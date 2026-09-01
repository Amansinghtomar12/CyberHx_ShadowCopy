-- Owner-only flag vault.
--
-- THE PROBLEM
--   Flags have only ever been stored as an unsalted SHA-256 in
--   challenge_secrets.flag_hash. That was a deliberate choice and it is why
--   get_challenge_flag() returns the literal string
--   '[HASHED — re-enter flag to change]' instead of a flag: there is no
--   plaintext anywhere in this database to return. The owner authored these
--   operations and still cannot read back what they set, which is a real
--   operational problem — you cannot check a flag against a player's dispute,
--   you cannot hand a flag to a co-organiser, and you cannot verify that an
--   edit did what you meant.
--
--   Nothing here recovers an existing flag. SHA-256 is one way. What this does
--   is start keeping a readable copy from now on, and give the owner a way to
--   capture the ones that already exist by proving they know them.
--
-- THE TRADE, STATED PLAINLY
--   Before this migration a full dump of challenge_secrets yielded hashes.
--   After it, a full dump of challenge_flag_vault yields flags. That is a real
--   reduction in defence-in-depth and it is the price of the feature. Three
--   things bound it:
--
--     · The vault is a separate table with RLS enabled and NO policies at all,
--       and every privilege revoked from anon and authenticated. No PostgREST
--       request can read it — not an admin's, not the owner's. The only way in
--       is through the two SECURITY DEFINER functions below.
--     · Those functions check is_owner(), not is_admin(). An admin — including
--       one an attacker promotes — cannot read a flag. This is the one
--       capability on the platform that admin does not confer.
--     · Every reveal is logged with who and when, so the vault cannot be
--       drained quietly.
--
--   Encrypting the column was considered and rejected as theatre: the key
--   would have to live in the same database, so anyone who can dump the table
--   can dump the key. Access control is the control that actually holds here.

-- ── 1. is_owner(), the missing counterpart to is_admin() ──────────────
-- Ownership has been a column since 20260826130000 but there was never a
-- predicate for it. Modelled exactly on is_admin(): STABLE, SECURITY DEFINER,
-- empty search_path, and it answers only about the caller — it discloses
-- nothing about anyone else, which is why authenticated may execute it.
CREATE OR REPLACE FUNCTION public.is_owner()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND is_owner AND role = 'admin' AND NOT is_banned
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_owner() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_owner() TO authenticated, service_role;

-- ── 2. The vault ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.challenge_flag_vault (
  challenge_id uuid PRIMARY KEY REFERENCES public.challenges(id) ON DELETE CASCADE,
  flag         text NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   uuid
);

ALTER TABLE public.challenge_flag_vault ENABLE ROW LEVEL SECURITY;
-- Deliberately no policies. RLS with an empty policy set denies everything,
-- which is exactly the intent: this table is unreachable over the API.
REVOKE ALL ON public.challenge_flag_vault FROM anon;
REVOKE ALL ON public.challenge_flag_vault FROM authenticated;

COMMENT ON TABLE public.challenge_flag_vault IS
  'Readable copy of each flag, for the owner only. Reachable exclusively '
  'through owner_reveal_flag() and owner_capture_flag(); RLS denies all direct access.';

-- ── 3. The audit trail ───────────────────────────────────────────────
-- challenge_id is intentionally NOT a foreign key: deleting an operation must
-- not erase the record that its flag was read.
CREATE TABLE IF NOT EXISTS public.flag_reveal_log (
  id           bigserial PRIMARY KEY,
  challenge_id uuid,
  revealed_by  uuid,
  action       text NOT NULL DEFAULT 'reveal',
  revealed_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.flag_reveal_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.flag_reveal_log FROM anon;
REVOKE ALL ON public.flag_reveal_log FROM authenticated;

CREATE INDEX IF NOT EXISTS idx_flag_reveal_log_time
  ON public.flag_reveal_log (revealed_at DESC);

-- ── 4. Capture the flag on every save, from now on ───────────────────
-- Same body as 20260826010000 with one addition: whenever a real flag is
-- written to challenge_secrets, the same plaintext lands in the vault. The
-- "no flag supplied" path still leaves both tables untouched, which is what
-- keeps an ordinary edit from clobbering anything.
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

    IF v_flag_hash IS NOT NULL THEN
      INSERT INTO public.challenge_secrets (challenge_id, flag_hash, flag_type)
      VALUES (v_challenge_id, v_flag_hash, p_flag_type)
      ON CONFLICT (challenge_id) DO UPDATE SET flag_hash = v_flag_hash, flag_type = p_flag_type;

      INSERT INTO public.challenge_flag_vault (challenge_id, flag, updated_by)
      VALUES (v_challenge_id, v_flag, auth.uid())
      ON CONFLICT (challenge_id) DO UPDATE
        SET flag = v_flag, updated_at = now(), updated_by = auth.uid();
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

    INSERT INTO public.challenge_flag_vault (challenge_id, flag, updated_by)
    VALUES (v_challenge_id, v_flag, auth.uid());
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

-- ── 5. Reveal ────────────────────────────────────────────────────────
-- Returns one of three shapes, never an exception the UI has to parse:
--   { flag, stored_at }   the flag
--   { missing: true }     the operation predates the vault
--   { error }             not the owner, or no such operation
DROP FUNCTION IF EXISTS public.owner_reveal_flag(uuid);
CREATE FUNCTION public.owner_reveal_flag(p_challenge_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_flag  text;
  v_at    timestamptz;
  v_title text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('error', 'Not signed in');
  END IF;

  -- Rate limit first, so the bound applies to every caller and not just the
  -- one who passes the ownership check.
  PERFORM public.check_rate_limit('flag_reveal', auth.uid()::text, 60, 30);

  -- is_owner(), not is_admin(). Promoting yourself to admin does not get you
  -- here; that is the entire point of the feature.
  IF NOT public.is_owner() THEN
    -- A refusal is worth more in the log than a success: the owner reading
    -- their own flag is routine, an admin reaching for one is not. Only
    -- admins are recorded — a player spamming this must not be able to flood
    -- the audit trail.
    IF public.is_admin() THEN
      INSERT INTO public.flag_reveal_log (challenge_id, revealed_by, action)
      VALUES (p_challenge_id, auth.uid(), 'reveal_denied');
    END IF;
    RETURN jsonb_build_object('error', 'Owner only');
  END IF;

  SELECT title INTO v_title FROM public.challenges WHERE id = p_challenge_id;
  IF v_title IS NULL THEN
    RETURN jsonb_build_object('error', 'No such operation');
  END IF;

  SELECT flag, updated_at INTO v_flag, v_at
  FROM public.challenge_flag_vault WHERE challenge_id = p_challenge_id;

  INSERT INTO public.flag_reveal_log (challenge_id, revealed_by, action)
  VALUES (p_challenge_id, auth.uid(), CASE WHEN v_flag IS NULL THEN 'reveal_miss' ELSE 'reveal' END);

  IF v_flag IS NULL THEN
    RETURN jsonb_build_object('missing', true);
  END IF;

  RETURN jsonb_build_object('flag', v_flag, 'stored_at', v_at);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.owner_reveal_flag(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_reveal_flag(uuid) TO authenticated, service_role;

-- ── 6. Capture an operation that predates the vault ──────────────────
-- The owner types the flag they believe is set. It is hashed and compared
-- against the hash already stored; only an exact match is written. So this
-- cannot be used to silently change a live flag — it can only record one that
-- was already correct — and it doubles as a way to confirm a flag without
-- touching the operation.
DROP FUNCTION IF EXISTS public.owner_capture_flag(uuid, text);
CREATE FUNCTION public.owner_capture_flag(p_challenge_id uuid, p_flag text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_candidate text;
  v_hash      text;
  v_stored    text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('error', 'Not signed in');
  END IF;
  -- Tighter than reveal: this one takes a guess, so it is the endpoint an
  -- attacker would use to brute-force a flag through a stolen owner session.
  PERFORM public.check_rate_limit('flag_capture', auth.uid()::text, 60, 10);

  IF NOT public.is_owner() THEN
    IF public.is_admin() THEN
      INSERT INTO public.flag_reveal_log (challenge_id, revealed_by, action)
      VALUES (p_challenge_id, auth.uid(), 'capture_denied');
    END IF;
    RETURN jsonb_build_object('error', 'Owner only');
  END IF;

  v_candidate := trim(COALESCE(p_flag, ''));
  IF v_candidate = '' THEN
    RETURN jsonb_build_object('error', 'Enter the flag first');
  END IF;

  SELECT flag_hash INTO v_stored
  FROM public.challenge_secrets WHERE challenge_id = p_challenge_id;

  IF v_stored IS NULL THEN
    RETURN jsonb_build_object('error', 'That operation has no flag set');
  END IF;

  v_hash := encode(pg_catalog.sha256(pg_catalog.convert_to(v_candidate, 'UTF8')), 'hex');

  IF v_hash <> v_stored THEN
    INSERT INTO public.flag_reveal_log (challenge_id, revealed_by, action)
    VALUES (p_challenge_id, auth.uid(), 'capture_reject');
    RETURN jsonb_build_object('error', 'That is not this operation''s flag');
  END IF;

  INSERT INTO public.challenge_flag_vault (challenge_id, flag, updated_by)
  VALUES (p_challenge_id, v_candidate, auth.uid())
  ON CONFLICT (challenge_id) DO UPDATE
    SET flag = v_candidate, updated_at = now(), updated_by = auth.uid();

  INSERT INTO public.flag_reveal_log (challenge_id, revealed_by, action)
  VALUES (p_challenge_id, auth.uid(), 'capture');

  RETURN jsonb_build_object('flag', v_candidate, 'stored_at', now(), 'captured', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.owner_capture_flag(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_capture_flag(uuid, text) TO authenticated, service_role;
