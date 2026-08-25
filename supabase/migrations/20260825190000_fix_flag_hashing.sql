-- Fix: admin_upsert_challenge could not hash flags.
--
-- The function is declared SET search_path = '', so unqualified names resolve
-- against nothing but pg_catalog. digest() ships with pgcrypto, which Supabase
-- installs into the extensions schema, so the call raised
--   function digest(text, unknown) does not exist
-- and saving any challenge from the admin dashboard failed.
--
-- Use the built-in sha256(bytea) instead of pgcrypto. It lives in pg_catalog,
-- so it needs no extension and no search_path change. Hashing the UTF8 bytes of
-- the trimmed flag and hex-encoding matches what supabase/functions/submit-flag
-- computes with crypto.subtle.digest('SHA-256', ...), so hashes written here
-- still verify at submission time.

CREATE OR REPLACE FUNCTION public.admin_upsert_challenge(
  p_id uuid DEFAULT NULL, p_title text DEFAULT NULL, p_category text DEFAULT NULL,
  p_difficulty text DEFAULT NULL, p_description text DEFAULT NULL, p_flag text DEFAULT NULL,
  p_flag_type text DEFAULT 'static', p_points int DEFAULT 100, p_max_attempts int DEFAULT 0,
  p_author text DEFAULT 'CyberHX Team', p_tags text[] DEFAULT '{}',
  p_is_visible boolean DEFAULT false, p_connection_info text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_challenge_id uuid; v_flag_hash text;
BEGIN
  IF NOT public.is_admin() THEN RETURN jsonb_build_object('error', 'Unauthorized'); END IF;

  IF p_flag IS NOT NULL AND trim(p_flag) != '' THEN
    v_flag_hash := encode(pg_catalog.sha256(pg_catalog.convert_to(trim(p_flag), 'UTF8')), 'hex');
  END IF;

  IF p_id IS NOT NULL THEN
    UPDATE public.challenges SET
      title = COALESCE(p_title, title), category = COALESCE(p_category, category),
      difficulty = COALESCE(p_difficulty, difficulty), description = COALESCE(p_description, description),
      points = COALESCE(p_points, points), max_attempts = COALESCE(p_max_attempts, max_attempts),
      author = COALESCE(p_author, author), tags = COALESCE(p_tags, tags),
      is_visible = COALESCE(p_is_visible, is_visible), connection_info = p_connection_info
    WHERE id = p_id;
    v_challenge_id := p_id;
    IF v_flag_hash IS NOT NULL THEN
      INSERT INTO public.challenge_secrets (challenge_id, flag_hash, flag_type)
      VALUES (v_challenge_id, v_flag_hash, p_flag_type)
      ON CONFLICT (challenge_id) DO UPDATE SET flag_hash = v_flag_hash, flag_type = p_flag_type;
    END IF;
  ELSE
    IF p_flag IS NULL OR trim(p_flag) = '' THEN
      RETURN jsonb_build_object('error', 'Flag is required for new challenges');
    END IF;
    INSERT INTO public.challenges (title, category, difficulty, description, points,
      max_attempts, author, tags, is_visible, connection_info)
    VALUES (p_title, p_category, p_difficulty, p_description, p_points,
      p_max_attempts, p_author, p_tags, p_is_visible, p_connection_info)
    RETURNING id INTO v_challenge_id;
    INSERT INTO public.challenge_secrets (challenge_id, flag_hash, flag_type)
    VALUES (v_challenge_id, v_flag_hash, p_flag_type);
  END IF;

  RETURN jsonb_build_object('challenge_id', v_challenge_id);
END;
$$;
