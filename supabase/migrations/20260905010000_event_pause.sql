-- Pause the event.
--
-- An organiser needs a switch that stops the clock without ending the
-- event: a challenge turns out to be broken, the infrastructure needs a
-- minute, a dispute has to be settled. While paused:
--
--   * submit_flag_tx refuses player submissions (admins keep the channel
--     open so a fix can be verified);
--   * unlock_hint refuses player unlocks;
--   * public_challenges returns nothing to players, so the board has nothing
--     to show and the client renders the hold screen instead;
--   * scoreboard_state reports paused, so the scoreboard does the same.
--
-- Resuming shifts end_time forward by exactly the time spent paused, so the
-- players' remaining time is what it was when the pause began. Nothing about
-- scoring, freezing or hiding changes; those switches stay independent.
--
-- The four functions below are the current definitions with one gate added
-- each. Their grants are re-stated unchanged.

ALTER TABLE public.event_settings
  ADD COLUMN IF NOT EXISTS is_paused     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS paused_at     timestamptz,
  ADD COLUMN IF NOT EXISTS pause_message text
    CHECK (pause_message IS NULL OR length(pause_message) <= 300);

-- ── 1. The switch ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_set_paused(p_paused boolean, p_message text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  e          record;
  v_now      timestamptz := now();
  v_shift    interval := interval '0';
  v_end      timestamptz;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  -- Serialise against a second admin flipping the switch at the same moment,
  -- and against scoreboard_state's auto-freeze which also rewrites this row.
  PERFORM pg_advisory_xact_lock(hashtext('event_pause'));
  SELECT * INTO e FROM public.event_settings WHERE id = 1 FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'No event');
  END IF;

  IF p_paused THEN
    IF COALESCE(e.is_paused, false) THEN
      RETURN jsonb_build_object('success', true, 'paused', true, 'paused_at', e.paused_at, 'unchanged', true);
    END IF;
    UPDATE public.event_settings
    SET is_paused = true, paused_at = v_now,
        pause_message = NULLIF(btrim(COALESCE(p_message, '')), '')
    WHERE id = 1;
    INSERT INTO public.audit_log (actor_id, action, metadata)
    VALUES (auth.uid(), 'pause_event', jsonb_build_object('message', p_message));
    RETURN jsonb_build_object('success', true, 'paused', true, 'paused_at', v_now);
  END IF;

  IF NOT COALESCE(e.is_paused, false) THEN
    RETURN jsonb_build_object('success', true, 'paused', false, 'unchanged', true);
  END IF;

  -- Give the players back the time the pause took. Only a live clock moves:
  -- an event whose end had not been set, or had already passed when the
  -- pause began, is left alone.
  IF e.paused_at IS NOT NULL AND e.end_time IS NOT NULL AND e.end_time > e.paused_at THEN
    v_shift := v_now - e.paused_at;
    v_end := e.end_time + v_shift;
  ELSE
    v_end := e.end_time;
  END IF;

  UPDATE public.event_settings
  SET is_paused = false, paused_at = NULL, pause_message = NULL, end_time = v_end
  WHERE id = 1;
  INSERT INTO public.audit_log (actor_id, action, metadata)
  VALUES (auth.uid(), 'resume_event', jsonb_build_object(
    'paused_for_seconds', extract(epoch FROM v_shift)::int,
    'end_time', v_end));
  RETURN jsonb_build_object('success', true, 'paused', false,
    'end_time', v_end, 'extended_by_seconds', extract(epoch FROM v_shift)::int);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_set_paused(boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_paused(boolean, text) TO authenticated, service_role;

-- ── 2. Players see no challenges while paused ───────────────────────────
-- Same columns, same visibility rule, one more condition. Existing grants and
-- the anon revoke survive CREATE OR REPLACE.
CREATE OR REPLACE VIEW public.public_challenges AS
SELECT
  c.id, c.title, c.category, c.difficulty, c.description,
  c.flag_type, c.points_type, c.points, c.initial_points,
  c.minimum_points, c.decay, c.is_visible, c.max_attempts,
  c.unlock_after, c.author, c.tags, c.connection_info, c.created_at
FROM public.challenges c
WHERE c.is_visible = true
  AND (
    NOT COALESCE((SELECT es.is_paused FROM public.event_settings es WHERE es.id = 1), false)
    OR public.is_admin()
  );

-- ── 3. Submissions are sealed for players ───────────────────────────────
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

-- ── 4. Hints too ────────────────────────────────────────────────────────
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
GRANT EXECUTE ON FUNCTION public.unlock_hint(uuid) TO authenticated, service_role;

-- ── 5. The scoreboard knows ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.scoreboard_state()
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  e       record;
  v_admin boolean;
  v_ended boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO e FROM public.event_settings WHERE id = 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('frozen', false, 'hidden', false, 'ended', false, 'paused', false);
  END IF;

  v_ended := e.end_time IS NOT NULL AND now() > e.end_time;

  -- Freeze once, the first time anybody looks after the event has closed.
  -- The advisory lock serialises the herd; the re-read under FOR UPDATE means
  -- only one transaction sees the pre-freeze state and does the work.
  IF v_ended
     AND NOT COALESCE(e.freeze_scoreboard, false)
     AND e.auto_froze_at IS NULL
  THEN
    PERFORM pg_advisory_xact_lock(hashtext('scoreboard_auto_freeze'));

    SELECT * INTO e FROM public.event_settings WHERE id = 1 FOR UPDATE;

    IF NOT COALESCE(e.freeze_scoreboard, false) AND e.auto_froze_at IS NULL THEN
      -- Setting the flag is enough: on_freeze_toggle stamps freeze_time and
      -- takes the snapshot, exactly as a manual freeze does.
      UPDATE public.event_settings
      SET freeze_scoreboard = true,
          auto_froze_at     = now()
      WHERE id = 1;

      INSERT INTO public.audit_log (actor_id, action, metadata)
      VALUES (NULL, 'auto_freeze_scoreboard',
              jsonb_build_object('reason', 'event ended', 'end_time', e.end_time));

      SELECT * INTO e FROM public.event_settings WHERE id = 1;
    END IF;
  END IF;

  v_admin := public.is_admin();

  RETURN jsonb_build_object(
    'frozen',      COALESCE(e.freeze_scoreboard, false),
    'freeze_time', e.freeze_time,
    'hidden',      COALESCE(e.hide_scores, false),
    'ended',       v_ended,
    'is_admin',    v_admin,
    'paused',      COALESCE(e.is_paused, false),
    'paused_at',   e.paused_at,
    'pause_message', e.pause_message,
    -- What the caller will actually experience, so the client never has to
    -- re-derive the admin exemption and get it subtly wrong.
    'masked',        (NOT v_admin) AND COALESCE(e.freeze_scoreboard, false),
    'scores_hidden', (NOT v_admin) AND COALESCE(e.hide_scores, false)
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.scoreboard_state() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scoreboard_state() TO authenticated, service_role;

-- ── 6. A new event starts unpaused ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_start_new_event(
  p_name                text    DEFAULT NULL,
  p_clear_challenges    boolean DEFAULT false,
  p_clear_teams         boolean DEFAULT true,
  p_clear_notifications boolean DEFAULT true
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_name       text;
  v_subs       int;
  v_challenges int := 0;
  v_teams      int := 0;
  v_notifs     int := 0;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  v_name := trim(COALESCE(p_name, ''));

  IF v_name = '' THEN
    RETURN jsonb_build_object('error', 'Event name is required');
  END IF;

  -- Same bounds the event_settings.name column and the admin form imply.
  IF length(v_name) > 80 THEN
    RETURN jsonb_build_object('error', 'Event name must be 80 characters or fewer');
  END IF;

  SELECT COUNT(*)::int INTO v_subs FROM public.submissions;

  DELETE FROM public.submissions       WHERE true;
  DELETE FROM public.hint_unlocks      WHERE true;
  DELETE FROM public.user_score_agg    WHERE true;
  DELETE FROM public.team_score_agg    WHERE true;
  DELETE FROM public.frozen_user_score WHERE true;
  DELETE FROM public.frozen_team_score WHERE true;

  IF p_clear_challenges THEN
    SELECT COUNT(*)::int INTO v_challenges FROM public.challenges;
    UPDATE public.challenges SET unlock_after = NULL WHERE unlock_after IS NOT NULL;
    DELETE FROM public.challenges WHERE true;
  END IF;

  IF p_clear_teams THEN
    SELECT COUNT(*)::int INTO v_teams FROM public.teams;
    DELETE FROM public.awards WHERE true;
    DELETE FROM public.teams  WHERE true;
  END IF;

  IF p_clear_notifications THEN
    SELECT COUNT(*)::int INTO v_notifs FROM public.notifications;
    DELETE FROM public.notifications WHERE true;
  END IF;

  UPDATE public.event_settings
  SET name              = v_name,
      is_active         = false,
      start_time        = NULL,
      end_time          = NULL,
      freeze_scoreboard = false,
      freeze_time       = NULL,
      auto_froze_at     = NULL,
      hide_scores       = false,
      is_paused         = false,
      paused_at         = NULL,
      pause_message     = NULL
  WHERE id = 1;

  INSERT INTO public.audit_log (actor_id, action, metadata)
  VALUES (auth.uid(), 'start_new_event', jsonb_build_object(
    'name', v_name, 'submissions_cleared', v_subs,
    'challenges_cleared', v_challenges, 'teams_cleared', v_teams,
    'notifications_cleared', v_notifs
  ));

  RETURN jsonb_build_object(
    'success', true,
    'name', v_name,
    'submissions_cleared', v_subs,
    'challenges_cleared', v_challenges,
    'teams_cleared', v_teams,
    'notifications_cleared', v_notifs,
    'users_kept', (SELECT COUNT(*)::int FROM public.profiles)
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_start_new_event(text, boolean, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_start_new_event(text, boolean, boolean, boolean) TO authenticated, service_role;
