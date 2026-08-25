-- Corrections after re-reading the earlier hardening: one of those changes
-- restricted an admin, which was never the intent.

-- ── 1. Give admins back INSERT on profiles ────────────────────────────
--
-- Pinning role = 'player' on profiles_insert was meant to stop a player
-- inserting themselves as an admin. It applied to admins too, so an admin
-- creating a profile row directly could no longer set its role. Admins were
-- always meant to manage profiles; only self-service inserts need pinning.

DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;

CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT
  WITH CHECK (
    public.is_admin()
    OR (
      id = auth.uid()
      AND role = 'player'
      AND COALESCE(is_banned, false) = false
    )
  );

-- ── 2. is_hidden did not actually hide anyone ─────────────────────────
--
-- safe_profiles is the anon-readable listing view and selected every profile,
-- so a player who set is_hidden still appeared in public listings; the flag
-- was merely returned as a column for the client to honour or ignore.
-- user_scores already filters both flags, so the two disagreed about who is
-- public. Filter here to match, which also drops banned accounts from the
-- listings they should not appear in.

CREATE OR REPLACE VIEW public.safe_profiles
WITH (security_invoker = false)
AS SELECT id, username, avatar_url, country, bio, affiliation, website,
       team_id, is_banned, is_hidden, created_at
FROM public.profiles
WHERE COALESCE(is_banned, false) = false
  AND COALESCE(is_hidden, false) = false;

-- ── 3. The public challenge count included unreleased challenges ──────
--
-- get_challenges_count is callable anonymously and counted every row, so it
-- told anyone how many challenges were being held back before release.
-- Count what a player can actually see; admins read the real list directly.

-- Keep the bigint return type: CREATE OR REPLACE cannot change it.
CREATE OR REPLACE FUNCTION public.get_challenges_count()
RETURNS bigint LANGUAGE sql SECURITY DEFINER STABLE SET search_path = '' AS $$
  SELECT COUNT(*) FROM public.challenges WHERE is_visible = true;
$$;
