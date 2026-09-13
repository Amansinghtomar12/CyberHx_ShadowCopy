-- ════════════════════════════════════════════════════════════════════════
-- Fix 1: Clean existing profile data that violates NOT VALID constraints
--
-- profiles_website_safe, profiles_affiliation_safe, profiles_country_safe
-- were added NOT VALID (skips initial table scan), but PostgreSQL still
-- re-validates ALL check constraints on every UPDATE to the row. Any
-- profile whose existing data predates the constraint is now stuck: every
-- UPDATE — profile edit, leave_team, join_team, create_team, admin ban —
-- fails with check_violation, and the raw error leaks the full row
-- (email, role, is_banned, team_id) in PostgreSQL's DETAIL field.
--
-- Fix 2: Wrap every function that UPDATEs profiles in a check_violation
-- handler so a constraint miss never leaks row contents.
--
-- Fix 3: challenges_open() and unlock_hint() now check is_active, closing
-- the gap where hints could be unlocked while the event is configured but
-- not yet activated.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. Data cleanup ─────────────────────────────────────────────────────
-- NULL out values that fail the current constraints. Users can re-enter
-- valid values; these are optional profile fields, not critical data.

UPDATE public.profiles SET website = NULL
WHERE website IS NOT NULL
  AND btrim(website) != ''
  AND NOT (
    length(website) <= 500
    AND website ~* '^https?://([a-z0-9-]+\.)+[a-z]{2,63}(:[0-9]{1,5})?([/?#][^[:space:]]*)?$'
  );

UPDATE public.profiles SET affiliation = NULL
WHERE affiliation IS NOT NULL
  AND btrim(affiliation) != ''
  AND NOT (
    length(affiliation) BETWEEN 2 AND 100
    AND affiliation !~ '[<>{}]'
    AND affiliation !~* '://'
    AND affiliation ~ '[^[:digit:][:punct:][:space:]]'
  );

UPDATE public.profiles SET country = NULL
WHERE country IS NOT NULL
  AND btrim(country) != ''
  AND NOT (
    length(country) <= 60
    AND country !~ '[<>{}0-9]'
    AND country !~* '://'
  );

-- Now that existing data is clean, fully validate so the planner can use
-- the constraints as optimisation hints.
ALTER TABLE public.profiles VALIDATE CONSTRAINT profiles_website_safe;
ALTER TABLE public.profiles VALIDATE CONSTRAINT profiles_affiliation_safe;
ALTER TABLE public.profiles VALIDATE CONSTRAINT profiles_country_safe;

-- ── 2. create_team: catch check_violation on profile UPDATE ─────────────
CREATE OR REPLACE FUNCTION public.create_team(p_name text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_team_id uuid;
  v_event   record;
  v_profile record;
  v_name    text := pg_catalog.btrim(COALESCE(p_name, ''));
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

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
  IF v_event.is_active AND NOT v_event.allow_team_changes
     AND (v_event.start_time IS NULL OR v_event.start_time <= now()) THEN
    RETURN jsonb_build_object('error', 'Team changes locked during event');
  END IF;

  IF length(v_name) < 2 OR length(v_name) > 40 THEN
    RETURN jsonb_build_object('error', 'Team name must be 2 to 40 characters.');
  END IF;
  IF v_name ~ '[[:cntrl:]]' OR v_name ~ '[<>{}]' THEN
    RETURN jsonb_build_object('error', 'Team name cannot contain < > { } or control characters.');
  END IF;

  BEGIN
    INSERT INTO public.teams (name, captain_id)
    VALUES (v_name, auth.uid())
    RETURNING id INTO v_team_id;
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object('error', 'That team name is already taken');
    WHEN check_violation OR not_null_violation THEN
      RETURN jsonb_build_object('error', 'Team name must be 2 to 40 printable characters.');
  END;

  BEGIN
    UPDATE public.profiles SET team_id = v_team_id WHERE id = auth.uid();
  EXCEPTION WHEN check_violation THEN
    RETURN jsonb_build_object('error',
      'Your profile contains invalid data. Please update your profile (website, affiliation, or country) and try again.');
  END;

  RETURN jsonb_build_object('team_id', v_team_id);
END;
$$;

-- ── 3. join_team: catch check_violation on profile UPDATE ───────────────
CREATE OR REPLACE FUNCTION public.join_team(p_invite_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_team         record;
  v_event        record;
  v_profile      record;
  v_member_count int;
  v_code         text := pg_catalog.lower(pg_catalog.btrim(COALESCE(p_invite_code, '')));
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('team-membership:' || auth.uid()::text, 0));

  BEGIN
    PERFORM public.check_rate_limit('join_team', auth.uid()::text, 60, 10);
  EXCEPTION WHEN check_violation THEN
    RETURN jsonb_build_object('error', 'Too many attempts. Wait a minute and try again.');
  END;

  SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();
  IF v_profile IS NULL OR v_profile.is_banned THEN
    RETURN jsonb_build_object('error', 'Account not found or banned');
  END IF;
  IF v_profile.team_id IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'Already in a team');
  END IF;

  SELECT * INTO v_event FROM public.event_settings WHERE id = 1;
  IF v_event.is_active AND NOT v_event.allow_team_changes
     AND (v_event.start_time IS NULL OR v_event.start_time <= now()) THEN
    RETURN jsonb_build_object('error', 'Team changes locked during event');
  END IF;

  IF v_code = '' THEN
    RETURN jsonb_build_object('error', 'Invalid invite code');
  END IF;

  SELECT * INTO v_team FROM public.teams
  WHERE invite_code = v_code FOR UPDATE;

  IF v_team IS NULL THEN
    RETURN jsonb_build_object('error', 'Invalid invite code');
  END IF;
  IF v_team.is_banned THEN
    RETURN jsonb_build_object('error', 'Team is banned');
  END IF;

  SELECT COUNT(*) INTO v_member_count
  FROM public.profiles WHERE team_id = v_team.id;

  IF v_member_count >= COALESCE(v_event.team_size, 4) THEN
    RETURN jsonb_build_object('error', 'Team is full');
  END IF;

  BEGIN
    UPDATE public.profiles SET team_id = v_team.id WHERE id = auth.uid();
  EXCEPTION WHEN check_violation THEN
    RETURN jsonb_build_object('error',
      'Your profile contains invalid data. Please update your profile (website, affiliation, or country) and try again.');
  END;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ── 4. leave_team: catch check_violation on profile UPDATE ──────────────
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
  IF v_event.is_active AND NOT v_event.allow_team_changes
     AND (v_event.start_time IS NULL OR v_event.start_time <= now()) THEN
    RETURN jsonb_build_object('error', 'Team changes locked during event');
  END IF;

  BEGIN
    UPDATE public.profiles SET team_id = NULL WHERE id = auth.uid();
  EXCEPTION WHEN check_violation THEN
    RETURN jsonb_build_object('error',
      'Your profile contains invalid data. Please update your profile (website, affiliation, or country) and try again.');
  END;

  PERFORM 1 FROM public.teams WHERE id = v_team_id FOR UPDATE;

  UPDATE public.teams t
  SET captain_id = (SELECT p.id FROM public.profiles p
                    WHERE p.team_id = v_team_id
                    ORDER BY p.created_at ASC, p.id ASC LIMIT 1)
  WHERE t.id = v_team_id AND t.captain_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.profiles WHERE team_id = v_team_id);

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE team_id = v_team_id)
     AND NOT EXISTS (SELECT 1 FROM public.submissions WHERE team_id = v_team_id)
     AND NOT EXISTS (SELECT 1 FROM public.awards WHERE team_id = v_team_id)
  THEN
    DELETE FROM public.teams WHERE id = v_team_id;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ── 5. admin_delete_team: catch check_violation on bulk profile UPDATE ──
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

  BEGIN
    UPDATE public.profiles SET team_id = NULL WHERE team_id = p_team_id;
    GET DIAGNOSTICS v_members = ROW_COUNT;
  EXCEPTION WHEN check_violation THEN
    RETURN jsonb_build_object('error',
      'A team member has invalid profile data that must be fixed first. Clean up the member profiles, then retry.');
  END;

  UPDATE public.submissions SET team_id = NULL WHERE team_id = p_team_id;
  UPDATE public.awards      SET team_id = NULL WHERE team_id = p_team_id;

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
GRANT  EXECUTE ON FUNCTION public.admin_delete_team(uuid) TO authenticated, service_role;

-- ── 6. admin_set_user_ban: catch check_violation ────────────────────────
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

  PERFORM pg_advisory_xact_lock(hashtext('admin_role_change'));

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

  BEGIN
    UPDATE public.profiles SET is_banned = p_banned WHERE id = p_user_id;
  EXCEPTION WHEN check_violation THEN
    RETURN jsonb_build_object('error',
      format('Cannot update %s: their profile contains invalid data that must be fixed first.', v_username));
  END;

  INSERT INTO public.audit_log (actor_id, action, metadata)
  VALUES (
    auth.uid(),
    CASE WHEN p_banned THEN 'ban_user' ELSE 'unban_user' END,
    jsonb_build_object('user_id', p_user_id, 'username', v_username, 'role', v_role)
  );

  RETURN jsonb_build_object('success', true, 'username', v_username, 'is_banned', p_banned);
END;
$$;

-- ── 7. admin_set_user_role: catch check_violation ───────────────────────
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

  BEGIN
    UPDATE public.profiles SET role = p_role WHERE id = p_user_id;
  EXCEPTION WHEN check_violation THEN
    RETURN jsonb_build_object('error',
      format('Cannot update %s: their profile contains invalid data that must be fixed first.', v_username));
  END;

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

-- ── 8. challenges_open: add is_active check ─────────────────────────────
-- submit_flag_tx checks is_active but challenges_open() did not, so
-- challenges were visible (and hints unlockable) when the event was
-- configured but not yet activated.
CREATE OR REPLACE FUNCTION public.challenges_open()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.is_admin()
      OR (
        COALESCE((SELECT es.is_active FROM public.event_settings es WHERE es.id = 1), false)
        AND NOT COALESCE((SELECT es.is_paused FROM public.event_settings es WHERE es.id = 1), false)
        AND COALESCE((SELECT es.start_time <= now() FROM public.event_settings es WHERE es.id = 1), true)
      );
$$;
REVOKE EXECUTE ON FUNCTION public.challenges_open() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.challenges_open() TO anon, authenticated, service_role;

-- ── 9. unlock_hint: add is_active check ─────────────────────────────────
-- The only change from the 20260913000000 version: SELECT now includes
-- e.is_active, and a new guard rejects hints when the event is inactive.
CREATE OR REPLACE FUNCTION public.unlock_hint(p_hint_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_hint     record;
  v_visible  boolean;
  v_team     uuid;
  v_balance  int;
  v_inserted uuid;
  v_event    record;
  v_found    boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  BEGIN
    PERFORM public.check_rate_limit('unlock_hint', auth.uid()::text, 60, 30);
  EXCEPTION WHEN check_violation THEN
    RETURN jsonb_build_object('error', 'Too many hint requests. Wait a minute and try again.');
  END;

  SELECT p.team_id INTO v_team
  FROM public.profiles p
  WHERE p.id = auth.uid() AND COALESCE(p.is_banned, false) = false;

  GET DIAGNOSTICS v_found = ROW_COUNT;
  IF NOT v_found THEN
    RETURN jsonb_build_object('error', 'Account not found or banned');
  END IF;

  IF v_team IS NULL THEN
    RETURN jsonb_build_object(
      'error', 'Create or join a team before unlocking hints. Playing solo is fine — make a team of one.'
    );
  END IF;

  IF NOT public.is_admin() AND EXISTS (
    SELECT 1 FROM public.teams t WHERE t.id = v_team AND COALESCE(t.is_banned, false)
  ) THEN
    RETURN jsonb_build_object('error', 'Your team has been removed from the competition.');
  END IF;

  IF NOT public.is_admin() AND public.play_allowlist_blocks(auth.uid()) THEN
    RETURN jsonb_build_object('error', 'Your email is not on the registration list to play this event');
  END IF;

  SELECT e.is_active, e.start_time, e.end_time, e.is_paused INTO v_event
  FROM public.event_settings e WHERE e.id = 1;

  IF NOT public.is_admin() THEN
    IF NOT COALESCE(v_event.is_active, false) THEN
      RETURN jsonb_build_object('error', 'Event not active');
    END IF;
    IF COALESCE(v_event.is_paused, false) THEN
      RETURN jsonb_build_object('error', 'The event is paused.');
    END IF;
    IF v_event.start_time IS NOT NULL AND now() < v_event.start_time THEN
      RETURN jsonb_build_object('error', 'The event has not started yet.');
    END IF;
    IF v_event.end_time IS NOT NULL AND now() > v_event.end_time THEN
      RETURN jsonb_build_object('error', 'The event has ended.');
    END IF;
  END IF;

  SELECT * INTO v_hint FROM public.hints h WHERE h.id = p_hint_id;
  IF v_hint IS NULL THEN
    RETURN jsonb_build_object('error', 'Hint not found');
  END IF;

  SELECT c.is_visible INTO v_visible
  FROM public.challenges c WHERE c.id = v_hint.challenge_id;

  IF v_visible IS NOT TRUE AND NOT public.is_admin() THEN
    RETURN jsonb_build_object('error', 'Hint not found');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.hint_unlocks hu
    WHERE hu.user_id = auth.uid() AND hu.hint_id = p_hint_id
  ) THEN
    RETURN jsonb_build_object('success', true, 'text', v_hint.content);
  END IF;

  INSERT INTO public.user_score_agg (user_id, total_points, solved_count, hint_spend)
  VALUES (auth.uid(), 0, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT GREATEST(COALESCE(a.total_points, 0) - COALESCE(a.hint_spend, 0), 0)
    INTO v_balance
  FROM public.user_score_agg a
  WHERE a.user_id = auth.uid()
  FOR UPDATE;

  v_balance := COALESCE(v_balance, 0);

  IF v_hint.cost > v_balance THEN
    RETURN jsonb_build_object(
      'error', format('Not enough points. This hint costs %s, you have %s.',
                      v_hint.cost, v_balance)
    );
  END IF;

  INSERT INTO public.hint_unlocks (user_id, hint_id)
  VALUES (auth.uid(), p_hint_id)
  ON CONFLICT (user_id, hint_id) DO NOTHING
  RETURNING id INTO v_inserted;

  IF v_inserted IS NOT NULL AND v_hint.cost > 0 THEN
    UPDATE public.user_score_agg
      SET hint_spend = hint_spend + v_hint.cost
      WHERE user_id = auth.uid();

    INSERT INTO public.team_score_agg (team_id, total_points, solved_count, hint_spend)
    VALUES (v_team, 0, 0, v_hint.cost)
    ON CONFLICT (team_id) DO UPDATE
      SET hint_spend = public.team_score_agg.hint_spend + v_hint.cost;
  END IF;

  RETURN jsonb_build_object('success', true, 'text', v_hint.content);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.unlock_hint(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.unlock_hint(uuid) TO authenticated, service_role;
