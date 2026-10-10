-- ════════════════════════════════════════════════════════════════════════
--  Pinaka story mode — acceptance test for the chain gate.
--
--  Run against a THROWAWAY database that has every migration applied.
--  It writes fixture rows, so never point it at production.
--
--    createdb ctf && psql -d ctf -f <each migration in order>
--    psql -d ctf -f supabase/tests/pinaka_story_mode_test.sql
--
--  Every line below prints `expected=... actual=...`; any `MISMATCH`
--  in the output is a failure.
-- ════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on
\set T  '''aaaaaaaa-0000-0000-0000-000000000001'''
\set C1 '''c0000000-0000-0000-0000-000000000001'''
\set C2 '''c0000000-0000-0000-0000-000000000002'''
\set C3 '''c0000000-0000-0000-0000-000000000003'''
\set FREE '''f0000000-0000-0000-0000-00000000000f'''

CREATE OR REPLACE FUNCTION pg_temp.check(label text, expected text, actual text)
RETURNS text LANGUAGE sql AS $$
  SELECT CASE WHEN expected = actual
              THEN '  ok   ' || label || '  (' || actual || ')'
              ELSE 'MISMATCH ' || label || '  expected=' || expected || ' actual=' || actual END;
$$;

\echo '── story mode OFF: the platform behaves exactly as it always did ──'
UPDATE public.event_settings SET pinaka_story_mode = false WHERE id = 1;
SELECT pg_temp.check('chain step 2 open when mode is off', 'true',
  public.pinaka_team_unlocked(:T, :C2)::text);

\echo '── story mode ON ──'
UPDATE public.event_settings SET pinaka_story_mode = true WHERE id = 1;
SELECT pg_temp.check('step 1 open (first door)',  'true',  public.pinaka_team_unlocked(:T, :C1)::text);
SELECT pg_temp.check('step 2 locked',             'false', public.pinaka_team_unlocked(:T, :C2)::text);
SELECT pg_temp.check('step 3 locked',             'false', public.pinaka_team_unlocked(:T, :C3)::text);
SELECT pg_temp.check('FREE challenge never gated','true',  public.pinaka_team_unlocked(:T, :FREE)::text);

\echo '── a locked challenge says nothing about itself ──'
-- Run these as the player; as superuser RLS does not apply and all pass vacuously.
SELECT pg_temp.check('locked description withheld', '',
  (SELECT description FROM public.public_challenges WHERE id = :C3));
SELECT pg_temp.check('locked connection_info withheld', 'NULL',
  COALESCE((SELECT connection_info FROM public.public_challenges WHERE id = :C3), 'NULL'));
SELECT pg_temp.check('locked hint rows withheld', '0',
  (SELECT count(*) FROM public.hints WHERE challenge_id = :C3)::text);
SELECT pg_temp.check('locked file rows withheld', '0',
  (SELECT count(*) FROM public.challenge_files WHERE challenge_id = :C3)::text);

\echo '── submission gate ──'
SELECT pg_temp.check('locked submit refused', 'true',
  (public.submit_flag_tx('11111111-1111-1111-1111-111111111111', :C3, 'x', NULL)
    -> 'body' ->> 'locked'));
SELECT pg_temp.check('locked submit burns no attempt', '0',
  (SELECT count(*) FROM public.submissions WHERE challenge_id = :C3)::text);

\echo '── progress is derived, so teammates cannot race it ──'
-- Whichever member solves, and however many times they solve at once, the
-- next step reads open for everyone: there is no counter to double-count.
INSERT INTO public.submissions (user_id, challenge_id, team_id, is_correct, submitted_flag_hash)
VALUES ('22222222-2222-2222-2222-222222222222', :C1, :T, true, 'x');
SELECT pg_temp.check('teammate solve opens step 2', 'true',
  public.pinaka_team_unlocked(:T, :C2)::text);
SELECT pg_temp.check('step 3 still shut',           'false',
  public.pinaka_team_unlocked(:T, :C3)::text);

\echo '── turning it off restores ordinary play immediately ──'
UPDATE public.event_settings SET pinaka_story_mode = false WHERE id = 1;
SELECT pg_temp.check('step 3 open again once off', 'true',
  public.pinaka_team_unlocked(:T, :C3)::text);
