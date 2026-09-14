-- Admin team inspection: show each member's score and solve count.
--
-- The owner/admin opens a team in the panel and wants to see who on that
-- team solved how much. admin_team_members previously returned only
-- (id, username, email); this adds each member's net score and solve
-- count, using the exact same formula the public scoreboard uses
-- (points earned minus hint spend, floored at zero) so the numbers match
-- what everyone else sees.
--
-- No security change: the is_admin() gate is unchanged, the function stays
-- SECURITY DEFINER with a pinned search_path, and execute stays revoked
-- from anon/PUBLIC. Only admins ever reach it.

-- Return signature changes, so the old function must be dropped first.
DROP FUNCTION IF EXISTS public.admin_team_members(uuid);

CREATE FUNCTION public.admin_team_members(p_team_id uuid)
RETURNS TABLE(id uuid, username text, email text, score int, solved_count int)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = '' AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  RETURN QUERY
    SELECT
      p.id,
      p.username,
      p.email,
      GREATEST(COALESCE(a.total_points, 0) - COALESCE(a.hint_spend, 0), 0)::int AS score,
      COALESCE(a.solved_count, 0)::int AS solved_count
    FROM public.profiles p
    LEFT JOIN public.user_score_agg a ON a.user_id = p.id
    WHERE p.team_id = p_team_id
    ORDER BY score DESC, p.username ASC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_team_members(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_team_members(uuid) TO authenticated, service_role;
