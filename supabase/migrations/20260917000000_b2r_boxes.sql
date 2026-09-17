-- B2R (Boot-to-Root) Challenges — an OPTIONAL, admin-gated experience layer.
--
-- A B2R "box" is one machine with TWO flags: a USER flag and a ROOT flag.
-- Design constraints this migration deliberately honours (mirrors 20260915000000):
--   * ZERO changes to the solve/score path. Each flag is an ORDINARY challenge
--     row underneath (created through the existing admin_upsert_challenge, so the
--     hashing, challenge_secrets and flag-vault paths are reused, never copied).
--     submit_flag_tx, apply_solve_to_scores, the score views, challenges_open()
--     and every existing RLS policy are left exactly as they are. A box never
--     gates a solve and never awards points of its own.
--   * PLACEMENT is DERIVED, not stored: a challenge is a B2R flag iff a b2r_boxes
--     row references it; a box is B2R-CHAINED iff it belongs to a published
--     b2r_series, else B2R-FREE. The challenges table and public_challenges view
--     are NOT touched.
--   * Everything is additive and defaults OFF. event_settings.b2r_enabled defaults
--     false, so an un-flagged platform behaves exactly as before.
--   * b2r_boxes FKs to its two challenges are ON DELETE CASCADE, so
--     admin_delete_challenge and the event reset/new-event paths need NO changes.
--   * Reads flow through owner-run VIEWS with writes REVOKED. Direct table reads
--     are admin-only. Writes flow ONLY through SECURITY DEFINER, is_admin()-gated,
--     audit-logged RPCs. No write grant to authenticated.
--   * Policies wrap helper calls as (SELECT ...) for InitPlan evaluation.

-- ════════════════════════════════════════════════════════════════════════
-- 1. Master feature flag (server-authoritative, admin-toggled)
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE public.event_settings
  ADD COLUMN IF NOT EXISTS b2r_enabled boolean NOT NULL DEFAULT false;

-- ════════════════════════════════════════════════════════════════════════
-- 2. Tables — structure only. Never points, never solves.
-- ════════════════════════════════════════════════════════════════════════

-- One box = one machine = (user-flag challenge, root-flag challenge).
CREATE TABLE IF NOT EXISTS public.b2r_boxes (
  id                uuid NOT NULL DEFAULT gen_random_uuid(),
  title             text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 120),
  category          text NOT NULL CHECK (length(category) BETWEEN 1 AND 40),
  description       text NOT NULL DEFAULT '' CHECK (length(description) <= 10000),
  difficulty        text CHECK (difficulty IS NULL OR difficulty IN ('Easy','Medium','Hard','Insane')),
  user_challenge_id uuid NOT NULL REFERENCES public.challenges(id) ON DELETE CASCADE,
  root_challenge_id uuid NOT NULL REFERENCES public.challenges(id) ON DELETE CASCADE,
  readme_url        text CHECK (readme_url IS NULL OR length(readme_url) <= 2048),
  display_order     integer NOT NULL DEFAULT 0,
  is_published      boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT b2r_boxes_pkey PRIMARY KEY (id),
  CONSTRAINT b2r_boxes_user_challenge_unique UNIQUE (user_challenge_id),
  CONSTRAINT b2r_boxes_root_challenge_unique UNIQUE (root_challenge_id),
  CONSTRAINT b2r_boxes_distinct_flags CHECK (user_challenge_id <> root_challenge_id)
);

-- A B2R chain: an ordered story of boxes (mirrors chain_series).
CREATE TABLE IF NOT EXISTS public.b2r_series (
  id            uuid NOT NULL DEFAULT gen_random_uuid(),
  title         text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 120),
  category      text NOT NULL CHECK (length(category) BETWEEN 1 AND 40),
  description   text NOT NULL DEFAULT '' CHECK (length(description) <= 2000),
  readme        text NOT NULL DEFAULT '' CHECK (length(readme) <= 20000),
  readme_url    text CHECK (readme_url IS NULL OR length(readme_url) <= 2048),
  difficulty    text CHECK (difficulty IS NULL OR difficulty IN ('Easy','Medium','Hard','Insane')),
  display_order integer NOT NULL DEFAULT 0,
  is_published  boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT b2r_series_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.b2r_series_members (
  series_id uuid NOT NULL REFERENCES public.b2r_series(id) ON DELETE CASCADE,
  box_id    uuid NOT NULL REFERENCES public.b2r_boxes(id)  ON DELETE CASCADE,
  position  integer NOT NULL CHECK (position >= 1),
  CONSTRAINT b2r_series_members_pkey PRIMARY KEY (series_id, box_id),
  CONSTRAINT b2r_series_members_unique_position UNIQUE (series_id, position)
);

-- A box lives in at most one series, so "B2R-CHAINED = member of a published
-- series, else B2R-FREE" is unambiguous.
CREATE UNIQUE INDEX IF NOT EXISTS idx_b2r_member_one_series
  ON public.b2r_series_members (box_id);

CREATE INDEX IF NOT EXISTS idx_b2r_boxes_category_order
  ON public.b2r_boxes (category, display_order);

CREATE INDEX IF NOT EXISTS idx_b2r_series_category_order
  ON public.b2r_series (category, display_order);

CREATE INDEX IF NOT EXISTS idx_b2r_members_series_pos
  ON public.b2r_series_members (series_id, position);

-- ════════════════════════════════════════════════════════════════════════
-- 3. Grants — SELECT to authenticated (for admin RLS reads); no client writes.
-- ════════════════════════════════════════════════════════════════════════
REVOKE ALL ON public.b2r_boxes          FROM anon;
REVOKE ALL ON public.b2r_series         FROM anon;
REVOKE ALL ON public.b2r_series_members FROM anon;
GRANT  SELECT ON public.b2r_boxes          TO authenticated;
GRANT  SELECT ON public.b2r_series         TO authenticated;
GRANT  SELECT ON public.b2r_series_members TO authenticated;

-- ════════════════════════════════════════════════════════════════════════
-- 4. RLS — direct table reads are ADMIN-ONLY. Players read the views (section 5).
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE public.b2r_boxes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.b2r_series         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.b2r_series_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "b2r_boxes_select_admin" ON public.b2r_boxes;
CREATE POLICY "b2r_boxes_select_admin" ON public.b2r_boxes FOR SELECT
  USING ((SELECT public.is_admin()));
DROP POLICY IF EXISTS "b2r_boxes_insert_admin" ON public.b2r_boxes;
CREATE POLICY "b2r_boxes_insert_admin" ON public.b2r_boxes FOR INSERT
  WITH CHECK ((SELECT public.is_admin()));
DROP POLICY IF EXISTS "b2r_boxes_update_admin" ON public.b2r_boxes;
CREATE POLICY "b2r_boxes_update_admin" ON public.b2r_boxes FOR UPDATE
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
DROP POLICY IF EXISTS "b2r_boxes_delete_admin" ON public.b2r_boxes;
CREATE POLICY "b2r_boxes_delete_admin" ON public.b2r_boxes FOR DELETE
  USING ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "b2r_series_select_admin" ON public.b2r_series;
CREATE POLICY "b2r_series_select_admin" ON public.b2r_series FOR SELECT
  USING ((SELECT public.is_admin()));
DROP POLICY IF EXISTS "b2r_series_insert_admin" ON public.b2r_series;
CREATE POLICY "b2r_series_insert_admin" ON public.b2r_series FOR INSERT
  WITH CHECK ((SELECT public.is_admin()));
DROP POLICY IF EXISTS "b2r_series_update_admin" ON public.b2r_series;
CREATE POLICY "b2r_series_update_admin" ON public.b2r_series FOR UPDATE
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
DROP POLICY IF EXISTS "b2r_series_delete_admin" ON public.b2r_series;
CREATE POLICY "b2r_series_delete_admin" ON public.b2r_series FOR DELETE
  USING ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "b2r_members_select_admin" ON public.b2r_series_members;
CREATE POLICY "b2r_members_select_admin" ON public.b2r_series_members FOR SELECT
  USING ((SELECT public.is_admin()));
DROP POLICY IF EXISTS "b2r_members_insert_admin" ON public.b2r_series_members;
CREATE POLICY "b2r_members_insert_admin" ON public.b2r_series_members FOR INSERT
  WITH CHECK ((SELECT public.is_admin()));
DROP POLICY IF EXISTS "b2r_members_update_admin" ON public.b2r_series_members;
CREATE POLICY "b2r_members_update_admin" ON public.b2r_series_members FOR UPDATE
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
DROP POLICY IF EXISTS "b2r_members_delete_admin" ON public.b2r_series_members;
CREATE POLICY "b2r_members_delete_admin" ON public.b2r_series_members FOR DELETE
  USING ((SELECT public.is_admin()));

-- ════════════════════════════════════════════════════════════════════════
-- 5. Player read surface — owner-run VIEWS, gated exactly like public_chain_*,
--    plus the master flag. Writes REVOKED (auto-updatable-view escalation).
-- ════════════════════════════════════════════════════════════════════════
-- Visibility rule for a NON-admin: the master flag is ON, the player is not
-- banned, the event is open, the box is published AND both of its flag
-- challenges are visible. Admins see every published box regardless of the
-- flag (for review/preview). Nothing here touches challenge_secrets / vault.

CREATE OR REPLACE VIEW public.public_b2r_boxes
WITH (security_invoker = false) AS
SELECT
  b.id, b.title, b.category, b.description, b.difficulty, b.display_order, b.readme_url,
  b.user_challenge_id, b.root_challenge_id,
  -- The PUBLISHED series this box belongs to (NULL => B2R-FREE).
  (SELECT m.series_id FROM public.b2r_series_members m
     JOIN public.b2r_series s ON s.id = m.series_id
    WHERE m.box_id = b.id AND s.is_published = true LIMIT 1) AS series_id,
  (SELECT m.position FROM public.b2r_series_members m
     JOIN public.b2r_series s ON s.id = m.series_id
    WHERE m.box_id = b.id AND s.is_published = true LIMIT 1) AS position
FROM public.b2r_boxes b
JOIN public.challenges cu ON cu.id = b.user_challenge_id
JOIN public.challenges cr ON cr.id = b.root_challenge_id
WHERE b.is_published = true
  AND (
    public.is_admin()
    OR (
      COALESCE((SELECT es.b2r_enabled FROM public.event_settings es WHERE es.id = 1), false)
      AND public.is_not_banned()
      AND public.challenges_open()
      AND cu.is_visible = true
      AND cr.is_visible = true
    )
  );

CREATE OR REPLACE VIEW public.public_b2r_series
WITH (security_invoker = false) AS
SELECT
  s.id, s.title, s.category, s.description, s.readme, s.readme_url, s.difficulty,
  s.display_order,
  (SELECT count(*)::int
     FROM public.b2r_series_members m
     JOIN public.b2r_boxes b ON b.id = m.box_id
    WHERE m.series_id = s.id
      AND (public.is_admin() OR b.is_published = true)) AS box_count
FROM public.b2r_series s
WHERE s.is_published = true
  AND (
    public.is_admin()
    OR (
      COALESCE((SELECT es.b2r_enabled FROM public.event_settings es WHERE es.id = 1), false)
      AND public.is_not_banned()
      AND public.challenges_open()
      -- Never surface an "empty" published B2R chain to players.
      AND EXISTS (
        SELECT 1 FROM public.b2r_series_members m2
        JOIN public.b2r_boxes b2 ON b2.id = m2.box_id
        JOIN public.challenges cu2 ON cu2.id = b2.user_challenge_id
        JOIN public.challenges cr2 ON cr2.id = b2.root_challenge_id
        WHERE m2.series_id = s.id AND b2.is_published = true
          AND cu2.is_visible = true AND cr2.is_visible = true
      )
    )
  );

CREATE OR REPLACE VIEW public.public_b2r_members
WITH (security_invoker = false) AS
SELECT m.series_id, m.box_id, m.position
FROM public.b2r_series_members m
JOIN public.b2r_series s ON s.id = m.series_id
JOIN public.b2r_boxes  b ON b.id = m.box_id
JOIN public.challenges cu ON cu.id = b.user_challenge_id
JOIN public.challenges cr ON cr.id = b.root_challenge_id
WHERE s.is_published = true
  AND (
    public.is_admin()
    OR (
      COALESCE((SELECT es.b2r_enabled FROM public.event_settings es WHERE es.id = 1), false)
      AND public.is_not_banned()
      AND public.challenges_open()
      AND b.is_published = true
      AND cu.is_visible = true
      AND cr.is_visible = true
    )
  );

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.public_b2r_boxes, public.public_b2r_series, public.public_b2r_members
  FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.public_b2r_boxes   TO authenticated;
GRANT SELECT ON public.public_b2r_series  TO authenticated;
GRANT SELECT ON public.public_b2r_members TO authenticated;

-- ════════════════════════════════════════════════════════════════════════
-- 6. Admin RPCs — SECURITY DEFINER, is_admin()-gated, audit-logged. The only
--    sanctioned write path.
-- ════════════════════════════════════════════════════════════════════════

-- 6a. Master toggle (mirrors admin_set_chain_experience).
CREATE OR REPLACE FUNCTION public.admin_set_b2r_enabled(p_enabled boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  UPDATE public.event_settings SET b2r_enabled = COALESCE(p_enabled, false) WHERE id = 1;

  INSERT INTO public.audit_log (actor_id, action, metadata)
  VALUES (auth.uid(),
          CASE WHEN p_enabled THEN 'enable_b2r' ELSE 'disable_b2r' END,
          jsonb_build_object('enabled', COALESCE(p_enabled, false)));

  RETURN jsonb_build_object('success', true, 'enabled', COALESCE(p_enabled, false));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_set_b2r_enabled(boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_set_b2r_enabled(boolean) TO authenticated, service_role;

-- 6b. Create / edit a box. Creates or updates its two underlying challenge rows
--     by CALLING admin_upsert_challenge (the single hashing path) — never by
--     re-implementing it. COALESCE partial-update discipline: a NULL argument
--     leaves the field unchanged; a NULL flag keeps the current hash.
--     The box's publish state is mirrored onto both challenges' is_visible on
--     every save, so a flag is solvable iff its box is published.
--     The mutating section runs in a nested block so that ANY failure rolls
--     the whole box back — no half-created box with an orphan challenge.
CREATE OR REPLACE FUNCTION public.admin_upsert_b2r_box(
  p_id              uuid    DEFAULT NULL,
  p_title           text    DEFAULT NULL,
  p_category        text    DEFAULT NULL,
  p_difficulty      text    DEFAULT NULL,
  p_description     text    DEFAULT NULL,
  p_user_flag       text    DEFAULT NULL,
  p_user_points     int     DEFAULT NULL,
  p_root_flag       text    DEFAULT NULL,
  p_root_points     int     DEFAULT NULL,
  p_max_attempts    int     DEFAULT NULL,
  p_connection_info text    DEFAULT NULL,
  p_readme_url      text    DEFAULT NULL,
  p_display_order   int     DEFAULT NULL,
  p_is_published    boolean DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_id     uuid;
  v_user   uuid;
  v_root   uuid;
  v_res    jsonb;
  v_title  text;
  v_pub    boolean;
  v_diff   text;
BEGIN
  IF NOT public.is_admin() THEN RETURN jsonb_build_object('error', 'Unauthorized'); END IF;

  IF p_difficulty IS NOT NULL AND p_difficulty NOT IN ('Easy','Medium','Hard','Insane') THEN
    RETURN jsonb_build_object('error', 'Invalid difficulty');
  END IF;
  IF p_readme_url IS NOT NULL AND length(p_readme_url) > 2048 THEN
    RETURN jsonb_build_object('error', 'Briefing URL is too long');
  END IF;
  IF p_user_points IS NOT NULL AND p_user_points <= 0 THEN
    RETURN jsonb_build_object('error', 'User flag points must be positive');
  END IF;
  IF p_root_points IS NOT NULL AND p_root_points <= 0 THEN
    RETURN jsonb_build_object('error', 'Root flag points must be positive');
  END IF;

  IF p_id IS NULL THEN
    -- ── CREATE ──────────────────────────────────────────────────────────
    IF p_title IS NULL OR length(btrim(p_title)) = 0 THEN
      RETURN jsonb_build_object('error', 'Title is required');
    END IF;
    IF p_category IS NULL OR length(btrim(p_category)) = 0 THEN
      RETURN jsonb_build_object('error', 'Category is required');
    END IF;
    IF p_user_flag IS NULL OR length(btrim(p_user_flag)) = 0 THEN
      RETURN jsonb_build_object('error', 'User flag is required for a new box');
    END IF;
    IF p_root_flag IS NULL OR length(btrim(p_root_flag)) = 0 THEN
      RETURN jsonb_build_object('error', 'Root flag is required for a new box');
    END IF;
    IF btrim(p_user_flag) = btrim(p_root_flag) THEN
      RETURN jsonb_build_object('error', 'User and root flags must be different');
    END IF;

    v_title := btrim(p_title);
    v_pub   := COALESCE(p_is_published, false);
    v_diff  := COALESCE(p_difficulty, 'Easy');   -- challenges.difficulty is NOT NULL

    BEGIN
      v_res := public.admin_upsert_challenge(
        NULL, v_title || ' — User', p_category, v_diff, COALESCE(p_description, ''),
        p_user_flag, 'static', COALESCE(p_user_points, 100), COALESCE(p_max_attempts, 0),
        NULL, ARRAY['b2r','user']::text[], v_pub, p_connection_info);
      IF v_res ? 'error' THEN RAISE EXCEPTION '%', v_res->>'error'; END IF;
      v_user := (v_res->>'challenge_id')::uuid;

      v_res := public.admin_upsert_challenge(
        NULL, v_title || ' — Root', p_category, v_diff, COALESCE(p_description, ''),
        p_root_flag, 'static', COALESCE(p_root_points, 100), COALESCE(p_max_attempts, 0),
        NULL, ARRAY['b2r','root']::text[], v_pub, p_connection_info);
      IF v_res ? 'error' THEN RAISE EXCEPTION '%', v_res->>'error'; END IF;
      v_root := (v_res->>'challenge_id')::uuid;

      INSERT INTO public.b2r_boxes
        (title, category, description, difficulty, user_challenge_id, root_challenge_id,
         readme_url, display_order, is_published)
      VALUES
        (v_title, p_category, COALESCE(p_description, ''), p_difficulty, v_user, v_root,
         NULLIF(btrim(COALESCE(p_readme_url, '')), ''), COALESCE(p_display_order, 0), v_pub)
      RETURNING id INTO v_id;
    EXCEPTION WHEN OTHERS THEN
      RETURN jsonb_build_object('error', SQLERRM);
    END;
  ELSE
    -- ── UPDATE ──────────────────────────────────────────────────────────
    SELECT user_challenge_id, root_challenge_id, is_published, title
      INTO v_user, v_root, v_pub, v_title
      FROM public.b2r_boxes WHERE id = p_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('error', 'B2R box not found'); END IF;

    IF p_user_flag IS NOT NULL AND p_root_flag IS NOT NULL
       AND btrim(p_user_flag) <> '' AND btrim(p_user_flag) = btrim(p_root_flag) THEN
      RETURN jsonb_build_object('error', 'User and root flags must be different');
    END IF;

    v_pub := COALESCE(p_is_published, v_pub);
    IF p_title IS NOT NULL AND length(btrim(p_title)) > 0 THEN v_title := btrim(p_title); END IF;

    BEGIN
      -- Only pass a title when one was supplied, so admin_upsert_challenge's
      -- "connection_info is written only when title/description is present"
      -- rule keeps partial updates from blanking it.
      v_res := public.admin_upsert_challenge(
        v_user,
        CASE WHEN p_title IS NULL THEN NULL ELSE v_title || ' — User' END,
        p_category, p_difficulty, p_description,
        p_user_flag, 'static', p_user_points, p_max_attempts,
        NULL, NULL, v_pub, p_connection_info);
      IF v_res ? 'error' THEN RAISE EXCEPTION '%', v_res->>'error'; END IF;

      v_res := public.admin_upsert_challenge(
        v_root,
        CASE WHEN p_title IS NULL THEN NULL ELSE v_title || ' — Root' END,
        p_category, p_difficulty, p_description,
        p_root_flag, 'static', p_root_points, p_max_attempts,
        NULL, NULL, v_pub, p_connection_info);
      IF v_res ? 'error' THEN RAISE EXCEPTION '%', v_res->>'error'; END IF;

      UPDATE public.b2r_boxes SET
        title         = v_title,
        category      = COALESCE(p_category, category),
        description   = COALESCE(p_description, description),
        difficulty    = CASE WHEN p_difficulty IS NULL THEN difficulty ELSE p_difficulty END,
        readme_url    = CASE WHEN p_readme_url IS NULL THEN readme_url
                             WHEN btrim(p_readme_url) = '' THEN NULL
                             ELSE p_readme_url END,
        display_order = COALESCE(p_display_order, display_order),
        is_published  = v_pub,
        updated_at    = now()
      WHERE id = p_id;
    EXCEPTION WHEN OTHERS THEN
      RETURN jsonb_build_object('error', SQLERRM);
    END;
    v_id := p_id;
  END IF;

  INSERT INTO public.audit_log (actor_id, action, metadata)
  VALUES (auth.uid(),
          CASE WHEN p_id IS NULL THEN 'create_b2r_box' ELSE 'update_b2r_box' END,
          jsonb_build_object('box_id', v_id, 'user_challenge_id', v_user, 'root_challenge_id', v_root));

  RETURN jsonb_build_object('success', true, 'box_id', v_id,
                            'user_challenge_id', v_user, 'root_challenge_id', v_root);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_upsert_b2r_box(uuid, text, text, text, text, text, int, text, int, int, text, text, int, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_upsert_b2r_box(uuid, text, text, text, text, text, int, text, int, int, text, text, int, boolean) TO authenticated, service_role;

-- 6c. Delete a box: removes BOTH underlying challenges through the existing
--     admin_delete_challenge (which also clears their submissions and
--     recomputes scores). The b2r_boxes row cascades away with the first one.
CREATE OR REPLACE FUNCTION public.admin_delete_b2r_box(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_user uuid;
  v_root uuid;
  v_res  jsonb;
BEGIN
  IF NOT public.is_admin() THEN RETURN jsonb_build_object('error', 'Unauthorized'); END IF;

  SELECT user_challenge_id, root_challenge_id INTO v_user, v_root
    FROM public.b2r_boxes WHERE id = p_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'B2R box not found'); END IF;

  v_res := public.admin_delete_challenge(v_user);
  IF v_res ? 'error' THEN RETURN v_res; END IF;
  v_res := public.admin_delete_challenge(v_root);
  IF v_res ? 'error' THEN RETURN v_res; END IF;

  INSERT INTO public.audit_log (actor_id, action, metadata)
  VALUES (auth.uid(), 'delete_b2r_box',
          jsonb_build_object('box_id', p_id, 'user_challenge_id', v_user, 'root_challenge_id', v_root));

  RETURN jsonb_build_object('success', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_delete_b2r_box(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_delete_b2r_box(uuid) TO authenticated, service_role;

-- 6d. Create / edit a B2R series (mirrors admin_upsert_chain_series, 9-arg).
CREATE OR REPLACE FUNCTION public.admin_upsert_b2r_series(
  p_id            uuid    DEFAULT NULL,
  p_title         text    DEFAULT NULL,
  p_category      text    DEFAULT NULL,
  p_description   text    DEFAULT NULL,
  p_readme        text    DEFAULT NULL,
  p_difficulty    text    DEFAULT NULL,
  p_display_order int     DEFAULT NULL,
  p_is_published  boolean DEFAULT NULL,
  p_readme_url    text    DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_id          uuid;
  v_member_cnt  int;
  v_publish     boolean;
BEGIN
  IF NOT public.is_admin() THEN RETURN jsonb_build_object('error', 'Unauthorized'); END IF;

  IF p_difficulty IS NOT NULL AND p_difficulty NOT IN ('Easy','Medium','Hard','Insane') THEN
    RETURN jsonb_build_object('error', 'Invalid difficulty');
  END IF;
  IF p_readme_url IS NOT NULL AND length(p_readme_url) > 2048 THEN
    RETURN jsonb_build_object('error', 'Briefing URL is too long');
  END IF;

  IF p_id IS NOT NULL THEN
    v_publish := COALESCE(p_is_published,
                          (SELECT is_published FROM public.b2r_series WHERE id = p_id));
    IF v_publish THEN
      SELECT count(*) INTO v_member_cnt FROM public.b2r_series_members WHERE series_id = p_id;
      IF v_member_cnt < 2 THEN
        RETURN jsonb_build_object('error', 'A B2R chain needs at least 2 boxes before it can be published');
      END IF;
    END IF;

    UPDATE public.b2r_series SET
      title         = COALESCE(p_title, title),
      category      = COALESCE(p_category, category),
      description   = COALESCE(p_description, description),
      readme        = COALESCE(p_readme, readme),
      readme_url    = CASE WHEN p_readme_url IS NULL THEN readme_url
                           WHEN btrim(p_readme_url) = '' THEN NULL
                           ELSE p_readme_url END,
      difficulty    = CASE WHEN p_difficulty IS NULL THEN difficulty ELSE p_difficulty END,
      display_order = COALESCE(p_display_order, display_order),
      is_published  = COALESCE(p_is_published, is_published),
      updated_at    = now()
    WHERE id = p_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('error', 'B2R series not found'); END IF;
    v_id := p_id;
  ELSE
    IF p_title IS NULL OR length(btrim(p_title)) = 0 THEN
      RETURN jsonb_build_object('error', 'Title is required');
    END IF;
    IF p_category IS NULL OR length(btrim(p_category)) = 0 THEN
      RETURN jsonb_build_object('error', 'Category is required');
    END IF;
    INSERT INTO public.b2r_series (title, category, description, readme, readme_url, difficulty, display_order, is_published)
    VALUES (btrim(p_title), p_category, COALESCE(p_description, ''), COALESCE(p_readme, ''),
            NULLIF(btrim(COALESCE(p_readme_url, '')), ''),
            p_difficulty, COALESCE(p_display_order, 0), false)
    RETURNING id INTO v_id;
  END IF;

  INSERT INTO public.audit_log (actor_id, action, metadata)
  VALUES (auth.uid(),
          CASE WHEN p_id IS NULL THEN 'create_b2r_series' ELSE 'update_b2r_series' END,
          jsonb_build_object('series_id', v_id));

  RETURN jsonb_build_object('success', true, 'series_id', v_id);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_upsert_b2r_series(uuid, text, text, text, text, text, int, boolean, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_upsert_b2r_series(uuid, text, text, text, text, text, int, boolean, text) TO authenticated, service_role;

-- 6e. Replace a series' ordered box membership atomically (mirrors admin_set_chain_members).
CREATE OR REPLACE FUNCTION public.admin_set_b2r_members(
  p_series_id uuid,
  p_box_ids   uuid[]
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_published boolean;
  v_n         int;
  v_distinct  int;
  v_valid     int;
BEGIN
  IF NOT public.is_admin() THEN RETURN jsonb_build_object('error', 'Unauthorized'); END IF;

  SELECT is_published INTO v_published FROM public.b2r_series WHERE id = p_series_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'B2R series not found'); END IF;

  p_box_ids := COALESCE(p_box_ids, ARRAY[]::uuid[]);
  v_n := COALESCE(array_length(p_box_ids, 1), 0);

  IF v_n > 64 THEN
    RETURN jsonb_build_object('error', 'A B2R chain cannot exceed 64 boxes');
  END IF;

  SELECT count(DISTINCT x) INTO v_distinct FROM unnest(p_box_ids) AS x;
  IF v_distinct <> v_n THEN
    RETURN jsonb_build_object('error', 'A box cannot appear twice in the same chain');
  END IF;

  IF v_n > 0 THEN
    SELECT count(*) INTO v_valid FROM public.b2r_boxes b WHERE b.id = ANY(p_box_ids);
    IF v_valid <> v_n THEN
      RETURN jsonb_build_object('error', 'One or more boxes do not exist');
    END IF;
  END IF;

  IF v_published AND v_n < 2 THEN
    RETURN jsonb_build_object('error', 'A published B2R chain must keep at least 2 boxes; unpublish it first');
  END IF;

  IF v_n > 0 AND EXISTS (
    SELECT 1 FROM public.b2r_series_members m
    WHERE m.box_id = ANY(p_box_ids) AND m.series_id <> p_series_id
  ) THEN
    RETURN jsonb_build_object('error', 'A box already belongs to another B2R chain');
  END IF;

  DELETE FROM public.b2r_series_members WHERE series_id = p_series_id;
  IF v_n > 0 THEN
    INSERT INTO public.b2r_series_members (series_id, box_id, position)
    SELECT p_series_id, bid, ord
    FROM unnest(p_box_ids) WITH ORDINALITY AS t(bid, ord);
  END IF;

  INSERT INTO public.audit_log (actor_id, action, metadata)
  VALUES (auth.uid(), 'set_b2r_members',
          jsonb_build_object('series_id', p_series_id, 'count', v_n));

  RETURN jsonb_build_object('success', true, 'series_id', p_series_id, 'count', v_n);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_set_b2r_members(uuid, uuid[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_set_b2r_members(uuid, uuid[]) TO authenticated, service_role;

-- 6f. Delete a series (members cascade via FK; boxes and challenges are untouched).
CREATE OR REPLACE FUNCTION public.admin_delete_b2r_series(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.is_admin() THEN RETURN jsonb_build_object('error', 'Unauthorized'); END IF;

  DELETE FROM public.b2r_series WHERE id = p_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'B2R series not found'); END IF;

  INSERT INTO public.audit_log (actor_id, action, metadata)
  VALUES (auth.uid(), 'delete_b2r_series', jsonb_build_object('series_id', p_id));

  RETURN jsonb_build_object('success', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_delete_b2r_series(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_delete_b2r_series(uuid) TO authenticated, service_role;

-- 6g. Admin read RPC: every box (incl. unpublished) with its two challenges'
--     points/visibility and any series membership. Structure only — no flags.
CREATE OR REPLACE FUNCTION public.admin_list_b2r_boxes()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = '' AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.is_admin() THEN RETURN jsonb_build_object('error', 'Unauthorized'); END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.category, x.display_order, x.title), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      b.id, b.title, b.category, b.description, b.difficulty, b.readme_url,
      b.display_order, b.is_published, b.created_at, b.updated_at,
      b.user_challenge_id, b.root_challenge_id,
      cu.points     AS user_points,
      cr.points     AS root_points,
      cu.max_attempts AS max_attempts,
      cu.connection_info AS connection_info,
      (SELECT m.series_id FROM public.b2r_series_members m WHERE m.box_id = b.id LIMIT 1) AS series_id,
      (SELECT m.position  FROM public.b2r_series_members m WHERE m.box_id = b.id LIMIT 1) AS position
    FROM public.b2r_boxes b
    JOIN public.challenges cu ON cu.id = b.user_challenge_id
    JOIN public.challenges cr ON cr.id = b.root_challenge_id
  ) x;

  RETURN jsonb_build_object('success', true, 'boxes', v_result);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_list_b2r_boxes() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_list_b2r_boxes() TO authenticated, service_role;

-- 6h. Admin read RPC: every series + ordered members (incl. unpublished).
CREATE OR REPLACE FUNCTION public.admin_list_b2r_series()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = '' AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.is_admin() THEN RETURN jsonb_build_object('error', 'Unauthorized'); END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.category, s.display_order, s.title), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      bs.id, bs.title, bs.category, bs.description, bs.readme, bs.readme_url, bs.difficulty,
      bs.display_order, bs.is_published, bs.created_at, bs.updated_at,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object('box_id', m.box_id, 'position', m.position)
                         ORDER BY m.position)
        FROM public.b2r_series_members m WHERE m.series_id = bs.id
      ), '[]'::jsonb) AS members
    FROM public.b2r_series bs
  ) s;

  RETURN jsonb_build_object('success', true, 'series', v_result);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_list_b2r_series() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_list_b2r_series() TO authenticated, service_role;
