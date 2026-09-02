-- A team's per-member solves are the team's business.
--
-- get_team_solves(team_id) returned who on a team solved which challenge
-- and when, to any signed-in caller for any team id. Nothing in the app
-- asks for another team, but the API answered anyway, so a curious player
-- could read the rival's roster-by-challenge with one call. Team totals
-- and per-challenge solver lists stay public -- that is the scoreboard --
-- but the per-member breakdown is now visible only to that team's own
-- members, and to admins.

CREATE OR REPLACE FUNCTION public.get_team_solves(p_team_id uuid)
RETURNS TABLE(challenge_id uuid, username text, submitted_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF NOT public.is_admin() AND NOT EXISTS (
    SELECT 1 FROM public.profiles me
    WHERE me.id = auth.uid() AND me.team_id = p_team_id
  ) THEN
    RAISE EXCEPTION 'Only members of this team can view its solves';
  END IF;

  RETURN QUERY
  SELECT DISTINCT ON (s.challenge_id) s.challenge_id, p.username, s.submitted_at
  FROM public.submissions s JOIN public.profiles p ON p.id = s.user_id
  WHERE s.team_id = p_team_id AND s.is_correct = true
  ORDER BY s.challenge_id, s.submitted_at ASC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_team_solves(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_team_solves(uuid) TO authenticated, service_role;
