-- ════════════════════════════════════════════════════════════════════════
--  Pinaka story mode — acceptance test for the chain gate.
--
--  Run it with supabase/tests/run.sh, which stands up a throwaway
--  database, applies every migration, loads fixtures.sql and runs this.
--  Never point it at production: it writes rows.
--
--  Everything happens inside one transaction that rolls back at the end,
--  so this test and its neighbours can run in any order and twice over.
--
--  Every line prints `expected=... actual=...`; any MISMATCH is a failure.
-- ════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on
\ir helpers.sql

\set T  '''aaaaaaaa-0000-0000-0000-000000000001'''
\set C1 '''c0000000-0000-0000-0000-000000000001'''
\set C2 '''c0000000-0000-0000-0000-000000000002'''
\set C3 '''c0000000-0000-0000-0000-000000000003'''
\set FREE '''f0000000-0000-0000-0000-00000000000f'''
\set RAMA '''11111111-1111-1111-1111-111111111111'''
\set LAKSHMAN '''22222222-2222-2222-2222-222222222222'''

BEGIN;

\echo '-- story mode OFF: the platform behaves exactly as it always did --'
UPDATE public.event_settings SET pinaka_story_mode = false WHERE id = 1;
SELECT pg_temp.check('chain step 2 open when mode is off', 'true',
  public.pinaka_team_unlocked(:T, :C2)::text);

\echo '-- story mode ON --'
UPDATE public.event_settings SET pinaka_story_mode = true WHERE id = 1;
SELECT pg_temp.check('step 1 open (first door)',  'true',  public.pinaka_team_unlocked(:T, :C1)::text);
SELECT pg_temp.check('step 2 locked',             'false', public.pinaka_team_unlocked(:T, :C2)::text);
SELECT pg_temp.check('step 3 locked',             'false', public.pinaka_team_unlocked(:T, :C3)::text);
SELECT pg_temp.check('FREE challenge never gated','true',  public.pinaka_team_unlocked(:T, :FREE)::text);

\echo '-- a locked challenge says nothing about itself --'
-- As the player, and as the `authenticated` role: read these as the owner
-- and every policy is bypassed, so the checks would pass whatever the
-- policies actually say.
SELECT pg_temp.be(:RAMA);
SET LOCAL ROLE authenticated;
SELECT pg_temp.check('locked description withheld', '',
  (SELECT description FROM public.public_challenges WHERE id = :C3));
SELECT pg_temp.check('locked connection_info withheld', '<NULL>',
  COALESCE((SELECT connection_info FROM public.public_challenges WHERE id = :C3), '<NULL>'));
SELECT pg_temp.check('locked hint rows withheld', '0',
  (SELECT count(*) FROM public.hints WHERE challenge_id = :C3)::text);
SELECT pg_temp.check('locked file rows withheld', '0',
  (SELECT count(*) FROM public.challenge_files WHERE challenge_id = :C3)::text);
-- The same reads on the open challenge, so the checks above are testing a
-- gate and not an empty fixture.
SELECT pg_temp.check('open challenge keeps its description', 'first of Ayodhya',
  (SELECT description FROM public.public_challenges WHERE id = :C1));
RESET ROLE;

\echo '-- submission gate --'
SELECT pg_temp.check('locked submit refused', 'true',
  (public.submit_flag_tx(:RAMA, :C3, 'CTF{a3}', NULL) -> 'body' ->> 'locked'));
SELECT pg_temp.check('locked submit burns no attempt', '0',
  (SELECT count(*) FROM public.submissions WHERE challenge_id = :C3)::text);

\echo '-- progress is derived, so teammates cannot race it --'
-- Whichever member solves, and however many times they solve at once, the
-- next step reads open for everyone: there is no counter to double-count.
INSERT INTO public.submissions (user_id, challenge_id, team_id, is_correct, submitted_flag_hash)
VALUES (:LAKSHMAN, :C1, :T, true, 'x');
SELECT pg_temp.check('teammate solve opens step 2', 'true',
  public.pinaka_team_unlocked(:T, :C2)::text);
SELECT pg_temp.check('step 3 still shut',           'false',
  public.pinaka_team_unlocked(:T, :C3)::text);

\echo '-- a player with no team gets the first door and nothing more --'
SELECT pg_temp.check('teamless: step 1 open',  'true',  public.pinaka_team_unlocked(NULL, :C1)::text);
SELECT pg_temp.check('teamless: step 2 shut',  'false', public.pinaka_team_unlocked(NULL, :C2)::text);

\echo '-- turning it off restores ordinary play immediately --'
UPDATE public.event_settings SET pinaka_story_mode = false WHERE id = 1;
SELECT pg_temp.check('step 3 open again once off', 'true',
  public.pinaka_team_unlocked(:T, :C3)::text);

ROLLBACK;
