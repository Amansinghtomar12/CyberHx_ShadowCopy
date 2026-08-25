-- Pre-event security review fixes.

-- ── 1. Hint content was readable by any logged-in player ──────────────
--
-- hints_select grants SELECT on the whole hints row to any authenticated
-- user for any visible challenge, and the schema grants authenticated ALL
-- on every table. The content column therefore came back from a plain
--   GET /rest/v1/hints?select=content
-- letting any player read every hint for free and bypass the hint economy
-- entirely. The public_hints view existed to prevent this, but nothing
-- forced clients through it.
--
-- Fix with column privileges rather than a policy change: the player UI
-- embeds hints (id, cost) through public_challenges to render hint costs,
-- so the rows must stay selectable — only content must not be. Admins are
-- unaffected because they read hints through get_challenge_hints, which is
-- SECURITY DEFINER, and their writes use INSERT/UPDATE/DELETE privileges.

REVOKE SELECT ON public.hints FROM authenticated;
GRANT SELECT (id, challenge_id, cost, created_at) ON public.hints TO authenticated;

-- ── 2. Individual scores were computed with SUM(DISTINCT points) ──────
--
-- SUM(DISTINCT c.points) sums the distinct point *values*, not the points
-- of each solved challenge. Three solves worth 100 each totalled 100
-- instead of 300, so the player scoreboard understated anyone who solved
-- more than one challenge of equal value.
--
-- team_scores already does this correctly by picking one row per challenge
-- with DISTINCT ON and summing that. Mirror it here.

CREATE OR REPLACE VIEW public.user_scores AS
SELECT
  p.id, p.username, p.team_id, p.country, p.avatar_url,
  COALESCE(s.total_points, 0) AS total_points,
  COALESCE(s.solved_count, 0) AS solved_count,
  s.last_solve
FROM public.profiles p
LEFT JOIN LATERAL (
  SELECT
    COUNT(*)::int AS solved_count,
    MAX(first_solve) AS last_solve,
    COALESCE(SUM(pts), 0)::int AS total_points
  FROM (
    SELECT DISTINCT ON (sub.challenge_id)
      sub.challenge_id, c.points AS pts, sub.submitted_at AS first_solve
    FROM public.submissions sub
    JOIN public.challenges c ON c.id = sub.challenge_id
    WHERE sub.user_id = p.id AND sub.is_correct = true
    ORDER BY sub.challenge_id, sub.submitted_at ASC
  ) deduped
) s ON true
WHERE p.is_banned = false AND p.is_hidden = false;

-- ── 3. profiles_insert did not pin the privileged columns ─────────────
--
-- The policy only checked id = auth.uid(), so the inserted row could name
-- any role. It is not reachable today because handle_new_user always
-- creates the row and no DELETE policy exists to remove it, but it is a
-- standing privilege escalation primitive one policy change away from
-- being live. Pin the columns that decide privilege.

DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;

CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT
  WITH CHECK (
    id = auth.uid()
    AND role = 'player'
    AND COALESCE(is_banned, false) = false
  );
