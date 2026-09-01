-- Stop blocking plus-aliased addresses at signup.
--
-- THE FAILURE
--   Registering someone+1@example.com after someone@example.com returned
--   "Database error saving new user". Reproduced against PostgreSQL 16:
--
--     ERROR:  An account already exists for this email address
--     CONTEXT: PL/pgSQL function public.handle_new_user() line 14 at RAISE
--
--   handle_new_user stripped the +tag before comparing (20260825270000), so
--   the two addresses were one account, and the trigger refused the signup.
--
-- WHY THE MESSAGE COULD NOT BE FIXED IN PLACE
--   Supabase Auth collapses ANY exception raised inside a trigger on
--   auth.users into that single opaque string. The trigger's own message is
--   written to the server log and never reaches the browser. There is no
--   SQLSTATE that changes this. So as long as the rule is enforced by raising
--   inside the trigger, a blocked player sees a database error and reasonably
--   concludes the platform is broken.
--
-- WHY THE RULE IS NOT WORTH THAT COST
--   It was there to stop one person farming entries with me+1@, me+2@. But it
--   only ever stopped the laziest version of that: a second Gmail address, an
--   Outlook address or any disposable-mail domain walks straight past it. It
--   bought very little, while reliably breaking a real habit -- people who use
--   +tags to file their own mail, which is common among exactly the audience a
--   CTF attracts.
--
--   Exact-address uniqueness is the constraint that actually matters, and it
--   stays: auth.users enforces it, profiles.email is UNIQUE, and GoTrue
--   reports that case clearly as "User already registered".
--
--   Real duplicate-entry abuse is better caught by team rules and review than
--   by a string comparison at signup.
--
-- WHAT IS KEPT
--   email_normalized stays as a column, and keeps an index -- just not a
--   unique one. Finding alias families is still one query, so an organiser can
--   review them if a competition result is ever disputed. Detection without
--   blocking.

-- ══ 1. The rule stops being enforced ═════════════════════════════════

DROP INDEX IF EXISTS public.idx_profiles_email_normalized;

-- Non-unique, so admins can still group alias families on demand.
CREATE INDEX IF NOT EXISTS idx_profiles_email_normalized_lookup
  ON public.profiles (email_normalized);

-- ══ 2. handle_new_user without the pre-check ═════════════════════════
--
-- Otherwise identical to 20260826060000: the username probe, the bounded
-- retry that survives a concurrent registration surge, and the constraint-
-- specific error handling are all carried over unchanged. Only the
-- email_normalized gate is gone.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_base       text;
  v_candidate  text;
  v_suffix     integer := 0;
  v_constraint text;
  v_attempt    integer := 0;
BEGIN
  v_base := NULLIF(trim(NEW.raw_user_meta_data->>'username'), '');

  IF v_base IS NULL THEN
    v_base := split_part(NEW.email, '@', 1);
  END IF;

  v_base := regexp_replace(v_base, '[^a-zA-Z0-9_-]', '_', 'g');
  v_base := left(v_base, 30);

  IF v_base IS NULL OR length(v_base) < 3 THEN
    v_base := left('user_' || replace(NEW.id::text, '-', ''), 30);
  END IF;

  v_candidate := v_base;
  WHILE EXISTS (SELECT 1 FROM public.profiles p WHERE p.username = v_candidate) LOOP
    v_suffix := v_suffix + 1;
    v_candidate := left(v_base, 30 - length(v_suffix::text)) || v_suffix::text;
  END LOOP;

  LOOP
    v_attempt := v_attempt + 1;
    BEGIN
      INSERT INTO public.profiles (id, username, email)
      VALUES (NEW.id, v_candidate, NEW.email);
      RETURN NEW;

    EXCEPTION WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;

      -- Exact address already registered. auth.users normally catches this
      -- first and GoTrue says so plainly; this is the backstop for the race.
      IF v_constraint = 'profiles_email_key' THEN
        RAISE EXCEPTION 'An account already exists for this email address';
      END IF;

      -- The profile row already exists for this id -- the trigger has run.
      IF v_constraint = 'profiles_pkey' THEN
        RETURN NEW;
      END IF;

      IF v_attempt >= 10 THEN
        RAISE EXCEPTION 'Could not allocate a username, please try again';
      END IF;

      -- Somebody took the name between the probe and the write. Random tail,
      -- because the next integer is what the other transaction will try too.
      v_candidate := left(v_base, 24) || floor(random() * 100000)::int::text;
    END;
  END LOOP;
END;
$$;
