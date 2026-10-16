-- ════════════════════════════════════════════════════════════════════════
--  Pinaka chapters — acceptance test for the chapter gate.
--
--  The fixture is two chapters and one unfiled chain:
--
--    ayodhya   "The Hall of Ayodhya"   Ayodhya I → II → III
--    mithila   "The Trial of Pinaka"   Mithila I → II
--    (none)    "Unfiled"               Loose I → II
--    (none)    Golden Deer                            — a Free challenge
--
--  What it has to prove: Mithila I is shut while any Ayodhya challenge is
--  unsolved even though it is a first door; finishing Ayodhya opens it;
--  the unfiled chain is never chapter-gated; and a locked chapter gives up
--  nothing about its challenges.
--
--  Run with supabase/tests/run.sh. Rolls back at the end.
-- ════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on
\ir helpers.sql

\set T  '''aaaaaaaa-0000-0000-0000-000000000001'''
\set A1 '''c0000000-0000-0000-0000-000000000001'''
\set A2 '''c0000000-0000-0000-0000-000000000002'''
\set A3 '''c0000000-0000-0000-0000-000000000003'''
\set M1 '''d0000000-0000-0000-0000-000000000001'''
\set M2 '''d0000000-0000-0000-0000-000000000002'''
\set L1 '''e0000000-0000-0000-0000-000000000001'''
\set L2 '''e0000000-0000-0000-0000-000000000002'''
\set FREE '''f0000000-0000-0000-0000-00000000000f'''
\set RAMA '''11111111-1111-1111-1111-111111111111'''

BEGIN;

\echo '-- the order of the journey is in the database --'
SELECT pg_temp.check('six chapters, in order', 'ayodhya,mithila,vanvaas,kishkindha,setu,lanka',
  (SELECT string_agg(id, ',' ORDER BY position) FROM public.pinaka_chapter));

\echo '-- story mode OFF: chapters do not gate anything --'
UPDATE public.event_settings SET pinaka_story_mode = false WHERE id = 1;
SELECT pg_temp.check('Mithila I open when mode is off', 'true',
  public.pinaka_team_unlocked(:T, :M1)::text);

\echo '-- story mode ON, nothing solved --'
UPDATE public.event_settings SET pinaka_story_mode = true WHERE id = 1;
SELECT pg_temp.check('chapter 1 is open',            'true',  public.pinaka_chapter_unlocked(:T, 'ayodhya')::text);
SELECT pg_temp.check('chapter 2 is shut',            'false', public.pinaka_chapter_unlocked(:T, 'mithila')::text);
SELECT pg_temp.check('chapter 6 is shut',            'false', public.pinaka_chapter_unlocked(:T, 'lanka')::text);
SELECT pg_temp.check('Ayodhya I open (first door)',  'true',  public.pinaka_team_unlocked(:T, :A1)::text);
-- The point of the whole migration: a position-1 challenge that is still
-- shut, because its chapter has not opened.
SELECT pg_temp.check('Mithila I SHUT though first',  'false', public.pinaka_team_unlocked(:T, :M1)::text);
SELECT pg_temp.check('an unfiled chain is not chapter-gated', 'true',
  public.pinaka_team_unlocked(:T, :L1)::text);
SELECT pg_temp.check('FREE challenge never gated',   'true',  public.pinaka_team_unlocked(:T, :FREE)::text);

\echo '-- an empty chapter does not stop the journey --'
-- vanvaas..lanka hold nothing, so they are finished by definition; what
-- stops the team is Ayodhya, the first chapter that has content.
SELECT pg_temp.check('empty chapter reads complete', 'true',
  public.pinaka_chapter_complete(:T, 'vanvaas')::text);

\echo '-- a chapter is not finished until its LAST challenge is solved --'
INSERT INTO public.submissions (user_id, challenge_id, team_id, is_correct, submitted_flag_hash)
VALUES (:RAMA, :A1, :T, true, 'x');
SELECT pg_temp.check('one of three: Ayodhya unfinished', 'false',
  public.pinaka_chapter_complete(:T, 'ayodhya')::text);
SELECT pg_temp.check('one of three: Mithila still shut', 'false',
  public.pinaka_chapter_unlocked(:T, 'mithila')::text);

INSERT INTO public.submissions (user_id, challenge_id, team_id, is_correct, submitted_flag_hash)
VALUES (:RAMA, :A2, :T, true, 'x');
SELECT pg_temp.check('two of three: Mithila still shut', 'false',
  public.pinaka_chapter_unlocked(:T, 'mithila')::text);

\echo '-- finishing the chapter opens the next one, and only the next --'
INSERT INTO public.submissions (user_id, challenge_id, team_id, is_correct, submitted_flag_hash)
VALUES (:RAMA, :A3, :T, true, 'x');
SELECT pg_temp.check('Ayodhya complete',        'true',  public.pinaka_chapter_complete(:T, 'ayodhya')::text);
SELECT pg_temp.check('Mithila OPEN',            'true',  public.pinaka_chapter_unlocked(:T, 'mithila')::text);
SELECT pg_temp.check('Mithila I now playable',  'true',  public.pinaka_team_unlocked(:T, :M1)::text);
-- The chain gate is still doing its job inside the newly opened chapter.
SELECT pg_temp.check('Mithila II still shut',   'false', public.pinaka_team_unlocked(:T, :M2)::text);
-- Only the next. Being empty makes Vanvaas *complete*, which is not the
-- same as open: it still sits behind Mithila, which nobody has finished.
-- Get this backwards and an organiser who fills Vanvaas later finds their
-- players already inside it.
SELECT pg_temp.check('Vanvaas complete (it is empty)', 'true',
  public.pinaka_chapter_complete(:T, 'vanvaas')::text);
SELECT pg_temp.check('Vanvaas still SHUT behind Mithila', 'false',
  public.pinaka_chapter_unlocked(:T, 'vanvaas')::text);

-- Finish Mithila as well and the three empty chapters stop being a wall:
-- they are complete, so everything after them opens at once. An organiser
-- using three of the six chapters gets a journey, not a dead end.
INSERT INTO public.submissions (user_id, challenge_id, team_id, is_correct, submitted_flag_hash)
VALUES (:RAMA, :M1, :T, true, 'x'), (:RAMA, :M2, :T, true, 'x');
SELECT pg_temp.check('empty chapters do not block: Vanvaas open', 'true',
  public.pinaka_chapter_unlocked(:T, 'vanvaas')::text);
SELECT pg_temp.check('empty chapters do not block: Lanka open', 'true',
  public.pinaka_chapter_unlocked(:T, 'lanka')::text);
DELETE FROM public.submissions WHERE challenge_id IN (:M1, :M2) AND team_id = :T;

\echo '-- a locked chapter gives up nothing about its challenges --'
SELECT pg_temp.be(:RAMA);
SET LOCAL ROLE authenticated;
-- Mithila is open by now; shut it again by un-solving the chapter, so this
-- block tests a chapter lock and not a chain lock.
RESET ROLE;
DELETE FROM public.submissions WHERE challenge_id = :A3 AND team_id = :T;
SELECT pg_temp.check('Mithila shut again', 'false', public.pinaka_chapter_unlocked(:T, 'mithila')::text);
SELECT pg_temp.be(:RAMA);
SET LOCAL ROLE authenticated;
SELECT pg_temp.check('chapter-locked description withheld', '',
  (SELECT description FROM public.public_challenges WHERE id = :M1));
SELECT pg_temp.check('chapter-locked connection_info withheld', '<NULL>',
  COALESCE((SELECT connection_info FROM public.public_challenges WHERE id = :M1), '<NULL>'));
SELECT pg_temp.check('chapter-locked hint rows withheld', '0',
  (SELECT count(*) FROM public.hints WHERE challenge_id = :M1)::text);
SELECT pg_temp.check('chapter-locked file rows withheld', '0',
  (SELECT count(*) FROM public.challenge_files WHERE challenge_id = :M1)::text);
-- Still visible as a card: the journey is meant to be seen ahead of you.
SELECT pg_temp.check('chapter-locked challenge still listed', 'Mithila I',
  (SELECT title FROM public.public_challenges WHERE id = :M1));
RESET ROLE;

\echo '-- and refuses a flag, without burning an attempt --'
SELECT pg_temp.check('chapter-locked submit refused', 'true',
  (public.submit_flag_tx(:RAMA, :M1, 'CTF{m1}', NULL) -> 'body' ->> 'locked'));
SELECT pg_temp.check('chapter-locked submit burns no attempt', '0',
  (SELECT count(*) FROM public.submissions WHERE challenge_id = :M1)::text);

\echo '-- what the client is told about its own journey --'
SELECT pg_temp.be(:RAMA);
SELECT pg_temp.check('progress: ayodhya 2 of 3 solved', '2',
  (SELECT solved::text FROM public.get_team_chapter_progress() WHERE chapter = 'ayodhya'));
SELECT pg_temp.check('progress: ayodhya total 3', '3',
  (SELECT total::text FROM public.get_team_chapter_progress() WHERE chapter = 'ayodhya'));
SELECT pg_temp.check('progress: mithila locked', 'false',
  (SELECT is_unlocked::text FROM public.get_team_chapter_progress() WHERE chapter = 'mithila'));
SELECT pg_temp.check('progress: one chain in mithila', '1',
  (SELECT series_count::text FROM public.get_team_chapter_progress() WHERE chapter = 'mithila'));
SELECT pg_temp.check('chain progress carries the chapter', 'mithila',
  (SELECT chapter FROM public.get_team_chain_progress() WHERE challenge_id = :M1));
SELECT pg_temp.check('chain progress says why it is locked', 'false',
  (SELECT chapter_unlocked::text FROM public.get_team_chain_progress() WHERE challenge_id = :M1));
SELECT pg_temp.check('unfiled chain has no chapter', '<NULL>',
  (SELECT COALESCE(chapter, '<NULL>') FROM public.get_team_chain_progress() WHERE challenge_id = :L1));

\echo '-- turning it off opens everything again, at once --'
RESET ROLE;
UPDATE public.event_settings SET pinaka_story_mode = false WHERE id = 1;
SELECT pg_temp.check('Mithila I open once off', 'true',  public.pinaka_team_unlocked(:T, :M1)::text);
SELECT pg_temp.check('Lanka open once off',     'true',  public.pinaka_chapter_unlocked(:T, 'lanka')::text);

ROLLBACK;
