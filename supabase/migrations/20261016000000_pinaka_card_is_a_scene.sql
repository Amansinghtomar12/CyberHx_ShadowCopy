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
