-- Make "Registration closed" actually close registration.
--
-- event_settings.registration_open has existed since the initial schema and
-- the admin dashboard has always had a switch for it. Nothing on the server
-- has ever read it. The only code that consults the flag is AuthPage.tsx,
-- which hides the register form -- so closing registration hides a form and
-- nothing more.
--
-- Anyone who keeps a tab open from before the toggle, reloads a cached page,
-- or simply POSTs to /auth/v1/signup directly still gets an account. During a
-- live CTF that means the roster keeps growing after you have declared it
-- frozen, and late entrants appear on a scoreboard you thought was closed.
--
-- Same class of defect as freeze_scoreboard and hide_scores: a switch in the
-- UI wired to nothing. This is the third one, so it is worth stating the rule
-- plainly -- a control that only the client honours is not a control.
--
-- Enforced in handle_new_user because that is the one place every signup path
-- passes through, whichever provider it came from. Email/password, Google
-- OAuth and any future provider all insert into auth.users and all fire this
-- trigger.
--
-- The raise produces Supabase's opaque "Database error saving new user", for
-- the reasons documented in 20260826070000 -- GoTrue drops trigger messages.
-- That is acceptable here precisely because the client already checks the flag
-- before showing the form and re-checks before submitting, so a legitimate
-- player gets a clear message and never reaches this. Whoever does reach it is
-- bypassing the UI, and an opaque error is the right amount of help.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_base       text;
  v_candidate  text;
  v_suffix     integer := 0;
  v_constraint text;
  v_attempt    integer := 0;
  v_open       boolean;
BEGIN
  -- Missing row or NULL means "not configured", which must not lock everyone
  -- out of a platform that has never been set up.
  SELECT COALESCE(e.registration_open, true) INTO v_open
  FROM public.event_settings e WHERE e.id = 1;

  IF v_open IS NOT NULL AND NOT v_open THEN
    RAISE EXCEPTION 'Registration is currently closed';
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

      IF v_constraint = 'profiles_email_key' THEN
        RAISE EXCEPTION 'An account already exists for this email address';
      END IF;

      IF v_constraint = 'profiles_pkey' THEN
        RETURN NEW;
      END IF;

      IF v_attempt >= 10 THEN
        RAISE EXCEPTION 'Could not allocate a username, please try again';
      END IF;

      v_candidate := left(v_base, 24) || floor(random() * 100000)::int::text;
    END;
  END LOOP;
END;
$$;

-- Let the client ask the one question it needs without reading the whole
-- settings row: is registration open right now? Callable before login, which
-- is the only time it matters.
CREATE OR REPLACE FUNCTION public.registration_is_open()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT COALESCE(
           (SELECT e.registration_open FROM public.event_settings e WHERE e.id = 1),
           true
         );
$$;

REVOKE EXECUTE ON FUNCTION public.registration_is_open() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registration_is_open() TO anon, authenticated, service_role;
