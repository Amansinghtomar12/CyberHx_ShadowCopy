-- ════════════════════════════════════════════════════════════════════════
-- P1 pre-event hardening (security audit 2026-09)
--
-- Five low-risk, additive changes. No behaviour a legitimate user sees
-- changes; each closes a defence-in-depth or race item from the audit.
--
--   1. Seal the anon roster leak: user_scores was still readable by anon,
--      exposing the full username/team/country roster before the event —
--      the exact leak safe_profiles was sealed against (20260826140000).
--      The public scoreboard reads safe_profiles/team_scores, not
--      user_scores, so authenticated keeps it and nothing visible changes.
--   2/3. Refuse dangerous URL schemes at the column: avatar_url and website
--      had no CHECK (unlike bio/affiliation/country). A player could store
--      javascript:/data: there. NOT VALID so existing rows are grandfathered
--      and only new writes are checked — zero risk to the deploy.
--   4. Serialise the login-lockout counter: the password hook counted
--      failures without a lock, so parallel guesses could each read a stale
--      count and slip past the 5-failure lockout. One lock per account makes
--      count-then-act atomic.
--   5. Serialise team membership: create_team/join_team read team_id without
--      locking the actor, so concurrent calls could mint ghost teams / double
--      join. One lock per actor closes it.
--   6. Serialise admin_set_user_ban on the same 'admin_role_change' lock its
--      sibling role/ownership functions already take.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. Anon roster seal ─────────────────────────────────────────────────
REVOKE SELECT ON public.user_scores FROM anon;

-- ── 2/3. URL-scheme CHECK constraints (NOT VALID: new writes only) ──────
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_avatar_url_safe
  CHECK (avatar_url IS NULL OR (length(avatar_url) <= 1000 AND avatar_url ~* '^https?://'))
  NOT VALID;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_website_safe
  CHECK (website IS NULL OR (length(website) <= 500 AND website ~* '^https?://'))
  NOT VALID;

-- ── 4. Login-lockout serialisation ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.password_verification_hook(event jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_user_id uuid := (event->>'user_id')::uuid;
  v_valid   boolean := (event->>'valid')::boolean;
  v_recent  int;
BEGIN
  IF v_user_id IS NULL THEN
    -- Nothing to record; do not block the request either.
    RETURN jsonb_build_object('decision', 'continue');
  END IF;

  -- Serialise this account's attempts so the count-then-reject below is
  -- atomic; without it N simultaneous guesses each read a stale count and
  -- slip past the 5-failure lockout. Released at transaction end.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('login:' || v_user_id::text, 0));

  INSERT INTO public.login_attempts (user_id, succeeded) VALUES (v_user_id, v_valid);

  SELECT count(*) INTO v_recent
  FROM public.login_attempts
  WHERE user_id = v_user_id AND NOT succeeded
    AND ts > now() - interval '15 minutes';

  -- Fifth failure gets through with a standard "wrong password" from GoTrue.
  -- Sixth onwards, and any attempt while the lockout window is still open,
  -- is refused with our message -- including a correct password, which is
  -- the whole point of a lockout.
  IF v_recent > 5 THEN
    RETURN jsonb_build_object(
      'decision', 'reject',
      'message',  'Too many failed sign-in attempts. Please wait 15 minutes and try again.'
    );
  END IF;

  RETURN jsonb_build_object('decision', 'continue');
EXCEPTION WHEN OTHERS THEN
  -- A hook that raises would take login down entirely; log-and-continue is safer.
  RAISE WARNING 'password_verification_hook error: %', SQLERRM;
  RETURN jsonb_build_object('decision', 'continue');
END;
$$;

-- ── 5. Team-membership serialisation (create_team + join_team share a key) ─
CREATE OR REPLACE FUNCTION public.create_team(p_name text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_team_id uuid;
  v_event   record;
  v_profile record;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  -- One membership decision at a time per actor: stops a teamless account
  -- from creating several ghost teams (or create+join) concurrently.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('team-membership:' || auth.uid()::text, 0));

  -- 5 team creations per hour is generous for real use, harsh for spammers.
  PERFORM public.check_rate_limit('create_team', auth.uid()::text, 3600, 5);

  SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();
  IF v_profile IS NULL OR v_profile.is_banned THEN
    RETURN jsonb_build_object('error', 'Account not found or banned');
  END IF;
  IF v_profile.team_id IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'Already in a team');
  END IF;

  SELECT * INTO v_event FROM public.event_settings WHERE id = 1;
  IF v_event.is_active AND NOT v_event.allow_team_changes THEN
    RETURN jsonb_build_object('error', 'Team changes locked during event');
  END IF;

  BEGIN
    INSERT INTO public.teams (name, captain_id)
    VALUES (trim(p_name), auth.uid())
    RETURNING id INTO v_team_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('error', 'That team name is already taken');
  END;

  UPDATE public.profiles SET team_id = v_team_id WHERE id = auth.uid();
  RETURN jsonb_build_object('team_id', v_team_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.join_team(p_invite_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_team         record;
  v_event        record;
  v_profile      record;
  v_member_count int;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  -- Same membership lock as create_team: serialise this actor's join/create.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('team-membership:' || auth.uid()::text, 0));

  -- 10 join attempts per minute defeats invite-code brute forcing while
  -- leaving room for a real user mistyping.
  PERFORM public.check_rate_limit('join_team', auth.uid()::text, 60, 10);

  SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();
  IF v_profile IS NULL OR v_profile.is_banned THEN
    RETURN jsonb_build_object('error', 'Account not found or banned');
  END IF;
  IF v_profile.team_id IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'Already in a team');
  END IF;

  SELECT * INTO v_event FROM public.event_settings WHERE id = 1;
  IF v_event.is_active AND NOT v_event.allow_team_changes THEN
    RETURN jsonb_build_object('error', 'Team changes locked during event');
  END IF;

  SELECT * INTO v_team FROM public.teams
  WHERE invite_code = trim(p_invite_code) FOR UPDATE;

  IF v_team IS NULL THEN
    RETURN jsonb_build_object('error', 'Invalid invite code');
  END IF;
  IF v_team.is_banned THEN
    RETURN jsonb_build_object('error', 'Team is banned');
  END IF;

  SELECT COUNT(*) INTO v_member_count
  FROM public.profiles WHERE team_id = v_team.id;

  IF v_member_count >= v_event.team_size THEN
    RETURN jsonb_build_object('error', 'Team is full');
  END IF;

  UPDATE public.profiles SET team_id = v_team.id WHERE id = auth.uid();
  RETURN jsonb_build_object('success', true);
END;
$$;

-- ── 6. admin_set_user_ban shares the admin_role_change lock ─────────────
CREATE OR REPLACE FUNCTION public.admin_set_user_ban(p_user_id uuid, p_banned boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_username text;
  v_role     text;
  v_owner    boolean;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  -- Same lock admin_set_user_role / admin_transfer_ownership take, so a ban
  -- and a concurrent role/ownership change on the same target serialise and
  -- each re-reads state under the lock rather than racing.
  PERFORM pg_advisory_xact_lock(hashtext('admin_role_change'));

  IF p_user_id = auth.uid() THEN
    RETURN jsonb_build_object('error', 'You cannot ban your own account');
  END IF;

  SELECT p.username, p.role, COALESCE(p.is_owner, false)
    INTO v_username, v_role, v_owner
  FROM public.profiles p WHERE p.id = p_user_id;

  IF v_username IS NULL THEN
    RETURN jsonb_build_object('error', 'User not found');
  END IF;

  IF p_banned AND v_owner THEN
    RETURN jsonb_build_object(
      'error', format('%s is the owner and cannot be banned.', v_username)
    );
  END IF;

  IF p_banned AND v_role = 'admin' THEN
    RETURN jsonb_build_object(
      'error', 'Cannot ban an admin. Change their role to player first.'
    );
  END IF;

  UPDATE public.profiles SET is_banned = p_banned WHERE id = p_user_id;

  INSERT INTO public.audit_log (actor_id, action, metadata)
  VALUES (
    auth.uid(),
    CASE WHEN p_banned THEN 'ban_user' ELSE 'unban_user' END,
    jsonb_build_object('user_id', p_user_id, 'username', v_username, 'role', v_role)
  );

  RETURN jsonb_build_object('success', true, 'username', v_username, 'is_banned', p_banned);
END;
$$;
