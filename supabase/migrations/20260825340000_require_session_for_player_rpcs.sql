-- Player RPCs answered unauthenticated callers instead of refusing them.
--
-- None of these leak anything critical, but before the event starts they tell
-- an anonymous visitor which challenges exist, how many are being held back,
-- and who has solved what. They should be refused at the permission layer the
-- way the admin RPCs already are.
--
-- Note the REVOKE has to name PUBLIC, not just anon: PostgreSQL grants EXECUTE
-- on a new function to PUBLIC by default, and revoking from anon alone leaves
-- that default in place. This is the same reason the earlier admin lockdown
-- had to revoke from PUBLIC.
--
-- Safe to restrict: main.tsx renders <AuthPage /> whenever there is no user, so
-- every call site for these functions sits behind the login gate. service_role
-- keeps EXECUTE so the Edge Functions are unaffected.

-- ── Read paths that describe the competition ──────────────────────────
REVOKE EXECUTE ON FUNCTION public.get_solve_data() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_challenges_count() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_challenge_solvers(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_team_solves(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_solve_data() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_challenges_count() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_challenge_solvers(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_team_solves(uuid) TO authenticated, service_role;

-- ── Team membership actions ───────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.create_team(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.join_team(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.leave_team() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_my_team_invite() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_team(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.join_team(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.leave_team() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_team_invite() TO authenticated, service_role;

-- ── Hint paths, same family, same treatment ───────────────────────────
-- Not on the list but identical in kind: leaving them reachable would keep a
-- hole of exactly the class the others are being closed for.
REVOKE EXECUTE ON FUNCTION public.unlock_hint(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_hint_text(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.unlock_hint(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_hint_text(uuid) TO authenticated, service_role;

-- ── get_my_team_invite: say no rather than answering null ─────────────
--
-- With no session auth.uid() is NULL, the join matched nothing and the
-- function returned null, which reads as "you have no team" rather than "you
-- are not signed in". The permission revoke above already stops anonymous
-- callers, but the function should not depend on the grant alone.
CREATE OR REPLACE FUNCTION public.get_my_team_invite()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN (
    SELECT t.invite_code FROM public.teams t
    JOIN public.profiles p ON p.team_id = t.id
    WHERE p.id = auth.uid()
  );
END;
$$;

-- CREATE OR REPLACE resets nothing about privileges, but state them again so
-- the end state of this migration is explicit rather than inherited.
REVOKE EXECUTE ON FUNCTION public.get_my_team_invite() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_team_invite() TO authenticated, service_role;

-- Deliberately untouched: is_admin, is_mod_or_admin and is_not_banned are
-- called from inside RLS policies, which are evaluated for the anon role too.
-- Revoking EXECUTE on them would break policy evaluation rather than harden it.
