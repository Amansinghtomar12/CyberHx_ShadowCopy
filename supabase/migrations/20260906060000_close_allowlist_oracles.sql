-- ════════════════════════════════════════════════════════════════════════
-- Close two membership oracles left by the allowlist work
--
-- registration_email_allowed(email) was anon-callable so the signup form
-- could show a themed refusal. Signup no longer checks the allowlist, so
-- nothing calls it — and left open it lets anyone probe whether a given
-- email is on the list. play_allowlist_blocks(uuid) was granted to
-- authenticated but is only ever invoked from inside submit_flag_tx and
-- unlock_hint, which are SECURITY DEFINER and run as the owner; a direct
-- grant only let a player probe other users' list status.
--
-- Neither client role needs either function. Revoking from authenticated
-- does not affect the play gate: the definer functions execute as the
-- owner, who retains EXECUTE.
-- ════════════════════════════════════════════════════════════════════════

REVOKE EXECUTE ON FUNCTION public.registration_email_allowed(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.play_allowlist_blocks(uuid)     FROM PUBLIC, anon, authenticated;
