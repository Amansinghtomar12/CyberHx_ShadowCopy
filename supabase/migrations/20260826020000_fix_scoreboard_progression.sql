-- The scoreboard's "Score progression" graph never drew anything.
--
-- Scoreboard.tsx called
--   supabase.rpc('get_solve_data', { team_ids: [...] })
-- but get_solve_data takes no arguments. PostgREST resolves a function by the
-- argument names in the body, found no public.get_solve_data(team_ids), and
-- answered PGRST202 / 404. The component treats any error as "no data yet" and
-- returns, so the panel sat on its "Awaiting the first solve" empty state for
-- the whole event -- indistinguishable from a competition where nobody had
-- scored.
--
-- The signature was not the only mismatch. get_solve_data returns
-- (challenge_id, solve_count, first_blood_username), which is what App.tsx
-- wants for solve counts and first blood, while the graph needs one row per
-- scoring event with a team, a value and a timestamp. Two callers wanted two
-- different shapes from one name. Give the graph its own function instead of
-- overloading get_solve_data, so neither caller can drift into the other.
--
-- Attribution here deliberately mirrors recompute_scores exactly, so the curve
-- lands on the same number the standings table shows:
--   * a solve counts once per (team, challenge), taking the team's earliest
--     correct submission, valued at the challenge's points
--   * hint spend is attributed to the unlocking member's current team, which
--     is how team_score_agg.hint_spend is rebuilt
-- Hint unlocks are returned as negative events so the line dips when a team
-- buys a hint, matching team_scores.total_points being net of hint spend.

CREATE OR REPLACE FUNCTION public.get_score_progression(p_team_ids uuid[])
RETURNS TABLE(
  team_id     uuid,
  event_key   text,
  points      int,
  occurred_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_team_ids IS NULL OR pg_catalog.array_length(p_team_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH wanted AS (
    -- Bound the input: the graph draws ten series, and an unbounded array
    -- would let one caller ask for a scan of every team at once.
    SELECT DISTINCT t AS id
    FROM pg_catalog.unnest(p_team_ids[1:50]) AS t
  ),
  solves AS (
    SELECT DISTINCT ON (s.team_id, s.challenge_id)
      s.team_id,
      s.challenge_id::text AS event_key,
      c.points             AS points,
      s.submitted_at       AS occurred_at
    FROM public.submissions s
    JOIN public.challenges c ON c.id = s.challenge_id
    JOIN wanted w            ON w.id = s.team_id
    WHERE s.is_correct = true
    ORDER BY s.team_id, s.challenge_id, s.submitted_at ASC
  ),
  spends AS (
    SELECT
      p.team_id,
      hu.id::text     AS event_key,
      -h.cost         AS points,
      hu.unlocked_at  AS occurred_at
    FROM public.hint_unlocks hu
    JOIN public.hints h    ON h.id = hu.hint_id
    JOIN public.profiles p ON p.id = hu.user_id
    JOIN wanted w          ON w.id = p.team_id
    WHERE h.cost > 0
  )
  SELECT * FROM solves
  UNION ALL
  SELECT * FROM spends
  ORDER BY occurred_at ASC, event_key ASC;
END;
$$;

-- Same treatment as the other player RPCs: PostgreSQL grants EXECUTE to PUBLIC
-- by default, so revoking from anon alone would leave it reachable.
REVOKE EXECUTE ON FUNCTION public.get_score_progression(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_score_progression(uuid[]) TO authenticated, service_role;

-- The solve side reads submissions by team; the existing partial index on
-- (team_id, is_correct) covers the filter but not the per-challenge ordering
-- the DISTINCT ON needs, so it sorts every one of a team's solves on each call.
CREATE INDEX IF NOT EXISTS idx_submissions_team_challenge_correct
  ON public.submissions (team_id, challenge_id, submitted_at)
  WHERE is_correct = true;

-- The spend side joins hint_unlocks to profiles by user; nothing indexed that.
CREATE INDEX IF NOT EXISTS idx_hint_unlocks_user
  ON public.hint_unlocks (user_id);
