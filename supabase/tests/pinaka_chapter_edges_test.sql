-- ════════════════════════════════════════════════════════════════════════
--  Pinaka chapters — the shapes an organiser can actually build.
--
--  The acceptance test next door proves the gate on a well-formed event.
--  This one builds the events people really make the night before: no
--  chains yet, one chain in a chapter, two chains in one chapter, a
--  chapter left empty in the middle, a chain still unpublished, a
--  challenge not yet visible. Each of those is a state the admin panel
--  can reach in a few clicks, so each has to behave or be found here.
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
\set FREE '''f0000000-0000-0000-0000-00000000000f'''

BEGIN;
UPDATE public.event_settings SET pinaka_story_mode = true WHERE id = 1;

-- ════════════════════════════════════════════════════════════════════
\echo '-- A. an event with the gate on and no chains filed at all --'
-- The state a new organiser is in the moment they run the migration:
-- six chapters exist, nothing is filed under any of them. Nothing may
-- be locked by a journey that has not been written yet.
-- ════════════════════════════════════════════════════════════════════
DELETE FROM public.pinaka_series_chapter;
SELECT pg_temp.check('nothing filed: chapter 1 open',  'true', public.pinaka_chapter_unlocked(:T, 'ayodhya')::text);
SELECT pg_temp.check('nothing filed: chapter 6 open',  'true', public.pinaka_chapter_unlocked(:T, 'lanka')::text);
SELECT pg_temp.check('nothing filed: free plays',      'true', public.pinaka_team_unlocked(:T, :FREE)::text);
-- A chain with no chapter keeps its own step order and nothing more.
SELECT pg_temp.check('nothing filed: chain step 1 open','true', public.pinaka_team_unlocked(:T, :A1)::text);
SELECT pg_temp.check('nothing filed: chain step 2 shut','false',public.pinaka_team_unlocked(:T, :A2)::text);

-- ════════════════════════════════════════════════════════════════════
\echo '-- B. only a late chapter has content --'
-- Organisers fill Lanka first because they wrote the finale first. The
-- five empty chapters before it must not hold the event shut.
-- ════════════════════════════════════════════════════════════════════
INSERT INTO public.pinaka_series_chapter (series_id, chapter)
  SELECT id, 'lanka' FROM public.chain_series WHERE title = 'The Hall of Ayodhya';
SELECT pg_temp.check('late chapter: lanka open',  'true', public.pinaka_chapter_unlocked(:T, 'lanka')::text);
SELECT pg_temp.check('late chapter: its step 1 open','true', public.pinaka_team_unlocked(:T, :A1)::text);

-- ════════════════════════════════════════════════════════════════════
\echo '-- C. two chains filed under one chapter --'
-- Both have to be finished before the chapter counts as closed, or the
-- second chain is decorative.
-- ════════════════════════════════════════════════════════════════════
DELETE FROM public.pinaka_series_chapter;
INSERT INTO public.pinaka_series_chapter (series_id, chapter)
  SELECT id, 'ayodhya' FROM public.chain_series WHERE title IN ('The Hall of Ayodhya', 'The Trial of Pinaka');
SELECT pg_temp.check('two chains: chapter open',      'true',  public.pinaka_chapter_unlocked(:T, 'ayodhya')::text);
SELECT pg_temp.check('two chains: chapter unfinished','false', public.pinaka_chapter_complete(:T, 'ayodhya')::text);
SELECT pg_temp.check('two chains: both first doors open', 'true',
  (public.pinaka_team_unlocked(:T, :A1) AND public.pinaka_team_unlocked(:T, :M1))::text);

-- Finish one of the two; the chapter must still be open, not closed.
INSERT INTO public.submissions (user_id, challenge_id, team_id, is_correct, submitted_flag_hash)
  SELECT '11111111-1111-1111-1111-111111111111', m.challenge_id, :T, true, 'x'
  FROM public.chain_series_members m
  JOIN public.chain_series s ON s.id = m.series_id AND s.title = 'The Hall of Ayodhya';
SELECT pg_temp.check('two chains: one done is not enough', 'false',
  public.pinaka_chapter_complete(:T, 'ayodhya')::text);
SELECT pg_temp.check('two chains: next chapter still shut','false',
  public.pinaka_chapter_unlocked(:T, 'mithila')::text);

-- ════════════════════════════════════════════════════════════════════
\echo '-- D. a chain filed under a chapter but still empty --'
-- The organiser made the chain and filed it before adding anything.
-- ════════════════════════════════════════════════════════════════════
DELETE FROM public.pinaka_series_chapter;
INSERT INTO public.chain_series (id, title, category, description, is_published)
  VALUES ('99999999-0000-0000-0000-000000000009', 'Empty Chain', 'web', '', true);
INSERT INTO public.pinaka_series_chapter (series_id, chapter)
  VALUES ('99999999-0000-0000-0000-000000000009', 'ayodhya');
SELECT pg_temp.check('empty chain: chapter reads complete', 'true',
  public.pinaka_chapter_complete(:T, 'ayodhya')::text);
SELECT pg_temp.check('empty chain: next chapter opens', 'true',
  public.pinaka_chapter_unlocked(:T, 'mithila')::text);

-- ════════════════════════════════════════════════════════════════════
\echo '-- E. a chain filed under a chapter but not published --'
-- A draft chain must not hold a chapter shut.
-- ════════════════════════════════════════════════════════════════════
DELETE FROM public.pinaka_series_chapter;
DELETE FROM public.submissions WHERE team_id = :T;
UPDATE public.chain_series SET is_published = false WHERE title = 'The Hall of Ayodhya';
INSERT INTO public.pinaka_series_chapter (series_id, chapter)
  SELECT id, 'ayodhya' FROM public.chain_series WHERE title = 'The Hall of Ayodhya';
SELECT pg_temp.check('draft chain: chapter reads complete', 'true',
  public.pinaka_chapter_complete(:T, 'ayodhya')::text);
SELECT pg_temp.check('draft chain: next chapter opens', 'true',
  public.pinaka_chapter_unlocked(:T, 'mithila')::text);
UPDATE public.chain_series SET is_published = true WHERE title = 'The Hall of Ayodhya';

-- ════════════════════════════════════════════════════════════════════
\echo '-- F. a challenge in the middle of a chain is not visible yet --'
-- is_visible is a switch on the challenge, nothing to do with the chain,
-- so an organiser can hide step 2 of three without touching the chain at
-- all: a draft they have not finished, or one pulled mid-event.
--
-- Nothing may deadlock. The chapter must stay finishable and the step
-- after the hidden one must be reachable, or every team is stopped for
-- good at a door that cannot be opened.
-- ════════════════════════════════════════════════════════════════════
DELETE FROM public.pinaka_series_chapter;
INSERT INTO public.pinaka_series_chapter (series_id, chapter)
  SELECT id, 'ayodhya' FROM public.chain_series WHERE title = 'The Hall of Ayodhya';
UPDATE public.challenges SET is_visible = false WHERE id = :A2;

-- Solve the first step. In a three-step chain with the middle hidden,
-- that is everything a team can possibly do.
INSERT INTO public.submissions (user_id, challenge_id, team_id, is_correct, submitted_flag_hash)
  VALUES ('11111111-1111-1111-1111-111111111111', :A1, :T, true, 'x');

SELECT pg_temp.check('hidden middle: step 3 reachable', 'true',
  public.pinaka_team_unlocked(:T, :A3)::text);
UPDATE public.challenges SET is_visible = true WHERE id = :A2;

ROLLBACK;
