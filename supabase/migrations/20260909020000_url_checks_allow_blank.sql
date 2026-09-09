-- ════════════════════════════════════════════════════════════════════════
-- Blank is "not set", not an invalid URL
--
-- The URL CHECKs added in 20260906010000 accepted NULL or an http(s) URL,
-- but the profile form sends '' for an empty optional field, so saving a
-- profile with the website left blank failed with a raw constraint error.
-- Treat a blank/whitespace value like NULL. javascript:/data: and other
-- schemes are still refused. NOT VALID: new writes only, no deploy risk.
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_website_safe;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_website_safe
  CHECK (
    website IS NULL
    OR btrim(website) = ''
    OR (length(website) <= 500 AND website ~* '^https?://')
  ) NOT VALID;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_avatar_url_safe;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_avatar_url_safe
  CHECK (
    avatar_url IS NULL
    OR btrim(avatar_url) = ''
    OR (length(avatar_url) <= 1000 AND avatar_url ~* '^https?://')
  ) NOT VALID;
