-- ════════════════════════════════════════════════════════════════════════
-- Team flow hardening (13 Sep 2026)
--
-- 1. create_team validated only uniqueness. A name that failed the length or
--    printable CHECK surfaced as a raw constraint error naming the table and
--    constraint. Validate first and answer in the platform's voice; catch the
--    constraint errors as a backstop.
-- 2. join_team compared the code case-sensitively. Codes are lowercase hex,
--    but a code read aloud or retyped often arrives in capitals and was
--    refused as invalid. Normalise to lower case; nothing else changes.
-- 3. join_team's rate limit raised straight through as a check_violation.
--    Return it as a JSON error like every other refusal in the function.
-- 4. team_invite_preview said "locked" whenever Allow Team Changes was off,
--    but join_team (20260912020000) only locks once start_time has passed.
--    During the countdown the invite dialog therefore disabled its Join
--    button while joining would have succeeded. Same rule in both places.
-- ════════════════════════════════════════════════════════════════════════

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

  -- Mirrors teams_name_check and teams_name_printable, so a player hears
  -- the rule instead of the constraint that enforces it.
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
  v_code         text := pg_catalog.lower(pg_catalog.btrim(COALESCE(p_invite_code, '')));
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  -- Same membership lock as create_team: serialise this actor's join/create.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('team-membership:' || auth.uid()::text, 0));

  -- 10 join attempts per minute defeats invite-code brute forcing while
  -- leaving room for a real user mistyping.
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

  UPDATE public.profiles SET team_id = v_team.id WHERE id = auth.uid();
  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.team_invite_preview(p_code text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = '' AS $$
DECLARE
  v_code  text := pg_catalog.lower(pg_catalog.btrim(COALESCE(p_code, '')));
  v_team  record;
  v_event record;
  v_count int;
  v_size  int;
BEGIN
  IF v_code !~ '^[0-9a-z_-]{6,64}$' THEN
    RETURN jsonb_build_object('error', 'Invalid invite');
  END IF;

  SELECT t.id, t.name, t.is_banned INTO v_team
  FROM public.teams t WHERE t.invite_code = v_code;

  IF NOT FOUND OR COALESCE(v_team.is_banned, false) THEN
    RETURN jsonb_build_object('error', 'Invalid invite');
  END IF;

  SELECT e.team_size, e.is_active, e.allow_team_changes, e.start_time INTO v_event
  FROM public.event_settings e WHERE e.id = 1;
  v_size := COALESCE(v_event.team_size, 4);

  -- Same count join_team uses, so "full" here means full there.
  SELECT count(*)::int INTO v_count
  FROM public.profiles p WHERE p.team_id = v_team.id;

  RETURN jsonb_build_object(
    'name',    v_team.name,
    'members', v_count,
    'size',    v_size,
    'full',    v_count >= v_size,
    -- Exactly join_team's rule: locked only once the event has started.
    'locked',  COALESCE(v_event.is_active, false)
               AND NOT COALESCE(v_event.allow_team_changes, true)
               AND (v_event.start_time IS NULL OR v_event.start_time <= now())
  );
END;
$$;

-- Grants unchanged; restated so a fresh project ends in the same state.
REVOKE EXECUTE ON FUNCTION public.create_team(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.join_team(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.team_invite_preview(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_team(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.join_team(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.team_invite_preview(text) TO anon, authenticated, service_role;

-- ── Challenge content opens at start_time on the TABLES too ─────────────
--
-- 20260912020000 gated the public_challenges view on start_time and pause so
-- briefs, attachments and connection info cannot be read before the event
-- starts. The tables behind it kept their older policies (visible + not
-- banned), so a direct PostgREST read of challenges, challenge_files or
-- hints still answered during the countdown. One helper carries the rule
-- the view already applies; the three SELECT policies and public_hints use
-- it. Admins are exempt, exactly as in the view.

CREATE OR REPLACE FUNCTION public.challenges_open()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.is_admin()
      OR (
        NOT COALESCE((SELECT es.is_paused FROM public.event_settings es WHERE es.id = 1), false)
        AND COALESCE((SELECT es.start_time <= now() FROM public.event_settings es WHERE es.id = 1), true)
      );
$$;
REVOKE EXECUTE ON FUNCTION public.challenges_open() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.challenges_open() TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "challenges_select" ON public.challenges;
CREATE POLICY "challenges_select" ON public.challenges FOR SELECT
  USING (
    (SELECT public.is_admin())
    OR (
      is_visible = true
      AND (SELECT auth.uid()) IS NOT NULL
      AND (SELECT public.is_not_banned())
      AND (SELECT public.challenges_open())
    )
  );

DROP POLICY IF EXISTS "hints_select" ON public.hints;
CREATE POLICY "hints_select" ON public.hints FOR SELECT
  USING (
    (SELECT public.is_admin())
    OR (
      (SELECT auth.uid()) IS NOT NULL
      AND (SELECT public.is_not_banned())
      AND (SELECT public.challenges_open())
      AND EXISTS (SELECT 1 FROM public.challenges c
                  WHERE c.id = challenge_id AND c.is_visible = true)
    )
  );

DROP POLICY IF EXISTS "files_select" ON public.challenge_files;
CREATE POLICY "files_select" ON public.challenge_files FOR SELECT
  USING (
    (SELECT public.is_admin())
    OR (
      (SELECT auth.uid()) IS NOT NULL
      AND (SELECT public.is_not_banned())
      AND (SELECT public.challenges_open())
      AND EXISTS (SELECT 1 FROM public.challenges c
                  WHERE c.id = challenge_id AND c.is_visible = true)
    )
  );

CREATE OR REPLACE VIEW public.public_hints
WITH (security_invoker = false)
AS SELECT h.id, h.challenge_id, h.cost
FROM public.hints h
JOIN public.challenges c ON c.id = h.challenge_id
WHERE c.is_visible = true
  AND public.challenges_open();

-- public_challenges runs as its owner, so the ban that the table policies
-- enforce (20260825280000) never reached it: a banned account could still
-- list every brief through the view the client actually reads. Same rule
-- as the tables, same helper as the gate above.
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
    OR (public.is_not_banned() AND public.challenges_open())
  );

CREATE OR REPLACE VIEW public.public_hints
WITH (security_invoker = false)
AS SELECT h.id, h.challenge_id, h.cost
FROM public.hints h
JOIN public.challenges c ON c.id = h.challenge_id
WHERE c.is_visible = true
  AND (public.is_admin() OR (public.is_not_banned() AND public.challenges_open()));

-- ── Views are read-only for clients ──────────────────────────────────────
--
-- The initial schema's GRANT ALL ON ALL TABLES IN SCHEMA public TO
-- authenticated also covered the views, and 20260826030000 pulled the
-- blanket grants back from the tables only. public_challenges, safe_profiles
-- and public_teams are simple single-table views: PostgreSQL makes those
-- automatically updatable, and because they run as their owner (postgres,
-- which bypasses row level security on Supabase) an UPDATE through the view
-- reached the table with no policy and no column check in the way. A player
-- could change any profile, team or challenge row. Clients only ever SELECT
-- from views; take every other privilege away.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.public_challenges, public.public_hints, public.public_teams,
     public.safe_profiles, public.team_scores, public.user_scores
  FROM PUBLIC, anon, authenticated;

-- ── unlock_hint: the rate limit answers in the function's own shape ─────
-- Identical to 20260906040000 except that check_rate_limit's exception is
-- caught and returned as {error}, like every other refusal here.
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

  -- 30 hint calls per minute is more than any real event needs.
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

  -- Allowlist gate: non-listed accounts cannot unlock hints while it is on.
  IF NOT public.is_admin() AND public.play_allowlist_blocks(auth.uid()) THEN
    RETURN jsonb_build_object('error', 'Your email is not on the registration list to play this event');
  END IF;

  SELECT e.start_time, e.end_time, e.is_paused INTO v_event
  FROM public.event_settings e WHERE e.id = 1;

  IF NOT public.is_admin() THEN
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

-- ── get_solve_data: one filter for counts and first blood ───────────────
-- The count took every correct row while first blood skipped banned
-- accounts only, so hidden organiser accounts surfaced as First Blood and
-- the two numbers on a card disagreed. Both now count non-banned,
-- non-hidden solvers on visible challenges, and nothing at all before the
-- event opens (admins see everything, as with the view).
CREATE OR REPLACE FUNCTION public.get_solve_data()
RETURNS TABLE(challenge_id uuid, solve_count bigint, first_blood_username text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_cutoff timestamptz;
BEGIN
  IF public.scoreboard_is_hidden() THEN RETURN; END IF;
  IF NOT public.challenges_open() THEN RETURN; END IF;
  IF public.scoreboard_is_masked() THEN
    SELECT e.freeze_time INTO v_cutoff FROM public.event_settings e WHERE e.id = 1;
  END IF;
  RETURN QUERY
  SELECT
    s.challenge_id,
    COUNT(*) AS solve_count,
    (SELECT p2.username
       FROM public.submissions s2
       JOIN public.profiles p2 ON p2.id = s2.user_id
      WHERE s2.challenge_id = s.challenge_id
        AND s2.is_correct = true
        AND COALESCE(p2.is_banned, false) = false
        AND COALESCE(p2.is_hidden, false) = false
        AND (v_cutoff IS NULL OR s2.submitted_at <= v_cutoff)
      ORDER BY s2.submitted_at ASC
      LIMIT 1) AS first_blood_username
  FROM public.submissions s
  JOIN public.profiles p ON p.id = s.user_id
  JOIN public.challenges c ON c.id = s.challenge_id
  WHERE s.is_correct = true
    AND c.is_visible = true
    AND COALESCE(p.is_banned, false) = false
    AND COALESCE(p.is_hidden, false) = false
    AND (v_cutoff IS NULL OR s.submitted_at <= v_cutoff)
  GROUP BY s.challenge_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_solve_data() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_solve_data() TO authenticated, service_role;

-- ── teams_update: a captain must still be on the team ───────────────────
-- A captain who left as the last member of a team that had scored kept
-- captain_id (the row survives for its submissions) and with it the right
-- to rename the ghost team from another team. Membership is now part of
-- the rule; admins are unchanged.
ALTER POLICY teams_update ON public.teams
  USING (
    (SELECT public.is_admin())
    OR (
      captain_id = (SELECT auth.uid())
      AND id = (SELECT p.team_id FROM public.profiles p WHERE p.id = (SELECT auth.uid()))
    )
  )
  WITH CHECK (
    (SELECT public.is_admin())
    OR (
      captain_id = (SELECT auth.uid())
      AND id = (SELECT p.team_id FROM public.profiles p WHERE p.id = (SELECT auth.uid()))
      AND (is_banned IS NOT DISTINCT FROM (SELECT t.is_banned FROM public.teams t WHERE t.id = teams.id))
    )
  );

-- ── admin_delete_team: awards reference teams without a cascade ─────────
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

  -- submissions.team_id and awards.team_id reference teams without a
  -- cascade, so the delete below would fail on any team that ever scored
  -- or was decorated. Detach those rows; the per-user record remains.
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

-- ── submit_flag_tx: the per-network budget moves in here ────────────────
-- The edge function spent a 600/min per-address budget before verifying the
-- caller, keyed on the leftmost x-forwarded-for hop the client itself sets.
-- Anyone holding the public anon key could therefore empty a rival
-- network's budget with a spoofed header and no account. The same budget
-- is now charged here, after the caller is authenticated, not banned, on a
-- team and inside the event window, so a hostile spend costs an account
-- that is itself capped at 30 submissions a minute. Identical to
-- 20260906040000 otherwise.
CREATE OR REPLACE FUNCTION public.submit_flag_tx(
  p_user_id      uuid,
  p_challenge_id uuid,
  p_flag         text,
  p_ip           text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_flag      text        := pg_catalog.btrim(p_flag);
  v_now       timestamptz := pg_catalog.now();
  v_profile   record;
  v_event     record;
  v_chal      record;
  v_secret    record;
  v_is_admin  boolean;
  v_max       int;
  v_used      int;
  v_last      timestamptz;
  v_correct   boolean := false;
  v_hash      text;
  v_ip        inet;
  v_ip_key    text        := pg_catalog.left(pg_catalog.btrim(COALESCE(p_ip, '')), 64);
BEGIN
  -- ── 1. Who is asking ─────────────────────────────────────────────────
  SELECT p.is_banned, p.team_id, p.role INTO v_profile
  FROM public.profiles p WHERE p.id = p_user_id;

  IF NOT FOUND OR COALESCE(v_profile.is_banned, false) THEN
    RETURN jsonb_build_object('status', 403, 'body',
      jsonb_build_object('error', 'Account banned'));
  END IF;

  -- Every solve belongs to a team; a teamless row would score for nobody
  -- the scoreboard can see. See the original comment in submit-flag.
  IF v_profile.team_id IS NULL THEN
    RETURN jsonb_build_object('status', 403, 'body', jsonb_build_object(
      'correct', false,
      'error', 'Create or join a team before submitting. Playing solo is fine — make a team of one.'));
  END IF;

  v_is_admin := (v_profile.role = 'admin');

  -- A banned team is out of the competition, members included. The team
  -- vanished from the board but its players could still submit and unlock.
  IF NOT v_is_admin AND EXISTS (
    SELECT 1 FROM public.teams t WHERE t.id = v_profile.team_id AND COALESCE(t.is_banned, false)
  ) THEN
    RETURN jsonb_build_object('status', 403, 'body',
      jsonb_build_object('correct', false, 'error', 'Your team has been removed from the competition.'));
  END IF;

  -- Allowlist gate: only registered emails may play while it is on (admins
  -- exempt). Covers accounts that were created before the switch was set.
  -- Status 200 (like the paused / not-started gates) so the client surfaces
  -- the message rather than supabase-js masking a non-2xx as "Server error".
  IF NOT v_is_admin AND public.play_allowlist_blocks(p_user_id) THEN
    RETURN jsonb_build_object('status', 200, 'body', jsonb_build_object(
      'correct', false,
      'error', 'Your email is not on the registration list to play this event'));
  END IF;

  -- ── 2. Is the event open ─────────────────────────────────────────────
  SELECT e.is_active, e.start_time, e.end_time, e.is_paused INTO v_event
  FROM public.event_settings e WHERE e.id = 1;

  IF NOT FOUND OR NOT COALESCE(v_event.is_active, false) THEN
    RETURN jsonb_build_object('status', 200, 'body',
      jsonb_build_object('correct', false, 'error', 'Event not active'));
  END IF;
  IF v_event.start_time IS NOT NULL AND v_event.start_time > v_now THEN
    RETURN jsonb_build_object('status', 200, 'body',
      jsonb_build_object('correct', false, 'error', 'Event has not started'));
  END IF;
  -- A paused event seals the submission channel for players. Admins keep it
  -- open so they can verify a challenge while everyone else waits.
  IF COALESCE(v_event.is_paused, false) AND NOT v_is_admin THEN
    RETURN jsonb_build_object('status', 200, 'body',
      jsonb_build_object('correct', false, 'paused', true, 'error', 'Event is paused'));
  END IF;
  IF v_event.end_time IS NOT NULL AND v_event.end_time < v_now THEN
    RETURN jsonb_build_object('status', 200, 'body',
      jsonb_build_object('correct', false, 'eventEnded', true));
  END IF;

  -- ── 3. The challenge ─────────────────────────────────────────────────
  SELECT c.id, c.points, c.is_visible, c.max_attempts INTO v_chal
  FROM public.challenges c WHERE c.id = p_challenge_id;

  IF NOT FOUND OR NOT COALESCE(v_chal.is_visible, false) THEN
    RETURN jsonb_build_object('status', 404, 'body',
      jsonb_build_object('error', 'Challenge not found'));
  END IF;
  v_max := CASE WHEN COALESCE(v_chal.max_attempts, 0) > 0 THEN v_chal.max_attempts ELSE 9999 END;

  -- ── 4. Serialise this player's submissions before counting anything ──
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('rl:' || p_user_id::text, 0));
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text || ':' || p_challenge_id::text, 0));

  -- ── 5. Already solved ────────────────────────────────────────────────
  IF EXISTS (
    SELECT 1 FROM public.submissions s
    WHERE s.user_id = p_user_id AND s.challenge_id = p_challenge_id AND s.is_correct
  ) THEN
    RETURN jsonb_build_object('status', 200, 'body',
      jsonb_build_object('correct', true, 'alreadySolved', true));
  END IF;

  -- ── 6. Attempt cap and cooldown, from one scan ───────────────────────
  SELECT count(*)::int, max(s.submitted_at) INTO v_used, v_last
  FROM public.submissions s
  WHERE s.user_id = p_user_id AND s.challenge_id = p_challenge_id;

  IF v_used >= v_max THEN
    RETURN jsonb_build_object('status', 200, 'body', jsonb_build_object(
      'correct', false, 'locked', true, 'maxAttempts', v_max, 'attemptsLeft', 0));
  END IF;

  IF NOT v_is_admin AND v_last IS NOT NULL
     AND v_last > v_now - interval '10 seconds' THEN
    RETURN jsonb_build_object('status', 429, 'body', jsonb_build_object(
      'correct', false,
      'error', format('Too fast. Wait %ss.',
        ceil(extract(epoch FROM (v_last + interval '10 seconds' - v_now)))::int)));
  END IF;

  -- ── 7. The answer ────────────────────────────────────────────────────
  SELECT cs.flag_hash, cs.flag_type, cs.flag_regex INTO v_secret
  FROM public.challenge_secrets cs WHERE cs.challenge_id = p_challenge_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 500, 'body',
      jsonb_build_object('error', 'This challenge is not accepting flags yet. Tell the organisers.'));
  END IF;

  v_hash := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(v_flag, 'UTF8')), 'hex');

  IF v_secret.flag_type = 'static' THEN
    v_correct := (v_hash = v_secret.flag_hash);
  ELSIF v_secret.flag_type = 'regex' AND v_secret.flag_regex IS NOT NULL THEN
    BEGIN
      v_correct := (v_flag ~ v_secret.flag_regex);
    EXCEPTION WHEN OTHERS THEN
      v_correct := false;
    END;
  END IF;

  -- x-forwarded-for is untrusted text; a value inet cannot parse is just null.
  BEGIN
    v_ip := NULLIF(p_ip, '')::inet;
  EXCEPTION WHEN OTHERS THEN
    v_ip := NULL;
  END;

  -- ── 7b. Per-network budget: 600 a minute per address, admins exempt ──
  -- Charged only on the path that records a submission, so every hostile
  -- spend also costs the caller one of their own 30 rows a minute (the
  -- enforce_global_rate_limit trigger) and a 10 s cooldown; charging it
  -- before the cooldown return let one account drain a spoofed address's
  -- budget without ever writing a row. Lock order stays player first, then
  -- network.
  IF v_ip_key <> '' AND NOT v_is_admin THEN
    BEGIN
      PERFORM public.check_rate_limit('submit-flag-ip', v_ip_key, 60, 600);
    EXCEPTION WHEN check_violation THEN
      RETURN jsonb_build_object('status', 429, 'body', jsonb_build_object(
        'correct', false,
        'error', 'Too many requests from your network. Wait a minute and try again.'));
    END;
  END IF;

  -- ── 8. Record it. The triggers are the backstop for everything above. ─
  BEGIN
    INSERT INTO public.submissions
      (user_id, challenge_id, team_id, submitted_flag_hash, submitted_flag, is_correct, ip_address)
    VALUES
      (p_user_id, p_challenge_id, v_profile.team_id, v_hash, v_flag, v_correct, v_ip);
  EXCEPTION
    -- uniq_submission_correct_per_user_challenge: a concurrent request
    -- already recorded this solve. The duplicate loses; not an error.
    WHEN unique_violation THEN
      RETURN jsonb_build_object('status', 200, 'body',
        jsonb_build_object('correct', true, 'alreadySolved', true));
    WHEN OTHERS THEN
      IF SQLERRM LIKE 'Max attempts exceeded%' THEN
        RETURN jsonb_build_object('status', 200, 'body', jsonb_build_object(
          'correct', false, 'locked', true, 'maxAttempts', v_max, 'attemptsLeft', 0));
      ELSIF SQLERRM LIKE 'Rate limit exceeded%' THEN
        RETURN jsonb_build_object('status', 429, 'body', jsonb_build_object(
          'correct', false, 'error', 'Too many submissions. Wait a minute and try again.'));
      END IF;
      RAISE;
  END;

  RETURN jsonb_build_object('status', 200, 'body', jsonb_build_object(
    'correct',      v_correct,
    'points',       CASE WHEN v_correct THEN v_chal.points ELSE 0 END,
    'attemptsLeft', CASE WHEN v_correct THEN v_max ELSE v_max - v_used - 1 END,
    'maxAttempts',  v_max));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.submit_flag_tx(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.submit_flag_tx(uuid, uuid, text, text) TO service_role;

-- ── Challenge visibility gets its own RPC; upsert defaults stop clobbering ─
-- The admin "Live/Hidden" chip called admin_upsert_challenge with only p_id
-- and p_is_visible. PostgREST supplies every omitted argument from its SQL
-- DEFAULT, and the update branch COALESCEs those non-null defaults over the
-- row: points back to 100, attempts to unlimited, author and tags to the
-- defaults, connection_info to NULL. Switching every challenge live at
-- kickoff would have rewritten all of them. A dedicated function flips only
-- the flag, and the upsert's optional arguments now default to NULL so a
-- partial call can never overwrite a field it did not name (INSERT keeps the
-- old defaults via COALESCE).
CREATE OR REPLACE FUNCTION public.admin_set_challenge_visibility(p_id uuid, p_visible boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_found int;
BEGIN
  IF NOT public.is_admin() THEN RETURN jsonb_build_object('error', 'Unauthorized'); END IF;
  IF p_id IS NULL OR p_visible IS NULL THEN
    RETURN jsonb_build_object('error', 'Challenge and visibility are required');
  END IF;
  UPDATE public.challenges SET is_visible = p_visible WHERE id = p_id;
  GET DIAGNOSTICS v_found = ROW_COUNT;
  IF v_found = 0 THEN RETURN jsonb_build_object('error', 'Challenge not found'); END IF;
  INSERT INTO public.audit_log (actor_id, action, metadata)
  VALUES (auth.uid(), CASE WHEN p_visible THEN 'challenge_show' ELSE 'challenge_hide' END,
          jsonb_build_object('challenge_id', p_id));
  RETURN jsonb_build_object('success', true, 'is_visible', p_visible);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_set_challenge_visibility(uuid, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_set_challenge_visibility(uuid, boolean) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.admin_upsert_challenge(uuid, text, text, text, text, text, text, int, int, text, text[], boolean, text);
CREATE FUNCTION public.admin_upsert_challenge(
  p_id uuid DEFAULT NULL, p_title text DEFAULT NULL, p_category text DEFAULT NULL,
  p_difficulty text DEFAULT NULL, p_description text DEFAULT NULL, p_flag text DEFAULT NULL,
  p_flag_type text DEFAULT 'static', p_points int DEFAULT NULL, p_max_attempts int DEFAULT NULL,
  p_author text DEFAULT NULL, p_tags text[] DEFAULT NULL,
  p_is_visible boolean DEFAULT NULL, p_connection_info text DEFAULT NULL
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
    -- Only named fields change. connection_info is always sent by the
    -- editor (NULL clears it), so it stays an unconditional write there,
    -- but a call that omits it must leave it alone.
    UPDATE public.challenges SET
      title = COALESCE(p_title, title), category = COALESCE(p_category, category),
      difficulty = COALESCE(p_difficulty, difficulty), description = COALESCE(p_description, description),
      points = COALESCE(p_points, points), max_attempts = COALESCE(p_max_attempts, max_attempts),
      author = COALESCE(p_author, author), tags = COALESCE(p_tags, tags),
      is_visible = COALESCE(p_is_visible, is_visible),
      connection_info = CASE WHEN p_title IS NULL AND p_description IS NULL THEN connection_info ELSE p_connection_info END
    WHERE id = p_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Challenge not found'); END IF;
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
    VALUES (p_title, p_category, p_difficulty, p_description, COALESCE(p_points, 100),
      COALESCE(p_max_attempts, 0), COALESCE(p_author, 'CyberHX Team'), COALESCE(p_tags, '{}'),
      COALESCE(p_is_visible, false), p_connection_info)
    RETURNING id INTO v_challenge_id;

    INSERT INTO public.challenge_secrets (challenge_id, flag_hash, flag_type)
    VALUES (v_challenge_id, v_flag_hash, p_flag_type);

    INSERT INTO public.challenge_flag_vault (challenge_id, flag, updated_by)
    VALUES (v_challenge_id, v_flag, auth.uid());
  END IF;

  RETURN jsonb_build_object('challenge_id', v_challenge_id);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_upsert_challenge(uuid, text, text, text, text, text, text, int, int, text, text[], boolean, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_upsert_challenge(uuid, text, text, text, text, text, text, int, int, text, text[], boolean, text) TO authenticated, service_role;

-- ── get_hint_text honours the same gates as everything else ─────────────
-- Purchased hint text kept flowing to banned accounts, outside the event
-- window and for hidden challenges, because this definer function checked
-- only the unlock row.
CREATE OR REPLACE FUNCTION public.get_hint_text(hint_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = '' AS $$
DECLARE
  v_hint_id uuid := hint_id;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NULL; END IF;
  IF NOT public.is_admin() AND NOT (public.is_not_banned() AND public.challenges_open()) THEN
    RETURN NULL;
  END IF;
  RETURN (
    SELECT h.content FROM public.hints h
    JOIN public.hint_unlocks hu ON hu.hint_id = h.id
    JOIN public.challenges c ON c.id = h.challenge_id
    WHERE h.id = v_hint_id AND hu.user_id = auth.uid()
      AND (c.is_visible OR public.is_admin())
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_hint_text(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_hint_text(uuid) TO authenticated, service_role;

-- ── Team names are stored trimmed with single spaces ────────────────────
-- create_team trims, but a captain's direct UPDATE did not, so "Name " and
-- "Name" could both exist and look identical on the board and in the feed.
CREATE OR REPLACE FUNCTION public.teams_normalise_name()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.name := pg_catalog.btrim(pg_catalog.regexp_replace(NEW.name, '\s+', ' ', 'g'));
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS teams_normalise_name ON public.teams;
CREATE TRIGGER teams_normalise_name
  BEFORE INSERT OR UPDATE OF name ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.teams_normalise_name();

-- ── One playing account per listed address ──────────────────────────────
-- The tolerant match (dots, +tags) let any number of accounts play from one
-- listed address. The exact address is already one account (profiles.email
-- is unique); a variant now only counts for the earliest account that
-- claimed that address family, so the tolerance still forgives a typo
-- without minting extra ringers. Admins are exempt in the callers.
CREATE INDEX IF NOT EXISTS idx_profiles_play_email_norm
  ON public.profiles (public.normalize_play_email(email));

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
          OR (
            public.normalize_play_email(a.email) = public.normalize_play_email(p.email)
            AND p.id = (
              SELECT p2.id FROM public.profiles p2
              WHERE public.normalize_play_email(p2.email) = public.normalize_play_email(p.email)
              ORDER BY p2.created_at ASC, p2.id ASC
              LIMIT 1)));
$$;
REVOKE EXECUTE ON FUNCTION public.play_allowlist_blocks(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.play_allowlist_blocks(uuid) TO service_role;

-- ── Reset and new-event refuse to run on a live event ───────────────────
-- Both wipe every submission and score. The reset was a single confirm
-- dialog in the header. A live event (active, started, not ended) must be
-- set inactive first, a deliberate second step.
CREATE OR REPLACE FUNCTION public.event_is_live()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT COALESCE((
    SELECT e.is_active AND e.start_time IS NOT NULL AND e.start_time <= now()
           AND (e.end_time IS NULL OR e.end_time > now())
    FROM public.event_settings e WHERE e.id = 1), false);
$$;
REVOKE EXECUTE ON FUNCTION public.event_is_live() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.event_is_live() TO service_role;

CREATE OR REPLACE FUNCTION public.admin_reset_event()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.is_admin() THEN RETURN jsonb_build_object('error', 'Unauthorized'); END IF;
  IF public.event_is_live() THEN
    RETURN jsonb_build_object('error', 'The event is live. Set it inactive (or wait for it to end) before resetting scores.');
  END IF;

  DELETE FROM public.submissions      WHERE true;
  DELETE FROM public.hint_unlocks     WHERE true;
  DELETE FROM public.user_score_agg   WHERE true;
  DELETE FROM public.team_score_agg   WHERE true;
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
REVOKE EXECUTE ON FUNCTION public.admin_reset_event() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_reset_event() TO authenticated, service_role;

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
  IF public.event_is_live() THEN
    RETURN jsonb_build_object('error', 'The event is live. Set it inactive (or wait for it to end) before starting a new one.');
  END IF;

  v_name := trim(COALESCE(p_name, ''));

  IF v_name = '' THEN
    RETURN jsonb_build_object('error', 'Event name is required');
  END IF;

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
      hide_scores       = false,
      is_paused         = false,
      paused_at         = NULL,
      pause_message     = NULL
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
GRANT  EXECUTE ON FUNCTION public.admin_start_new_event(text, boolean, boolean, boolean) TO authenticated, service_role;
