-- Fix: signed-in updates on profiles and teams failed with
-- "infinite recursion detected in policy".
--
-- 20260901070000 wrapped auth.uid() and the helper functions in every policy
-- as (select ...) so Postgres evaluates them once per query. Correct for
-- every table but two. profiles_update_self and teams_update carry WITH
-- CHECK sub-selects on their own table, to pin the columns a player may not
-- change. Those sub-selects go through the table's SELECT policy, and a
-- SELECT policy that itself contains a sub-select, on a table whose other
-- policies already sub-select the table, trips Postgres's recursion guard.
-- The result: every profile save and team edit by a player was refused
-- since that migration deployed.
--
-- Restore all policies on those two tables to their previous, unwrapped
-- text. The other tables keep the InitPlan form, which is safe there because
-- none of their policies reference themselves. Verified locally: the updates
-- work again, the column pins hold, admins keep their access, and the
-- recursion is gone for signed-in and anonymous callers alike.

-- ── profiles ─────────────────────────────────────────────────────────────
ALTER POLICY profiles_select ON public.profiles
  USING ((id = auth.uid()) OR public.is_admin());

ALTER POLICY profiles_insert ON public.profiles
  WITH CHECK (public.is_admin()
              OR ((id = auth.uid()) AND (role = 'player') AND (COALESCE(is_banned, false) = false)));

ALTER POLICY profiles_update_admin ON public.profiles
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

ALTER POLICY profiles_update_self ON public.profiles
  USING (id = auth.uid())
  WITH CHECK (
    (id = auth.uid())
    AND (role = (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()))
    AND (email = (SELECT p.email FROM public.profiles p WHERE p.id = auth.uid()))
    AND (is_banned IS NOT DISTINCT FROM (SELECT p.is_banned FROM public.profiles p WHERE p.id = auth.uid()))
    AND (is_hidden IS NOT DISTINCT FROM (SELECT p.is_hidden FROM public.profiles p WHERE p.id = auth.uid()))
    AND (team_id IS NOT DISTINCT FROM (SELECT p.team_id FROM public.profiles p WHERE p.id = auth.uid()))
    AND (created_at IS NOT DISTINCT FROM (SELECT p.created_at FROM public.profiles p WHERE p.id = auth.uid()))
  );

-- ── teams ────────────────────────────────────────────────────────────────
ALTER POLICY teams_select ON public.teams
  USING (auth.uid() IS NOT NULL);

ALTER POLICY teams_update ON public.teams
  USING ((captain_id = auth.uid()) OR public.is_admin())
  WITH CHECK (public.is_admin()
              OR ((captain_id = auth.uid())
                  AND (is_banned IS NOT DISTINCT FROM (SELECT t.is_banned FROM public.teams t WHERE t.id = teams.id))));

ALTER POLICY teams_delete ON public.teams
  USING (public.is_admin());

ALTER POLICY teams_insert_blocked ON public.teams
  WITH CHECK (false);
