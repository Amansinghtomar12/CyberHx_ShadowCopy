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
