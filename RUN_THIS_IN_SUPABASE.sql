-- ════════════════════════════════════════════════════════════════════════
--  RUN THIS IN THE SUPABASE SQL EDITOR
--
--  Paste the whole file, press Run. Safe to run again.
--
--  This is the one migration your database is missing
--  (20261016000000_pinaka_card_is_a_scene). The other three were applied
--  earlier and were verified present: pinaka_challenge_card,
--  admin_set_challenge_card, pinaka_scene and its twelve built-in rows.
--
--  WHY IT MATTERS NOW
--
--  The live admin form calls admin_set_challenge_card with fourteen named
--  arguments. Your database currently has only the eight-argument version,
--  so PostgREST finds no match and every "Card picture" save fails. This
--  replaces that function and adds the six columns the words live in.
--
--  AFTER RUNNING, the last statement prints one row. Expect:
--     columns_added = 6      overloads = 1      ready = true
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

-- ── Did it work? ────────────────────────────────────────────────────────
SELECT
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name = 'pinaka_challenge_card'
       AND column_name IN ('label','intro','enter_label','button_label','sun_x','sun_y')
  ) AS columns_added,
  (SELECT count(*) FROM pg_proc WHERE proname = 'admin_set_challenge_card') AS overloads,
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name = 'pinaka_challenge_card'
       AND column_name IN ('label','intro','enter_label','button_label','sun_x','sun_y')
  ) = 6
  AND (SELECT count(*) FROM pg_proc WHERE proname = 'admin_set_challenge_card') = 1
  AS ready;
