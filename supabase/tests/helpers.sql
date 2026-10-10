-- ════════════════════════════════════════════════════════════════════════
--  Shared by every *_test.sql in this directory (\ir helpers.sql).
-- ════════════════════════════════════════════════════════════════════════

-- A check that cannot pass by accident.
--
-- The earlier version compared two texts with `=`, so a NULL actual made
-- the comparison NULL, the CASE returned NULL, and psql printed a blank
-- line that read as "nothing wrong here". A missing row is exactly the
-- failure a gate test most needs to catch, so NULL is spelled out and
-- compared like any other value.
CREATE OR REPLACE FUNCTION pg_temp.check(label text, expected text, actual text)
RETURNS text LANGUAGE sql AS $$
  SELECT CASE WHEN COALESCE(expected, '<NULL>') = COALESCE(actual, '<NULL>')
              THEN '  ok   ' || label || '  (' || COALESCE(actual, '<NULL>') || ')'
              ELSE 'MISMATCH ' || label
                   || '  expected=' || COALESCE(expected, '<NULL>')
                   || ' actual='    || COALESCE(actual, '<NULL>') END;
$$;

-- Become a player, for the checks that only mean something under RLS.
-- Reading a table as the owner bypasses every policy, so a test that
-- forgets this passes whatever the policies say.
CREATE OR REPLACE FUNCTION pg_temp.be(p_user uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_user::text, false);
END;
$$;
