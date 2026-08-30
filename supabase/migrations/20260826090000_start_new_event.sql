-- Run a second event on this platform without hand-clearing it.
--
-- THE BUG THIS FIXES FIRST
--   admin_reset_event clears submissions, hint_unlocks and the two score
--   aggregates. It does not touch any freeze state. After an event ends,
--   scoreboard_state() has set freeze_scoreboard = true and stamped
--   auto_froze_at, and frozen_user_score / frozen_team_score hold that
--   event's final standings.
--
--   So resetting after a finished event leaves the next one starting with a
--   frozen scoreboard showing the PREVIOUS event's scores, and with
--   auto_froze_at already set so the end-of-event auto-freeze will not re-arm.
--   Players would see stale standings they cannot explain and the organiser
--   would have no obvious way to clear them. Guaranteed to bite on the second
--   event, which is exactly the thing this platform is meant to support.
--
-- THE MISSING TOOL
--   Starting fresh otherwise means deleting every challenge and every team one
--   row at a time through the UI. At thirty challenges and a thousand teams
--   that is not a workflow, it is an afternoon. There is no bulk path:
--   admin_delete_challenge and admin_delete_team each take a single id.
--
-- DELETE ORDER
--   Dictated by the foreign keys, none of which cascade in the useful
--   direction:
--     submissions -> challenges  (no cascade)  so submissions go first
--     submissions -> teams       (no cascade)  same
--     awards      -> teams       (no cascade)  before teams
--     challenges.unlock_after -> challenges    self-reference, nulled first
--   These DO cascade, so they need no explicit delete:
--     challenge_secrets, challenge_files, hints -> challenges  ON DELETE CASCADE
--     profiles.team_id -> teams                                ON DELETE SET NULL
--
--   Every bare DELETE says WHERE true: pg_safeupdate rejects one without it,
--   inside SECURITY DEFINER functions included. See 20260825300000.

-- ══ 1. Make the existing reset leave a usable board ═══════════════════

CREATE OR REPLACE FUNCTION public.admin_reset_event()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.is_admin() THEN RETURN jsonb_build_object('error', 'Unauthorized'); END IF;

  DELETE FROM public.submissions      WHERE true;
  DELETE FROM public.hint_unlocks     WHERE true;
  DELETE FROM public.user_score_agg   WHERE true;
  DELETE FROM public.team_score_agg   WHERE true;

  -- The part that was missing. Without it the board stays frozen on the
  -- previous event's snapshot.
  DELETE FROM public.frozen_user_score WHERE true;
  DELETE FROM public.frozen_team_score WHERE true;

  UPDATE public.event_settings
  SET freeze_scoreboard = false,
      freeze_time       = NULL,
      auto_froze_at     = NULL,
      hide_scores       = false
  WHERE id = 1;

  INSERT INTO public.audit_log (actor_id, action, metadata)
  VALUES (auth.uid(), 'reset_event', jsonb_build_object('ts', now()));

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ══ 2. Start a fresh event in one call ═══════════════════════════════
--
-- Scores and freeze state always go -- there is no version of "new event"
-- where last event's standings should survive. Challenges, teams and
-- notifications are choices, because the answer differs by organiser: a
-- recurring event may reuse its challenge set, a new one will not.
--
-- User accounts are never touched. They live in auth.users, which this
-- function cannot reach, and keeping them is almost always right -- people
-- return for the next event and expect their login to work. Teams are cleared
-- by default because a team is a per-event thing in a way an account is not.

CREATE OR REPLACE FUNCTION public.admin_start_new_event(
  p_name                text    DEFAULT NULL,
  p_clear_challenges    boolean DEFAULT false,
  p_clear_teams         boolean DEFAULT true,
  p_clear_notifications boolean DEFAULT true
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_subs       int;
  v_challenges int := 0;
  v_teams      int := 0;
  v_notifs     int := 0;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  SELECT COUNT(*)::int INTO v_subs FROM public.submissions;

  -- ── always: scores, progress and freeze state ──
  DELETE FROM public.submissions       WHERE true;
  DELETE FROM public.hint_unlocks      WHERE true;
  DELETE FROM public.user_score_agg    WHERE true;
  DELETE FROM public.team_score_agg    WHERE true;
  DELETE FROM public.frozen_user_score WHERE true;
  DELETE FROM public.frozen_team_score WHERE true;

  -- ── optional: the challenge set ──
  IF p_clear_challenges THEN
    SELECT COUNT(*)::int INTO v_challenges FROM public.challenges;
    -- Break the self-reference before the bulk delete, or the FK blocks it.
    UPDATE public.challenges SET unlock_after = NULL WHERE unlock_after IS NOT NULL;
    -- secrets, files and hints cascade from here.
    DELETE FROM public.challenges WHERE true;
  END IF;

  -- ── optional: teams ──
  IF p_clear_teams THEN
    SELECT COUNT(*)::int INTO v_teams FROM public.teams;
    DELETE FROM public.awards WHERE true;
    -- profiles.team_id is ON DELETE SET NULL, so members are released.
    DELETE FROM public.teams WHERE true;
  END IF;

  -- ── optional: the notice board ──
  IF p_clear_notifications THEN
    SELECT COUNT(*)::int INTO v_notifs FROM public.notifications;
    DELETE FROM public.notifications WHERE true;
  END IF;

  -- ── the event itself, left dormant ──
  -- is_active false and no start/end time, so a freshly reset platform cannot
  -- be live with an empty challenge set while the organiser is still setting
  -- it up. They turn it on deliberately.
  UPDATE public.event_settings
  SET name              = COALESCE(NULLIF(trim(COALESCE(p_name, '')), ''), name),
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
    'name', p_name, 'submissions_cleared', v_subs,
    'challenges_cleared', v_challenges, 'teams_cleared', v_teams,
    'notifications_cleared', v_notifs
  ));

  RETURN jsonb_build_object(
    'success', true,
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
