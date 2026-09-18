-- Fix First Blood consistency across both RPCs.
--
-- BUG 1 (get_challenge_solvers): DISTINCT ON (s.user_id) forces
--   ORDER BY s.user_id first, so rows were sorted by UUID, not solve time.
--   The frontend marks row[0] as First Blood → wrong user got it.
--   Fix: wrap the DISTINCT ON query as a subquery, re-sort by submitted_at.
--
-- BUG 2 (get_solve_data): first_blood_username subquery did not filter
--   is_hidden, but get_challenge_solvers does. A hidden user could be
--   named First Blood on the card while absent from the solver list.
--   Fix: add p.is_hidden = false to the first_blood subquery.

CREATE OR REPLACE FUNCTION public.get_challenge_solvers(p_challenge_id uuid)
RETURNS TABLE(username text, submitted_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = '' AS $$
DECLARE
  v_cutoff timestamptz;
BEGIN
  IF public.scoreboard_is_hidden() THEN RETURN; END IF;
  IF public.scoreboard_is_masked() THEN
    SELECT e.freeze_time INTO v_cutoff FROM public.event_settings e WHERE e.id = 1;
  END IF;
  RETURN QUERY
  SELECT t.username, t.submitted_at
  FROM (
    SELECT DISTINCT ON (s.user_id) p.username, s.submitted_at
    FROM public.submissions s JOIN public.profiles p ON p.id = s.user_id
    WHERE s.challenge_id = p_challenge_id AND s.is_correct = true
      AND p.is_banned = false AND p.is_hidden = false
      AND (v_cutoff IS NULL OR s.submitted_at <= v_cutoff)
    ORDER BY s.user_id, s.submitted_at ASC
  ) t
  ORDER BY t.submitted_at ASC;
END;
$$;

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
    COUNT(*) AS solve_count,
    (SELECT p.username
       FROM public.submissions s2
       JOIN public.profiles p ON p.id = s2.user_id
      WHERE s2.challenge_id = s.challenge_id
        AND s2.is_correct = true
        AND p.is_banned = false
        AND p.is_hidden = false
        AND (v_cutoff IS NULL OR s2.submitted_at <= v_cutoff)
      ORDER BY s2.submitted_at ASC
      LIMIT 1) AS first_blood_username
  FROM public.submissions s
  WHERE s.is_correct = true
    AND (v_cutoff IS NULL OR s.submitted_at <= v_cutoff)
  GROUP BY s.challenge_id;
END;
$$;
