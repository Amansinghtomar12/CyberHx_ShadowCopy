-- ════════════════════════════════════════════════════════════════════════
-- Team creation: no hourly cap; empty teams are removed on leave
--
-- create_team charged "5 per hour" on every call, before any validation, so
-- a player retrying a taken name locked themselves out of creating a team
-- for an hour. The cap is removed. What bounds team creation instead is
-- structural: an account can hold one team at a time, and a team whose
-- last member leaves is deleted, so a create/leave loop leaves nothing
-- behind and cannot squat names or fill the board with ghost teams.
--
-- A team that has submissions or awards is never deleted here (those rows
-- reference teams without cascade); it simply stays, empty, for the
-- organisers to handle with admin_delete_team.
-- ════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.create_team(p_name text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_team_id uuid;
  v_event   record;
  v_profile record;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  -- One membership decision at a time per actor: stops a teamless account
  -- from creating several ghost teams (or create+join) concurrently.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('team-membership:' || auth.uid()::text, 0));

  SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();
  IF v_profile IS NULL OR v_profile.is_banned THEN
    RETURN jsonb_build_object('error', 'Account not found or banned');
  END IF;
  IF v_profile.team_id IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'Already in a team');
  END IF;

  SELECT * INTO v_event FROM public.event_settings WHERE id = 1;
  IF v_event.is_active AND NOT v_event.allow_team_changes THEN
    RETURN jsonb_build_object('error', 'Team changes locked during event');
  END IF;

  BEGIN
    INSERT INTO public.teams (name, captain_id)
    VALUES (trim(p_name), auth.uid())
    RETURNING id INTO v_team_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('error', 'That team name is already taken');
  END;

  UPDATE public.profiles SET team_id = v_team_id WHERE id = auth.uid();
  RETURN jsonb_build_object('team_id', v_team_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.leave_team()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_profile record;
  v_event   record;
  v_team_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('team-membership:' || auth.uid()::text, 0));

  SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();
  IF v_profile IS NULL OR v_profile.team_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Not in a team');
  END IF;
  v_team_id := v_profile.team_id;

  SELECT * INTO v_event FROM public.event_settings WHERE id = 1;
  IF v_event.is_active AND NOT v_event.allow_team_changes THEN
    RETURN jsonb_build_object('error', 'Team changes locked during event');
  END IF;

  UPDATE public.profiles SET team_id = NULL WHERE id = auth.uid();

  -- Lock the team row so two members leaving at once cannot both see the
  -- other as still present, or both decide to delete.
  PERFORM 1 FROM public.teams WHERE id = v_team_id FOR UPDATE;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE team_id = v_team_id)
     AND NOT EXISTS (SELECT 1 FROM public.submissions WHERE team_id = v_team_id)
     AND NOT EXISTS (SELECT 1 FROM public.awards WHERE team_id = v_team_id)
  THEN
    DELETE FROM public.teams WHERE id = v_team_id;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_team(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.leave_team() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_team(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.leave_team() TO authenticated, service_role;
