-- Chained Challenges — an OPTIONAL, admin-gated experience layer.
--
-- Design constraints this migration deliberately honours (see the feature spec):
--   * ZERO changes to the solve/score path. submit_flag_tx, apply_solve_to_scores,
--     the score views, challenges_open(), and every existing RLS policy are left
--     exactly as they are. A chain never gates a solve and never awards points.
--   * "Mode" (FREE vs CHAINED) is DERIVED, not stored: a challenge is CHAINED iff
--     it belongs to a published chain series. So the challenges table and the
--     public_challenges view are NOT touched here.
--   * Everything is additive and defaults OFF. event_settings.chain_experience_enabled
--     defaults false, so an un-flagged platform behaves exactly as before.
--   * Membership FKs to challenges are ON DELETE CASCADE, so admin_delete_challenge
--     and the event reset/new-event paths need NO changes — deleting a challenge
--     simply drops its membership rows.
--   * Reads flow through owner-run VIEWS with writes REVOKED (the auto-updatable-
--     view escalation fixed in 20260913000000). Direct table reads are admin-only.
--   * Writes flow ONLY through SECURITY DEFINER, is_admin()-gated, audit-logged RPCs
--     (the admin_upsert_challenge template). No write grant to authenticated.
--   * Policies wrap helper calls as (SELECT ...) for InitPlan evaluation (20260901070000).

-- ════════════════════════════════════════════════════════════════════════
-- 1. Master feature flag (server-authoritative, admin-toggled)
-- ════════════════════════════════════════════════════════════════════════
-- Additive, nullable-safe boolean on the event_settings singleton. Reuses the
-- existing "authenticated may SELECT event_settings, only is_admin() may UPDATE"
-- posture, so no new grant is required for the client to read it.

ALTER TABLE public.event_settings
  ADD COLUMN IF NOT EXISTS chain_experience_enabled boolean NOT NULL DEFAULT false;

-- ════════════════════════════════════════════════════════════════════════
-- 2. Tables — structure only. Never points, never solves.
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.chain_series (
  id            uuid NOT NULL DEFAULT gen_random_uuid(),
  title         text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 120),
  category      text NOT NULL CHECK (length(category) BETWEEN 1 AND 40),
  description   text NOT NULL DEFAULT '' CHECK (length(description) <= 2000),
  readme        text NOT NULL DEFAULT '' CHECK (length(readme) <= 20000),
  difficulty    text CHECK (difficulty IS NULL OR difficulty IN ('Easy','Medium','Hard','Insane')),
  display_order integer NOT NULL DEFAULT 0,
  is_published  boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chain_series_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.chain_series_members (
  series_id    uuid NOT NULL REFERENCES public.chain_series(id) ON DELETE CASCADE,
  challenge_id uuid NOT NULL REFERENCES public.challenges(id)   ON DELETE CASCADE,
  position     integer NOT NULL CHECK (position >= 1),
  CONSTRAINT chain_series_members_pkey PRIMARY KEY (series_id, challenge_id),
  CONSTRAINT chain_series_members_unique_position UNIQUE (series_id, position)
);

-- A challenge lives in at most one series (a chain is a linear story). Enforced
-- structurally so the "CHAINED = member of a series" derivation is unambiguous.
CREATE UNIQUE INDEX IF NOT EXISTS idx_chain_member_one_series
  ON public.chain_series_members (challenge_id);

CREATE INDEX IF NOT EXISTS idx_chain_series_category_order
  ON public.chain_series (category, display_order);

CREATE INDEX IF NOT EXISTS idx_chain_members_series_pos
  ON public.chain_series_members (series_id, position);

-- ════════════════════════════════════════════════════════════════════════
-- 3. Grants — SELECT to authenticated (for admin RLS reads); no client writes.
-- ════════════════════════════════════════════════════════════════════════
-- The initial schema's blanket "GRANT ALL ... TO authenticated" ran before these
-- tables existed, so they start with no grants. Grant read only; writes go
-- exclusively through the SECURITY DEFINER RPCs below.

REVOKE ALL ON public.chain_series          FROM anon;
REVOKE ALL ON public.chain_series_members  FROM anon;
GRANT  SELECT ON public.chain_series          TO authenticated;
GRANT  SELECT ON public.chain_series_members  TO authenticated;

-- ════════════════════════════════════════════════════════════════════════
-- 4. RLS — direct table reads are ADMIN-ONLY. Players read the views (section 5).
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE public.chain_series         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chain_series_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chain_series_select_admin" ON public.chain_series;
CREATE POLICY "chain_series_select_admin" ON public.chain_series FOR SELECT
  USING ((SELECT public.is_admin()));

-- Defence-in-depth write policies. No write grant is issued to authenticated, so
-- these are belt-and-suspenders behind the RPCs (which run as definer/owner).
DROP POLICY IF EXISTS "chain_series_insert_admin" ON public.chain_series;
CREATE POLICY "chain_series_insert_admin" ON public.chain_series FOR INSERT
  WITH CHECK ((SELECT public.is_admin()));
DROP POLICY IF EXISTS "chain_series_update_admin" ON public.chain_series;
CREATE POLICY "chain_series_update_admin" ON public.chain_series FOR UPDATE
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
DROP POLICY IF EXISTS "chain_series_delete_admin" ON public.chain_series;
CREATE POLICY "chain_series_delete_admin" ON public.chain_series FOR DELETE
  USING ((SELECT public.is_admin()));

DROP POLICY IF EXISTS "chain_members_select_admin" ON public.chain_series_members;
CREATE POLICY "chain_members_select_admin" ON public.chain_series_members FOR SELECT
  USING ((SELECT public.is_admin()));
DROP POLICY IF EXISTS "chain_members_insert_admin" ON public.chain_series_members;
CREATE POLICY "chain_members_insert_admin" ON public.chain_series_members FOR INSERT
  WITH CHECK ((SELECT public.is_admin()));
DROP POLICY IF EXISTS "chain_members_update_admin" ON public.chain_series_members;
CREATE POLICY "chain_members_update_admin" ON public.chain_series_members FOR UPDATE
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
DROP POLICY IF EXISTS "chain_members_delete_admin" ON public.chain_series_members;
CREATE POLICY "chain_members_delete_admin" ON public.chain_series_members FOR DELETE
  USING ((SELECT public.is_admin()));

-- ════════════════════════════════════════════════════════════════════════
-- 5. Player read surface — owner-run VIEWS, gated exactly like public_challenges,
--    plus the master flag. Writes REVOKED (auto-updatable-view escalation).
-- ════════════════════════════════════════════════════════════════════════
-- Visibility rule for a NON-admin: the master flag is ON, the player is not
-- banned, the event is open, AND the series is published. Admins see every
-- published series regardless of the flag (for review/preview). Neither view
-- ever exposes an unpublished series, a hidden member challenge (to non-admins),
-- or anything touching challenge_secrets / challenge_flag_vault.

CREATE OR REPLACE VIEW public.public_chain_series
WITH (security_invoker = false) AS
SELECT
  s.id, s.title, s.category, s.description, s.readme, s.difficulty,
  s.display_order,
  (SELECT count(*)::int
     FROM public.chain_series_members m
     JOIN public.challenges c ON c.id = m.challenge_id
    WHERE m.series_id = s.id
      AND (public.is_admin() OR c.is_visible = true)) AS challenge_count
FROM public.chain_series s
WHERE s.is_published = true
  AND (
    public.is_admin()
    OR (
      COALESCE((SELECT es.chain_experience_enabled FROM public.event_settings es WHERE es.id = 1), false)
      AND public.is_not_banned()
      AND public.challenges_open()
      -- Never surface an "empty" published chain to players: one whose members
      -- are all still hidden, or a series left memberless by an event reset
      -- (members cascade away, the series row remains). Admins still see it so
      -- they can finish or remove it.
      AND EXISTS (
        SELECT 1 FROM public.chain_series_members m2
        JOIN public.challenges c2 ON c2.id = m2.challenge_id
        WHERE m2.series_id = s.id AND c2.is_visible = true
      )
    )
  );

CREATE OR REPLACE VIEW public.public_chain_members
WITH (security_invoker = false) AS
SELECT m.series_id, m.challenge_id, m.position
FROM public.chain_series_members m
JOIN public.chain_series s ON s.id = m.series_id
JOIN public.challenges   c ON c.id = m.challenge_id
WHERE s.is_published = true
  AND (
    public.is_admin()
    OR (
      COALESCE((SELECT es.chain_experience_enabled FROM public.event_settings es WHERE es.id = 1), false)
      AND public.is_not_banned()
      AND public.challenges_open()
      AND c.is_visible = true
    )
  );

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.public_chain_series, public.public_chain_members
  FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.public_chain_series  TO authenticated;
GRANT SELECT ON public.public_chain_members TO authenticated;

-- ════════════════════════════════════════════════════════════════════════
-- 6. Admin RPCs — SECURITY DEFINER, is_admin()-gated, audit-logged. The only
--    sanctioned write path (mirrors admin_upsert_challenge / admin_set_*).
-- ════════════════════════════════════════════════════════════════════════

-- 6a. Master toggle (mirrors admin_set_scoreboard_hidden).
CREATE OR REPLACE FUNCTION public.admin_set_chain_experience(p_enabled boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  UPDATE public.event_settings SET chain_experience_enabled = COALESCE(p_enabled, false) WHERE id = 1;

  INSERT INTO public.audit_log (actor_id, action, metadata)
  VALUES (auth.uid(),
          CASE WHEN p_enabled THEN 'enable_chain_experience' ELSE 'disable_chain_experience' END,
          jsonb_build_object('enabled', COALESCE(p_enabled, false)));

  RETURN jsonb_build_object('success', true, 'enabled', COALESCE(p_enabled, false));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_set_chain_experience(boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_set_chain_experience(boolean) TO authenticated, service_role;

-- 6b. Create / edit a series. COALESCE partial-update discipline (a call that
--     omits a field leaves it unchanged) — the same rule admin_upsert_challenge
--     follows so a partial call never silently blanks fields. Publishing is
--     refused unless the series already has >= 2 members. (An "all hidden
--     members" chain is additionally hidden from players by public_chain_series,
--     so publishing early during a staged reveal is safe.)
CREATE OR REPLACE FUNCTION public.admin_upsert_chain_series(
  p_id            uuid    DEFAULT NULL,
  p_title         text    DEFAULT NULL,
  p_category      text    DEFAULT NULL,
  p_description   text    DEFAULT NULL,
  p_readme        text    DEFAULT NULL,
  p_difficulty    text    DEFAULT NULL,
  p_display_order int     DEFAULT NULL,
  p_is_published  boolean DEFAULT NULL
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

  IF p_id IS NOT NULL THEN
    -- Guard publish transition: never publish a series with < 2 members.
    v_publish := COALESCE(p_is_published,
                          (SELECT is_published FROM public.chain_series WHERE id = p_id));
    IF v_publish THEN
      SELECT count(*) INTO v_member_cnt FROM public.chain_series_members WHERE series_id = p_id;
      IF v_member_cnt < 2 THEN
        RETURN jsonb_build_object('error', 'A chain needs at least 2 challenges before it can be published');
      END IF;
    END IF;

    UPDATE public.chain_series SET
      title         = COALESCE(p_title, title),
      category      = COALESCE(p_category, category),
      description   = COALESCE(p_description, description),
      readme        = COALESCE(p_readme, readme),
      difficulty    = CASE WHEN p_difficulty IS NULL THEN difficulty ELSE p_difficulty END,
      display_order = COALESCE(p_display_order, display_order),
      is_published  = COALESCE(p_is_published, is_published),
      updated_at    = now()
    WHERE id = p_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Chain series not found'); END IF;
    v_id := p_id;
  ELSE
    IF p_title IS NULL OR length(btrim(p_title)) = 0 THEN
      RETURN jsonb_build_object('error', 'Title is required');
    END IF;
    IF p_category IS NULL OR length(btrim(p_category)) = 0 THEN
      RETURN jsonb_build_object('error', 'Category is required');
    END IF;
    -- A brand-new series always starts unpublished (it has no members yet).
    INSERT INTO public.chain_series (title, category, description, readme, difficulty, display_order, is_published)
    VALUES (btrim(p_title), p_category, COALESCE(p_description, ''), COALESCE(p_readme, ''),
            p_difficulty, COALESCE(p_display_order, 0), false)
    RETURNING id INTO v_id;
  END IF;

  INSERT INTO public.audit_log (actor_id, action, metadata)
  VALUES (auth.uid(),
          CASE WHEN p_id IS NULL THEN 'create_chain_series' ELSE 'update_chain_series' END,
          jsonb_build_object('series_id', v_id));

  RETURN jsonb_build_object('success', true, 'series_id', v_id);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_upsert_chain_series(uuid, text, text, text, text, text, int, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_upsert_chain_series(uuid, text, text, text, text, text, int, boolean) TO authenticated, service_role;

-- 6c. Replace a series' ordered membership atomically. Validates: series exists,
--     all challenge ids exist, no duplicates. Positions are assigned 1..N from
--     array order, so duplicate-position / duplicate-assignment are impossible.
--     Members carry NO dependent rows (solves reference challenges, not members),
--     so a full replace is safe — unlike the hints delete+reinsert hazard.
--     If the series is currently published, refuse to drop below 2 members.
CREATE OR REPLACE FUNCTION public.admin_set_chain_members(
  p_series_id uuid,
  p_challenge_ids uuid[]
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_published boolean;
  v_n         int;
  v_distinct  int;
  v_valid     int;
BEGIN
  IF NOT public.is_admin() THEN RETURN jsonb_build_object('error', 'Unauthorized'); END IF;

  SELECT is_published INTO v_published FROM public.chain_series WHERE id = p_series_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Chain series not found'); END IF;

  p_challenge_ids := COALESCE(p_challenge_ids, ARRAY[]::uuid[]);
  v_n := array_length(p_challenge_ids, 1);
  v_n := COALESCE(v_n, 0);

  IF v_n > 64 THEN
    RETURN jsonb_build_object('error', 'A chain cannot exceed 64 challenges');
  END IF;

  -- Reject duplicate assignments up front (clean error rather than a PK violation).
  SELECT count(DISTINCT x) INTO v_distinct FROM unnest(p_challenge_ids) AS x;
  IF v_distinct <> v_n THEN
    RETURN jsonb_build_object('error', 'A challenge cannot appear twice in the same chain');
  END IF;

  -- Every id must be a real challenge.
  IF v_n > 0 THEN
    SELECT count(*) INTO v_valid
    FROM public.challenges c
    WHERE c.id = ANY(p_challenge_ids);
    IF v_valid <> v_n THEN
      RETURN jsonb_build_object('error', 'One or more challenges do not exist');
    END IF;
  END IF;

  IF v_published AND v_n < 2 THEN
    RETURN jsonb_build_object('error', 'A published chain must keep at least 2 challenges; unpublish it first');
  END IF;

  -- A challenge belongs to at most one series (idx_chain_member_one_series). If a
  -- requested challenge is already in a DIFFERENT series, refuse with a clear message.
  IF v_n > 0 AND EXISTS (
    SELECT 1 FROM public.chain_series_members m
    WHERE m.challenge_id = ANY(p_challenge_ids) AND m.series_id <> p_series_id
  ) THEN
    RETURN jsonb_build_object('error', 'A challenge already belongs to another chain');
  END IF;

  DELETE FROM public.chain_series_members WHERE series_id = p_series_id;
  IF v_n > 0 THEN
    INSERT INTO public.chain_series_members (series_id, challenge_id, position)
    SELECT p_series_id, cid, ord
    FROM unnest(p_challenge_ids) WITH ORDINALITY AS t(cid, ord);
  END IF;

  INSERT INTO public.audit_log (actor_id, action, metadata)
  VALUES (auth.uid(), 'set_chain_members',
          jsonb_build_object('series_id', p_series_id, 'count', v_n));

  RETURN jsonb_build_object('success', true, 'series_id', p_series_id, 'count', v_n);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_set_chain_members(uuid, uuid[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_set_chain_members(uuid, uuid[]) TO authenticated, service_role;

-- 6d. Delete a series (members cascade via FK).
CREATE OR REPLACE FUNCTION public.admin_delete_chain_series(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.is_admin() THEN RETURN jsonb_build_object('error', 'Unauthorized'); END IF;

  DELETE FROM public.chain_series WHERE id = p_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Chain series not found'); END IF;

  INSERT INTO public.audit_log (actor_id, action, metadata)
  VALUES (auth.uid(), 'delete_chain_series', jsonb_build_object('series_id', p_id));

  RETURN jsonb_build_object('success', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_delete_chain_series(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_delete_chain_series(uuid) TO authenticated, service_role;

-- 6e. Admin read RPC: full series + members for the builder, INCLUDING unpublished
--     and hidden members. is_admin()-gated; returns structure only (no flags).
CREATE OR REPLACE FUNCTION public.admin_list_chain_series()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = '' AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.is_admin() THEN RETURN jsonb_build_object('error', 'Unauthorized'); END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.category, s.display_order, s.title), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      cs.id, cs.title, cs.category, cs.description, cs.readme, cs.difficulty,
      cs.display_order, cs.is_published, cs.created_at, cs.updated_at,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object('challenge_id', m.challenge_id, 'position', m.position)
                         ORDER BY m.position)
        FROM public.chain_series_members m WHERE m.series_id = cs.id
      ), '[]'::jsonb) AS members
    FROM public.chain_series cs
  ) s;

  RETURN jsonb_build_object('success', true, 'series', v_result);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_list_chain_series() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_list_chain_series() TO authenticated, service_role;
