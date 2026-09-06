-- ════════════════════════════════════════════════════════════════════════
-- Registration allowlist
--
-- Optional gate so that during the event only pre-registered emails can
-- create an account. Enforced inside handle_new_user (the signup trigger),
-- so it cannot be bypassed by calling the API directly: a disallowed email
-- makes the trigger RAISE, which rolls back the auth.users insert too.
--
--   • event_settings.registration_allowlist_only  — the on/off switch
--     (default false, so nothing changes until an admin turns it on).
--   • public.registration_allowlist               — the allowed emails,
--     stored lower(trim(...)) to match GoTrue's lowercased signup email.
--     Locked down: only SECURITY DEFINER admin functions / service_role
--     touch it; no anon/authenticated access.
--
-- Turn it on ONLY after the list is loaded — with the switch on and the
-- list empty, nobody can register.
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE public.event_settings
  ADD COLUMN IF NOT EXISTS registration_allowlist_only boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.registration_allowlist (
  email    text PRIMARY KEY,
  added_at timestamptz NOT NULL DEFAULT now(),
  note     text
);
ALTER TABLE public.registration_allowlist ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.registration_allowlist FROM PUBLIC, anon, authenticated;
-- No policies on purpose: the table is reachable only through the SECURITY
-- DEFINER functions below (which run as the owner) and service_role.

-- ── Signup trigger: enforce the allowlist when the switch is on ─────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_base       text;
  v_candidate  text;
  v_suffix     integer := 0;
  v_constraint text;
  v_attempt    integer := 0;
  v_open       boolean;
  v_allow_only boolean;
BEGIN
  -- Missing row or NULL means "not configured", which must not lock everyone
  -- out of a platform that has never been set up.
  SELECT COALESCE(e.registration_open, true), COALESCE(e.registration_allowlist_only, false)
    INTO v_open, v_allow_only
  FROM public.event_settings e WHERE e.id = 1;

  IF v_open IS NOT NULL AND NOT v_open THEN
    RAISE EXCEPTION 'Registration is currently closed';
  END IF;

  -- Allowlist gate: only pre-registered emails may sign up while it is on.
  IF v_allow_only AND NOT EXISTS (
    SELECT 1 FROM public.registration_allowlist a
    WHERE a.email = lower(btrim(NEW.email))
  ) THEN
    RAISE EXCEPTION 'This email is not on the registration list for this event';
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

-- ── Admin management functions (guarded by is_admin) ───────────────────
CREATE OR REPLACE FUNCTION public.admin_allowlist_add(p_emails text[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_added int;
BEGIN
  IF NOT public.is_admin() THEN RETURN jsonb_build_object('error', 'Unauthorized'); END IF;

  WITH norm AS (
    SELECT DISTINCT lower(btrim(e)) AS email
    FROM unnest(p_emails) AS e
    WHERE btrim(e) <> '' AND position('@' in btrim(e)) > 1
  ), ins AS (
    INSERT INTO public.registration_allowlist (email)
    SELECT email FROM norm
    ON CONFLICT (email) DO NOTHING
    RETURNING 1
  )
  SELECT count(*)::int INTO v_added FROM ins;

  RETURN jsonb_build_object(
    'added', v_added,
    'total', (SELECT count(*) FROM public.registration_allowlist));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_allowlist_remove(p_email text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.is_admin() THEN RETURN jsonb_build_object('error', 'Unauthorized'); END IF;
  DELETE FROM public.registration_allowlist WHERE email = lower(btrim(p_email));
  RETURN jsonb_build_object(
    'removed', true,
    'total', (SELECT count(*) FROM public.registration_allowlist));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_allowlist_clear()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.is_admin() THEN RETURN jsonb_build_object('error', 'Unauthorized'); END IF;
  DELETE FROM public.registration_allowlist;
  RETURN jsonb_build_object('cleared', true, 'total', 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_allowlist_count()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.is_admin() THEN RETURN jsonb_build_object('error', 'Unauthorized'); END IF;
  RETURN jsonb_build_object('total', (SELECT count(*) FROM public.registration_allowlist));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_allowlist_add(text[])   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_allowlist_remove(text)  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_allowlist_clear()       FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_allowlist_count()       FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_allowlist_add(text[])   TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.admin_allowlist_remove(text)  TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.admin_allowlist_clear()       TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.admin_allowlist_count()       TO authenticated, service_role;
