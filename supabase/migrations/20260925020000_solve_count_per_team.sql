-- The solve count on a challenge card counts teams, not players.
--
-- submit_flag_tx lets every member of a team submit a flag the team already
-- has (the team is scored once, in apply_solve_to_scores), so each teammate
-- adds a correct submission row. get_solve_data counted those rows, and a
-- challenge solved by 42 teams showed "47 solves". It now counts each team
-- once (a player without a team counts as their own entry) and skips banned
-- and hidden accounts, the same rule the first-blood name and the solver
-- list already use. Scores are not touched.

CREATE OR REPLACE FUNCTION public.get_solve_data()
RETURNS TABLE(challenge_id uuid, solve_count bigint, first_blood_username text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_cutoff timestamptz;
BEGIN
  IF public.scoreboard_is_hidden() THEN RETURN; END IF;
  IF public.scoreboard_is_masked() THEN
    SELECT e.freeze_time INTO v_cutoff FROM public.event_settings e WHERE e.id = 1;
  END IF;
  RETURN QUERY
  SELECT
    s.challenge_id,
    COUNT(DISTINCT COALESCE(s.team_id::text, 'user:' || s.user_id::text)) AS solve_count,
    (SELECT p2.username
       FROM public.submissions s2
       JOIN public.profiles p2 ON p2.id = s2.user_id
      WHERE s2.challenge_id = s.challenge_id
        AND s2.is_correct = true
        AND p2.is_banned = false
        AND p2.is_hidden = false
        AND (v_cutoff IS NULL OR s2.submitted_at <= v_cutoff)
      ORDER BY s2.submitted_at ASC
      LIMIT 1) AS first_blood_username
  FROM public.submissions s
  JOIN public.profiles p ON p.id = s.user_id
  WHERE s.is_correct = true
    AND p.is_banned = false
    AND p.is_hidden = false
    AND (v_cutoff IS NULL OR s.submitted_at <= v_cutoff)
  GROUP BY s.challenge_id;
END;
$$;
