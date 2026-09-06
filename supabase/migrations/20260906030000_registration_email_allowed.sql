-- ════════════════════════════════════════════════════════════════════════
-- registration_email_allowed(email)
--
-- A lightweight pre-check the signup form calls so it can show a clear,
-- themed refusal to a non-registered email. GoTrue masks a trigger's
-- RAISE as a generic "Database error saving new user", so the specific
-- allowlist message cannot reach the browser from handle_new_user. This
-- function lets the client decide the message BEFORE attempting signup.
--
-- It is NOT the enforcement — handle_new_user remains the authoritative,
-- unbypassable gate. This only drives the UX message.
--
-- Returns true (allowed) when the allowlist gate is off, or when the email
-- is on the list. Returns false only when the gate is on and the email is
-- not listed. Single indexed lookup; safe to expose to anon.
-- ════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.registration_email_allowed(p_email text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT
    NOT COALESCE(
      (SELECT es.registration_allowlist_only FROM public.event_settings es WHERE es.id = 1),
      false)
    OR EXISTS (
      SELECT 1 FROM public.registration_allowlist a
      WHERE a.email = lower(btrim(p_email)));
$$;

REVOKE EXECUTE ON FUNCTION public.registration_email_allowed(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.registration_email_allowed(text) TO anon, authenticated, service_role;
