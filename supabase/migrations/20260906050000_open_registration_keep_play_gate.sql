-- ════════════════════════════════════════════════════════════════════════
-- Registration is open to everyone; the allowlist gates PLAY only
--
-- Earlier the allowlist blocked signup. New intent: anyone worldwide may
-- register, but only emails on the allowlist may PLAY (submit flags / unlock
-- hints) once the switch is on — checked across all registered accounts.
--
-- So the signup trigger goes back to enforcing only registration_open. The
-- play-time gate (submit_flag_tx / unlock_hint via play_allowlist_blocks,
-- migration 20260906040000) stays and is the sole allowlist enforcement.
-- ════════════════════════════════════════════════════════════════════════

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

  -- No allowlist check here: registration is open to everyone. The allowlist
  -- is enforced only at play time (submit_flag_tx / unlock_hint).

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
