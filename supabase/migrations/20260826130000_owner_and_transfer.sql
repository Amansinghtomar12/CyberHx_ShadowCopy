-- One owner, transferable by the owner alone, removable by nobody else.
--
-- 20260826120000 added is_protected: an account no admin could demote or
-- ban. That is the right guarantee, but "protected" describes a property
-- when what this actually is now is a role -- the group creator, in the
-- sense WhatsApp uses it. One of them, they appoint the admins, and the
-- only person who can end their ownership is them, by handing it to
-- someone else. Renaming the column to is_owner says that; a partial
-- unique index makes "one of them" true rather than merely intended.
--
-- WHAT EACH PARTY CAN DO
--   owner  -> promote and demote admins, transfer ownership, everything else
--   admin  -> everything except touching the owner
--   the owner's role and ban state are refused for everyone, the owner
--   included, so there is no slip that ends ownership by accident
--
-- TRANSFER, NOT RENUNCIATION
--   admin_transfer_ownership moves the flag in one transaction and leaves
--   the old owner as a plain admin, the way handing over a group does. It
--   deliberately has no "give up ownership" form: a deployment with no
--   owner has no one who can appoint one back, and recovering that needs
--   the SQL editor.
--
-- The unique index is why the transfer clears the old row before setting
-- the new one. A single UPDATE touching both would trip the index inside
-- the statement -- a unique index built this way cannot be deferred.
--
-- admin_list_users is dropped rather than replaced: it returns a named
-- TABLE(...), and CREATE OR REPLACE cannot change a function's return
-- type. Same trap the bigint comment in 20260826030000 records.

-- ── The column is about ownership, so name it that ────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles'
      AND column_name = 'is_protected'
  ) THEN
    ALTER TABLE public.profiles RENAME COLUMN is_protected TO is_owner;
  END IF;
END $$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_owner boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.is_owner IS
  'The single owner. Role changes and bans are refused for this account. '
  'Moves only via admin_transfer_ownership, or the SQL editor as break-glass.';

-- ── Bootstrap this deployment's owner ─────────────────────────────────
-- One-time, per install, and deliberately NOT done here: this repository
-- is public, and a migration that names the owner's account tells every
-- reader exactly which login to go after. Set the owner once from the SQL
-- editor, where the address never leaves the dashboard:
--
--   update public.profiles set is_owner = true, role = 'admin'
--   where lower(email) = lower('<owner e-mail>');
--
-- Later moves go through admin_transfer_ownership.
UPDATE public.profiles SET is_owner = false WHERE is_owner;

DO $$
DECLARE v_owners int;
BEGIN
  SELECT COUNT(*)::int INTO v_owners FROM public.profiles WHERE is_owner;
  IF v_owners = 0 THEN
    RAISE WARNING
      'No owner was set: no profile matched. Set one with: update public.profiles set is_owner = true, role = ''admin'' where username = ''...'';';
  END IF;
END $$;

-- Enforced, not assumed: at most one row may carry the flag.
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_single_owner
  ON public.profiles ((is_owner)) WHERE is_owner;

-- ── Role changes ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_set_user_role(p_user_id uuid, p_role text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_username text;
  v_old_role text;
  v_owner    boolean;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  IF p_role NOT IN ('player', 'moderator', 'admin') THEN
    RETURN jsonb_build_object('error', 'Invalid role');
  END IF;

  IF p_user_id = auth.uid() THEN
    RETURN jsonb_build_object('error', 'You cannot change your own role');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('admin_role_change'));

  -- Re-read our own role now that we hold the lock. If a concurrent admin
  -- demoted us while we waited, the check above passed on stale data.
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object(
      'error', 'Your admin role changed while this was in flight. Reload and try again.'
    );
  END IF;

  SELECT p.username, p.role, COALESCE(p.is_owner, false)
    INTO v_username, v_old_role, v_owner
  FROM public.profiles p WHERE p.id = p_user_id;

  IF v_username IS NULL THEN
    RETURN jsonb_build_object('error', 'User not found');
  END IF;

  IF v_owner THEN
    RETURN jsonb_build_object(
      'error', format('%s is the owner. Ownership must be transferred, not removed.',
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
CREATE OR REPLACE FUNCTION public.admin_set_user_ban(p_user_id uuid, p_banned boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_username text;
  v_role     text;
  v_owner    boolean;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  IF p_user_id = auth.uid() THEN
    RETURN jsonb_build_object('error', 'You cannot ban your own account');
  END IF;

  SELECT p.username, p.role, COALESCE(p.is_owner, false)
    INTO v_username, v_role, v_owner
  FROM public.profiles p WHERE p.id = p_user_id;

  IF v_username IS NULL THEN
    RETURN jsonb_build_object('error', 'User not found');
  END IF;

  IF p_banned AND v_owner THEN
    RETURN jsonb_build_object(
      'error', format('%s is the owner and cannot be banned.', v_username)
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

-- ── Hand ownership over ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_transfer_ownership(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_is_owner  boolean;
  v_username  text;
  v_banned    boolean;
  v_from      text;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('admin_role_change'));

  SELECT COALESCE(p.is_owner, false), p.username INTO v_is_owner, v_from
  FROM public.profiles p WHERE p.id = auth.uid();

  IF NOT COALESCE(v_is_owner, false) THEN
    RETURN jsonb_build_object('error', 'Only the owner can transfer ownership');
  END IF;

  IF p_user_id = auth.uid() THEN
    RETURN jsonb_build_object('error', 'You already own this platform');
  END IF;

  SELECT p.username, COALESCE(p.is_banned, false) INTO v_username, v_banned
  FROM public.profiles p WHERE p.id = p_user_id;

  IF v_username IS NULL THEN
    RETURN jsonb_build_object('error', 'User not found');
  END IF;

  IF v_banned THEN
    RETURN jsonb_build_object('error', 'Cannot hand ownership to a banned account');
  END IF;

  -- Clear first: the partial unique index is checked within each statement,
  -- so both rows cannot carry the flag even momentarily.
  UPDATE public.profiles SET is_owner = false WHERE id = auth.uid();
  UPDATE public.profiles SET is_owner = true, role = 'admin' WHERE id = p_user_id;

  INSERT INTO public.audit_log (actor_id, action, metadata)
  VALUES (auth.uid(), 'transfer_ownership',
          jsonb_build_object('from_username', v_from,
                             'to_user_id', p_user_id, 'to_username', v_username));

  RETURN jsonb_build_object('success', true, 'owner', v_username);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_transfer_ownership(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_transfer_ownership(uuid) TO authenticated, service_role;

-- ── Surface ownership to the admin table ──────────────────────────────
DROP FUNCTION IF EXISTS public.admin_list_users();

CREATE FUNCTION public.admin_list_users()
RETURNS TABLE(
  id uuid, username text, email text, role text,
  is_banned boolean, is_hidden boolean, is_owner boolean, team_id uuid,
  total_points int, solved_count int, created_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = '' AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  RETURN QUERY
  SELECT
    p.id, p.username, p.email, p.role,
    COALESCE(p.is_banned, false), COALESCE(p.is_hidden, false),
    COALESCE(p.is_owner, false), p.team_id,
    GREATEST(COALESCE(a.total_points, 0) - COALESCE(a.hint_spend, 0), 0)::int,
    COALESCE(a.solved_count, 0)::int,
    p.created_at
  FROM public.profiles p
  LEFT JOIN public.user_score_agg a ON a.user_id = p.id
  ORDER BY COALESCE(p.is_owner, false) DESC,
           GREATEST(COALESCE(a.total_points, 0) - COALESCE(a.hint_spend, 0), 0) DESC,
           p.username ASC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_list_users() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated, service_role;
