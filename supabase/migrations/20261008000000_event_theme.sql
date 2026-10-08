-- The organisers' switch for the platform's look.
--
-- A temporary event skin (Pinaka CTF 2026) is shipped behind one server-held
-- value, so an admin can open it for every visitor from the dashboard and
-- close it the same way, without a deploy. Presentation only: nothing else
-- reads this column. Mirrors the chain-experience toggle
-- (admin_set_chain_experience) in shape and privilege.
--
-- Additive and reversible: a one-column default, two functions. Dropping the
-- column and the functions restores the previous schema exactly.

ALTER TABLE public.event_settings
  ADD COLUMN IF NOT EXISTS theme text NOT NULL DEFAULT 'cyberhx'
  CHECK (theme IN ('cyberhx', 'pinaka'));

-- Admin only. Audited like every other organiser switch.
CREATE OR REPLACE FUNCTION public.admin_set_theme(p_theme text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_theme text := lower(COALESCE(p_theme, 'cyberhx'));
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;
  IF v_theme NOT IN ('cyberhx', 'pinaka') THEN
    RETURN jsonb_build_object('error', 'Unknown theme');
  END IF;

  UPDATE public.event_settings SET theme = v_theme WHERE id = 1;

  INSERT INTO public.audit_log (actor_id, action, metadata)
  VALUES (auth.uid(), 'set_theme', jsonb_build_object('theme', v_theme));

  RETURN jsonb_build_object('success', true, 'theme', v_theme);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_set_theme(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_set_theme(text) TO authenticated, service_role;

-- Readable by everyone, including the sign-in page, which has no session yet.
-- anon has no SELECT on event_settings (revoked in 20260826030000), so this
-- is the only way out for the one value the sign-in page needs. It reveals
-- nothing but the name of the look.
CREATE OR REPLACE FUNCTION public.public_theme()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT COALESCE((SELECT e.theme FROM public.event_settings e WHERE e.id = 1), 'cyberhx');
$$;
REVOKE EXECUTE ON FUNCTION public.public_theme() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.public_theme() TO anon, authenticated, service_role;
