-- Confirmed: a player could PATCH their own profiles.created_at.
--
-- profiles_update_self pinned role, email, is_banned, is_hidden and team_id
-- but not created_at, so a plain
--   PATCH /rest/v1/profiles?id=eq.<self> {"created_at":"1999-01-01"}
-- succeeded. Verified live: the write landed and the row read back with the
-- fake timestamp until it was restored.
--
-- This is a real cheat vector on the platform: safe_profiles exposes
-- created_at as part of the public listing, and it is the natural tiebreaker
-- for equal scores (whoever registered earlier ranks higher). Rewriting it
-- lets a player claim veteran status and jump the tie ordering, and it also
-- corrupts audit records that key off account age.
--
-- created_at is set once at insert and never changes; pin it.

DROP POLICY IF EXISTS "profiles_update_self" ON public.profiles;

CREATE POLICY "profiles_update_self" ON public.profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role = (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid())
    AND email = (SELECT p.email FROM public.profiles p WHERE p.id = auth.uid())
    AND is_banned IS NOT DISTINCT FROM
        (SELECT p.is_banned FROM public.profiles p WHERE p.id = auth.uid())
    AND is_hidden IS NOT DISTINCT FROM
        (SELECT p.is_hidden FROM public.profiles p WHERE p.id = auth.uid())
    AND team_id IS NOT DISTINCT FROM
        (SELECT p.team_id FROM public.profiles p WHERE p.id = auth.uid())
    AND created_at IS NOT DISTINCT FROM
        (SELECT p.created_at FROM public.profiles p WHERE p.id = auth.uid())
  );
