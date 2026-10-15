-- ════════════════════════════════════════════════════════════════════════
--  Pinaka CTF — the migrations still to apply.
--
--  Paste the whole file into the Supabase SQL editor and run it once.
--  Safe to run again: every statement is written to be replayed.
--
--  1. 20261012000000_pinaka_chain_skips_hidden
--     A chain steps over a challenge that is not visible. Without this,
--     hiding one challenge in the middle of a chain stops every team in
--     the event permanently.
--
--  2. 20261013000000_pinaka_scene_catalogue
--     Battle scenes become a catalogue you can add to from the admin
--     panel, with the storage bucket their artwork goes in.
--
--  3. 20261015000000_pinaka_challenge_card
--     A picture on any challenge's card, chosen on the challenge form.
--     Without this the "Card picture" field has nowhere to save to.
--
--  4. 20261016000000_pinaka_card_is_a_scene
--     That picture carries its own name, prologue and button wording, so
--     one upload replaces the separate battle-scene catalogue. Without
--     this the form saves the picture and silently drops the words.
--
--  Generated from the migration files; they remain the source.
-- ════════════════════════════════════════════════════════════════════════

-- ─── 1 of 4 ─────────────────────────────────────────────────────────
-- ════════════════════════════════════════════════════════════════════════
--  Pinaka — a chain steps over a challenge that is not visible.
--
--  THE DEADLOCK
--
--  A chain's step N opened when its team had solved step N−1. `is_visible`
--  is a switch on the challenge and has nothing to do with the chain, so
--  an organiser can hide the middle of a three-step chain without touching
--  the chain at all — a draft they have not finished, or one pulled during
--  the event because its flag leaked.
--
--  The moment they do, step 3 asks whether step 2 is solved. Nobody can
--  see step 2, so nobody can solve it, so step 3 never opens. And because
--  pinaka_chapter_complete counts only visible challenges, step 3 is
--  visible, unsolved and now unreachable — the chapter can never close,
--  and the chapter after it can never open. One toggle, and every team in
--  the event is stopped at a door with no handle, for the rest of the
--  event, with nothing on screen to say why.
--
--  THE RULE
--
--  A step opens when the previous *visible* step is solved; a step with
--  nothing visible before it in its chain is a first door. A hidden
--  challenge is simply not part of the chain anybody is playing, which is
--  the same rule pinaka_chapter_complete already applies — the two now
--  agree about what a chain contains.
--
--  Nothing else changes. Story mode off, a challenge in no chain, the
--  chapter gate, a team that does not exist: all exactly as before.
-- ════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.pinaka_team_unlocked(
  p_team_id uuid, p_challenge_id uuid
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT
    NOT COALESCE((SELECT es.pinaka_story_mode FROM public.event_settings es WHERE es.id = 1), false)
    OR NOT EXISTS (
      SELECT 1 FROM public.chain_series_members m WHERE m.challenge_id = p_challenge_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.chain_series_members m
      -- LEFT: a chain with no chapter is not chapter-gated, which is what
      -- keeps an organiser who never used chapters on their old behaviour.
      LEFT JOIN public.pinaka_series_chapter pc ON pc.series_id = m.series_id
      WHERE m.challenge_id = p_challenge_id
        AND public.pinaka_chapter_unlocked(p_team_id, pc.chapter)
        AND (
          -- A first door: nothing visible stands before it in this chain.
          NOT EXISTS (
            SELECT 1
            FROM public.chain_series_members b
            JOIN public.challenges bc ON bc.id = b.challenge_id AND bc.is_visible
            WHERE b.series_id = m.series_id AND b.position < m.position
          )
          -- Or the step before it that a player can actually see is solved.
          OR (p_team_id IS NOT NULL AND EXISTS (
                SELECT 1
                FROM public.chain_series_members prev
                JOIN public.submissions s ON s.challenge_id = prev.challenge_id
                WHERE prev.series_id = m.series_id
                  AND prev.position = (
                        SELECT max(b.position)
                        FROM public.chain_series_members b
                        JOIN public.challenges bc
                          ON bc.id = b.challenge_id AND bc.is_visible
                        WHERE b.series_id = m.series_id AND b.position < m.position
                      )
                  AND s.team_id = p_team_id
                  AND s.is_correct
              ))
        )
    );
$$;

REVOKE EXECUTE ON FUNCTION public.pinaka_team_unlocked(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.pinaka_team_unlocked(uuid, uuid) TO authenticated, service_role;

-- ─── 2 of 4 ─────────────────────────────────────────────────────────
-- ════════════════════════════════════════════════════════════════════════
--  Pinaka — battle scenes become a catalogue an organiser can add to.
--
--  WHY
--
--  The twelve scenes were a closed set: a union type in TypeScript, a
--  bundled image set, and a CHECK constraint listing the twelve ids. Adding
--  a thirteenth meant processing the art, editing two source files, writing
--  a migration, merging and redeploying — perhaps five minutes with a
--  rebuild, and a deploy over a live event, which is the one moment nobody
--  should be shipping.
--
--  Organisers write challenges during their own event. The art for one
--  should not need an engineer.
--
--  WHAT CHANGES
--
--  pinaka_scene is the catalogue. The twelve ship as rows with is_builtin,
--  and keep their bundled art: they are already measured, compressed and
--  served from the app's own bundle, and nothing is gained by fetching
--  them. A scene the organisers add carries the URL of its uploaded art
--  and the numbers the browser measured from it.
--
--  pinaka_challenge_scene used to be guarded by a CHECK of twelve
--  literals. It now references this table, so the set of legal scenes is
--  data — and deleting a scene takes its assignments with it rather than
--  leaving challenges pointing at art that no longer exists.
--
--  WHAT DOES NOT CHANGE
--
--  A scene still only dresses a challenge: background, a line of story,
--  the wording on a button. Nothing here gates, scores, orders or hides
--  anything, and a challenge with no scene is exactly as it was.
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.pinaka_scene (
  id            text        NOT NULL,
  label         text        NOT NULL,
  intro         text        NOT NULL DEFAULT '',
  button_label  text        NOT NULL DEFAULT '',
  enter_label   text        NOT NULL DEFAULT '',
  -- The card's thin glowing border. Measured from the art by the browser
  -- that uploaded it, not picked by eye.
  accent        text        NOT NULL DEFAULT '#e3bb66',
  -- Null for the twelve: their art is in the bundle, keyed by id.
  art_url       text,
  art_width     integer,
  art_height    integer,
  -- Where the subject sits and where the light is, as fractions of the
  -- image, so a wide desktop crop and a tall phone crop both keep it.
  focal_x       real        NOT NULL DEFAULT 0.5,
  focal_y       real        NOT NULL DEFAULT 0.5,
  sun_x         real        NOT NULL DEFAULT 0.5,
  sun_y         real        NOT NULL DEFAULT 0.35,
  -- Sorts the admin dropdown; the twelve keep the order they were written.
  position      integer     NOT NULL DEFAULT 100,
  is_builtin    boolean     NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pinaka_scene_pkey PRIMARY KEY (id),
  -- A slug, because it is also the storage path and the plate key.
  CONSTRAINT pinaka_scene_id_slug  CHECK (id ~ '^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$'),
  CONSTRAINT pinaka_scene_label_len CHECK (length(label) BETWEEN 1 AND 60),
  CONSTRAINT pinaka_scene_intro_len CHECK (length(intro) <= 400),
  CONSTRAINT pinaka_scene_button_len CHECK (length(button_label) <= 40),
  CONSTRAINT pinaka_scene_enter_len  CHECK (length(enter_label) <= 40),
  CONSTRAINT pinaka_scene_accent_hex CHECK (accent ~ '^#[0-9a-fA-F]{6}$'),
  -- A scene the organisers added is useless without its art; a built-in
  -- must not have a URL, because its art is in the bundle.
  CONSTRAINT pinaka_scene_art_present CHECK (is_builtin OR art_url IS NOT NULL),
  CONSTRAINT pinaka_scene_builtin_bundled CHECK (NOT is_builtin OR art_url IS NULL)
);

-- The twelve, exactly as themes/pinaka/scenes/config.ts has always had
-- them. Re-running updates the words and leaves everything else alone, so
-- editing a line of story in the source and replaying this stays honest.
INSERT INTO public.pinaka_scene (id, label, intro, button_label, enter_label, accent, position, is_builtin) VALUES
  ('golden-deer', 'Golden Deer', 'A golden trail appears too perfect to be real. What shines may only be bait.', 'Track the Golden Deer', 'Give Chase', '#dfa049', 1, true),
  ('jatayus-last-stand', 'Jatayu''s Last Stand', 'A broken witness leaves one final sign. Recover the truth from what remains.', 'Recover Jatayu''s Message', 'Honour the Fallen', '#d27837', 2, true),
  ('shabaris-offering', 'Shabari''s Offering', 'Every piece is chosen with care. The answer is hidden among what seems ordinary.', 'Accept the Offering', 'Receive the Gift', '#ce793b', 3, true),
  ('hanumans-leap', 'Hanuman''s Leap', 'The distance is impossible only until the right path is found.', 'Begin the Leap', 'Take the Leap', '#eda762', 4, true),
  ('ashoka-vatika', 'Ashoka Vatika', 'Inside the guarded garden, a message waits where only the patient will look.', 'Search Ashoka Vatika', 'Enter the Garden', '#407ac9', 5, true),
  ('lanka-dahan', 'Lanka Dahan', 'One spark is enough when the city is built on weak defenses.', 'Ignite the Breach', 'Set the Spark', '#e96320', 6, true),
  ('sanjeevani-hunt', 'Sanjeevani Hunt', 'The system is wounded. Find what restores life before the window closes.', 'Hunt Sanjeevani', 'Race the Dawn', '#467cc3', 7, true),
  ('setu-stones', 'Setu Stones', 'One stone means little. A chain of stones becomes a path.', 'Build the Setu', 'Lay the First Stone', '#e9a663', 8, true),
  ('meghnads-trap', 'Meghnad''s Trap', 'The trap is not where it appears. Break the illusion before it binds you.', 'Break Meghnad''s Trap', 'Break the Illusion', '#d13844', 9, true),
  ('kumbhakarna-awakens', 'Kumbhakarna Awakens', 'Something huge sleeps beneath the surface. Wake it carefully, or be crushed by it.', 'Wake the Giant', 'Rouse the Giant', '#d5784b', 10, true),
  ('angadas-embassy', 'Angada''s Embassy', 'Stand firm in the court of pressure. Not every challenge is won by force.', 'Enter the Court', 'Hold the Court', '#d78332', 11, true),
  ('ravanas-ten-heads', 'Ravana''s Ten Heads', 'Every head hides a different defense. Defeat them one by one.', 'Face the Ten Heads', 'Win the War', '#e16529', 12, true)
ON CONFLICT (id) DO UPDATE SET
  label = EXCLUDED.label, intro = EXCLUDED.intro,
  button_label = EXCLUDED.button_label, enter_label = EXCLUDED.enter_label,
  accent = EXCLUDED.accent, position = EXCLUDED.position,
  is_builtin = true, updated_at = now();

ALTER TABLE public.pinaka_scene ENABLE ROW LEVEL SECURITY;

-- A scene is a label, a line of story and a picture. Any signed-in player
-- already sees all three on the board; the catalogue is not a secret.
DROP POLICY IF EXISTS "pinaka_scene_select" ON public.pinaka_scene;
CREATE POLICY "pinaka_scene_select" ON public.pinaka_scene
  FOR SELECT USING ((SELECT auth.uid()) IS NOT NULL);

REVOKE ALL    ON public.pinaka_scene FROM anon;
GRANT  SELECT ON public.pinaka_scene TO authenticated;

-- ════════════════════════════════════════════════════════════════════════
--  The assignment table stops carrying its own list of legal scenes.
--
--  It had a CHECK of twelve literals, which is the thing this migration
--  exists to stop. A foreign key says the same thing about data that is
--  allowed to grow, and ON DELETE CASCADE means removing a scene removes
--  the assignments to it rather than leaving challenges dressed in art
--  that is gone.
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE public.pinaka_challenge_scene
  DROP CONSTRAINT IF EXISTS pinaka_challenge_scene_known;

-- Any row pointing at a scene this catalogue does not know would fail the
-- key below. There should be none — the CHECK allowed only the twelve —
-- but an event mid-flight is not the place to find out.
DELETE FROM public.pinaka_challenge_scene cs
  WHERE NOT EXISTS (SELECT 1 FROM public.pinaka_scene s WHERE s.id = cs.scene);

ALTER TABLE public.pinaka_challenge_scene
  DROP CONSTRAINT IF EXISTS pinaka_challenge_scene_scene_fk;
ALTER TABLE public.pinaka_challenge_scene
  ADD CONSTRAINT pinaka_challenge_scene_scene_fk
  FOREIGN KEY (scene) REFERENCES public.pinaka_scene(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_pinaka_challenge_scene_scene
  ON public.pinaka_challenge_scene (scene);

-- ════════════════════════════════════════════════════════════════════════
--  Writing the catalogue. Admin only, like every other organiser action.
--
--  The browser uploads the art and measures it — the focal point, the
--  light and the accent all come from the picture rather than from a
--  guess — then calls this with what it found. Validation lives in the
--  constraints above, so a bad call fails here rather than painting a
--  broken scene onto the board.
-- ════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_upsert_pinaka_scene(
  p_id           text,
  p_label        text,
  p_intro        text    DEFAULT '',
  p_button_label text    DEFAULT '',
  p_enter_label  text    DEFAULT '',
  p_accent       text    DEFAULT '#e3bb66',
  p_art_url      text    DEFAULT NULL,
  p_art_width    integer DEFAULT NULL,
  p_art_height   integer DEFAULT NULL,
  p_focal_x      real    DEFAULT 0.5,
  p_focal_y      real    DEFAULT 0.5,
  p_sun_x        real    DEFAULT 0.5,
  p_sun_y        real    DEFAULT 0.35
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_builtin boolean;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  SELECT s.is_builtin INTO v_builtin FROM public.pinaka_scene s WHERE s.id = p_id;

  -- The twelve keep their bundled art and their id. Their words may be
  -- edited like any other scene's; their picture may not be replaced from
  -- here, because it is not in the database to replace.
  IF v_builtin THEN
    UPDATE public.pinaka_scene SET
      label = p_label, intro = COALESCE(p_intro, ''),
      button_label = COALESCE(p_button_label, ''),
      enter_label  = COALESCE(p_enter_label, ''),
      accent = COALESCE(p_accent, accent), updated_at = now()
    WHERE id = p_id;
  ELSE
    IF p_art_url IS NULL THEN
      RETURN jsonb_build_object('error', 'A new scene needs its artwork.');
    END IF;
    INSERT INTO public.pinaka_scene (
      id, label, intro, button_label, enter_label, accent,
      art_url, art_width, art_height, focal_x, focal_y, sun_x, sun_y,
      position, is_builtin
    ) VALUES (
      p_id, p_label, COALESCE(p_intro, ''), COALESCE(p_button_label, ''),
      COALESCE(p_enter_label, ''), COALESCE(p_accent, '#e3bb66'),
      p_art_url, p_art_width, p_art_height,
      COALESCE(p_focal_x, 0.5), COALESCE(p_focal_y, 0.5),
      COALESCE(p_sun_x, 0.5), COALESCE(p_sun_y, 0.35),
      1000, false
    )
    ON CONFLICT (id) DO UPDATE SET
      label = EXCLUDED.label, intro = EXCLUDED.intro,
      button_label = EXCLUDED.button_label, enter_label = EXCLUDED.enter_label,
      accent = EXCLUDED.accent, art_url = EXCLUDED.art_url,
      art_width = EXCLUDED.art_width, art_height = EXCLUDED.art_height,
      focal_x = EXCLUDED.focal_x, focal_y = EXCLUDED.focal_y,
      sun_x = EXCLUDED.sun_x, sun_y = EXCLUDED.sun_y,
      updated_at = now();
  END IF;

  INSERT INTO public.audit_log (actor_id, action, metadata)
  VALUES (auth.uid(), 'upsert_pinaka_scene',
          jsonb_build_object('scene', p_id, 'builtin', COALESCE(v_builtin, false)));

  RETURN jsonb_build_object('success', true, 'scene', p_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_pinaka_scene(p_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_builtin boolean;
  v_used    integer;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  SELECT s.is_builtin INTO v_builtin FROM public.pinaka_scene s WHERE s.id = p_id;
  IF v_builtin IS NULL THEN
    RETURN jsonb_build_object('error', 'No such scene.');
  END IF;
  -- The twelve are in the bundle whatever this table says, so removing the
  -- row would only produce a scene the board can draw and nobody can pick.
  IF v_builtin THEN
    RETURN jsonb_build_object('error', 'The twelve original scenes cannot be removed.');
  END IF;

  SELECT count(*) INTO v_used FROM public.pinaka_challenge_scene WHERE scene = p_id;

  DELETE FROM public.pinaka_scene WHERE id = p_id;

  INSERT INTO public.audit_log (actor_id, action, metadata)
  VALUES (auth.uid(), 'delete_pinaka_scene',
          jsonb_build_object('scene', p_id, 'challenges_undressed', v_used));

  -- Said plainly, because the cascade is silent and an organiser deleting
  -- a scene during an event should know what it took with it.
  RETURN jsonb_build_object('success', true, 'challenges_undressed', v_used);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_upsert_pinaka_scene(text, text, text, text, text, text, text, integer, integer, real, real, real, real) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_upsert_pinaka_scene(text, text, text, text, text, text, text, integer, integer, real, real, real, real) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_delete_pinaka_scene(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_delete_pinaka_scene(text) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════
--  Where uploaded scene art lives.
--
--  Its own bucket rather than challenge-files: that one holds attachments
--  a player downloads and is sized for them (50 MB). Scene art is a
--  background the whole site paints, it is only ever an image, and it
--  wants a limit small enough that nobody uploads a 40 MB photograph by
--  accident and makes every page on the board wait for it.
--
--  Public for reads, because it is a background on a public-facing board
--  and a signed URL on every paint would be a round trip for nothing.
--  Admin-only for writes, exactly like attachments.
-- ════════════════════════════════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('scene-art', 'scene-art', true, 8388608,
        ARRAY['image/webp', 'image/jpeg', 'image/png'])
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "scene_art_admin_insert" ON storage.objects;
CREATE POLICY "scene_art_admin_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'scene-art' AND public.is_admin());

DROP POLICY IF EXISTS "scene_art_admin_update" ON storage.objects;
CREATE POLICY "scene_art_admin_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'scene-art' AND public.is_admin())
  WITH CHECK (bucket_id = 'scene-art' AND public.is_admin());

DROP POLICY IF EXISTS "scene_art_admin_delete" ON storage.objects;
CREATE POLICY "scene_art_admin_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'scene-art' AND public.is_admin());

DROP POLICY IF EXISTS "scene_art_admin_select" ON storage.objects;
CREATE POLICY "scene_art_admin_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'scene-art' AND public.is_admin());

-- ════════════════════════════════════════════════════════════════════════
--  And the setter learns the new shape of "unknown scene".
--
--  It caught check_violation, which was exactly right while the guard was
--  a CHECK of twelve literals. The guard above is a foreign key now, so an
--  unknown scene raises foreign_key_violation, the handler no longer
--  matched, and an organiser picking a scene another admin had just
--  deleted got a raw Postgres error instead of a sentence. Catches both,
--  so this reads correctly whichever guard a database happens to have.
-- ════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_set_challenge_scene(
  p_challenge_id uuid, p_scene text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_scene text := NULLIF(pg_catalog.btrim(COALESCE(p_scene, '')), '');
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.challenges c WHERE c.id = p_challenge_id) THEN
    RETURN jsonb_build_object('error', 'Challenge not found');
  END IF;

  -- "None / Default" clears the row, which is what restores the ordinary look.
  IF v_scene IS NULL THEN
    DELETE FROM public.pinaka_challenge_scene WHERE challenge_id = p_challenge_id;
    RETURN jsonb_build_object('success', true, 'scene', NULL);
  END IF;

  INSERT INTO public.pinaka_challenge_scene (challenge_id, scene, updated_at)
  VALUES (p_challenge_id, v_scene, now())
  ON CONFLICT (challenge_id)
    DO UPDATE SET scene = EXCLUDED.scene, updated_at = now();

  RETURN jsonb_build_object('success', true, 'scene', v_scene);
EXCEPTION WHEN check_violation OR foreign_key_violation THEN
  RETURN jsonb_build_object('error', 'Unknown scene');
END;
$$;

-- ─── 3 of 4 ─────────────────────────────────────────────────────────
-- ════════════════════════════════════════════════════════════════════════
--  Pinaka — a picture for any challenge's card.
--
--  WHY
--
--  Card art came only from a battle scene, and a scene is a shared thing:
--  a name, a line of story, a button's wording, reusable across
--  challenges. Most challenges want none of that. They want a picture on
--  their card, chosen when the challenge is written, and nothing else.
--
--  Dressing one in a scene to get art meant inventing a scene per
--  challenge — twenty rows of story nobody reads, so that twenty cards
--  could have pictures. So this is the picture on its own, with no words
--  attached and nothing to name.
--
--  Both still work, and a scene still wins: a challenge given a scene is
--  an arena, and the scene's painting is what dresses it. This is for
--  everything else, which is most of the board.
--
--  WHAT IT CARRIES
--
--  Two sizes, because the same picture is painted both as a card a few
--  hundred pixels wide and as a full-bleed background on a 4K screen,
--  and one file cannot serve both without being wrong for one of them.
--  Plus where the subject sits, so a wide card and a tall one both keep
--  it, and the accent its border takes — all measured from the picture by
--  the browser that uploaded it.
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.pinaka_challenge_card (
  challenge_id uuid        NOT NULL,
  -- Up to 3840 wide: the shipped plates all carry one, and an organiser's
  -- own art should not be the blurriest thing on the board.
  art_url      text        NOT NULL,
  -- Half of it, for cards and for screens that do not want 4K.
  art_half_url text,
  art_width    integer,
  art_height   integer,
  focal_x      real        NOT NULL DEFAULT 0.5,
  focal_y      real        NOT NULL DEFAULT 0.5,
  accent       text        NOT NULL DEFAULT '#e3bb66',
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pinaka_challenge_card_pkey PRIMARY KEY (challenge_id),
  CONSTRAINT pinaka_challenge_card_fk FOREIGN KEY (challenge_id)
    REFERENCES public.challenges(id) ON DELETE CASCADE,
  CONSTRAINT pinaka_challenge_card_accent_hex CHECK (accent ~ '^#[0-9a-fA-F]{6}$')
);

ALTER TABLE public.pinaka_challenge_card ENABLE ROW LEVEL SECURITY;

-- A picture on a card every signed-in player already sees. Not a secret,
-- and emphatically not a hint: it says nothing the challenge does not.
DROP POLICY IF EXISTS "pinaka_challenge_card_select" ON public.pinaka_challenge_card;
CREATE POLICY "pinaka_challenge_card_select" ON public.pinaka_challenge_card
  FOR SELECT USING ((SELECT auth.uid()) IS NOT NULL);

REVOKE ALL    ON public.pinaka_challenge_card FROM anon;
GRANT  SELECT ON public.pinaka_challenge_card TO authenticated;

-- ════════════════════════════════════════════════════════════════════════
--  Setting and clearing it. Admin only, like every organiser action.
-- ════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_set_challenge_card(
  p_challenge_id uuid,
  p_art_url      text    DEFAULT NULL,
  p_art_half_url text    DEFAULT NULL,
  p_art_width    integer DEFAULT NULL,
  p_art_height   integer DEFAULT NULL,
  p_focal_x      real    DEFAULT 0.5,
  p_focal_y      real    DEFAULT 0.5,
  p_accent       text    DEFAULT '#e3bb66'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_url text := NULLIF(pg_catalog.btrim(COALESCE(p_art_url, '')), '');
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.challenges c WHERE c.id = p_challenge_id) THEN
    RETURN jsonb_build_object('error', 'Challenge not found');
  END IF;

  -- No url clears the picture, which restores the ordinary card.
  IF v_url IS NULL THEN
    DELETE FROM public.pinaka_challenge_card WHERE challenge_id = p_challenge_id;
    RETURN jsonb_build_object('success', true, 'art', NULL);
  END IF;

  INSERT INTO public.pinaka_challenge_card (
    challenge_id, art_url, art_half_url, art_width, art_height,
    focal_x, focal_y, accent, updated_at
  ) VALUES (
    p_challenge_id, v_url, NULLIF(pg_catalog.btrim(COALESCE(p_art_half_url, '')), ''),
    p_art_width, p_art_height,
    COALESCE(p_focal_x, 0.5), COALESCE(p_focal_y, 0.5),
    COALESCE(p_accent, '#e3bb66'), now()
  )
  ON CONFLICT (challenge_id) DO UPDATE SET
    art_url = EXCLUDED.art_url, art_half_url = EXCLUDED.art_half_url,
    art_width = EXCLUDED.art_width, art_height = EXCLUDED.art_height,
    focal_x = EXCLUDED.focal_x, focal_y = EXCLUDED.focal_y,
    accent = EXCLUDED.accent, updated_at = now();

  INSERT INTO public.audit_log (actor_id, action, metadata)
  VALUES (auth.uid(), 'set_challenge_card',
          jsonb_build_object('challenge', p_challenge_id));

  RETURN jsonb_build_object('success', true, 'art', v_url);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_set_challenge_card(uuid, text, text, integer, integer, real, real, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_set_challenge_card(uuid, text, text, integer, integer, real, real, text) TO authenticated;

-- ─── 4 of 4 ─────────────────────────────────────────────────────────
-- ════════════════════════════════════════════════════════════════════════
--  Pinaka — a challenge's picture becomes its scene.
--
--  WHY
--
--  There were two ways to put art on a challenge and an organiser had to
--  know which one they wanted before they started:
--
--    * a battle SCENE — a shared catalogue row with a name, a prologue and
--      two button labels, picked from a dropdown, authored in its own admin
--      tab, and turning the card into an arena door;
--    * a card PICTURE — one image, chosen on the challenge form, drawn as a
--      band across the top of the ordinary card.
--
--  That is one concept too many. The organisers asked for a single upload
--  on the challenge form that carries its own wording, and for the PLACEMENT
--  to decide how it is drawn: a Free challenge opens as an arena with the
--  painting behind the whole site, and the same challenge inside a chain
--  shows the painting on its card instead.
--
--  WHAT THIS DOES
--
--  Gives pinaka_challenge_card the four words a scene carries and the light
--  a backdrop needs, so a card row can be rendered through exactly the same
--  path a catalogue scene is. Nothing about the rendering moves here; this
--  is the column the client reads.
--
--  WHAT IT DELIBERATELY DOES NOT DO
--
--  It does not touch pinaka_scene or pinaka_challenge_scene. The twelve
--  shipped paintings and every challenge already dressed in one keep
--  working exactly as they are -- there are live challenges wearing them
--  today, and an event three weeks out is no time to migrate content that
--  is already correct. The catalogue simply stops being the only way in.
--
--  REVERT
--    ALTER TABLE public.pinaka_challenge_card
--      DROP COLUMN label, DROP COLUMN intro,
--      DROP COLUMN enter_label, DROP COLUMN button_label,
--      DROP COLUMN sun_x, DROP COLUMN sun_y;
--    (then re-run 20261015000000 for the older admin_set_challenge_card)
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE public.pinaka_challenge_card
  ADD COLUMN IF NOT EXISTS label        text  NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS intro        text  NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS enter_label  text  NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS button_label text  NOT NULL DEFAULT '',
  -- Where the light is, for the bloom and rays behind an arena. Centred
  -- and a little high is the neutral answer for a picture that has not
  -- been measured; the browser measures it on upload.
  ADD COLUMN IF NOT EXISTS sun_x        real  NOT NULL DEFAULT 0.5,
  ADD COLUMN IF NOT EXISTS sun_y        real  NOT NULL DEFAULT 0.35;

-- Lengths that match the admin form's own limits, so a value that got past
-- the client cannot sit in the table unbounded.
ALTER TABLE public.pinaka_challenge_card
  DROP CONSTRAINT IF EXISTS pinaka_challenge_card_words_len;
ALTER TABLE public.pinaka_challenge_card
  ADD CONSTRAINT pinaka_challenge_card_words_len CHECK (
    length(label) <= 60 AND length(intro) <= 400
    AND length(enter_label) <= 40 AND length(button_label) <= 40
  );

ALTER TABLE public.pinaka_challenge_card
  DROP CONSTRAINT IF EXISTS pinaka_challenge_card_sun_range;
ALTER TABLE public.pinaka_challenge_card
  ADD CONSTRAINT pinaka_challenge_card_sun_range CHECK (
    sun_x >= -1 AND sun_x <= 2 AND sun_y >= -1 AND sun_y <= 2
  );

-- ── The writer learns the words ─────────────────────────────────────────
-- The eight-argument version from 20261015000000 is DROPPED first, and
-- that is the opposite of what it looks like.
--
-- Leaving it in place to keep a stale browser tab working is the obvious
-- move and it is wrong: Postgres then has two candidates for an
-- eight-argument call and refuses it outright --
--
--   function public.admin_set_challenge_card(p_challenge_id => uuid, ...)
--   is not unique
--
-- -- which breaks every card save, from old tabs and new ones alike.
-- With only this version present an eight-argument call resolves here and
-- the six new arguments take their defaults, so an un-rebuilt client keeps
-- saving pictures exactly as before and simply writes no words.
DROP FUNCTION IF EXISTS public.admin_set_challenge_card(
  uuid, text, text, integer, integer, real, real, text);
CREATE OR REPLACE FUNCTION public.admin_set_challenge_card(
  p_challenge_id  uuid,
  p_art_url       text,
  p_art_half_url  text    DEFAULT NULL,
  p_art_width     integer DEFAULT NULL,
  p_art_height    integer DEFAULT NULL,
  p_focal_x       real    DEFAULT 0.5,
  p_focal_y       real    DEFAULT 0.5,
  p_accent        text    DEFAULT '#e3bb66',
  p_label         text    DEFAULT '',
  p_intro         text    DEFAULT '',
  p_enter_label   text    DEFAULT '',
  p_button_label  text    DEFAULT '',
  p_sun_x         real    DEFAULT 0.5,
  p_sun_y         real    DEFAULT 0.35
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('error', 'Admins only');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.challenges c WHERE c.id = p_challenge_id) THEN
    RETURN jsonb_build_object('error', 'Unknown challenge');
  END IF;

  -- A null picture clears the row: "no art" and "art with no words" are
  -- different states, and only the first removes the record.
  IF p_art_url IS NULL OR length(btrim(p_art_url)) = 0 THEN
    DELETE FROM public.pinaka_challenge_card WHERE challenge_id = p_challenge_id;
    RETURN jsonb_build_object('success', true, 'cleared', true);
  END IF;

  INSERT INTO public.pinaka_challenge_card AS t (
    challenge_id, art_url, art_half_url, art_width, art_height,
    focal_x, focal_y, accent,
    label, intro, enter_label, button_label, sun_x, sun_y, updated_at
  ) VALUES (
    p_challenge_id, btrim(p_art_url), nullif(btrim(coalesce(p_art_half_url, '')), ''),
    p_art_width, p_art_height,
    coalesce(p_focal_x, 0.5), coalesce(p_focal_y, 0.5),
    coalesce(nullif(btrim(coalesce(p_accent, '')), ''), '#e3bb66'),
    left(btrim(coalesce(p_label, '')), 60),
    left(btrim(coalesce(p_intro, '')), 400),
    left(btrim(coalesce(p_enter_label, '')), 40),
    left(btrim(coalesce(p_button_label, '')), 40),
    coalesce(p_sun_x, 0.5), coalesce(p_sun_y, 0.35),
    now()
  )
  ON CONFLICT (challenge_id) DO UPDATE SET
    art_url      = EXCLUDED.art_url,
    art_half_url = EXCLUDED.art_half_url,
    art_width    = EXCLUDED.art_width,
    art_height   = EXCLUDED.art_height,
    focal_x      = EXCLUDED.focal_x,
    focal_y      = EXCLUDED.focal_y,
    accent       = EXCLUDED.accent,
    label        = EXCLUDED.label,
    intro        = EXCLUDED.intro,
    enter_label  = EXCLUDED.enter_label,
    button_label = EXCLUDED.button_label,
    sun_x        = EXCLUDED.sun_x,
    sun_y        = EXCLUDED.sun_y,
    updated_at   = now();

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_set_challenge_card(
  uuid, text, text, integer, integer, real, real, text,
  text, text, text, text, real, real) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_set_challenge_card(
  uuid, text, text, integer, integer, real, real, text,
  text, text, text, text, real, real) TO authenticated;
