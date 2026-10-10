-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  Pinaka CTF 2026 — event mode                                        ║
-- ║                                                                      ║
-- ║  Two things, both temporary and both removable in one step:          ║
-- ║                                                                      ║
-- ║   1. A cosmetic mapping: which Ramayana battle scene dresses a Free  ║
-- ║      challenge, and which chapter a chain series belongs to. Stored  ║
-- ║      in side tables so `challenges` and `chain_series` keep their    ║
-- ║      exact shape and `admin_upsert_challenge` keeps its exact        ║
-- ║      13-argument signature — adding a parameter there would publish  ║
-- ║      a second overload and PostgREST would have to guess.            ║
-- ║                                                                      ║
-- ║   2. Story mode: a chained challenge is playable only once the team  ║
-- ║      has solved the one before it. Enforced here, in the database,   ║
-- ║      because hiding a locked card in the client is not enforcement.  ║
-- ║                                                                      ║
-- ║  Story mode is OFF until an organiser turns it on, and turning it    ║
-- ║  off restores ordinary play instantly — every gate below short-      ║
-- ║  circuits on the flag before it looks at anything else.              ║
-- ║                                                                      ║
-- ║  FULL REVERT — see docs/pinaka/EVENT_MODE.md, which repeats this:    ║
-- ║    SELECT public.admin_set_pinaka_story_mode(false);  -- instant off ║
-- ║    ALTER FUNCTION public.submit_flag_tx_core(uuid,uuid,text,text)    ║
-- ║      RENAME TO submit_flag_tx;        -- drops the wrapper's gate    ║
-- ║    ALTER FUNCTION public.unlock_hint_core(uuid) RENAME TO unlock_hint;
-- ║    DROP TABLE public.pinaka_challenge_scene, public.pinaka_series_chapter;
-- ║    (then re-run 20260913000000's view + policy block to restore them)║
-- ╚══════════════════════════════════════════════════════════════════════╝

-- ════════════════════════════════════════════════════════════════════════
-- 1. The flag. Separate from event_settings.theme on purpose: the skin is
--    a look, this changes how the game plays. Organisers can dress the
--    event without locking it, rehearse locking before the doors open,
--    and kill locking mid-event without losing the artwork.
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE public.event_settings
  ADD COLUMN IF NOT EXISTS pinaka_story_mode boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.admin_set_pinaka_story_mode(p_on boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  UPDATE public.event_settings SET pinaka_story_mode = COALESCE(p_on, false) WHERE id = 1;

  INSERT INTO public.audit_log (actor_id, action, metadata)
  VALUES (auth.uid(), 'set_pinaka_story_mode',
          jsonb_build_object('on', COALESCE(p_on, false)));

  RETURN jsonb_build_object('success', true, 'pinaka_story_mode', COALESCE(p_on, false));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_set_pinaka_story_mode(boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_set_pinaka_story_mode(boolean) TO authenticated, service_role;

-- ════════════════════════════════════════════════════════════════════════
-- 2. The cosmetic mappings.
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.pinaka_challenge_scene (
  challenge_id uuid NOT NULL,
  scene        text NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pinaka_challenge_scene_pkey PRIMARY KEY (challenge_id),
  CONSTRAINT pinaka_challenge_scene_fk FOREIGN KEY (challenge_id)
    REFERENCES public.challenges(id) ON DELETE CASCADE,
  CONSTRAINT pinaka_challenge_scene_known CHECK (scene IN (
    'golden-deer','jatayus-last-stand','shabaris-offering','hanumans-leap',
    'ashoka-vatika','lanka-dahan','sanjeevani-hunt','setu-stones',
    'meghnads-trap','kumbhakarna-awakens','angadas-embassy','ravanas-ten-heads'))
);

CREATE TABLE IF NOT EXISTS public.pinaka_series_chapter (
  series_id  uuid NOT NULL,
  chapter    text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pinaka_series_chapter_pkey PRIMARY KEY (series_id),
  CONSTRAINT pinaka_series_chapter_fk FOREIGN KEY (series_id)
    REFERENCES public.chain_series(id) ON DELETE CASCADE,
  CONSTRAINT pinaka_series_chapter_known CHECK (chapter IN (
    'ayodhya','mithila','vanvaas','kishkindha','setu','lanka'))
);

ALTER TABLE public.pinaka_challenge_scene ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pinaka_series_chapter  ENABLE ROW LEVEL SECURITY;

-- Which picture sits behind a challenge is not a secret, and the client
-- needs it to render. Writes go through the admin RPCs below, never here.
DROP POLICY IF EXISTS "pinaka_scene_select" ON public.pinaka_challenge_scene;
CREATE POLICY "pinaka_scene_select" ON public.pinaka_challenge_scene
  FOR SELECT USING ((SELECT auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "pinaka_chapter_select" ON public.pinaka_series_chapter;
CREATE POLICY "pinaka_chapter_select" ON public.pinaka_series_chapter
  FOR SELECT USING ((SELECT auth.uid()) IS NOT NULL);

REVOKE ALL ON public.pinaka_challenge_scene FROM anon;
REVOKE ALL ON public.pinaka_series_chapter  FROM anon;
GRANT SELECT ON public.pinaka_challenge_scene TO authenticated;
GRANT SELECT ON public.pinaka_series_chapter  TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_challenge_scene(
  p_challenge_id uuid, p_scene text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_scene text := NULLIF(pg_catalog.btrim(COALESCE(p_scene, '')), '');
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.challenges c WHERE c.id = p_challenge_id) THEN
    RETURN jsonb_build_object('error', 'Challenge not found');
  END IF;

  -- "None / Default" clears the row, which is what restores the ordinary look.
  IF v_scene IS NULL THEN
    DELETE FROM public.pinaka_challenge_scene WHERE challenge_id = p_challenge_id;
    RETURN jsonb_build_object('success', true, 'scene', NULL);
  END IF;

  INSERT INTO public.pinaka_challenge_scene (challenge_id, scene, updated_at)
  VALUES (p_challenge_id, v_scene, now())
  ON CONFLICT (challenge_id)
    DO UPDATE SET scene = EXCLUDED.scene, updated_at = now();

  RETURN jsonb_build_object('success', true, 'scene', v_scene);
EXCEPTION WHEN check_violation THEN
  RETURN jsonb_build_object('error', 'Unknown scene');
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_series_chapter(
  p_series_id uuid, p_chapter text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_chapter text := NULLIF(pg_catalog.btrim(COALESCE(p_chapter, '')), '');
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.chain_series s WHERE s.id = p_series_id) THEN
    RETURN jsonb_build_object('error', 'Series not found');
  END IF;

  IF v_chapter IS NULL THEN
    DELETE FROM public.pinaka_series_chapter WHERE series_id = p_series_id;
    RETURN jsonb_build_object('success', true, 'chapter', NULL);
  END IF;

  INSERT INTO public.pinaka_series_chapter (series_id, chapter, updated_at)
  VALUES (p_series_id, v_chapter, now())
  ON CONFLICT (series_id)
    DO UPDATE SET chapter = EXCLUDED.chapter, updated_at = now();

  RETURN jsonb_build_object('success', true, 'chapter', v_chapter);
EXCEPTION WHEN check_violation THEN
  RETURN jsonb_build_object('error', 'Unknown chapter');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_set_challenge_scene(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_set_challenge_scene(uuid, text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.admin_set_series_chapter(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_set_series_chapter(uuid, text) TO authenticated, service_role;

-- ════════════════════════════════════════════════════════════════════════
-- 3. The gate.
--
--    A challenge is unlocked for a team when ANY of these holds:
--      · story mode is off                      (the whole feature sleeps)
--      · the challenge is in no chain series    (every Free challenge)
--      · it sits at position 1                  (the chapter's first door)
--      · the team has solved position - 1       (they earned it)
--
--    Progress is DERIVED, never stored. That is what makes two teammates
--    solving at the same moment harmless: there is no counter to double-
--    increment and no row to race for. Whatever order the solves land in,
--    the next challenge reads as unlocked the instant either one commits,
--    for every member of the team, on every device, after any refresh.
--
--    `idx_chain_member_one_series` guarantees a challenge belongs to at
--    most one series, so "the previous challenge" is unambiguous.
-- ════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.pinaka_team_unlocked(
  p_team_id uuid, p_challenge_id uuid
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT
    -- Off, or not part of the story: play as normal.
    NOT COALESCE((SELECT es.pinaka_story_mode FROM public.event_settings es WHERE es.id = 1), false)
    OR NOT EXISTS (
      SELECT 1 FROM public.chain_series_members m WHERE m.challenge_id = p_challenge_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.chain_series_members m
      WHERE m.challenge_id = p_challenge_id
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

-- The same question for whoever is asking right now. Admins are never
-- gated, which is what makes the admin preview of every chapter work.
CREATE OR REPLACE FUNCTION public.pinaka_viewer_unlocked(p_challenge_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.is_admin()
      OR public.pinaka_team_unlocked(
           (SELECT p.team_id FROM public.profiles p WHERE p.id = auth.uid()),
           p_challenge_id);
$$;

REVOKE EXECUTE ON FUNCTION public.pinaka_team_unlocked(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.pinaka_team_unlocked(uuid, uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.pinaka_viewer_unlocked(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.pinaka_viewer_unlocked(uuid) TO authenticated, service_role;

-- ════════════════════════════════════════════════════════════════════════
-- 4. Enforcement — submissions.
--
--    submit_flag_tx is ~200 lines of ban checks, event window, attempt
--    caps, cooldowns, IP budget, hash compare and the insert, all in one
--    transaction. Re-stating all of it to add four lines would be four
--    lines of feature and 200 lines of risk, so instead the original is
--    renamed and a thin wrapper takes its name. The scoring logic is not
--    edited at all; it is the same function body, called under the same
--    name, with one gate in front of it.
--
--    The gate sits before everything the original does, so a locked
--    challenge costs no attempt, trips no cooldown, spends no IP budget
--    and never reaches challenge_secrets.
-- ════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  -- Idempotent: only rename the first time this migration runs.
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'submit_flag_tx'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'submit_flag_tx_core'
  ) THEN
    ALTER FUNCTION public.submit_flag_tx(uuid, uuid, text, text)
      RENAME TO submit_flag_tx_core;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.submit_flag_tx(
  p_user_id      uuid,
  p_challenge_id uuid,
  p_flag         text,
  p_ip           text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_team     uuid;
  v_is_admin boolean;
BEGIN
  SELECT p.team_id, (p.role = 'admin') INTO v_team, v_is_admin
  FROM public.profiles p WHERE p.id = p_user_id;

  -- Not found is the original's problem to report, in its own words.
  IF FOUND AND NOT COALESCE(v_is_admin, false)
     AND NOT public.pinaka_team_unlocked(v_team, p_challenge_id) THEN
    -- 403, not 404: the player can see the card, so pretending the
    -- challenge does not exist would just look broken. It says nothing
    -- about the challenge itself.
    RETURN jsonb_build_object('status', 403, 'body', jsonb_build_object(
      'correct', false,
      'locked',  true,
      'error',   'Locked. Complete the previous challenge to unlock.'));
  END IF;

  RETURN public.submit_flag_tx_core(p_user_id, p_challenge_id, p_flag, p_ip);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_flag_tx(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.submit_flag_tx(uuid, uuid, text, text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.submit_flag_tx_core(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.submit_flag_tx_core(uuid, uuid, text, text) TO service_role;

-- ════════════════════════════════════════════════════════════════════════
-- 5. Enforcement — hints. Same rename-and-wrap, same reasoning: buying a
--    hint for a challenge you cannot open would both leak the hint and
--    spend the team's points on it.
-- ════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'unlock_hint'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'unlock_hint_core'
  ) THEN
    ALTER FUNCTION public.unlock_hint(uuid) RENAME TO unlock_hint_core;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.unlock_hint(p_hint_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_challenge uuid;
BEGIN
  SELECT h.challenge_id INTO v_challenge FROM public.hints h WHERE h.id = p_hint_id;

  IF FOUND AND NOT public.pinaka_viewer_unlocked(v_challenge) THEN
    RETURN jsonb_build_object(
      'error', 'Locked. Complete the previous challenge to unlock.');
  END IF;

  RETURN public.unlock_hint_core(p_hint_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.unlock_hint(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.unlock_hint(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.unlock_hint_core(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.unlock_hint_core(uuid) TO authenticated, service_role;

-- ════════════════════════════════════════════════════════════════════════
-- 6. Enforcement — what a locked challenge is allowed to say about itself.
--
--    The card stays visible (that is the point of a journey you can see
--    ahead of you), but it carries only safe metadata: title, category,
--    points, difficulty, solve count. The description and any connection
--    string are withheld until the team earns them.
--
--    Column list, order and types are unchanged — CREATE OR REPLACE VIEW
--    cannot alter those, and the client selects by name regardless.
-- ════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW public.public_challenges AS
SELECT
  c.id, c.title, c.category, c.difficulty,
  CASE WHEN public.pinaka_viewer_unlocked(c.id) THEN c.description ELSE '' END
    AS description,
  c.flag_type, c.points_type, c.points, c.initial_points,
  c.minimum_points, c.decay, c.is_visible, c.max_attempts,
  c.unlock_after, c.author, c.tags,
  CASE WHEN public.pinaka_viewer_unlocked(c.id) THEN c.connection_info ELSE NULL END
    AS connection_info,
  c.created_at
FROM public.challenges c
WHERE c.is_visible = true
  AND (
    public.is_admin()
    OR (public.is_not_banned() AND public.challenges_open())
  );

-- Hint rows carry id and cost, which is enough to tell a player how many
-- hints a locked challenge has and what they are worth. Withhold the rows.
CREATE OR REPLACE VIEW public.public_hints
WITH (security_invoker = false)
AS SELECT h.id, h.challenge_id, h.cost
FROM public.hints h
JOIN public.challenges c ON c.id = h.challenge_id
WHERE c.is_visible = true
  AND (public.is_admin() OR (public.is_not_banned() AND public.challenges_open()))
  AND public.pinaka_viewer_unlocked(h.challenge_id);

-- ════════════════════════════════════════════════════════════════════════
-- 7. Enforcement — files and hints at the table level.
--
--    useData.ts asks PostgREST to embed `files:challenge_files(...)` and
--    `hints(id,cost)`, which PostgREST resolves against the BASE TABLES
--    under these policies, not through the views above. Hardening only
--    the views would leave locked file URLs and hint costs reachable by
--    the client's ordinary query, so the same gate goes here.
--
--    Note on files: the storage bucket is public-read behind capability
--    URLs, so withholding a row hides a locked challenge's attachments
--    from anyone who has not already seen the URL — it does not revoke a
--    URL already handed out. Rotate attachments if that matters.
-- ════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "hints_select" ON public.hints;
CREATE POLICY "hints_select" ON public.hints FOR SELECT
  USING (
    (SELECT public.is_admin())
    OR (
      (SELECT auth.uid()) IS NOT NULL
      AND (SELECT public.is_not_banned())
      AND (SELECT public.challenges_open())
      AND EXISTS (SELECT 1 FROM public.challenges c
                  WHERE c.id = challenge_id AND c.is_visible = true)
      AND public.pinaka_viewer_unlocked(challenge_id)
    )
  );

DROP POLICY IF EXISTS "files_select" ON public.challenge_files;
CREATE POLICY "files_select" ON public.challenge_files FOR SELECT
  USING (
    (SELECT public.is_admin())
    OR (
      (SELECT auth.uid()) IS NOT NULL
      AND (SELECT public.is_not_banned())
      AND (SELECT public.challenges_open())
      AND EXISTS (SELECT 1 FROM public.challenges c
                  WHERE c.id = challenge_id AND c.is_visible = true)
      AND public.pinaka_viewer_unlocked(challenge_id)
    )
  );

-- ════════════════════════════════════════════════════════════════════════
-- 8. What the client is allowed to know about its own progress.
--
--    One round trip for the whole journey: every chained challenge, its
--    series, its position, whether this team has solved it and whether it
--    is open to them. No flags, no descriptions — only state the player
--    is entitled to see about their own team.
-- ════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_team_chain_progress()
RETURNS TABLE (
  challenge_id   uuid,
  series_id      uuid,
  -- `position` is a reserved word in a RETURNS TABLE signature (it parses
  -- as the position() function), even though chain_series_members may use
  -- it as a column name. Named differently rather than quoted everywhere.
  chain_position integer,
  is_solved      boolean,
  is_unlocked    boolean,
  is_gate        boolean
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
    -- The chapter gate is the last challenge of its series.
    m.position = (SELECT max(m2.position) FROM public.chain_series_members m2
                  WHERE m2.series_id = m.series_id)               AS is_gate
  FROM public.chain_series_members m
  WHERE auth.uid() IS NOT NULL;
$$;

REVOKE EXECUTE ON FUNCTION public.get_team_chain_progress() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_team_chain_progress() TO authenticated, service_role;

-- ── Indexes the gate leans on ───────────────────────────────────────────
-- The solved-the-previous-one check runs per challenge row in the view and
-- in two policies, so give it the exact index it wants.
CREATE INDEX IF NOT EXISTS idx_submissions_team_challenge_correct
  ON public.submissions (team_id, challenge_id) WHERE is_correct;
