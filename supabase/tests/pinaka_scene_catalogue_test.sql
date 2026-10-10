-- ════════════════════════════════════════════════════════════════════════
--  Pinaka — the scene catalogue an organiser can add to.
--
--  What it has to prove: the twelve are seeded and marked as built in;
--  a scene the organisers add needs its artwork; the assignment table now
--  refuses a scene that does not exist and lets go of its assignments when
--  one is deleted; the twelve cannot be deleted; and none of it is
--  reachable without being an admin.
--
--  Run with supabase/tests/run.sh. Rolls back at the end.
-- ════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on
\ir helpers.sql

\set RAMA '''11111111-1111-1111-1111-111111111111'''
\set A1   '''c0000000-0000-0000-0000-000000000001'''

BEGIN;

\echo '-- the twelve ship as rows --'
SELECT pg_temp.check('twelve built-in scenes', '12',
  (SELECT count(*)::text FROM public.pinaka_scene WHERE is_builtin));
SELECT pg_temp.check('a built-in carries no url', 'true',
  (SELECT bool_and(art_url IS NULL)::text FROM public.pinaka_scene WHERE is_builtin));
SELECT pg_temp.check('the words came with them', 'Golden Deer',
  (SELECT label FROM public.pinaka_scene WHERE id = 'golden-deer'));

\echo '-- writing the catalogue is admin only --'
-- No signed-in user at all: the SQL editor's situation, and a stranger's.
SELECT pg_temp.check('anonymous cannot add a scene', '"Unauthorized"',
  (public.admin_upsert_pinaka_scene('sneaky', 'Sneaky', '', '', '', '#ffffff',
     'https://example.test/a.webp') -> 'error')::text);
SELECT pg_temp.check('anonymous add wrote nothing', '0',
  (SELECT count(*)::text FROM public.pinaka_scene WHERE id = 'sneaky'));
SELECT pg_temp.be(:RAMA);
SELECT pg_temp.check('a player cannot add a scene', '"Unauthorized"',
  (public.admin_upsert_pinaka_scene('sneaky', 'Sneaky', '', '', '', '#ffffff',
     'https://example.test/a.webp') -> 'error')::text);

\echo '-- as an admin --'
UPDATE public.profiles SET role = 'admin', is_owner = true WHERE id = :RAMA;
SELECT pg_temp.check('a new scene needs its artwork', '"A new scene needs its artwork."',
  (public.admin_upsert_pinaka_scene('no-art', 'No Art') -> 'error')::text);
SELECT pg_temp.check('with artwork it is added', 'true',
  (public.admin_upsert_pinaka_scene('rama-returns', 'Rama Returns',
     'The city lights every lamp it owns.', 'Light the Lamps', 'Come Home',
     '#e3bb66', 'https://example.test/rama.webp', 1920, 1080,
     0.42, 0.55, 0.6, 0.3) -> 'success')::text);
SELECT pg_temp.check('it is not a built-in', 'false',
  (SELECT is_builtin::text FROM public.pinaka_scene WHERE id = 'rama-returns'));
SELECT pg_temp.check('its measurements are kept', '0.42,0.55,0.6,0.3',
  (SELECT concat_ws(',', focal_x, focal_y, sun_x, sun_y)
     FROM public.pinaka_scene WHERE id = 'rama-returns'));

\echo '-- a built-in keeps its bundled art, and its words can still be edited --'
SELECT pg_temp.check('editing a built-in succeeds', 'true',
  (public.admin_upsert_pinaka_scene('golden-deer', 'Golden Deer',
     'A new line of story.', 'Track It', 'Give Chase', '#dfa049',
     'https://example.test/hijack.webp') -> 'success')::text);
SELECT pg_temp.check('the new words took', 'A new line of story.',
  (SELECT intro FROM public.pinaka_scene WHERE id = 'golden-deer'));
-- The url is refused silently rather than by error: a built-in's art is in
-- the bundle, so a row pointing elsewhere would simply never be read.
SELECT pg_temp.check('the built-in art was not replaced', '<NULL>',
  (SELECT art_url FROM public.pinaka_scene WHERE id = 'golden-deer'));

\echo '-- the assignment table now follows the catalogue --'
-- A sentence, not a raw constraint name: an organiser may pick a scene
-- another admin deleted a moment ago, and that is not a crash.
SELECT pg_temp.check('a scene nobody defined is refused', '"Unknown scene"',
  (public.admin_set_challenge_scene(:A1, 'not-a-scene') -> 'error')::text);

SELECT public.admin_set_challenge_scene(:A1, 'rama-returns');
SELECT pg_temp.check('a real scene is assigned', 'rama-returns',
  (SELECT scene FROM public.pinaka_challenge_scene WHERE challenge_id = :A1));

\echo '-- deleting a scene says what it undressed, and the twelve stay --'
SELECT pg_temp.check('the twelve cannot be removed',
  '"The twelve original scenes cannot be removed."',
  (public.admin_delete_pinaka_scene('golden-deer') -> 'error')::text);
SELECT pg_temp.check('deleting reports the challenges it undressed', '1',
  (public.admin_delete_pinaka_scene('rama-returns') -> 'challenges_undressed')::text);
SELECT pg_temp.check('and the assignment went with it', '0',
  (SELECT count(*)::text FROM public.pinaka_challenge_scene WHERE challenge_id = :A1));

ROLLBACK;
