-- Admins could ban each other, and a banned admin kept their powers.
--
-- admin_set_user_ban only refused banning your own account, so with two
-- admins either could ban the other. is_admin() meanwhile tests role alone
-- and never is_banned, so the banned admin kept every privilege and could
-- simply unban themselves or ban back. The ban was both dangerous and
-- ineffective at once.
--
-- Settle it in one direction: an admin account cannot be banned while it is
-- an admin. Demote first, then ban, so removing someone's privileges is a
-- deliberate two-step with an audit entry for each.

-- ── A banned account is never an admin ────────────────────────────────
-- Defence in depth: if is_banned is ever set directly in SQL, the account
-- stops being privileged rather than sitting in a contradictory state.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
      AND COALESCE(p.is_banned, false) = false
  );
$$;

CREATE OR REPLACE FUNCTION public.is_mod_or_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('moderator', 'admin')
      AND COALESCE(p.is_banned, false) = false
  );
$$;

-- ── Refuse to ban an admin ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_set_user_ban(p_user_id uuid, p_banned boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_username text;
  v_role     text;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  IF p_user_id = auth.uid() THEN
    RETURN jsonb_build_object('error', 'You cannot ban your own account');
  END IF;

  SELECT p.username, p.role INTO v_username, v_role
  FROM public.profiles p WHERE p.id = p_user_id;

  IF v_username IS NULL THEN
    RETURN jsonb_build_object('error', 'User not found');
  END IF;

  -- Only blocks banning; unbanning an admin stays possible so a bad state
  -- from before this change can still be cleared.
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

-- ── Role changes, so demote-then-ban does not need the SQL editor ─────
CREATE OR REPLACE FUNCTION public.admin_set_user_role(p_user_id uuid, p_role text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_username text;
  v_old_role text;
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

  SELECT p.username, p.role INTO v_username, v_old_role
  FROM public.profiles p WHERE p.id = p_user_id;

  IF v_username IS NULL THEN
    RETURN jsonb_build_object('error', 'User not found');
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
