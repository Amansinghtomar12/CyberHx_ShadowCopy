-- Make the solve board cheap enough to actually keep fresh.
--
-- WHY NOW
--   The client fetched solve counts, first blood and teammates' solves exactly
--   once per session, so a teammate's solve was invisible until someone hit
--   reload. Fixing that means polling get_solve_data, and at 5000 players that
--   is ~17 calls a second. At the 70ms this function used to take, that is
--   1.17 seconds of CPU per second -- more than a whole core saturated
--   permanently, on a two-core box, for one query.
--
-- WHERE THE 70ms WENT
--   COUNT(DISTINCT s.user_id) forced a sort of every correct submission:
--   56k rows at event scale, spilling 2.3MB to disk on an external merge.
--
--   The DISTINCT was never needed. uniq_submission_correct_per_user_challenge
--   is a UNIQUE index on (user_id, challenge_id) WHERE is_correct, so a player
--   physically cannot have two correct rows for one challenge -- the database
--   has been enforcing that since 20260825320000. COUNT(*) is therefore the
--   same number by construction, and it lets the planner hash-aggregate
--   instead of sorting. Verified against real data: zero rows differ.
--
-- THE INDEX
--   That alone took it to ~24ms, with the remaining cost a heap scan over
--   56k rows. An index-only scan does the same work in a third of the time,
--   but the planner would not choose the existing three-column index for it.
--   A narrow partial index on (challenge_id) WHERE is_correct is small enough
--   to win on cost, and the planner picks it unprompted. 416kB at event
--   scale, Heap Fetches: 0.
--
-- MEASURED, on 125k submissions / 56k correct / 5000 players / 50 challenges:
--   before                        70ms
--   COUNT(*)                      24ms
--   COUNT(*) + narrow index      8.8ms
--
--   At 17 calls a second that is 0.15 cores instead of 1.17.

CREATE INDEX IF NOT EXISTS idx_submissions_solvecount
  ON public.submissions (challenge_id) WHERE is_correct = true;

-- Return type is unchanged (COUNT(*) is bigint, as COUNT(DISTINCT ...) was),
-- so CREATE OR REPLACE is safe here and the client needs no change.
CREATE OR REPLACE FUNCTION public.get_solve_data()
RETURNS TABLE(challenge_id uuid, solve_count bigint, first_blood_username text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.challenge_id,
    -- Safe because of uniq_submission_correct_per_user_challenge: one correct
    -- row per player per challenge, so counting rows counts distinct players.
    COUNT(*) AS solve_count,
    (SELECT p.username
       FROM public.submissions s2
       JOIN public.profiles p ON p.id = s2.user_id
      WHERE s2.challenge_id = s.challenge_id
        AND s2.is_correct = true
        AND p.is_banned = false
      ORDER BY s2.submitted_at ASC
      LIMIT 1) AS first_blood_username
  FROM public.submissions s
  WHERE s.is_correct = true
  GROUP BY s.challenge_id;
END;
$$;
