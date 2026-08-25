-- Any logged-in player could read every team's invite code.
--
-- teams_select is USING (auth.uid() IS NOT NULL) and authenticated holds
-- SELECT on every table, so a plain
--   GET /rest/v1/teams?select=name,invite_code
-- returned the invite code of every team on the platform. Anyone with an
-- account could then join any team they liked, which defeats the entire
-- invite mechanism: private teams were effectively open, a player could plant
-- themselves in a rival team to read its solves, and a team could be filled
-- with strangers to lock its real members out once team_size was reached.
--
-- The public_teams view exists to hide the column, but a view only helps when
-- clients are forced through it, and nothing forced them. This is the same
-- shape as the hint content exposure: the row policy was right, the column
-- privileges were not.
--
-- Fix it with column privileges, since the rows themselves are legitimately
-- readable (team names and countries are public). Table-level SELECT has to be
-- revoked first, because a column-level REVOKE cannot carve an exception out
-- of a table-level grant.
--
-- Legitimate access to the code is unaffected: get_my_team_invite() returns it
-- to a member of that team and admin_team_invite() to an admin, both
-- SECURITY DEFINER, and join_team() matches on it server-side without ever
-- returning it.

REVOKE SELECT ON public.teams FROM authenticated;

GRANT SELECT (
  id, name, captain_id, website, affiliation, country, is_banned, created_at
) ON public.teams TO authenticated;
