-- ════════════════════════════════════════════════════════════════════════
-- Allowlist also gates PLAY, not just signup
--
-- The signup trigger already refuses a non-listed email. But accounts made
-- while registration was open (before the switch was turned on) still exist
-- and could otherwise play. When registration_allowlist_only is on, a
-- non-listed account must not be able to submit flags or unlock hints.
-- Admins are always exempt.
--
-- Enforced server-side inside submit_flag_tx and unlock_hint via one helper,
-- so it cannot be bypassed from the client and is reversible: turn the switch
-- off and play is open again.
-- ════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.play_allowlist_blocks(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  -- true  = the gate is on AND this user's email is not on the list
  -- false = gate off, or the user is listed
  SELECT COALESCE(
           (SELECT es.registration_allowlist_only FROM public.event_settings es WHERE es.id = 1),
           false)
     AND NOT EXISTS (
       SELECT 1
       FROM public.registration_allowlist a
       JOIN public.profiles p ON p.id = p_user_id
       WHERE a.email = lower(btrim(p.email)));
$$;
REVOKE EXECUTE ON FUNCTION public.play_allowlist_blocks(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.play_allowlist_blocks(uuid) TO authenticated, service_role;

-- ── submit_flag_tx: refuse a non-listed account when the gate is on ─────
CREATE OR REPLACE FUNCTION public.submit_flag_tx(
  p_user_id      uuid,
  p_challenge_id uuid,
  p_flag         text,
  p_ip           text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_flag      text        := pg_catalog.btrim(p_flag);
  v_now       timestamptz := pg_catalog.now();
  v_profile   record;
  v_event     record;
  v_chal      record;
  v_secret    record;
  v_is_admin  boolean;
  v_max       int;
  v_used      int;
  v_last      timestamptz;
  v_correct   boolean := false;
  v_hash      text;
  v_ip        inet;
BEGIN
  -- ── 1. Who is asking ─────────────────────────────────────────────────
  SELECT p.is_banned, p.team_id, p.role INTO v_profile
  FROM public.profiles p WHERE p.id = p_user_id;

  IF NOT FOUND OR COALESCE(v_profile.is_banned, false) THEN
    RETURN jsonb_build_object('status', 403, 'body',
      jsonb_build_object('error', 'Account banned'));
  END IF;

  -- Every solve belongs to a team; a teamless row would score for nobody
  -- the scoreboard can see. See the original comment in submit-flag.
  IF v_profile.team_id IS NULL THEN
    RETURN jsonb_build_object('status', 403, 'body', jsonb_build_object(
      'correct', false,
      'error', 'Create or join a team before submitting. Playing solo is fine — make a team of one.'));
  END IF;

  v_is_admin := (v_profile.role = 'admin');

  -- Allowlist gate: only registered emails may play while it is on (admins
  -- exempt). Covers accounts that were created before the switch was set.
  -- Status 200 (like the paused / not-started gates) so the client surfaces
  -- the message rather than supabase-js masking a non-2xx as "Server error".
  IF NOT v_is_admin AND public.play_allowlist_blocks(p_user_id) THEN
    RETURN jsonb_build_object('status', 200, 'body', jsonb_build_object(
      'correct', false,
      'error', 'Your email is not on the registration list to play this event'));
  END IF;

  -- ── 2. Is the event open ─────────────────────────────────────────────
  SELECT e.is_active, e.start_time, e.end_time, e.is_paused INTO v_event
  FROM public.event_settings e WHERE e.id = 1;

  IF NOT FOUND OR NOT COALESCE(v_event.is_active, false) THEN
    RETURN jsonb_build_object('status', 200, 'body',
      jsonb_build_object('correct', false, 'error', 'Event not active'));
  END IF;
  IF v_event.start_time IS NOT NULL AND v_event.start_time > v_now THEN
    RETURN jsonb_build_object('status', 200, 'body',
      jsonb_build_object('correct', false, 'error', 'Event has not started'));
  END IF;
  -- A paused event seals the submission channel for players. Admins keep it
  -- open so they can verify a challenge while everyone else waits.
  IF COALESCE(v_event.is_paused, false) AND NOT v_is_admin THEN
    RETURN jsonb_build_object('status', 200, 'body',
      jsonb_build_object('correct', false, 'paused', true, 'error', 'Event is paused'));
  END IF;
  IF v_event.end_time IS NOT NULL AND v_event.end_time < v_now THEN
    RETURN jsonb_build_object('status', 200, 'body',
      jsonb_build_object('correct', false, 'eventEnded', true));
  END IF;

  -- ── 3. The challenge ─────────────────────────────────────────────────
  SELECT c.id, c.points, c.is_visible, c.max_attempts INTO v_chal
  FROM public.challenges c WHERE c.id = p_challenge_id;

  IF NOT FOUND OR NOT COALESCE(v_chal.is_visible, false) THEN
    RETURN jsonb_build_object('status', 404, 'body',
      jsonb_build_object('error', 'Challenge not found'));
  END IF;
  v_max := CASE WHEN COALESCE(v_chal.max_attempts, 0) > 0 THEN v_chal.max_attempts ELSE 9999 END;

  -- ── 4. Serialise this player's submissions before counting anything ──
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('rl:' || p_user_id::text, 0));
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text || ':' || p_challenge_id::text, 0));

  -- ── 5. Already solved ────────────────────────────────────────────────
  IF EXISTS (
    SELECT 1 FROM public.submissions s
    WHERE s.user_id = p_user_id AND s.challenge_id = p_challenge_id AND s.is_correct
  ) THEN
    RETURN jsonb_build_object('status', 200, 'body',
      jsonb_build_object('correct', true, 'alreadySolved', true));
  END IF;

  -- ── 6. Attempt cap and cooldown, from one scan ───────────────────────
  SELECT count(*)::int, max(s.submitted_at) INTO v_used, v_last
  FROM public.submissions s
  WHERE s.user_id = p_user_id AND s.challenge_id = p_challenge_id;

  IF v_used >= v_max THEN
    RETURN jsonb_build_object('status', 200, 'body', jsonb_build_object(
      'correct', false, 'locked', true, 'maxAttempts', v_max, 'attemptsLeft', 0));
  END IF;

  IF NOT v_is_admin AND v_last IS NOT NULL
     AND v_last > v_now - interval '10 seconds' THEN
    RETURN jsonb_build_object('status', 429, 'body', jsonb_build_object(
      'correct', false,
      'error', format('Too fast. Wait %ss.',
        ceil(extract(epoch FROM (v_last + interval '10 seconds' - v_now)))::int)));
  END IF;

  -- ── 7. The answer ────────────────────────────────────────────────────
  SELECT cs.flag_hash, cs.flag_type, cs.flag_regex INTO v_secret
  FROM public.challenge_secrets cs WHERE cs.challenge_id = p_challenge_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 500, 'body',
      jsonb_build_object('error', 'Challenge misconfigured'));
  END IF;

  v_hash := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(v_flag, 'UTF8')), 'hex');

  IF v_secret.flag_type = 'static' THEN
    v_correct := (v_hash = v_secret.flag_hash);
  ELSIF v_secret.flag_type = 'regex' AND v_secret.flag_regex IS NOT NULL THEN
    BEGIN
      v_correct := (v_flag ~ v_secret.flag_regex);
    EXCEPTION WHEN OTHERS THEN
      v_correct := false;
    END;
  END IF;

  -- x-forwarded-for is untrusted text; a value inet cannot parse is just null.
  BEGIN
    v_ip := NULLIF(p_ip, '')::inet;
  EXCEPTION WHEN OTHERS THEN
    v_ip := NULL;
  END;

  -- ── 8. Record it. The triggers are the backstop for everything above. ─
  BEGIN
    INSERT INTO public.submissions
      (user_id, challenge_id, team_id, submitted_flag_hash, submitted_flag, is_correct, ip_address)
    VALUES
      (p_user_id, p_challenge_id, v_profile.team_id, v_hash, v_flag, v_correct, v_ip);
  EXCEPTION
    -- uniq_submission_correct_per_user_challenge: a concurrent request
    -- already recorded this solve. The duplicate loses; not an error.
    WHEN unique_violation THEN
      RETURN jsonb_build_object('status', 200, 'body',
        jsonb_build_object('correct', true, 'alreadySolved', true));
    WHEN OTHERS THEN
      IF SQLERRM LIKE 'Max attempts exceeded%' THEN
        RETURN jsonb_build_object('status', 200, 'body', jsonb_build_object(
          'correct', false, 'locked', true, 'maxAttempts', v_max, 'attemptsLeft', 0));
      ELSIF SQLERRM LIKE 'Rate limit exceeded%' THEN
        RETURN jsonb_build_object('status', 429, 'body', jsonb_build_object(
          'correct', false, 'error', 'Too many submissions. Wait a minute and try again.'));
      END IF;
      RAISE;
  END;

  RETURN jsonb_build_object('status', 200, 'body', jsonb_build_object(
    'correct',      v_correct,
    'points',       CASE WHEN v_correct THEN v_chal.points ELSE 0 END,
    'attemptsLeft', CASE WHEN v_correct THEN v_max ELSE v_max - v_used - 1 END,
    'maxAttempts',  v_max));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.submit_flag_tx(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_flag_tx(uuid, uuid, text, text) TO service_role;

-- ── unlock_hint: same gate ─────────────────────────────────────────────
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

  -- Allowlist gate: non-listed accounts cannot unlock hints while it is on.
  IF NOT public.is_admin() AND public.play_allowlist_blocks(auth.uid()) THEN
    RETURN jsonb_build_object('error', 'Your email is not on the registration list to play this event');
  END IF;

  SELECT e.start_time, e.end_time, e.is_paused INTO v_event
  FROM public.event_settings e WHERE e.id = 1;

  IF NOT public.is_admin() THEN
    IF COALESCE(v_event.is_paused, false) THEN
      RETURN jsonb_build_object('error', 'The event is paused.');
    END IF;
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
GRANT  EXECUTE ON FUNCTION public.unlock_hint(uuid) TO authenticated, service_role;
