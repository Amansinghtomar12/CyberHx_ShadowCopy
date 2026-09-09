-- ════════════════════════════════════════════════════════════════════════
-- Profile field rules: real values only
--
-- website     must be http(s) with a real domain (a dot and an alphabetic
--             TLD): no bare IPs, no localhost, no credentials, no spaces.
-- affiliation must be a name, not a link or markup: 2–100 chars, at least
--             one letter, no <>{} and no "://".
-- country     must be a name: no digits, no <>{}, no "://". The picker in the
--             UI limits it to the list; this stops junk sent past the UI.
--
-- Blank/whitespace means "not set" everywhere. Rules avoid locale-dependent
-- character classes so non-Latin names are accepted. NOT VALID: new writes
-- only, so the deploy cannot fail on existing rows.
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_website_safe;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_website_safe
  CHECK (
    website IS NULL
    OR btrim(website) = ''
    OR (
      length(website) <= 500
      AND website ~* '^https?://([a-z0-9-]+\.)+[a-z]{2,63}(:[0-9]{1,5})?([/?#][^[:space:]]*)?$'
    )
  ) NOT VALID;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_affiliation_safe;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_affiliation_safe
  CHECK (
    affiliation IS NULL
    OR btrim(affiliation) = ''
    OR (
      length(affiliation) BETWEEN 2 AND 100
      AND affiliation !~ '[<>{}]'
      AND affiliation !~* '://'
      AND affiliation ~ '[^[:digit:][:punct:][:space:]]'
    )
  ) NOT VALID;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_country_safe;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_country_safe
  CHECK (
    country IS NULL
    OR btrim(country) = ''
    OR (
      length(country) <= 60
      AND country !~ '[<>{}0-9]'
      AND country !~* '://'
    )
  ) NOT VALID;
