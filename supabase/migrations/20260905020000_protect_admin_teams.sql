-- A team with an admin on it is protected the way the admin is.
--
-- An admin account cannot be banned while it is an admin (20260825290000).
-- The team that admin plays on could still be banned or deleted, which took
-- the admin's own membership, solves and standing with it, by any other
-- admin, in one click. The owner's team included. Settle it the same way:
-- while a team includes an admin, it cannot be banned or deleted. Demote the
-- admin first, then act, so the removal is a deliberate two-step with an
-- audit entry for each. Unbanning stays open.

CREATE OR REPLACE FUNCTION public.admin_set_team_ban(p_team_id uuid, p_banned boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_name  text;
  v_owner boolean;
  v_admin boolean;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  SELECT t.name INTO v_name FROM public.teams t WHERE t.id = p_team_id;
  IF v_name IS NULL THEN
    RETURN jsonb_build_object('error', 'Team not found');
  END IF;

  IF COALESCE(p_banned, false) THEN
    SELECT bool_or(p.is_owner), bool_or(p.role = 'admin')
      INTO v_owner, v_admin
    FROM public.profiles p WHERE p.team_id = p_team_id;
    IF COALESCE(v_owner, false) THEN
      RETURN jsonb_build_object('error', 'This team includes the owner and cannot be banned.');
    END IF;
    IF COALESCE(v_admin, false) THEN
      RETURN jsonb_build_object('error', 'This team includes an admin. Change their role to player first.');
    END IF;
  END IF;

  UPDATE public.teams SET is_banned = COALESCE(p_banned, false) WHERE id = p_team_id;

  INSERT INTO public.audit_log (actor_id, action, metadata)
  VALUES (auth.uid(), CASE WHEN p_banned THEN 'ban_team' ELSE 'unban_team' END,
          jsonb_build_object('team_id', p_team_id, 'team_name', v_name));

  RETURN jsonb_build_object('success', true, 'name', v_name);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_set_team_ban(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_team_ban(uuid, boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_delete_team(p_team_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_name    text;
  v_members int;
  v_owner   boolean;
  v_admin   boolean;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  SELECT t.name INTO v_name FROM public.teams t WHERE t.id = p_team_id;
  IF v_name IS NULL THEN
    RETURN jsonb_build_object('error', 'Team not found');
  END IF;

  SELECT bool_or(p.is_owner), bool_or(p.role = 'admin')
    INTO v_owner, v_admin
  FROM public.profiles p WHERE p.team_id = p_team_id;
  IF COALESCE(v_owner, false) THEN
    RETURN jsonb_build_object('error', 'This team includes the owner and cannot be deleted.');
  END IF;
  IF COALESCE(v_admin, false) THEN
    RETURN jsonb_build_object('error', 'This team includes an admin. Change their role to player first.');
  END IF;

  -- One transaction, so members are never orphaned by a half-done delete.
  UPDATE public.profiles SET team_id = NULL WHERE team_id = p_team_id;
  GET DIAGNOSTICS v_members = ROW_COUNT;

  -- submissions.team_id references teams and has no cascade, so the delete
  -- below would fail on any team that ever scored. Detach those rows; the
  -- per-user solve record is what matters once the team is gone.
  UPDATE public.submissions SET team_id = NULL WHERE team_id = p_team_id;

  DELETE FROM public.team_score_agg WHERE team_id = p_team_id;
  DELETE FROM public.teams WHERE id = p_team_id;

  INSERT INTO public.audit_log (actor_id, action, metadata)
  VALUES (auth.uid(), 'delete_team',
          jsonb_build_object('team_id', p_team_id, 'team_name', v_name,
                             'members_released', v_members));

  RETURN jsonb_build_object('success', true, 'name', v_name, 'members_released', v_members);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_delete_team(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_team(uuid) TO authenticated, service_role;
