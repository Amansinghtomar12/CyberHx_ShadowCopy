-- ════════════════════════════════════════════════════════════════════════
-- Fix 1: GRANT EXECUTE on normalize_play_email to authenticated
--
-- idx_profiles_play_email_norm is an expression index that calls
-- normalize_play_email(email). PostgreSQL re-evaluates expression indexes
-- on every UPDATE using the caller's privileges. Because EXECUTE was
-- revoked from authenticated, any profile update (username, avatar_url,
-- bio, etc.) fails with "permission denied for function
-- normalize_play_email". The function is a pure text normaliser (lowercase,
-- strip dots/+tags for Gmail) — no security concern in exposing it.
--
-- Fix 2: Clean existing avatar_url values that violate
-- profiles_avatar_url_safe, then fully validate the constraint. Same
-- pattern as the website/affiliation/country cleanup in the previous
-- migration.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. Grant normalize_play_email to authenticated ────────────────────
GRANT EXECUTE ON FUNCTION public.normalize_play_email(text) TO authenticated;

-- ── 2. Clean avatar_url values that predate the constraint ──────────────
UPDATE public.profiles SET avatar_url = NULL
WHERE avatar_url IS NOT NULL
  AND btrim(avatar_url) != ''
  AND NOT (
    length(avatar_url) <= 1000
    AND avatar_url ~* '^https?://'
  );

ALTER TABLE public.profiles VALIDATE CONSTRAINT profiles_avatar_url_safe;
