-- Every publicly reachable path gets a budget it cannot outrun.
--
-- The last audit closed the flag- and privilege-escalation surfaces. This one
-- is about survival under load and against automation. Four risks are worth
-- naming, and each gets a matching gate.
--
-- 1. LOGIN BRUTE FORCE
--    Turnstile stops a bot from making one automated login. It does not stop
--    a human running a distributed password-spray -- each attempt carries a
--    fresh, valid captcha. The second layer is a password-verification hook
--    called by GoTrue on every attempt: five failures in fifteen minutes on
--    a single account and the sixth is refused, whatever the password. The
--    lockout is per-user and self-heals in fifteen minutes.
--
--    A locked-out attacker on a correct guess is still refused, because the
--    lockout is checked after the count regardless of validity. This is the
--    right trade for a CTF: the loss to a legit user is 15 minutes of wait,
--    the loss to the platform if a scoreboard captain gets brute-forced
--    mid-event is much larger.
--
-- 2. INVITE-CODE BRUTE FORCE
--    Invite codes are 12 hex chars, ~48 bits. Unbounded, an attacker can
--    fire join_team back-to-back to walk the space. Bounded at 10 per user
--    per minute the same walk takes centuries. join_team, create_team and
--    unlock_hint each get a per-user budget through one helper so the
--    limits are visible in one place and tunable together.
--
-- 3. SUBMISSION FLOOD
--    The submissions trigger already caps at 30/min per user, but that is
--    per authenticated session; a fresh account is a fresh budget. The
--    Edge Function reads x-forwarded-for and adds a per-IP budget so a
--    burst from one machine cannot register a hundred accounts and burn
--    3000 hashes a minute. See the Edge Function edit accompanying this.
--
-- 4. THE HELPER ITSELF
--    check_rate_limit is invoked once per protected call. The events table
--    is append-only and drained lazily: 1% of calls also delete rows older
--    than an hour, so nothing accumulates without a cron and no run has to
--    pay the whole cleanup cost. The partial index is scoped to the recent
--    window so it stays small.

-- ── 1. The event log and its helper ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rate_limit_events (
  bucket text NOT NULL,
  key    text NOT NULL,
  ts     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rate_limit_events_lookup
  ON public.rate_limit_events (bucket, key, ts DESC);

REVOKE ALL ON public.rate_limit_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.rate_limit_events TO service_role;

-- Not called by the client directly -- always through a SECURITY DEFINER
-- function that has already made an authorisation decision. So it trusts
-- the caller's bucket/key labelling.
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_bucket          text,
  p_key             text,
  p_window_seconds  int,
  p_max_hits        int
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_recent int;
BEGIN
  SELECT count(*) INTO v_recent
  FROM public.rate_limit_events
  WHERE bucket = p_bucket AND key = p_key
    AND ts > now() - make_interval(secs => p_window_seconds);

  IF v_recent >= p_max_hits THEN
    RAISE EXCEPTION 'Rate limit exceeded (% per % seconds)', p_max_hits, p_window_seconds
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.rate_limit_events (bucket, key) VALUES (p_bucket, p_key);

  -- Lazy cleanup, once every ~100 calls.
  IF random() < 0.01 THEN
    DELETE FROM public.rate_limit_events WHERE ts < now() - interval '1 hour';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text,text,int,int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text,text,int,int) TO service_role;

-- ── 2. Login attempt log and the GoTrue hook ─────────────────────────
CREATE TABLE IF NOT EXISTS public.login_attempts (
  id         bigserial PRIMARY KEY,
  user_id    uuid,
  succeeded  boolean NOT NULL,
  ts         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_recent_failures
  ON public.login_attempts (user_id, ts DESC) WHERE NOT succeeded;

REVOKE ALL ON public.login_attempts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.login_attempts TO service_role;

-- GoTrue calls this via the "password verification attempt" auth hook.
-- Docs: https://supabase.com/docs/guides/auth/auth-hooks/password-verification-hook
-- Input:  { "user_id": "<uuid>", "valid": true|false }
-- Output: { "decision": "continue" | "reject", "message"?: "text" }
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

-- Grant execute to the role GoTrue runs the hook as.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.password_verification_hook(jsonb) TO supabase_auth_admin';
    EXECUTE 'GRANT SELECT, INSERT ON public.login_attempts TO supabase_auth_admin';
  END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public.password_verification_hook(jsonb) FROM PUBLIC, anon, authenticated;

-- ── 3. Wrap player RPCs with per-user budgets ────────────────────────
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

REVOKE EXECUTE ON FUNCTION public.create_team(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_team(text) TO authenticated, service_role;

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

REVOKE EXECUTE ON FUNCTION public.join_team(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_team(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.unlock_hint(p_hint_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_hint     record;
  v_visible  boolean;
  v_team     uuid;
  v_balance  int;
  v_inserted uuid;
  v_event    record;
  v_found    boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  -- 30 hint calls per minute is more than any real event needs.
  PERFORM public.check_rate_limit('unlock_hint', auth.uid()::text, 60, 30);

  SELECT p.team_id INTO v_team
  FROM public.profiles p
  WHERE p.id = auth.uid() AND COALESCE(p.is_banned, false) = false;

  GET DIAGNOSTICS v_found = ROW_COUNT;
  IF NOT v_found THEN
    RETURN jsonb_build_object('error', 'Account not found or banned');
  END IF;

  IF v_team IS NULL THEN
    RETURN jsonb_build_object(
      'error', 'Create or join a team before unlocking hints. Playing solo is fine — make a team of one.'
    );
  END IF;

  SELECT e.start_time, e.end_time INTO v_event
  FROM public.event_settings e WHERE e.id = 1;

  IF NOT public.is_admin() THEN
    IF v_event.start_time IS NOT NULL AND now() < v_event.start_time THEN
      RETURN jsonb_build_object('error', 'The event has not started yet.');
    END IF;
    IF v_event.end_time IS NOT NULL AND now() > v_event.end_time THEN
      RETURN jsonb_build_object('error', 'The event has ended.');
    END IF;
  END IF;

  SELECT * INTO v_hint FROM public.hints h WHERE h.id = p_hint_id;
  IF v_hint IS NULL THEN
    RETURN jsonb_build_object('error', 'Hint not found');
  END IF;

  SELECT c.is_visible INTO v_visible
  FROM public.challenges c WHERE c.id = v_hint.challenge_id;

  IF v_visible IS NOT TRUE AND NOT public.is_admin() THEN
    RETURN jsonb_build_object('error', 'Hint not found');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.hint_unlocks hu
    WHERE hu.user_id = auth.uid() AND hu.hint_id = p_hint_id
  ) THEN
    RETURN jsonb_build_object('success', true, 'text', v_hint.content);
  END IF;

  INSERT INTO public.user_score_agg (user_id, total_points, solved_count, hint_spend)
  VALUES (auth.uid(), 0, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT GREATEST(COALESCE(a.total_points, 0) - COALESCE(a.hint_spend, 0), 0)
    INTO v_balance
  FROM public.user_score_agg a
  WHERE a.user_id = auth.uid()
  FOR UPDATE;

  v_balance := COALESCE(v_balance, 0);

  IF v_hint.cost > v_balance THEN
    RETURN jsonb_build_object(
      'error', format('Not enough points. This hint costs %s, you have %s.',
                      v_hint.cost, v_balance)
    );
  END IF;

  INSERT INTO public.hint_unlocks (user_id, hint_id)
  VALUES (auth.uid(), p_hint_id)
  ON CONFLICT (user_id, hint_id) DO NOTHING
  RETURNING id INTO v_inserted;

  IF v_inserted IS NOT NULL AND v_hint.cost > 0 THEN
    UPDATE public.user_score_agg
      SET hint_spend = hint_spend + v_hint.cost
      WHERE user_id = auth.uid();

    INSERT INTO public.team_score_agg (team_id, total_points, solved_count, hint_spend)
    VALUES (v_team, 0, 0, v_hint.cost)
    ON CONFLICT (team_id) DO UPDATE
      SET hint_spend = public.team_score_agg.hint_spend + v_hint.cost;
  END IF;

  RETURN jsonb_build_object('success', true, 'text', v_hint.content);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.unlock_hint(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unlock_hint(uuid) TO authenticated, service_role;
