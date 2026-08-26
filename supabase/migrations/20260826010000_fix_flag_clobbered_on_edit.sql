-- Editing a challenge silently replaced its flag with a placeholder string.
--
-- get_challenge_flag() returns the literal text '[HASHED — re-enter flag to
-- change]'. It has to: only the SHA-256 lives in challenge_secrets, so there is
-- no flag to hand back. The admin form treated that string as the flag,
-- prefilled the flag input with it, and sent it straight back on the next save.
-- admin_upsert_challenge saw a non-empty p_flag and did exactly what it was
-- asked -- it hashed the placeholder and stored that as the challenge's flag.
--
-- So any edit at all, adding a hint or fixing a typo in the description, quietly
-- repointed the challenge at a flag nobody could ever submit. Players entering
-- the real flag were told they were wrong, which is what surfaced this.
--
-- The frontend no longer prefills the field, and now sends NULL for a blank one
-- so admin_upsert_challenge keeps the stored flag. Two server-side changes back
-- that up, because an admin whose browser still has the old bundle cached would
-- otherwise keep clobbering flags.

-- ── 1. Stop handing out a string that reads like a flag ───────────────
-- NULL is the honest answer: there is nothing to return. If any client still
-- prefills from this, it now prefills empty, which means "keep the flag".
CREATE OR REPLACE FUNCTION public.get_challenge_flag(challenge_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = '' AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_challenge_flag(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_challenge_flag(uuid) TO authenticated, service_role;

-- ── 2. Refuse to store the placeholder as a flag ──────────────────────
-- Treat the sentinel exactly like a blank field: keep whatever flag is already
-- there. This is what makes a stale cached admin bundle harmless.
CREATE OR REPLACE FUNCTION public.admin_upsert_challenge(
  p_id uuid DEFAULT NULL, p_title text DEFAULT NULL, p_category text DEFAULT NULL,
  p_difficulty text DEFAULT NULL, p_description text DEFAULT NULL, p_flag text DEFAULT NULL,
  p_flag_type text DEFAULT 'static', p_points int DEFAULT 100, p_max_attempts int DEFAULT 0,
  p_author text DEFAULT 'CyberHX Team', p_tags text[] DEFAULT '{}',
  p_is_visible boolean DEFAULT false, p_connection_info text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_challenge_id uuid;
  v_flag_hash    text;
  v_flag         text;
BEGIN
  IF NOT public.is_admin() THEN RETURN jsonb_build_object('error', 'Unauthorized'); END IF;

  v_flag := trim(COALESCE(p_flag, ''));

  -- The old get_challenge_flag sentinel, and the generic shape of it, are not
  -- flags. Anything arriving as one means a client echoed a placeholder back.
  IF v_flag = '[HASHED — re-enter flag to change]'
     OR v_flag ~ '^\[HASHED' THEN
    v_flag := '';
  END IF;

  IF v_flag <> '' THEN
    v_flag_hash := encode(pg_catalog.sha256(pg_catalog.convert_to(v_flag, 'UTF8')), 'hex');
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

    -- No flag supplied: leave challenge_secrets untouched. This is the path an
    -- ordinary edit takes now, and it is the whole fix.
    IF v_flag_hash IS NOT NULL THEN
      INSERT INTO public.challenge_secrets (challenge_id, flag_hash, flag_type)
      VALUES (v_challenge_id, v_flag_hash, p_flag_type)
      ON CONFLICT (challenge_id) DO UPDATE SET flag_hash = v_flag_hash, flag_type = p_flag_type;
    END IF;
  ELSE
    IF v_flag = '' THEN
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

REVOKE EXECUTE ON FUNCTION public.admin_upsert_challenge(
  uuid, text, text, text, text, text, text, int, int, text, text[], boolean, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_upsert_challenge(
  uuid, text, text, text, text, text, text, int, int, text, text[], boolean, text
) TO authenticated, service_role;

-- ── 3. Name the challenges this already broke ─────────────────────────
-- Every challenge saved through the old form is now pointing at
-- sha256('[HASHED — re-enter flag to change]'). Their real flags cannot be
-- recovered -- only the hash was ever stored -- so an admin has to re-enter
-- each one. This lists exactly which, so nobody has to guess or re-key flags
-- that are still fine.
CREATE OR REPLACE FUNCTION public.admin_challenges_needing_flag_reset()
RETURNS TABLE(id uuid, title text, category text, is_visible boolean)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = '' AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  RETURN QUERY
  SELECT c.id, c.title, c.category, c.is_visible
  FROM public.challenges c
  JOIN public.challenge_secrets s ON s.challenge_id = c.id
  WHERE s.flag_hash = pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to('[HASHED — re-enter flag to change]', 'UTF8')), 'hex')
  ORDER BY c.is_visible DESC, c.title;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_challenges_needing_flag_reset() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_challenges_needing_flag_reset() TO authenticated, service_role;
