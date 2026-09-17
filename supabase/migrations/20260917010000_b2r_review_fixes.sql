-- B2R follow-up fixes from the post-deploy review. Additive and idempotent;
-- signatures are unchanged so CREATE OR REPLACE is safe (grants are kept).
--
-- 1. admin_upsert_b2r_box — partial updates no longer blank connection_info.
--    admin_upsert_challenge writes connection_info whenever a title OR a
--    description is supplied (the ordinary challenge editor always sends all
--    three together). The box RPC forwards the box's title/description but the
--    box editor has no connection_info field, so it was passing NULL and
--    clearing the resource links on BOTH flag challenges on every save.
--    Now, on UPDATE: NULL keeps the current value, an empty string clears it,
--    anything else replaces it (the same discipline readme_url already uses).
--
-- 2. public_b2r_series.box_count — count only boxes whose two flag challenges
--    are visible (exactly what public_b2r_boxes exposes), so a series card
--    never advertises more machines than the player can actually open.

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
  v_conn   text;
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
    v_conn  := NULLIF(btrim(COALESCE(p_connection_info, '')), '');

    BEGIN
      v_res := public.admin_upsert_challenge(
        NULL, v_title || ' — User', p_category, v_diff, COALESCE(p_description, ''),
        p_user_flag, 'static', COALESCE(p_user_points, 100), COALESCE(p_max_attempts, 0),
        NULL, ARRAY['b2r','user']::text[], v_pub, v_conn);
      IF v_res ? 'error' THEN RAISE EXCEPTION '%', v_res->>'error'; END IF;
      v_user := (v_res->>'challenge_id')::uuid;

      v_res := public.admin_upsert_challenge(
        NULL, v_title || ' — Root', p_category, v_diff, COALESCE(p_description, ''),
        p_root_flag, 'static', COALESCE(p_root_points, 100), COALESCE(p_max_attempts, 0),
        NULL, ARRAY['b2r','root']::text[], v_pub, v_conn);
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

    -- Resource links: NULL = keep what the box already has (read from the
    -- user-flag challenge; both flags always carry the same links), '' =
    -- clear, otherwise replace. Passing the resolved value means the
    -- "title/description supplied" write in admin_upsert_challenge can never
    -- blank it by accident; and when links ARE supplied we also pass the
    -- (unchanged) title so that write path actually runs.
    v_conn := CASE
                WHEN p_connection_info IS NULL
                  THEN (SELECT c.connection_info FROM public.challenges c WHERE c.id = v_user)
                WHEN btrim(p_connection_info) = '' THEN NULL
                ELSE p_connection_info
              END;

    BEGIN
      v_res := public.admin_upsert_challenge(
        v_user,
        CASE WHEN p_title IS NULL AND p_connection_info IS NULL THEN NULL ELSE v_title || ' — User' END,
        p_category, p_difficulty, p_description,
        p_user_flag, 'static', p_user_points, p_max_attempts,
        NULL, NULL, v_pub, v_conn);
      IF v_res ? 'error' THEN RAISE EXCEPTION '%', v_res->>'error'; END IF;

      v_res := public.admin_upsert_challenge(
        v_root,
        CASE WHEN p_title IS NULL AND p_connection_info IS NULL THEN NULL ELSE v_title || ' — Root' END,
        p_category, p_difficulty, p_description,
        p_root_flag, 'static', p_root_points, p_max_attempts,
        NULL, NULL, v_pub, v_conn);
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

-- ── public_b2r_series: box_count honours flag visibility ────────────────
-- Same column list and order as 20260917000000 (CREATE OR REPLACE VIEW may
-- only append columns); only the box_count expression changes.
CREATE OR REPLACE VIEW public.public_b2r_series
WITH (security_invoker = false) AS
SELECT
  s.id, s.title, s.category, s.description, s.readme, s.readme_url, s.difficulty,
  s.display_order,
  (SELECT count(*)::int
     FROM public.b2r_series_members m
     JOIN public.b2r_boxes  b  ON b.id  = m.box_id
     JOIN public.challenges cu ON cu.id = b.user_challenge_id
     JOIN public.challenges cr ON cr.id = b.root_challenge_id
    WHERE m.series_id = s.id
      AND (public.is_admin()
           OR (b.is_published = true AND cu.is_visible = true AND cr.is_visible = true))) AS box_count
FROM public.b2r_series s
WHERE s.is_published = true
  AND (
    public.is_admin()
    OR (
      COALESCE((SELECT es.b2r_enabled FROM public.event_settings es WHERE es.id = 1), false)
      AND public.is_not_banned()
      AND public.challenges_open()
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

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.public_b2r_series FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.public_b2r_series TO authenticated;
