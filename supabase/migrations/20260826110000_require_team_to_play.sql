-- Every solve and every hint belongs to a team.
--
-- WHY
--   team_score_agg only counts submissions where team_id IS NOT NULL, and the
--   scoreboard reads team_scores. So a player with no team scores into a void:
--   their own total on the Users list climbs, and the competition scoreboard
--   never shows a point of it. They would only discover this by asking why
--   they are not on the board.
--
--   The way in is not an API call. allow_team_changes defaults to true, so a
--   player can leave their team mid-event; from that moment every solve lands
--   with team_id NULL. Admins were exempt from the UI's team gate as well, so
--   their test solves did the same.
--
--   Refusing outright is the honest behaviour, and it matches how the platform
--   already presents itself: the challenge list asks for a team first. Solo
--   players are not excluded -- a team of one is still a team, and create_team
--   is one field and one click.
--
-- HINTS TOO
--   unlock_hint charged the individual and, when a team existed, the team as
--   well. Teamless, it debited user_score_agg and nothing else, which is the
--   same split-brain in the other direction: points leave a balance that no
--   scoreboard shows. Same rule, same reason.
--
-- The window check from 20260826050000 and the FOR UPDATE balance lock from
-- 20260825310000 are both carried over unchanged; only the team gate is new.

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

  SELECT p.team_id INTO v_team
  FROM public.profiles p
  WHERE p.id = auth.uid() AND COALESCE(p.is_banned, false) = false;

  GET DIAGNOSTICS v_found = ROW_COUNT;
  IF NOT v_found THEN
    RETURN jsonb_build_object('error', 'Account not found or banned');
  END IF;

  -- A hint bought without a team debits a balance no scoreboard reflects.
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
