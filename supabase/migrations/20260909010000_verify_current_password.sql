-- ════════════════════════════════════════════════════════════════════════
-- verify_current_password(p_password)
--
-- Changing a password used to call auth.updateUser directly, with no proof
-- the caller knew the existing one. This lets the signed-in user prove it
-- server-side first: it reads the bcrypt hash GoTrue keeps in auth.users
-- and compares with pgcrypto. It never returns the hash, and it only ever
-- checks the CALLER's own row (auth.uid()), so it is not an oracle for any
-- other account. Rate limited to 10 checks per minute per user.
-- ════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.verify_current_password(p_password text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_hash text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  -- Guessing your own password through this is pointless (you already hold
  -- the session), but keep it bounded anyway.
  PERFORM public.check_rate_limit('verify_password', auth.uid()::text, 60, 10);

  SELECT u.encrypted_password INTO v_hash
  FROM auth.users u WHERE u.id = auth.uid();

  IF v_hash IS NULL OR v_hash = '' OR p_password IS NULL OR p_password = '' THEN
    RETURN false;
  END IF;

  RETURN extensions.crypt(p_password, v_hash) = v_hash;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.verify_current_password(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.verify_current_password(text) TO authenticated, service_role;
