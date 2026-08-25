-- Deleting a challenge failed with "DELETE requires a WHERE clause".
--
-- Supabase enables pg_safeupdate, which rejects any DELETE or UPDATE without
-- a WHERE clause to stop an accidental mass delete through the API. It hooks
-- the executor, so it fires inside SECURITY DEFINER functions too.
--
-- admin_delete_challenge calls recompute_scores, which clears both aggregate
-- tables with bare DELETEs, so the whole call was rejected and no challenge
-- could be deleted. admin_reset_event has the same problem across four
-- statements, so RESET EVENT SCORES was broken in the same way; that one
-- predates this work and came with the original schema.
--
-- Clearing the whole table is the intent in both cases, so say so explicitly
-- with WHERE true.

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
  SELECT hu.user_id, 0, 0, COALESCE(SUM(h.cost), 0)::int
  FROM public.hint_unlocks hu
  JOIN public.hints h ON h.id = hu.hint_id
  GROUP BY hu.user_id
  ON CONFLICT (user_id) DO UPDATE SET hint_spend = EXCLUDED.hint_spend;

  INSERT INTO public.team_score_agg (team_id, total_points, solved_count, hint_spend)
  SELECT p.team_id, 0, 0, COALESCE(SUM(h.cost), 0)::int
  FROM public.hint_unlocks hu
  JOIN public.hints h ON h.id = hu.hint_id
  JOIN public.profiles p ON p.id = hu.user_id
  WHERE p.team_id IS NOT NULL
  GROUP BY p.team_id
  ON CONFLICT (team_id) DO UPDATE SET hint_spend = EXCLUDED.hint_spend;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_reset_event()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.is_admin() THEN RETURN jsonb_build_object('error', 'Unauthorized'); END IF;

  DELETE FROM public.submissions WHERE true;
  DELETE FROM public.hint_unlocks WHERE true;
  DELETE FROM public.user_score_agg WHERE true;
  DELETE FROM public.team_score_agg WHERE true;

  INSERT INTO public.audit_log (actor_id, action, metadata)
  VALUES (auth.uid(), 'reset_event', jsonb_build_object('ts', now()));

  RETURN jsonb_build_object('success', true);
END;
$$;
