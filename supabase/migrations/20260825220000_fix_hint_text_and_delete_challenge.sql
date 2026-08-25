-- Two broken admin/player paths found by probing the deployed API.

-- ── 1. get_hint_text always raised 42702 ──────────────────────────────
--
-- The parameter is named hint_id and hint_unlocks also has a hint_id
-- column, so inside the query PL/pgSQL cannot tell them apart:
--   column reference "hint_id" is ambiguous
-- Every call failed, so a player could never re-read a hint they had
-- already unlocked. The parameter name is part of the PostgREST API, so
-- keep it and copy it into a local variable that cannot collide.

CREATE OR REPLACE FUNCTION public.get_hint_text(hint_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = '' AS $$
DECLARE
  v_hint_id uuid := hint_id;
BEGIN
  RETURN (
    SELECT h.content FROM public.hints h
    JOIN public.hint_unlocks hu ON hu.hint_id = h.id
    WHERE h.id = v_hint_id AND hu.user_id = auth.uid()
  );
END;
$$;

-- ── 2. admin_delete_challenge did not exist ───────────────────────────
--
-- AdminDashboard calls it to delete a challenge but the schema never
-- defined it, so PostgREST answered PGRST202 and the call site discards
-- the error: the delete button silently did nothing.
--
-- challenge_secrets, challenge_files and hints cascade from challenges,
-- and hint_unlocks cascades from hints. submissions do not cascade, so
-- they would block the delete and have to go first, and another challenge
-- may gate on this one through unlock_after.

CREATE OR REPLACE FUNCTION public.admin_delete_challenge(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_submissions int;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.challenges c WHERE c.id = p_id) THEN
    RETURN jsonb_build_object('error', 'Challenge not found');
  END IF;

  SELECT COUNT(*) INTO v_submissions
  FROM public.submissions s WHERE s.challenge_id = p_id;

  DELETE FROM public.submissions s WHERE s.challenge_id = p_id;

  UPDATE public.challenges c SET unlock_after = NULL WHERE c.unlock_after = p_id;

  DELETE FROM public.challenges c WHERE c.id = p_id;

  INSERT INTO public.audit_log (actor_id, action, metadata)
  VALUES (auth.uid(), 'delete_challenge',
          jsonb_build_object('challenge_id', p_id,
                             'submissions_removed', v_submissions));

  RETURN jsonb_build_object('success', true, 'submissions_removed', v_submissions);
END;
$$;

-- ── 3. Admin functions were executable by anonymous callers ───────────
--
-- The base schema revoked function privileges from anon, but PostgreSQL
-- grants EXECUTE to PUBLIC by default and revoking from anon does not
-- remove that. Every admin RPC was therefore reachable unauthenticated;
-- only each function's own is_admin() check refused the work, which is a
-- single edit away from being the only thing standing in the way.
-- Take the default grant away so the privileged surface needs a session.

REVOKE EXECUTE ON FUNCTION public.admin_delete_challenge(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_reset_event() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_team_members(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_team_invite(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_challenge_hints(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_challenge_flag(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_upsert_challenge(
  uuid, text, text, text, text, text, text, int, int, text, text[], boolean, text
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_delete_challenge(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_reset_event() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_team_members(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_team_invite(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_challenge_hints(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_challenge_flag(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_upsert_challenge(
  uuid, text, text, text, text, text, text, int, int, text, text[], boolean, text
) TO authenticated, service_role;
