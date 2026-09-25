-- A hint is bought once per team, not once per player.
--
-- unlock_hint charged every player who opened a hint, so a second teammate
-- opening a hint the team already had cost the team the price again (Team
-- Pri5m paid 500 twice in the finale). Now:
--
--   * unlock_hint charges nothing when a current teammate already unlocked
--     the hint; it records the player's own unlock and returns the text.
--     Two teammates clicking at the same moment are serialised on a per
--     team+hint lock, so only one of them pays.
--   * get_my_hint_texts and get_hint_text return hints unlocked by any
--     current teammate, so the team sees them without clicking.
--   * recompute_scores charges a team once per hint, and charges the player
--     whose unlock came first in their team.
--   * The totals of teams (and players) who already paid twice are set to
--     what they should be. Only rows that are wrong change, so running this
--     file again changes nothing.
--
-- Solve points are not touched anywhere in this file.

BEGIN;

-- ── 1. unlock_hint ──────────────────────────────────────────────────────
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

  BEGIN
    PERFORM public.check_rate_limit('unlock_hint', auth.uid()::text, 60, 30);
  EXCEPTION WHEN check_violation THEN
    RETURN jsonb_build_object('error', 'Too many hint requests. Wait a minute and try again.');
  END;

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

  IF NOT public.is_admin() AND EXISTS (
    SELECT 1 FROM public.teams t WHERE t.id = v_team AND COALESCE(t.is_banned, false)
  ) THEN
    RETURN jsonb_build_object('error', 'Your team has been removed from the competition.');
  END IF;

  IF NOT public.is_admin() AND public.play_allowlist_blocks(auth.uid()) THEN
    RETURN jsonb_build_object('error', 'Your email is not on the registration list to play this event');
  END IF;

  SELECT e.is_active, e.start_time, e.end_time, e.is_paused INTO v_event
  FROM public.event_settings e WHERE e.id = 1;

  IF NOT public.is_admin() THEN
    IF NOT COALESCE(v_event.is_active, false) THEN
      RETURN jsonb_build_object('error', 'Event not active');
    END IF;
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

  -- One buyer per team and hint: teammates clicking together wait here, and
  -- the second one then finds the first one's unlock below.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('hint-unlock:' || v_team::text || ':' || p_hint_id::text, 0));

  IF EXISTS (
    SELECT 1 FROM public.hint_unlocks hu
    JOIN public.profiles p ON p.id = hu.user_id
    WHERE hu.hint_id = p_hint_id AND p.team_id = v_team
  ) THEN
    INSERT INTO public.hint_unlocks (user_id, hint_id)
    VALUES (auth.uid(), p_hint_id)
    ON CONFLICT (user_id, hint_id) DO NOTHING;
    RETURN jsonb_build_object('success', true, 'text', v_hint.content, 'free', true);
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

-- ── 2. Hint texts include the team's unlocks ────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_hint_texts()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = '' AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_team uuid;
BEGIN
  IF v_uid IS NULL THEN RETURN '{}'::jsonb; END IF;
  IF NOT public.is_admin() AND NOT (public.is_not_banned() AND public.challenges_open()) THEN
    RETURN '{}'::jsonb;
  END IF;
  SELECT p.team_id INTO v_team FROM public.profiles p WHERE p.id = v_uid;
  RETURN COALESCE((
    SELECT jsonb_object_agg(h.id::text, h.content)
    FROM public.hints h
    JOIN public.challenges c ON c.id = h.challenge_id
    WHERE (c.is_visible OR public.is_admin())
      AND EXISTS (
        SELECT 1 FROM public.hint_unlocks hu
        JOIN public.profiles p ON p.id = hu.user_id
        WHERE hu.hint_id = h.id
          AND (hu.user_id = v_uid OR (v_team IS NOT NULL AND p.team_id = v_team))
      )
  ), '{}'::jsonb);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_my_hint_texts() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_my_hint_texts() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_hint_text(hint_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = '' AS $$
DECLARE
  v_hint_id uuid := hint_id;
  v_uid     uuid := auth.uid();
  v_team    uuid;
BEGIN
  IF v_uid IS NULL THEN RETURN NULL; END IF;
  IF NOT public.is_admin() AND NOT (public.is_not_banned() AND public.challenges_open()) THEN
    RETURN NULL;
  END IF;
  SELECT p.team_id INTO v_team FROM public.profiles p WHERE p.id = v_uid;
  RETURN (
    SELECT h.content FROM public.hints h
    JOIN public.challenges c ON c.id = h.challenge_id
    WHERE h.id = v_hint_id
      AND (c.is_visible OR public.is_admin())
      AND EXISTS (
        SELECT 1 FROM public.hint_unlocks hu
        JOIN public.profiles p ON p.id = hu.user_id
        WHERE hu.hint_id = h.id
          AND (hu.user_id = v_uid OR (v_team IS NOT NULL AND p.team_id = v_team))
      )
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_hint_text(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_hint_text(uuid) TO authenticated, service_role;

-- ── 3. What each player and team should have paid ───────────────────────
-- A player pays for a hint when theirs is the first unlock of it in their
-- current team (or they have no team). A team pays once per hint.
CREATE OR REPLACE FUNCTION public.hint_spend_expected()
RETURNS TABLE(kind text, id uuid, spend int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT 'user', hu.user_id, COALESCE(SUM(h.cost), 0)::int
  FROM public.hint_unlocks hu
  JOIN public.hints h ON h.id = hu.hint_id
  JOIN public.profiles p ON p.id = hu.user_id
  WHERE p.team_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.hint_unlocks hu2
    JOIN public.profiles p2 ON p2.id = hu2.user_id
    WHERE hu2.hint_id = hu.hint_id
      AND p2.team_id = p.team_id
      AND (hu2.unlocked_at, hu2.id) < (hu.unlocked_at, hu.id)
  )
  GROUP BY hu.user_id
  UNION ALL
  SELECT 'team', d.team_id, COALESCE(SUM(h.cost), 0)::int
  FROM (
    SELECT DISTINCT p.team_id, hu.hint_id
    FROM public.hint_unlocks hu
    JOIN public.profiles p ON p.id = hu.user_id
    WHERE p.team_id IS NOT NULL
  ) d
  JOIN public.hints h ON h.id = d.hint_id
  GROUP BY d.team_id;
$$;
REVOKE EXECUTE ON FUNCTION public.hint_spend_expected() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.hint_spend_expected() TO service_role;

-- ── 4. recompute_scores uses the same rule ──────────────────────────────
CREATE OR REPLACE FUNCTION public.recompute_scores()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  DELETE FROM public.user_score_agg WHERE true;
  DELETE FROM public.team_score_agg WHERE true;

  INSERT INTO public.user_score_agg (user_id, total_points, solved_count, last_solve)
  SELECT d.user_id, COALESCE(SUM(d.pts), 0)::int, COUNT(*)::int, MAX(d.solved_at)
  FROM (
    SELECT DISTINCT ON (s.user_id, s.challenge_id)
      s.user_id, c.points AS pts, s.submitted_at AS solved_at
    FROM public.submissions s
    JOIN public.challenges c ON c.id = s.challenge_id
    WHERE s.is_correct = true
    ORDER BY s.user_id, s.challenge_id, s.submitted_at ASC
  ) d
  GROUP BY d.user_id;

  INSERT INTO public.team_score_agg (team_id, total_points, solved_count, last_solve)
  SELECT d.team_id, COALESCE(SUM(d.pts), 0)::int, COUNT(*)::int, MAX(d.solved_at)
  FROM (
    SELECT DISTINCT ON (s.team_id, s.challenge_id)
      s.team_id, c.points AS pts, s.submitted_at AS solved_at
    FROM public.submissions s
    JOIN public.challenges c ON c.id = s.challenge_id
    WHERE s.is_correct = true AND s.team_id IS NOT NULL
    ORDER BY s.team_id, s.challenge_id, s.submitted_at ASC
  ) d
  GROUP BY d.team_id;

  INSERT INTO public.user_score_agg (user_id, total_points, solved_count, hint_spend)
  SELECT e.id, 0, 0, e.spend FROM public.hint_spend_expected() e WHERE e.kind = 'user'
  ON CONFLICT (user_id) DO UPDATE SET hint_spend = EXCLUDED.hint_spend;

  INSERT INTO public.team_score_agg (team_id, total_points, solved_count, hint_spend)
  SELECT e.id, 0, 0, e.spend FROM public.hint_spend_expected() e WHERE e.kind = 'team'
  ON CONFLICT (team_id) DO UPDATE SET hint_spend = EXCLUDED.hint_spend;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.recompute_scores() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.recompute_scores() TO service_role;

-- ── 5. Refund teams and players who paid twice ──────────────────────────
-- Only teams where two or more members unlocked the same hint, and only the
-- hint_spend column. Solve points stay exactly as they are.
WITH dup_teams AS (
  SELECT DISTINCT p.team_id
  FROM public.hint_unlocks hu
  JOIN public.profiles p ON p.id = hu.user_id
  WHERE p.team_id IS NOT NULL
  GROUP BY p.team_id, hu.hint_id
  HAVING COUNT(*) > 1
),
expected AS (SELECT * FROM public.hint_spend_expected())
UPDATE public.team_score_agg a
SET hint_spend = e.spend
FROM expected e
WHERE e.kind = 'team' AND e.id = a.team_id
  AND a.team_id IN (SELECT team_id FROM dup_teams)
  AND a.hint_spend <> e.spend;

WITH dup_users AS (
  SELECT hu.user_id
  FROM public.hint_unlocks hu
  JOIN public.profiles p ON p.id = hu.user_id
  WHERE p.team_id IN (
    SELECT p3.team_id
    FROM public.hint_unlocks hu3
    JOIN public.profiles p3 ON p3.id = hu3.user_id
    WHERE p3.team_id IS NOT NULL
    GROUP BY p3.team_id, hu3.hint_id
    HAVING COUNT(*) > 1
  )
),
expected AS (SELECT * FROM public.hint_spend_expected() WHERE kind = 'user')
UPDATE public.user_score_agg a
SET hint_spend = COALESCE((SELECT e.spend FROM expected e WHERE e.id = a.user_id), 0)
WHERE a.user_id IN (SELECT user_id FROM dup_users)
  AND a.hint_spend <> COALESCE((SELECT e.spend FROM expected e WHERE e.id = a.user_id), 0);

COMMIT;
