-- Survive a registration surge.
--
-- handle_new_user picks a username by probing for a free one:
--
--   WHILE EXISTS (SELECT 1 FROM profiles WHERE username = v_candidate) LOOP
--     v_suffix := v_suffix + 1; v_candidate := base || v_suffix;
--   END LOOP;
--   INSERT INTO profiles (id, username, email) VALUES (NEW.id, v_candidate, NEW.email);
--
-- The probe and the insert are not atomic with respect to another
-- transaction doing the same thing. Two people signing up in the same
-- moment from addresses sharing a local-part -- aman@gmail / aman@outlook,
-- and at 5000 registrations there will be many -- both find 'aman' free,
-- both insert 'aman', and the loser gets a unique_violation. That exception
-- propagates out of the AFTER INSERT trigger, rolls back the auth.users row
-- with it, and the person sees a 500 "Database error saving new user" on a
-- signup that should simply have been named aman1. Retrying by hand usually
-- works, which is exactly what makes it hard to diagnose during an event.
--
-- The window is small but it is entered once per signup, and the surge is
-- the moment every signup happens at once. Handle the collision instead of
-- racing it: attempt the insert, and if the username was taken between the
-- probe and the write, pick another and try again.
--
-- Retry only on the username constraint. The email_normalized unique index
-- is the deliberate one-account-per-person rule from 20260825270000 and must
-- still fail the signup -- but it now fails with the same friendly message
-- the explicit pre-check raises, rather than a raw index name, since the
-- pre-check itself has the identical race.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_base       text;
  v_candidate  text;
  v_suffix     integer := 0;
  v_norm       text;
  v_constraint text;
  v_attempt    integer := 0;
BEGIN
  v_norm := lower(split_part(split_part(NEW.email, '@', 1), '+', 1)
                  || '@' || split_part(NEW.email, '@', 2));

  IF EXISTS (SELECT 1 FROM public.profiles p WHERE p.email_normalized = v_norm) THEN
    RAISE EXCEPTION 'An account already exists for this email address';
  END IF;

  v_base := NULLIF(trim(NEW.raw_user_meta_data->>'username'), '');

  IF v_base IS NULL THEN
    v_base := split_part(NEW.email, '@', 1);
  END IF;

  v_base := regexp_replace(v_base, '[^a-zA-Z0-9_-]', '_', 'g');
  v_base := left(v_base, 30);

  IF v_base IS NULL OR length(v_base) < 3 THEN
    v_base := left('user_' || replace(NEW.id::text, '-', ''), 30);
  END IF;

  -- Same probe as before: it still produces the tidy aman, aman1, aman2
  -- sequence in the overwhelmingly common uncontended case.
  v_candidate := v_base;
  WHILE EXISTS (SELECT 1 FROM public.profiles p WHERE p.username = v_candidate) LOOP
    v_suffix := v_suffix + 1;
    v_candidate := left(v_base, 30 - length(v_suffix::text)) || v_suffix::text;
  END LOOP;

  -- Bounded retry around the write. Ten attempts is far beyond what a real
  -- collision needs; it exists so a pathological case terminates rather than
  -- spinning inside a trigger holding a transaction open.
  LOOP
    v_attempt := v_attempt + 1;
    BEGIN
      INSERT INTO public.profiles (id, username, email)
      VALUES (NEW.id, v_candidate, NEW.email);
      RETURN NEW;

    EXCEPTION WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;

      -- One account per person: still a hard stop, now with a readable
      -- message. Covers the race in the pre-check above.
      IF v_constraint = 'idx_profiles_email_normalized'
         OR v_constraint = 'profiles_email_key' THEN
        RAISE EXCEPTION 'An account already exists for this email address';
      END IF;

      -- The profile row itself already exists (id is the PK, and it comes
      -- from auth.users). Nothing to do -- the trigger has already run.
      IF v_constraint = 'profiles_pkey' THEN
        RETURN NEW;
      END IF;

      IF v_attempt >= 10 THEN
        RAISE EXCEPTION 'Could not allocate a username, please try again';
      END IF;

      -- Somebody took the name between the probe and the write. A random
      -- tail rather than the next integer, because the integer is exactly
      -- what the other transaction is also about to try.
      v_candidate := left(v_base, 24) || floor(random() * 100000)::int::text;
    END;
  END LOOP;
END;
$$;

-- ══ Indexes for the surge ════════════════════════════════════════════
--
-- The username probe runs once per signup and once per collision. It is an
-- equality test on a UNIQUE column, so it already has an index; nothing to
-- add there.
--
-- These two do not have one. Both are read on paths every player hits.

-- Users and Teams list pages, and the scoreboard views, all order by points.
-- Without this the ORDER BY is a sort of the whole aggregate table on every
-- page load.
CREATE INDEX IF NOT EXISTS idx_user_score_agg_points
  ON public.user_score_agg (total_points DESC, last_solve ASC);

CREATE INDEX IF NOT EXISTS idx_team_score_agg_points
  ON public.team_score_agg (total_points DESC, last_solve ASC);

-- Every logged-in client polls notifications on a timer. Small table, but the
-- sort runs on each of 5000 clients' polls.
CREATE INDEX IF NOT EXISTS idx_notifications_created_at
  ON public.notifications (created_at DESC);

-- Name search on the Users and Teams pages moves server-side (a client that
-- downloads 5000 rows to filter them in the browser is the thing being fixed),
-- so the ILIKE prefix match needs support. text_pattern_ops handles the
-- 'foo%' form that a prefix search produces.
CREATE INDEX IF NOT EXISTS idx_profiles_username_lower
  ON public.profiles (lower(username) text_pattern_ops);

CREATE INDEX IF NOT EXISTS idx_teams_name_lower
  ON public.teams (lower(name) text_pattern_ops);
