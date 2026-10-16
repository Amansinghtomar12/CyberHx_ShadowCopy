-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  Pinaka CTF 2026 — the chapter gate                                  ║
-- ║                                                                      ║
-- ║  20261010000000 gated a chained challenge behind the one before it.  ║
-- ║  That locks a chain from the inside, but every chain still opened at ║
-- ║  once: six chapters, six first doors, all standing open on day one.  ║
-- ║                                                                      ║
-- ║  This adds the second level. A chain belongs to a chapter (the       ║
-- ║  mapping already exists, in pinaka_series_chapter), chapters run in  ║
-- ║  a fixed order, and a chapter opens only when every chapter before   ║
-- ║  it is finished — every visible challenge of every published chain   ║
-- ║  in it, solved by that team. Finish Ayodhya and Mithila opens, its   ║
-- ║  artwork takes the page, and its chains appear.                      ║
-- ║                                                                      ║
-- ║  Nothing here stores progress. A chapter's state is read off the     ║
-- ║  submissions the platform already holds, exactly as the chain gate   ║
-- ║  reads it, so two teammates solving the last challenge at the same   ║
-- ║  moment cannot race: there is no counter and no row to win.          ║
-- ║                                                                      ║
-- ║  The whole thing still sleeps behind event_settings.pinaka_story_    ║
-- ║  mode. Off, every function below returns "open" on its first line.   ║
-- ║                                                                      ║
-- ║  A chain with NO chapter assigned is never chapter-gated. That is    ║
-- ║  deliberate: an organiser who has not used chapters keeps exactly    ║
-- ║  the behaviour they had before this migration.                       ║
-- ║                                                                      ║
-- ║  FULL REVERT — see docs/pinaka/EVENT_MODE.md:                        ║
-- ║    SELECT public.admin_set_pinaka_story_mode(false);  -- instant off ║
-- ║    (then re-run 20261010000000's pinaka_team_unlocked to drop the    ║
-- ║     chapter half of the gate, and DROP the functions and table here) ║
-- ╚══════════════════════════════════════════════════════════════════════╝

-- ════════════════════════════════════════════════════════════════════════
-- 1. The order of the journey, in the database.
--
--    The client has the same six in themes/pinaka/chapters/config.ts, with
--    their art and their colour. Only the order and the name live here,
--    because only the order and the name are things the gate has to agree
--    with the client about. The ids match that file exactly.
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.pinaka_chapter (
  id       text    NOT NULL,
  position integer NOT NULL,
  title    text    NOT NULL,
  CONSTRAINT pinaka_chapter_pkey PRIMARY KEY (id),
  CONSTRAINT pinaka_chapter_position_unique UNIQUE (position)
);

INSERT INTO public.pinaka_chapter (id, position, title) VALUES
  ('ayodhya',    1, 'Ayodhya'),
  ('mithila',    2, 'Mithila'),
  ('vanvaas',    3, 'Vanvaas'),
  ('kishkindha', 4, 'Kishkindha'),
  ('setu',       5, 'Setu Bandhan'),
  ('lanka',      6, 'Lanka')
ON CONFLICT (id) DO UPDATE
  SET position = EXCLUDED.position, title = EXCLUDED.title;

ALTER TABLE public.pinaka_chapter ENABLE ROW LEVEL SECURITY;

-- The names and the order are what the board prints on a locked chapter.
-- Not a secret; the gate is what is enforced, not the table of contents.
DROP POLICY IF EXISTS "pinaka_chapter_select" ON public.pinaka_chapter;
CREATE POLICY "pinaka_chapter_select" ON public.pinaka_chapter
  FOR SELECT USING ((SELECT auth.uid()) IS NOT NULL);

REVOKE ALL    ON public.pinaka_chapter FROM anon;
GRANT  SELECT ON public.pinaka_chapter TO authenticated;

-- ════════════════════════════════════════════════════════════════════════
-- 2. When a chapter is finished.
--
--    When it has nothing left: no visible challenge, in any published
--    chain assigned to it, that this team has not solved.
--
--    An empty chapter is finished by that definition, and that is the
--    behaviour an organiser wants. A team should not be stopped at a
--    chapter nobody wrote; using three of the six has to leave a working
--    journey, not a wall.
-- ════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.pinaka_chapter_complete(
  p_team_id uuid, p_chapter text
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM public.pinaka_series_chapter pc
    JOIN public.chain_series         s ON s.id = pc.series_id AND s.is_published
    JOIN public.chain_series_members m ON m.series_id = s.id
    JOIN public.challenges           c ON c.id = m.challenge_id AND c.is_visible
    WHERE pc.chapter = p_chapter
      AND NOT EXISTS (
        SELECT 1 FROM public.submissions sub
        WHERE sub.challenge_id = m.challenge_id
          AND sub.team_id      = p_team_id
          AND sub.is_correct
      )
  );
$$;

-- ════════════════════════════════════════════════════════════════════════
-- 3. When a chapter is open.
--
--    Written as one NOT EXISTS over everything that comes before it rather
--    than as a loop calling pinaka_chapter_complete per chapter: this gate
--    runs once per challenge row in two views and two policies, so it stops
--    at the first unsolved challenge it finds instead of finishing a count
--    nobody reads.
-- ════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.pinaka_chapter_unlocked(
  p_team_id uuid, p_chapter text
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT
    -- Off, or a chain nobody filed under a chapter: play as normal.
    NOT COALESCE((SELECT es.pinaka_story_mode FROM public.event_settings es WHERE es.id = 1), false)
    OR p_chapter IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM public.pinaka_series_chapter pc
      JOIN public.pinaka_chapter  earlier ON earlier.id = pc.chapter
      JOIN public.chain_series          s ON s.id = pc.series_id AND s.is_published
      JOIN public.chain_series_members  m ON m.series_id = s.id
      JOIN public.challenges            c ON c.id = m.challenge_id AND c.is_visible
      WHERE earlier.position < (
              SELECT ch.position FROM public.pinaka_chapter ch WHERE ch.id = p_chapter
            )
        AND NOT EXISTS (
          SELECT 1 FROM public.submissions sub
          WHERE sub.challenge_id = m.challenge_id
            AND sub.team_id      = p_team_id
            AND sub.is_correct
        )
    );
$$;

REVOKE EXECUTE ON FUNCTION public.pinaka_chapter_complete(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.pinaka_chapter_complete(uuid, text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.pinaka_chapter_unlocked(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.pinaka_chapter_unlocked(uuid, text) TO authenticated, service_role;

-- ════════════════════════════════════════════════════════════════════════
-- 4. The gate, now two levels deep.
--
--    Replaced in place, with the same name and the same signature, so
--    every caller from 20261010000000 picks this up without being touched:
--    the submit_flag_tx wrapper, the unlock_hint wrapper, public_challenges,
--    public_hints, and the hints_select / files_select policies.
--
--    A chained challenge is open to a team when ALL of these hold:
--      · its chapter is open                     (this migration)
--      · it sits at position 1, or the team has solved position - 1
--
--    and the whole thing short-circuits to "open" when story mode is off
--    or the challenge is in no chain at all — every Free challenge.
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
          m.position <= 1
          OR (p_team_id IS NOT NULL AND EXISTS (
                SELECT 1
                FROM public.chain_series_members prev
                JOIN public.submissions s
                  ON s.challenge_id = prev.challenge_id
                WHERE prev.series_id = m.series_id
                  AND prev.position  = m.position - 1
                  AND s.team_id      = p_team_id
                  AND s.is_correct
              ))
        )
    );
$$;

-- ════════════════════════════════════════════════════════════════════════
-- 5. The same question for whoever is asking. Unchanged in behaviour —
--    restated only because it is the pair to the function above and a
--    reader should find them together.
-- ════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.pinaka_viewer_unlocked(p_challenge_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.is_admin()
      OR public.pinaka_team_unlocked(
           (SELECT p.team_id FROM public.profiles p WHERE p.id = auth.uid()),
           p_challenge_id);
$$;

-- ════════════════════════════════════════════════════════════════════════
-- 6. What the client is allowed to know about the journey.
--
--    One row per chapter, in order, with this team's own counts. Enough to
--    draw the rail, name the chapter a team stands in, pick the artwork,
--    and say why a locked chapter is locked — and nothing else. No titles
--    of challenges, no flags, no other team's progress.
-- ════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_team_chapter_progress()
RETURNS TABLE (
  chapter          text,
  chapter_position integer,
  title            text,
  series_count     integer,
  total            integer,
  solved           integer,
  is_complete      boolean,
  is_unlocked      boolean
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH me AS (
    SELECT p.team_id FROM public.profiles p WHERE p.id = auth.uid()
  ),
  -- Every visible challenge of every published chain, with its chapter.
  content AS (
    SELECT pc.chapter, pc.series_id, m.challenge_id
    FROM public.pinaka_series_chapter pc
    JOIN public.chain_series         s ON s.id = pc.series_id AND s.is_published
    JOIN public.chain_series_members m ON m.series_id = s.id
    JOIN public.challenges           c ON c.id = m.challenge_id AND c.is_visible
  )
  SELECT
    ch.id,
    ch.position,
    ch.title,
    (SELECT count(DISTINCT k.series_id)::int FROM content k WHERE k.chapter = ch.id),
    (SELECT count(*)::int                    FROM content k WHERE k.chapter = ch.id),
    (SELECT count(*)::int FROM content k
      WHERE k.chapter = ch.id
        AND EXISTS (SELECT 1 FROM public.submissions s
                    WHERE s.challenge_id = k.challenge_id
                      AND s.team_id = (SELECT team_id FROM me)
                      AND s.is_correct)),
    public.pinaka_chapter_complete((SELECT team_id FROM me), ch.id),
    public.pinaka_chapter_unlocked((SELECT team_id FROM me), ch.id)
  FROM public.pinaka_chapter ch
  WHERE auth.uid() IS NOT NULL
  ORDER BY ch.position;
$$;

REVOKE EXECUTE ON FUNCTION public.get_team_chapter_progress() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_team_chapter_progress() TO authenticated, service_role;

-- ════════════════════════════════════════════════════════════════════════
-- 7. The per-challenge progress gains its chapter.
--
--    Dropped and recreated rather than replaced: the return type grows two
--    columns, and CREATE OR REPLACE cannot change a function's output. The
--    existing columns keep their names, order and types, so a client built
--    against the old shape keeps working while a deploy catches up.
--
--    `chapter_unlocked` is what lets the board say which of the two locks
--    it is looking at — "finish Mithila first" reads very differently from
--    "solve the one before this" — without the client having to work it
--    out from a second query it might get wrong.
-- ════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.get_team_chain_progress();

CREATE FUNCTION public.get_team_chain_progress()
RETURNS TABLE (
  challenge_id     uuid,
  series_id        uuid,
  -- `position` parses as the position() function in a RETURNS TABLE
  -- signature, so it is named differently here rather than quoted
  -- everywhere it is used.
  chain_position   integer,
  is_solved        boolean,
  is_unlocked      boolean,
  is_gate          boolean,
  chapter          text,
  chapter_unlocked boolean
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH me AS (
    SELECT p.team_id FROM public.profiles p WHERE p.id = auth.uid()
  )
  SELECT
    m.challenge_id,
    m.series_id,
    m.position,
    EXISTS (SELECT 1 FROM public.submissions s
            WHERE s.challenge_id = m.challenge_id
              AND s.team_id = (SELECT team_id FROM me)
              AND s.is_correct)                                   AS is_solved,
    public.pinaka_team_unlocked((SELECT team_id FROM me), m.challenge_id) AS is_unlocked,
    -- The chain's own gate is its last link: solving it finishes the chain,
    -- and finishing every chain in a chapter is what opens the next one.
    m.position = (SELECT max(m2.position) FROM public.chain_series_members m2
                  WHERE m2.series_id = m.series_id)               AS is_gate,
    pc.chapter,
    public.pinaka_chapter_unlocked((SELECT team_id FROM me), pc.chapter) AS chapter_unlocked
  FROM public.chain_series_members m
  LEFT JOIN public.pinaka_series_chapter pc ON pc.series_id = m.series_id
  WHERE auth.uid() IS NOT NULL;
$$;

REVOKE EXECUTE ON FUNCTION public.get_team_chain_progress() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_team_chain_progress() TO authenticated, service_role;

-- ════════════════════════════════════════════════════════════════════════
-- 8. Admin: which chains sit in which chapter.
--
--    The organiser's view of the same thing, without a team in it: one row
--    per chapter in journey order, each with the chains filed under it and
--    how many challenges each holds. The admin panel builds its chapter
--    board from this instead of reading three tables and joining them in
--    the browser.
-- ════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_list_pinaka_chapters()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE WHEN NOT public.is_admin()
    THEN jsonb_build_object('error', 'Unauthorized')
    ELSE jsonb_build_object('chapters', COALESCE((
      SELECT jsonb_agg(row ORDER BY row->>'position')
      FROM (
        SELECT jsonb_build_object(
          'id', ch.id,
          'position', ch.position,
          'title', ch.title,
          'series', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                     'id', s.id,
                     'title', s.title,
                     'category', s.category,
                     'is_published', s.is_published,
                     'display_order', s.display_order,
                     'challenge_count', (
                       SELECT count(*)::int FROM public.chain_series_members m
                       WHERE m.series_id = s.id
                     ))
                   ORDER BY s.display_order, s.title)
            FROM public.pinaka_series_chapter pc
            JOIN public.chain_series s ON s.id = pc.series_id
            WHERE pc.chapter = ch.id
          ), '[]'::jsonb)
        ) AS row
        FROM public.pinaka_chapter ch
      ) rows
    ), '[]'::jsonb))
  END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_list_pinaka_chapters() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_list_pinaka_chapters() TO authenticated, service_role;

-- ── Indexes the chapter gate leans on ───────────────────────────────────
-- The gate walks "every challenge of every published chain in an earlier
-- chapter" and asks whether this team solved it. The submissions index from
-- 20261010000000 answers the second half; these two answer the first.
CREATE INDEX IF NOT EXISTS idx_pinaka_series_chapter_chapter
  ON public.pinaka_series_chapter (chapter);

CREATE INDEX IF NOT EXISTS idx_chain_series_published
  ON public.chain_series (id) WHERE is_published;
