-- Chained Challenges, follow-up: a downloadable per-series briefing.
--
-- Admins attach ONE briefing/README file URL to a chain series (they upload the
-- file to their own storage and paste the link). Players get a prominent
-- "Download briefing" button at the top of the chain. Purely additive; the
-- client sanitises the URL with safeHttpUrl() before it is ever used as a link.

ALTER TABLE public.chain_series
  ADD COLUMN IF NOT EXISTS readme_url text
  CHECK (readme_url IS NULL OR length(readme_url) <= 2048);

-- ── Restate public_chain_series to expose readme_url ────────────────────
-- CREATE OR REPLACE VIEW may only APPEND columns (existing columns must keep
-- the same names/types/order), so readme_url is added at the END of the SELECT
-- list, after challenge_count. The client selects by name, so order is
-- irrelevant to it. Gate is identical to 20260915000000, incl. the
-- "hide empty published chains" EXISTS clause.
CREATE OR REPLACE VIEW public.public_chain_series
WITH (security_invoker = false) AS
SELECT
  s.id, s.title, s.category, s.description, s.readme, s.difficulty,
  s.display_order,
  (SELECT count(*)::int
     FROM public.chain_series_members m
     JOIN public.challenges c ON c.id = m.challenge_id
    WHERE m.series_id = s.id
      AND (public.is_admin() OR c.is_visible = true)) AS challenge_count,
  s.readme_url
FROM public.chain_series s
WHERE s.is_published = true
  AND (
    public.is_admin()
    OR (
      COALESCE((SELECT es.chain_experience_enabled FROM public.event_settings es WHERE es.id = 1), false)
      AND public.is_not_banned()
      AND public.challenges_open()
      AND EXISTS (
        SELECT 1 FROM public.chain_series_members m2
        JOIN public.challenges c2 ON c2.id = m2.challenge_id
        WHERE m2.series_id = s.id AND c2.is_visible = true
      )
    )
  );

-- CREATE OR REPLACE VIEW preserves grants, but re-assert the hardened posture
-- so this migration is self-contained and idempotent.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.public_chain_series FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.public_chain_series TO authenticated;

-- ── admin_upsert_chain_series gains p_readme_url ────────────────────────
-- Adding a parameter changes the signature, so DROP the old function first
-- (otherwise CREATE OR REPLACE would create an overload and PostgREST calls
-- would be ambiguous). Body is the previous version plus the readme_url write.
DROP FUNCTION IF EXISTS public.admin_upsert_chain_series(uuid, text, text, text, text, text, int, boolean);

CREATE FUNCTION public.admin_upsert_chain_series(
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
      -- readme_url is cleared by passing an empty string, set by a non-empty
      -- one, and left unchanged when NULL (partial-update discipline).
      readme_url    = CASE WHEN p_readme_url IS NULL THEN readme_url
                           WHEN btrim(p_readme_url) = '' THEN NULL
                           ELSE p_readme_url END,
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
    INSERT INTO public.chain_series (title, category, description, readme, readme_url, difficulty, display_order, is_published)
    VALUES (btrim(p_title), p_category, COALESCE(p_description, ''), COALESCE(p_readme, ''),
            NULLIF(btrim(COALESCE(p_readme_url, '')), ''),
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
REVOKE EXECUTE ON FUNCTION public.admin_upsert_chain_series(uuid, text, text, text, text, text, int, boolean, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_upsert_chain_series(uuid, text, text, text, text, text, int, boolean, text) TO authenticated, service_role;

-- ── admin_list_chain_series must return readme_url too (explicit column list) ──
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
      cs.id, cs.title, cs.category, cs.description, cs.readme, cs.readme_url, cs.difficulty,
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
