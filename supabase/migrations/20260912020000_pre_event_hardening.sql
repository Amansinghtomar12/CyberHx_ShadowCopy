-- ════════════════════════════════════════════════════════════════════════
-- Pre-event hardening (final review, 12 Sep 2026)
--
-- 1. Challenges open at start_time. public_challenges no longer shows briefs,
--    attachments or connection info before the event starts; admins see
--    everything. Offline-solvable challenges cannot be worked in advance.
-- 2. Solve data honours the scoreboard. get_solve_data and
--    get_challenge_solvers return nothing while the board is hidden and only
--    pre-freeze solves while it is frozen, matching every other read path.
-- 3. A captain who leaves hands the team to its longest-standing member.
-- 4. Team changes lock at start_time, not at "Event Active". Rosters stay
--    editable during the countdown with "Allow Team Changes" already off.
-- 5. The automatic end-of-event freeze does not fire during a pause, and an
--    unfreeze after end_time is final rather than re-frozen 15 s later.
-- 6. public_teams is no longer readable logged out; team_scores is the
--    public board. teams.website/name get the same content checks profiles
--    have. Only static flags can be saved (the regex path has no pattern).
-- 7. Allowlist matching tolerates +tags and Gmail dots on either side.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. Challenges open at start_time ─────────────────────────────────────
CREATE OR REPLACE VIEW public.public_challenges AS
SELECT
  c.id, c.title, c.category, c.difficulty, c.description,
  c.flag_type, c.points_type, c.points, c.initial_points,
  c.minimum_points, c.decay, c.is_visible, c.max_attempts,
  c.unlock_after, c.author, c.tags, c.connection_info, c.created_at
FROM public.challenges c
WHERE c.is_visible = true
  AND (
    public.is_admin()
    OR (
      NOT COALESCE((SELECT es.is_paused FROM public.event_settings es WHERE es.id = 1), false)
      AND COALESCE((SELECT es.start_time <= now() FROM public.event_settings es WHERE es.id = 1), true)
    )
  );

-- ── 2. Solve data honours hidden / frozen ────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_solve_data()
RETURNS TABLE(challenge_id uuid, solve_count bigint, first_blood_username text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_cutoff timestamptz;
BEGIN
  IF public.scoreboard_is_hidden() THEN RETURN; END IF;
  IF public.scoreboard_is_masked() THEN
    SELECT e.freeze_time INTO v_cutoff FROM public.event_settings e WHERE e.id = 1;
  END IF;
  RETURN QUERY
  SELECT
    s.challenge_id,
    COUNT(*) AS solve_count,
    (SELECT p.username
       FROM public.submissions s2
       JOIN public.profiles p ON p.id = s2.user_id
      WHERE s2.challenge_id = s.challenge_id
        AND s2.is_correct = true
        AND p.is_banned = false
        AND (v_cutoff IS NULL OR s2.submitted_at <= v_cutoff)
      ORDER BY s2.submitted_at ASC
      LIMIT 1) AS first_blood_username
  FROM public.submissions s
  WHERE s.is_correct = true
    AND (v_cutoff IS NULL OR s.submitted_at <= v_cutoff)
  GROUP BY s.challenge_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_challenge_solvers(p_challenge_id uuid)
RETURNS TABLE(username text, submitted_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = '' AS $$
DECLARE
  v_cutoff timestamptz;
BEGIN
  IF public.scoreboard_is_hidden() THEN RETURN; END IF;
  IF public.scoreboard_is_masked() THEN
    SELECT e.freeze_time INTO v_cutoff FROM public.event_settings e WHERE e.id = 1;
  END IF;
  RETURN QUERY
  SELECT DISTINCT ON (s.user_id) p.username, s.submitted_at
  FROM public.submissions s JOIN public.profiles p ON p.id = s.user_id
  WHERE s.challenge_id = p_challenge_id AND s.is_correct = true
    AND p.is_banned = false AND p.is_hidden = false
    AND (v_cutoff IS NULL OR s.submitted_at <= v_cutoff)
  ORDER BY s.user_id, s.submitted_at ASC;
END;
$$;

-- ── 3 + 4. Team membership: lock at start_time, captain hand-over ────────
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
  IF v_event.is_active AND NOT v_event.allow_team_changes
     AND (v_event.start_time IS NULL OR v_event.start_time <= now()) THEN
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

CREATE OR REPLACE FUNCTION public.join_team(p_invite_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_team         record;
  v_event        record;
  v_profile      record;
  v_member_count int;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  -- Same membership lock as create_team: serialise this actor's join/create.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('team-membership:' || auth.uid()::text, 0));

  -- 10 join attempts per minute defeats invite-code brute forcing while
  -- leaving room for a real user mistyping.
  PERFORM public.check_rate_limit('join_team', auth.uid()::text, 60, 10);

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

  SELECT * INTO v_team FROM public.teams
  WHERE invite_code = trim(p_invite_code) FOR UPDATE;

  IF v_team IS NULL THEN
    RETURN jsonb_build_object('error', 'Invalid invite code');
  END IF;
  IF v_team.is_banned THEN
    RETURN jsonb_build_object('error', 'Team is banned');
  END IF;

  SELECT COUNT(*) INTO v_member_count
  FROM public.profiles WHERE team_id = v_team.id;

  IF v_member_count >= v_event.team_size THEN
    RETURN jsonb_build_object('error', 'Team is full');
  END IF;

  UPDATE public.profiles SET team_id = v_team.id WHERE id = auth.uid();
  RETURN jsonb_build_object('success', true);
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
  IF v_event.is_active AND NOT v_event.allow_team_changes
     AND (v_event.start_time IS NULL OR v_event.start_time <= now()) THEN
    RETURN jsonb_build_object('error', 'Team changes locked during event');
  END IF;

  UPDATE public.profiles SET team_id = NULL WHERE id = auth.uid();

  -- Lock the team row so two members leaving at once cannot both see the
  -- other as still present, or both decide to delete.
  PERFORM 1 FROM public.teams WHERE id = v_team_id FOR UPDATE;

  -- A captain who walks out hands the team to its longest-standing member,
  -- so the people left behind keep a captain and the leaver keeps nothing.
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

-- ── 5. Freeze behaviour around pause and end ─────────────────────────────
CREATE OR REPLACE FUNCTION public.scoreboard_state()
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  e       record;
  v_admin boolean;
  v_ended boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO e FROM public.event_settings WHERE id = 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('frozen', false, 'hidden', false, 'ended', false, 'paused', false);
  END IF;

  v_ended := e.end_time IS NOT NULL AND now() > e.end_time;

  -- Freeze once, the first time anybody looks after the event has closed.
  -- The advisory lock serialises the herd; the re-read under FOR UPDATE means
  -- only one transaction sees the pre-freeze state and does the work.
  IF v_ended
     AND NOT COALESCE(e.is_paused, false)
     AND NOT COALESCE(e.freeze_scoreboard, false)
     AND e.auto_froze_at IS NULL
  THEN
    PERFORM pg_advisory_xact_lock(hashtext('scoreboard_auto_freeze'));

    SELECT * INTO e FROM public.event_settings WHERE id = 1 FOR UPDATE;

    IF NOT COALESCE(e.freeze_scoreboard, false) AND e.auto_froze_at IS NULL THEN
      -- Setting the flag is enough: on_freeze_toggle stamps freeze_time and
      -- takes the snapshot, exactly as a manual freeze does.
      UPDATE public.event_settings
      SET freeze_scoreboard = true,
          auto_froze_at     = now()
      WHERE id = 1;

      INSERT INTO public.audit_log (actor_id, action, metadata)
      VALUES (NULL, 'auto_freeze_scoreboard',
              jsonb_build_object('reason', 'event ended', 'end_time', e.end_time));

      SELECT * INTO e FROM public.event_settings WHERE id = 1;
    END IF;
  END IF;

  v_admin := public.is_admin();

  RETURN jsonb_build_object(
    'frozen',      COALESCE(e.freeze_scoreboard, false),
    'freeze_time', e.freeze_time,
    'hidden',      COALESCE(e.hide_scores, false),
    'ended',       v_ended,
    'is_admin',    v_admin,
    'paused',      COALESCE(e.is_paused, false),
    'paused_at',   e.paused_at,
    'pause_message', e.pause_message,
    -- What the caller will actually experience, so the client never has to
    -- re-derive the admin exemption and get it subtly wrong.
    'masked',        (NOT v_admin) AND COALESCE(e.freeze_scoreboard, false),
    'scores_hidden', (NOT v_admin) AND COALESCE(e.hide_scores, false)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_scoreboard_freeze(p_frozen boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_at    timestamptz;
  v_teams int;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  UPDATE public.event_settings
  SET freeze_scoreboard = p_frozen,
      auto_froze_at = CASE
        WHEN NOT p_frozen AND end_time IS NOT NULL AND now() >= end_time
          THEN COALESCE(auto_froze_at, now())
        ELSE auto_froze_at END
  WHERE id = 1;

  SELECT e.freeze_time INTO v_at FROM public.event_settings e WHERE e.id = 1;
  SELECT COUNT(*)::int INTO v_teams FROM public.frozen_team_score;

  INSERT INTO public.audit_log (actor_id, action, metadata)
  VALUES (
    auth.uid(),
    CASE WHEN p_frozen THEN 'freeze_scoreboard' ELSE 'unfreeze_scoreboard' END,
    jsonb_build_object('frozen', p_frozen, 'freeze_time', v_at, 'teams_captured', v_teams)
  );

  RETURN jsonb_build_object(
    'success', true, 'frozen', p_frozen,
    'freeze_time', v_at, 'teams_captured', v_teams
  );
END;
$$;

-- ── 6. Public surface and content checks ─────────────────────────────────
REVOKE SELECT ON public.public_teams FROM anon;

ALTER TABLE public.teams DROP CONSTRAINT IF EXISTS teams_website_safe;
ALTER TABLE public.teams
  ADD CONSTRAINT teams_website_safe
  CHECK (
    website IS NULL
    OR btrim(website) = ''
    OR (
      length(website) <= 500
      AND website ~* '^https?://([a-z0-9-]+\.)+[a-z]{2,63}(:[0-9]{1,5})?([/?#][^[:space:]]*)?$'
    )
  ) NOT VALID;

ALTER TABLE public.teams DROP CONSTRAINT IF EXISTS teams_name_printable;
ALTER TABLE public.teams
  ADD CONSTRAINT teams_name_printable
  CHECK (btrim(name) <> '' AND name !~ '[[:cntrl:]]' AND name !~ '[<>{}]')
  NOT VALID;

CREATE OR REPLACE FUNCTION public.admin_upsert_challenge(
  p_id uuid DEFAULT NULL, p_title text DEFAULT NULL, p_category text DEFAULT NULL,
  p_difficulty text DEFAULT NULL, p_description text DEFAULT NULL, p_flag text DEFAULT NULL,
  p_flag_type text DEFAULT 'static', p_points int DEFAULT 100, p_max_attempts int DEFAULT 0,
  p_author text DEFAULT 'CyberHX Team', p_tags text[] DEFAULT '{}',
  p_is_visible boolean DEFAULT false, p_connection_info text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_challenge_id uuid;
  v_flag_hash    text;
  v_flag         text;
BEGIN
  IF NOT public.is_admin() THEN RETURN jsonb_build_object('error', 'Unauthorized'); END IF;
  IF COALESCE(p_flag_type, 'static') <> 'static' THEN
    RETURN jsonb_build_object('error', 'Only static flags are supported');
  END IF;
  p_flag_type := 'static';

  v_flag := trim(COALESCE(p_flag, ''));

  IF v_flag = '[HASHED — re-enter flag to change]'
     OR v_flag ~ '^\[HASHED' THEN
    v_flag := '';
  END IF;

  IF v_flag <> '' THEN
    v_flag_hash := encode(pg_catalog.sha256(pg_catalog.convert_to(v_flag, 'UTF8')), 'hex');
  END IF;

  IF p_id IS NOT NULL THEN
    UPDATE public.challenges SET
      title = COALESCE(p_title, title), category = COALESCE(p_category, category),
      difficulty = COALESCE(p_difficulty, difficulty), description = COALESCE(p_description, description),
      points = COALESCE(p_points, points), max_attempts = COALESCE(p_max_attempts, max_attempts),
      author = COALESCE(p_author, author), tags = COALESCE(p_tags, tags),
      is_visible = COALESCE(p_is_visible, is_visible), connection_info = p_connection_info
    WHERE id = p_id;
    v_challenge_id := p_id;

    IF v_flag_hash IS NOT NULL THEN
      INSERT INTO public.challenge_secrets (challenge_id, flag_hash, flag_type)
      VALUES (v_challenge_id, v_flag_hash, p_flag_type)
      ON CONFLICT (challenge_id) DO UPDATE SET flag_hash = v_flag_hash, flag_type = p_flag_type;

      INSERT INTO public.challenge_flag_vault (challenge_id, flag, updated_by)
      VALUES (v_challenge_id, v_flag, auth.uid())
      ON CONFLICT (challenge_id) DO UPDATE
        SET flag = v_flag, updated_at = now(), updated_by = auth.uid();
    END IF;
  ELSE
    IF v_flag = '' THEN
      RETURN jsonb_build_object('error', 'Flag is required for new challenges');
    END IF;
    INSERT INTO public.challenges (title, category, difficulty, description, points,
      max_attempts, author, tags, is_visible, connection_info)
    VALUES (p_title, p_category, p_difficulty, p_description, p_points,
      p_max_attempts, p_author, p_tags, p_is_visible, p_connection_info)
    RETURNING id INTO v_challenge_id;

    INSERT INTO public.challenge_secrets (challenge_id, flag_hash, flag_type)
    VALUES (v_challenge_id, v_flag_hash, p_flag_type);

    INSERT INTO public.challenge_flag_vault (challenge_id, flag, updated_by)
    VALUES (v_challenge_id, v_flag, auth.uid());
  END IF;

  RETURN jsonb_build_object('challenge_id', v_challenge_id);
END;
$$;

-- ── 7. Allowlist matching tolerant of +tags and Gmail dots ───────────────
CREATE OR REPLACE FUNCTION public.normalize_play_email(p_email text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path = '' AS $$
  SELECT CASE
    WHEN split_part(lower(btrim(p_email)), '@', 2) IN ('gmail.com', 'googlemail.com')
      THEN replace(split_part(split_part(lower(btrim(p_email)), '@', 1), '+', 1), '.', '') || '@gmail.com'
    ELSE split_part(split_part(lower(btrim(p_email)), '@', 1), '+', 1)
         || '@' || split_part(lower(btrim(p_email)), '@', 2)
  END
$$;
REVOKE EXECUTE ON FUNCTION public.normalize_play_email(text) FROM PUBLIC, anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_registration_allowlist_norm
  ON public.registration_allowlist (public.normalize_play_email(email));

CREATE OR REPLACE FUNCTION public.play_allowlist_blocks(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT COALESCE(
           (SELECT es.registration_allowlist_only FROM public.event_settings es WHERE es.id = 1),
           false)
     AND NOT EXISTS (
       SELECT 1
       FROM public.registration_allowlist a
       JOIN public.profiles p ON p.id = p_user_id
       WHERE a.email = lower(btrim(p.email))
          OR public.normalize_play_email(a.email) = public.normalize_play_email(p.email));
$$;
REVOKE EXECUTE ON FUNCTION public.play_allowlist_blocks(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.play_allowlist_blocks(uuid) TO service_role;

-- Grants unchanged; restated so a fresh project ends in the same state.
REVOKE EXECUTE ON FUNCTION public.create_team(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.join_team(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.leave_team() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_solve_data() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_challenge_solvers(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_team(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.join_team(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.leave_team() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_solve_data() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_challenge_solvers(uuid) TO authenticated, service_role;
