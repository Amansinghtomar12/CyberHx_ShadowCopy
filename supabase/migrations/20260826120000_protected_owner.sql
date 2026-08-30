-- An admin could demote any other admin, including the owner.
--
-- WHAT HAPPENED
--   admin_set_user_role refuses only one thing: changing your own role. Any
--   other admin's role is fair game. So with two admins, either can strip the
--   other, and the audit log records it after the fact -- which is how the
--   owner of this deployment lost their own admin role and had to go to the
--   SQL editor to find out why.
--
--   The worse version is not malice. Two admins tidying up a user list can
--   demote each other, or one can demote the last remaining admin, and then
--   nobody can freeze the scoreboard, publish a challenge, or end the event.
--   During a 12-hour CTF that is unrecoverable without the SQL editor, and
--   the person who needs it is usually the one who just lost access.
--
-- TWO GUARDS
--   1. is_protected -- an account flagged protected cannot have its role
--      changed or be banned through the RPCs at all, by anyone, including
--      itself. This is the owner's seatbelt: mark your own account and no
--      co-organiser can remove you, however the argument goes.
--
--   2. Two admins demoting each other at the same moment cannot both succeed.
--      Without that, a deployment where nobody set the flag can be left with
--      zero admins and no way back except the SQL editor.
--
--   Both are deliberately not switchable from the admin UI. A guard an admin
--   can turn off in one click is not a guard -- unprotect-then-demote would
--   be the same two clicks as before. Clearing the flag needs the SQL editor,
--   where service_role bypasses these functions entirely:
--
--     update public.profiles set is_protected = false where username = '...';
--
--   That is the intended break-glass: deliberate, logged by Supabase, and out
--   of reach of whoever is signed into the platform.
--
-- WHY THE ADVISORY LOCK, AND WHY is_admin() IS TESTED TWICE
--   The authorisation check and the write are separate statements, so under
--   READ COMMITTED two admins can demote each other simultaneously: each
--   reads the other as an admin before either commits, and both writes land.
--   Reproduced on a local cluster -- two admins, both demoted, zero left.
--
--   The lock serialises role changes, and the second is_admin() call inside
--   it is what actually closes the window: the loser now re-reads its own
--   role after the winner has committed, sees it is no longer an admin, and
--   is refused. Role changes are rare, so serialising them costs nothing.
--
--   A count of remaining admins was tried here first and is the wrong tool.
--   It cannot fire in the ordinary case -- the caller is always an admin and
--   cannot target itself, so a demotion always leaves at least two -- while
--   in the one case it does fire it is harmful: an admin who is the only
--   *unbanned* admin is blocked from demoting a legacy banned admin, which
--   is exactly the cleanup 20260825290000 left open. The re-check makes the
--   caller a proven admin at write time, so an admin always remains.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_protected boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.is_protected IS
  'Owner seatbelt: role changes and bans are refused for this account. '
  'Settable only via the SQL editor (service_role), never from the admin UI.';

-- Note there is intentionally no GRANT UPDATE (is_protected) here. The
-- allow-list in 20260826030000 is exactly six presentation columns, so a new
-- column starts unwritable through PostgREST for authenticated and stays that
-- way. RLS never gets a chance to matter.

-- ── Role changes ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_set_user_role(p_user_id uuid, p_role text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_username  text;
  v_old_role  text;
  v_protected boolean;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  IF p_role NOT IN ('player', 'moderator', 'admin') THEN
    RETURN jsonb_build_object('error', 'Invalid role');
  END IF;

  -- Demoting yourself would drop your own access with no way back through
  -- the UI, exactly like self-banning.
  IF p_user_id = auth.uid() THEN
    RETURN jsonb_build_object('error', 'You cannot change your own role');
  END IF;

  -- Serialise every role change so the last-admin count below cannot be
  -- read by two sessions that then both act on it.
  PERFORM pg_advisory_xact_lock(hashtext('admin_role_change'));

  -- Re-read our own role now that we hold the lock. If a concurrent admin
  -- demoted us while we waited, the check above passed on stale data.
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object(
      'error', 'Your admin role changed while this was in flight. Reload and try again.'
    );
  END IF;

  SELECT p.username, p.role, COALESCE(p.is_protected, false)
    INTO v_username, v_old_role, v_protected
  FROM public.profiles p WHERE p.id = p_user_id;

  IF v_username IS NULL THEN
    RETURN jsonb_build_object('error', 'User not found');
  END IF;

  IF v_protected THEN
    RETURN jsonb_build_object(
      'error', format('%s is a protected account and cannot be changed here.',
                      v_username)
    );
  END IF;

  UPDATE public.profiles SET role = p_role WHERE id = p_user_id;

  INSERT INTO public.audit_log (actor_id, action, metadata)
  VALUES (
    auth.uid(), 'set_user_role',
    jsonb_build_object('user_id', p_user_id, 'username', v_username,
                       'from', v_old_role, 'to', p_role)
  );

  RETURN jsonb_build_object('success', true, 'username', v_username, 'role', p_role);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_set_user_role(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_role(uuid, text) TO authenticated, service_role;

-- ── Bans ──────────────────────────────────────────────────────────────
-- Banning an admin is already refused (20260825290000). This adds the case
-- that guard misses: a protected account that is not currently an admin --
-- an owner who demoted themselves to play, say -- could still be banned, and
-- a banned account cannot be an admin, so the seatbelt would come off.
CREATE OR REPLACE FUNCTION public.admin_set_user_ban(p_user_id uuid, p_banned boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_username  text;
  v_role      text;
  v_protected boolean;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  IF p_user_id = auth.uid() THEN
    RETURN jsonb_build_object('error', 'You cannot ban your own account');
  END IF;

  SELECT p.username, p.role, COALESCE(p.is_protected, false)
    INTO v_username, v_role, v_protected
  FROM public.profiles p WHERE p.id = p_user_id;

  IF v_username IS NULL THEN
    RETURN jsonb_build_object('error', 'User not found');
  END IF;

  -- Only blocks banning; unbanning stays possible so a bad state from before
  -- this change can still be cleared.
  IF p_banned AND v_protected THEN
    RETURN jsonb_build_object(
      'error', format('%s is a protected account and cannot be banned.', v_username)
    );
  END IF;

  IF p_banned AND v_role = 'admin' THEN
    RETURN jsonb_build_object(
      'error', 'Cannot ban an admin. Change their role to player first.'
    );
  END IF;

  UPDATE public.profiles SET is_banned = p_banned WHERE id = p_user_id;

  INSERT INTO public.audit_log (actor_id, action, metadata)
  VALUES (
    auth.uid(),
    CASE WHEN p_banned THEN 'ban_user' ELSE 'unban_user' END,
    jsonb_build_object('user_id', p_user_id, 'username', v_username, 'role', v_role)
  );

  RETURN jsonb_build_object('success', true, 'username', v_username, 'is_banned', p_banned);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_set_user_ban(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_ban(uuid, boolean) TO authenticated, service_role;
