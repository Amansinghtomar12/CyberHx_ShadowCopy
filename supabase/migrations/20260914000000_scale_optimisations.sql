-- Scale optimisations for 5-7k concurrent players.
-- No security changes, no new limits — just fewer round trips.

-- ── 1. Batch hint-text loader ───────────────────────────────────────────
-- The old pattern fired one get_hint_text RPC per unlocked hint, so a player
-- with N unlocked hints made N round trips on login. At 5000 logins in a
-- 10-minute window that is 25,000+ extra connections. This returns them all
-- in one query, with the same security gates as the single-hint version.

CREATE OR REPLACE FUNCTION public.get_my_hint_texts()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = '' AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN '{}'::jsonb; END IF;
  IF NOT public.is_admin() AND NOT (public.is_not_banned() AND public.challenges_open()) THEN
    RETURN '{}'::jsonb;
  END IF;
  RETURN COALESCE((
    SELECT jsonb_object_agg(h.id::text, h.content)
    FROM public.hints h
    JOIN public.hint_unlocks hu ON hu.hint_id = h.id
    JOIN public.challenges c ON c.id = h.challenge_id
    WHERE hu.user_id = v_uid
      AND (c.is_visible OR public.is_admin())
  ), '{}'::jsonb);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_my_hint_texts() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_my_hint_texts() TO authenticated, service_role;
