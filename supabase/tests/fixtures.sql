-- ════════════════════════════════════════════════════════════════════════
--  A small event, written straight to the tables.
--
--  Two chapters with a chain each, one chain filed under no chapter at
--  all, and one Free challenge — the four shapes the gate has to tell
--  apart. One team of two, so "a teammate solved it" is a real case and
--  not a single-player special.
--
--  Written with INSERT rather than the admin RPCs on purpose: the RPCs
--  are is_admin()-gated and this runs as the owner, and a fixture that
--  needed the API to be correct could not be used to test the API.
-- ════════════════════════════════════════════════════════════════════════

-- ── people ──────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'rama@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'lakshman@example.test'),
  ('33333333-3333-3333-3333-333333333333', 'solo@example.test')
ON CONFLICT DO NOTHING;

INSERT INTO public.teams (id, name, captain_id) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Vanara Sena', '11111111-1111-1111-1111-111111111111')
ON CONFLICT DO NOTHING;

INSERT INTO public.profiles (id, username, email, team_id) VALUES
  ('11111111-1111-1111-1111-111111111111', 'rama',      'rama@example.test',      'aaaaaaaa-0000-0000-0000-000000000001'),
  ('22222222-2222-2222-2222-222222222222', 'lakshman',  'lakshman@example.test',  'aaaaaaaa-0000-0000-0000-000000000001'),
  -- No team: the gate has to cope with a player who has not joined one.
  ('33333333-3333-3333-3333-333333333333', 'solo',      'solo@example.test',      NULL)
ON CONFLICT (id) DO UPDATE SET team_id = EXCLUDED.team_id;

-- ── the event is open ───────────────────────────────────────────────────
INSERT INTO public.event_settings (id, name, is_active, start_time, end_time)
VALUES (1, 'Pinaka CTF Test', true, now() - interval '1 hour', now() + interval '10 hours')
ON CONFLICT (id) DO UPDATE
  SET is_active = true,
      start_time = now() - interval '1 hour',
      end_time   = now() + interval '10 hours';

UPDATE public.event_settings SET chain_experience_enabled = true WHERE id = 1;

-- ── challenges ──────────────────────────────────────────────────────────
-- c1/c2/c3  Ayodhya's chain      d1/d2  Mithila's chain
-- e1/e2  a chain with no chapter      f  a Free challenge
INSERT INTO public.challenges (id, title, category, description, points, is_visible, connection_info) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'Ayodhya I',  'web',    'first of Ayodhya',  100, true, 'nc a 1'),
  ('c0000000-0000-0000-0000-000000000002', 'Ayodhya II', 'web',    'second of Ayodhya', 100, true, 'nc a 2'),
  ('c0000000-0000-0000-0000-000000000003', 'Ayodhya III','web',    'third of Ayodhya',  100, true, 'nc a 3'),
  ('d0000000-0000-0000-0000-000000000001', 'Mithila I',  'crypto', 'first of Mithila',  200, true, 'nc m 1'),
  ('d0000000-0000-0000-0000-000000000002', 'Mithila II', 'crypto', 'second of Mithila', 200, true, 'nc m 2'),
  ('e0000000-0000-0000-0000-000000000001', 'Loose I',    'rev',    'no chapter here',   150, true, 'nc l 1'),
  ('e0000000-0000-0000-0000-000000000002', 'Loose II',   'rev',    'no chapter here',   150, true, 'nc l 2'),
  ('f0000000-0000-0000-0000-00000000000f', 'Golden Deer','web',    'a free challenge',  100, true, 'nc f 1')
ON CONFLICT DO NOTHING;

-- A hint and a file on the locked one, so "a locked challenge says nothing
-- about itself" is testing withheld rows and not an empty table.
-- One on a challenge locked by the CHAIN (Ayodhya III, two links in) and
-- one on a challenge locked by the CHAPTER (Mithila I, a first door in a
-- chapter that has not opened). Both have to be withheld, for different
-- reasons, and a test that only covered one would miss half the gate.
INSERT INTO public.hints (id, challenge_id, cost, content) VALUES
  ('11110000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-000000000003', 50, 'mind the step'),
  ('11110000-0000-0000-0000-00000000000b', 'd0000000-0000-0000-0000-000000000001', 50, 'lift the bow')
ON CONFLICT DO NOTHING;
INSERT INTO public.challenge_files (id, challenge_id, name, url) VALUES
  ('22220000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-000000000003', 'hall.zip', 'https://example.test/hall.zip'),
  ('22220000-0000-0000-0000-00000000000b', 'd0000000-0000-0000-0000-000000000001', 'bow.zip',  'https://example.test/bow.zip')
ON CONFLICT DO NOTHING;

INSERT INTO public.challenge_secrets (challenge_id, flag_hash) VALUES
  ('c0000000-0000-0000-0000-000000000001', encode(digest('CTF{a1}', 'sha256'), 'hex')),
  ('c0000000-0000-0000-0000-000000000002', encode(digest('CTF{a2}', 'sha256'), 'hex')),
  ('c0000000-0000-0000-0000-000000000003', encode(digest('CTF{a3}', 'sha256'), 'hex')),
  ('d0000000-0000-0000-0000-000000000001', encode(digest('CTF{m1}', 'sha256'), 'hex')),
  ('d0000000-0000-0000-0000-000000000002', encode(digest('CTF{m2}', 'sha256'), 'hex')),
  ('e0000000-0000-0000-0000-000000000001', encode(digest('CTF{l1}', 'sha256'), 'hex')),
  ('e0000000-0000-0000-0000-000000000002', encode(digest('CTF{l2}', 'sha256'), 'hex')),
  ('f0000000-0000-0000-0000-00000000000f', encode(digest('CTF{ff}', 'sha256'), 'hex'))
ON CONFLICT DO NOTHING;

-- ── chains ──────────────────────────────────────────────────────────────
INSERT INTO public.chain_series (id, title, category, is_published) VALUES
  ('5e000000-0000-0000-0000-00000000000a', 'The Hall of Ayodhya', 'web',    true),
  ('5e000000-0000-0000-0000-00000000000b', 'The Trial of Pinaka', 'crypto', true),
  ('5e000000-0000-0000-0000-00000000000c', 'Unfiled',             'rev',    true)
ON CONFLICT DO NOTHING;

INSERT INTO public.chain_series_members (series_id, challenge_id, position) VALUES
  ('5e000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-000000000001', 1),
  ('5e000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-000000000002', 2),
  ('5e000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-000000000003', 3),
  ('5e000000-0000-0000-0000-00000000000b', 'd0000000-0000-0000-0000-000000000001', 1),
  ('5e000000-0000-0000-0000-00000000000b', 'd0000000-0000-0000-0000-000000000002', 2),
  ('5e000000-0000-0000-0000-00000000000c', 'e0000000-0000-0000-0000-000000000001', 1),
  ('5e000000-0000-0000-0000-00000000000c', 'e0000000-0000-0000-0000-000000000002', 2)
ON CONFLICT DO NOTHING;

-- Chapter one and chapter two. The third chain is deliberately left out.
INSERT INTO public.pinaka_series_chapter (series_id, chapter) VALUES
  ('5e000000-0000-0000-0000-00000000000a', 'ayodhya'),
  ('5e000000-0000-0000-0000-00000000000b', 'mithila')
ON CONFLICT DO NOTHING;
