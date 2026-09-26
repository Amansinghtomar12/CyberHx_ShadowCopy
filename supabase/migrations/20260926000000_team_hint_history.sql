-- A team's hint history, so its page can show what it spent and match the
-- scoreboard.
--
-- The team page added up full challenge points and never subtracted hints,
-- while the scoreboard subtracts them, so any team that bought a hint saw
-- two different totals. hint_unlocks is readable only row by row by its own
-- player, so a team had no way to list its hints. This returns one row per
-- hint the team paid for: the first unlock of each hint among the team's
-- current members, the same rule hint_spend_expected() and unlock_hint use,
-- so the costs listed add up to the team's hint spend. Read-only; callable
-- by a member of that team or an admin.

CREATE OR REPLACE FUNCTION public.get_team_hint_unlocks(p_team_id uuid)
RETURNS TABLE(challenge_id uuid, challenge_title text, cost int, username text, unlocked_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  IF NOT public.is_admin() AND NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.team_id = p_team_id
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT f.challenge_id, f.title, f.cost, f.username, f.unlocked_at
  FROM (
    SELECT DISTINCT ON (hu.hint_id)
      h.challenge_id, c.title, h.cost, p.username, hu.unlocked_at
    FROM public.hint_unlocks hu
    JOIN public.profiles p ON p.id = hu.user_id
    JOIN public.hints h ON h.id = hu.hint_id
    JOIN public.challenges c ON c.id = h.challenge_id
    WHERE p.team_id = p_team_id
    ORDER BY hu.hint_id, hu.unlocked_at, hu.id
  ) f
  ORDER BY f.unlocked_at;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_team_hint_unlocks(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_team_hint_unlocks(uuid) TO authenticated, service_role;
