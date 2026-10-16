-- ════════════════════════════════════════════════════════════════════════
--  Take TRUNCATE, TRIGGER and REFERENCES back off `authenticated`.
--
--  FOUND BY: pre-event penetration test, attacking the live schema as an
--  ordinary signed-in player.
--
--  WHAT IT IS
--
--  20260825000000_initial_schema ran
--
--      GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
--
--  and the hardening migrations that followed revoked the dangerous half
--  table by table. Ten tables were missed, and still carry TRUNCATE,
--  TRIGGER and REFERENCES for every registered player:
--
--      awards, challenge_files, challenges, event_settings, hint_unlocks,
--      hints, notifications, profiles, submissions, teams
--
--  TRUNCATE is the one that matters, because ROW LEVEL SECURITY DOES NOT
--  APPLY TO IT. Every careful policy on these tables is simply not
--  consulted. Proven, not inferred: as a player with no team and no admin
--  role, `TRUNCATE public.submissions` took a seeded solve from 1 row to
--  0, and `TRUNCATE public.event_settings` emptied the event's entire
--  configuration. DELETE on the same tables is correctly refused.
--
--  HOW BAD, HONESTLY
--
--  Not reachable from the internet today, and the audit says so plainly
--  rather than inflating it. PostgREST has no TRUNCATE verb -- it speaks
--  SELECT, INSERT, UPDATE, DELETE and RPC -- and `authenticated` is
--  NOLOGIN, so nobody can open a psql session as it. Reaching this needs
--  arbitrary SQL execution, which would already be a worse problem.
--
--  It is fixed anyway, because the grant has no purpose: nothing in the
--  platform truncates these tables, creates triggers on them, or builds
--  foreign keys against them as `authenticated`. It is a loaded gun left
--  on the table on the chance that something later picks it up -- a future
--  PostgREST verb, a connection pooler, an admin tool run under the wrong
--  role, or a SECURITY DEFINER function somewhere down the line that
--  executes dynamic SQL.
--
--  TRIGGER and REFERENCES go with it. TRIGGER lets a role attach a trigger
--  to a table, which is a privilege-escalation primitive the moment it is
--  paired with anything that can define a function; REFERENCES lets one
--  point a foreign key at a table and learn about rows it cannot read.
--  Neither is used by anything here either.
--
--  REVERT
--    GRANT TRUNCATE, TRIGGER, REFERENCES ON <table> TO authenticated;
--    (there is no reason to)
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
