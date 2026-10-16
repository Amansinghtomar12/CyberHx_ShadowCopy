-- ════════════════════════════════════════════════════════════════════════
--  RUN THIS IN THE SUPABASE SQL EDITOR
--
--  Paste the whole file, press Run. Safe to run again.
--
--  SECURITY FIX, found by attacking your schema as an ordinary signed-in
--  player before the event.
--
--  TRUNCATE, TRIGGER and REFERENCES are still granted to every registered
--  player on ten tables, left behind by the original schema's
--  GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated.
--
--  TRUNCATE is the one that matters: ROW LEVEL SECURITY DOES NOT APPLY TO
--  IT, so every policy on those tables is simply not consulted. Measured,
--  not guessed -- as a player with no team and no admin role, TRUNCATE on
--  submissions took a seeded solve from 1 row to 0, and TRUNCATE on
--  event_settings emptied the event's configuration.
--
--  It is not reachable from the internet today: PostgREST has no TRUNCATE
--  verb, and the player roles cannot open a database session. This closes
--  it anyway, because the grant has no user and no purpose.
--
--  Nothing about play changes. No table, policy, function or row is
--  touched -- only privileges that nothing uses are taken away.
--
--  AFTER RUNNING, the last statement prints one row. Expect:
--     leftover_grants = 0      ready = true
-- ════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'awards', 'challenge_files', 'challenges', 'event_settings',
    'hint_unlocks', 'hints', 'notifications', 'profiles',
    'submissions', 'teams'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.%I FROM authenticated', t);
      EXECUTE format('REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.%I FROM anon', t);
    END IF;
  END LOOP;
END
$$;

-- Nothing created after this point inherits the original GRANT ALL, but a
-- future table created by a migration that copies an old pattern might.
-- The check below is the record of what this migration is for: it fails
-- loudly if any of the three ever comes back.
DO $$
DECLARE
  leftovers text;
BEGIN
  SELECT string_agg(DISTINCT grantee || ':' || table_name || ':' || privilege_type, ', ')
    INTO leftovers
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND grantee IN ('anon', 'authenticated')
    AND privilege_type IN ('TRUNCATE', 'TRIGGER', 'REFERENCES');

  IF leftovers IS NOT NULL THEN
    RAISE EXCEPTION 'TRUNCATE/TRIGGER/REFERENCES still granted to a player role: %', leftovers;
  END IF;
END
$$;

-- ── Did it work? ────────────────────────────────────────────────────────
SELECT
  count(*) AS leftover_grants,
  count(*) = 0 AS ready
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee IN ('anon', 'authenticated')
  AND privilege_type IN ('TRUNCATE', 'TRIGGER', 'REFERENCES');
