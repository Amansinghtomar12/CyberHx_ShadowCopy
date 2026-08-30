-- Require a name when starting a new event.
--
-- admin_start_new_event took p_name as optional and fell back to the current
-- name when it was blank. That reads as a convenience and behaves as a trap:
-- clear every challenge, team and score, and the "new" event is still called
-- whatever the finished one was called. The organiser then has a fresh event
-- announcing itself as the old one, on the scoreboard and in the sidebar, and
-- nothing in the flow points at why.
--
-- Naming the thing you are creating is not a burden worth optimising away.
-- Blank is now an error rather than a silent inherit. The check is here as
-- well as in the form because the RPC is callable directly.

CREATE OR REPLACE FUNCTION public.admin_start_new_event(
  p_name                text    DEFAULT NULL,
  p_clear_challenges    boolean DEFAULT false,
  p_clear_teams         boolean DEFAULT true,
  p_clear_notifications boolean DEFAULT true
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_name       text;
  v_subs       int;
  v_challenges int := 0;
  v_teams      int := 0;
  v_notifs     int := 0;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  v_name := trim(COALESCE(p_name, ''));

  IF v_name = '' THEN
    RETURN jsonb_build_object('error', 'Event name is required');
  END IF;

  -- Same bounds the event_settings.name column and the admin form imply.
  IF length(v_name) > 80 THEN
    RETURN jsonb_build_object('error', 'Event name must be 80 characters or fewer');
  END IF;

  SELECT COUNT(*)::int INTO v_subs FROM public.submissions;

  DELETE FROM public.submissions       WHERE true;
  DELETE FROM public.hint_unlocks      WHERE true;
  DELETE FROM public.user_score_agg    WHERE true;
  DELETE FROM public.team_score_agg    WHERE true;
  DELETE FROM public.frozen_user_score WHERE true;
  DELETE FROM public.frozen_team_score WHERE true;

  IF p_clear_challenges THEN
    SELECT COUNT(*)::int INTO v_challenges FROM public.challenges;
    UPDATE public.challenges SET unlock_after = NULL WHERE unlock_after IS NOT NULL;
    DELETE FROM public.challenges WHERE true;
  END IF;

  IF p_clear_teams THEN
    SELECT COUNT(*)::int INTO v_teams FROM public.teams;
    DELETE FROM public.awards WHERE true;
    DELETE FROM public.teams  WHERE true;
  END IF;

  IF p_clear_notifications THEN
    SELECT COUNT(*)::int INTO v_notifs FROM public.notifications;
    DELETE FROM public.notifications WHERE true;
  END IF;

  UPDATE public.event_settings
  SET name              = v_name,
      is_active         = false,
      start_time        = NULL,
      end_time          = NULL,
      freeze_scoreboard = false,
      freeze_time       = NULL,
      auto_froze_at     = NULL,
      hide_scores       = false
  WHERE id = 1;

  INSERT INTO public.audit_log (actor_id, action, metadata)
  VALUES (auth.uid(), 'start_new_event', jsonb_build_object(
    'name', v_name, 'submissions_cleared', v_subs,
    'challenges_cleared', v_challenges, 'teams_cleared', v_teams,
    'notifications_cleared', v_notifs
  ));

  RETURN jsonb_build_object(
    'success', true,
    'name', v_name,
    'submissions_cleared', v_subs,
    'challenges_cleared', v_challenges,
    'teams_cleared', v_teams,
    'notifications_cleared', v_notifs,
    'users_kept', (SELECT COUNT(*)::int FROM public.profiles)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_start_new_event(text, boolean, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_start_new_event(text, boolean, boolean, boolean) TO authenticated, service_role;
