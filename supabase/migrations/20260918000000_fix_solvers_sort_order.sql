-- Fix get_challenge_solvers: sort by solve time, not by UUID.
--
-- DISTINCT ON (s.user_id) forces ORDER BY s.user_id first, which means
-- the returned rows are ordered by UUID — not by submitted_at.
-- The frontend marks row[0] as First Blood, so whichever user had the
-- lowest UUID got First Blood regardless of when they actually solved.
--
-- Fix: wrap the DISTINCT ON query in a subquery so the outer query can
-- ORDER BY submitted_at ASC independently.

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
