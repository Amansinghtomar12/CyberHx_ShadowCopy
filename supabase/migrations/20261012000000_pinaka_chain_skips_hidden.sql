-- ════════════════════════════════════════════════════════════════════════
--  Pinaka — a chain steps over a challenge that is not visible.
--
--  THE DEADLOCK
--
--  A chain's step N opened when its team had solved step N−1. `is_visible`
--  is a switch on the challenge and has nothing to do with the chain, so
--  an organiser can hide the middle of a three-step chain without touching
--  the chain at all — a draft they have not finished, or one pulled during
--  the event because its flag leaked.
--
--  The moment they do, step 3 asks whether step 2 is solved. Nobody can
--  see step 2, so nobody can solve it, so step 3 never opens. And because
--  pinaka_chapter_complete counts only visible challenges, step 3 is
--  visible, unsolved and now unreachable — the chapter can never close,
--  and the chapter after it can never open. One toggle, and every team in
--  the event is stopped at a door with no handle, for the rest of the
--  event, with nothing on screen to say why.
--
--  THE RULE
--
--  A step opens when the previous *visible* step is solved; a step with
--  nothing visible before it in its chain is a first door. A hidden
--  challenge is simply not part of the chain anybody is playing, which is
--  the same rule pinaka_chapter_complete already applies — the two now
--  agree about what a chain contains.
--
--  Nothing else changes. Story mode off, a challenge in no chain, the
--  chapter gate, a team that does not exist: all exactly as before.
-- ════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.pinaka_team_unlocked(
  p_team_id uuid, p_challenge_id uuid
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT
    NOT COALESCE((SELECT es.pinaka_story_mode FROM public.event_settings es WHERE es.id = 1), false)
    OR NOT EXISTS (
      SELECT 1 FROM public.chain_series_members m WHERE m.challenge_id = p_challenge_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.chain_series_members m
      -- LEFT: a chain with no chapter is not chapter-gated, which is what
      -- keeps an organiser who never used chapters on their old behaviour.
      LEFT JOIN public.pinaka_series_chapter pc ON pc.series_id = m.series_id
      WHERE m.challenge_id = p_challenge_id
        AND public.pinaka_chapter_unlocked(p_team_id, pc.chapter)
        AND (
          -- A first door: nothing visible stands before it in this chain.
          NOT EXISTS (
            SELECT 1
            FROM public.chain_series_members b
            JOIN public.challenges bc ON bc.id = b.challenge_id AND bc.is_visible
            WHERE b.series_id = m.series_id AND b.position < m.position
          )
          -- Or the step before it that a player can actually see is solved.
          OR (p_team_id IS NOT NULL AND EXISTS (
                SELECT 1
                FROM public.chain_series_members prev
                JOIN public.submissions s ON s.challenge_id = prev.challenge_id
                WHERE prev.series_id = m.series_id
                  AND prev.position = (
                        SELECT max(b.position)
                        FROM public.chain_series_members b
                        JOIN public.challenges bc
                          ON bc.id = b.challenge_id AND bc.is_visible
                        WHERE b.series_id = m.series_id AND b.position < m.position
                      )
                  AND s.team_id = p_team_id
                  AND s.is_correct
              ))
        )
    );
$$;

REVOKE EXECUTE ON FUNCTION public.pinaka_team_unlocked(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.pinaka_team_unlocked(uuid, uuid) TO authenticated, service_role;
