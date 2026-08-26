-- Two controls the organiser needs during a live event, plus the bug that
-- makes the second one necessary.
--
-- 1. HIDE. Distinct from freeze. A frozen board shows stale-but-real
--    standings; a hidden board shows players nothing at all. hide_scores has
--    been a column since the initial schema and nothing has ever read it.
--    Enforced in the views, not the client, so a player cannot simply curl
--    /rest/v1/team_scores and read what the page refuses to draw. Every
--    ranked surface goes dark together -- team_scores and user_scores both
--    back the Teams and Users lists, and a ranked team list IS a scoreboard.
--
-- 2. AUTO-FREEZE AT THE END. Rather than a second masking rule, this simply
--    sets freeze_scoreboard itself, so the snapshot trigger and the views
--    from 20260826040000 do all the real work through one path already
--    tested. It fires lazily: the first authenticated caller of
--    scoreboard_state() after end_time performs it, under an advisory lock
--    so 4500 simultaneous clients cannot double-snapshot. auto_froze_at
--    records that it has happened, so an admin who deliberately unfreezes
--    after the event is not immediately re-frozen by the next poll.
--
-- 3. unlock_hint had no event-window check at all. Solves stop at end_time
--    (submit-flag/index.ts:148) but hint spend did not, so a player could
--    keep buying hints after the CTF closed and drive their own score down
--    -- moving final standings after the event, and drifting the numbers
--    behind a frozen board. Closed here.

-- ══ 1. Remember that the auto-freeze already ran ══════════════════════

ALTER TABLE public.event_settings
  ADD COLUMN IF NOT EXISTS auto_froze_at timestamptz;

-- ══ 2. Is the board hidden for THIS caller? ═══════════════════════════
-- Same shape as scoreboard_is_masked: admins are never hidden from, and the
-- views call it as an uncorrelated subquery so it costs one InitPlan.

CREATE OR REPLACE FUNCTION public.scoreboard_is_hidden()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT COALESCE(
           (SELECT e.hide_scores FROM public.event_settings e WHERE e.id = 1),
           false
         )
     AND NOT public.is_admin();
$$;

REVOKE EXECUTE ON FUNCTION public.scoreboard_is_hidden() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.scoreboard_is_hidden() TO anon, authenticated, service_role;

-- ══ 3. One call the client polls: state, and the lazy auto-freeze ═════

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
    RETURN jsonb_build_object('frozen', false, 'hidden', false, 'ended', false);
  END IF;

  v_ended := e.end_time IS NOT NULL AND now() > e.end_time;

  -- Freeze once, the first time anybody looks after the event has closed.
  -- The advisory lock serialises the herd; the re-read under FOR UPDATE means
  -- only one transaction sees the pre-freeze state and does the work.
  IF v_ended
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
    -- What the caller will actually experience, so the client never has to
    -- re-derive the admin exemption and get it subtly wrong.
    'masked',        (NOT v_admin) AND COALESCE(e.freeze_scoreboard, false),
    'scores_hidden', (NOT v_admin) AND COALESCE(e.hide_scores, false)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.scoreboard_state() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scoreboard_state() TO authenticated, service_role;

-- ══ 4. The hide switch itself ════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_set_scoreboard_hidden(p_hidden boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  UPDATE public.event_settings SET hide_scores = p_hidden WHERE id = 1;

  INSERT INTO public.audit_log (actor_id, action, metadata)
  VALUES (auth.uid(),
          CASE WHEN p_hidden THEN 'hide_scoreboard' ELSE 'show_scoreboard' END,
          jsonb_build_object('hidden', p_hidden));

  RETURN jsonb_build_object('success', true, 'hidden', p_hidden);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_set_scoreboard_hidden(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_scoreboard_hidden(boolean) TO authenticated, service_role;

-- ══ 5. Views go dark when hidden ═════════════════════════════════════
-- Identical to 20260826040000 apart from the extra WHERE conjunct. The net-of-
-- hint-spend arithmetic and the COALESCE-wrapped flag tests are carried over
-- unchanged; getting either wrong corrupts scoring silently.

CREATE OR REPLACE VIEW public.user_scores AS
SELECT
  p.id, p.username, p.team_id, p.country, p.avatar_url,
  GREATEST(
    CASE WHEN (SELECT public.scoreboard_is_masked())
      THEN COALESCE(f.total_points, 0) - COALESCE(f.hint_spend, 0)
      ELSE COALESCE(a.total_points, 0) - COALESCE(a.hint_spend, 0)
    END, 0) AS total_points,
  CASE WHEN (SELECT public.scoreboard_is_masked())
    THEN COALESCE(f.solved_count, 0) ELSE COALESCE(a.solved_count, 0) END AS solved_count,
  CASE WHEN (SELECT public.scoreboard_is_masked())
    THEN f.last_solve ELSE a.last_solve END AS last_solve
FROM public.profiles p
LEFT JOIN public.user_score_agg    a ON a.user_id = p.id
LEFT JOIN public.frozen_user_score f ON f.user_id = p.id
WHERE COALESCE(p.is_banned, false) = false
  AND COALESCE(p.is_hidden, false) = false
  AND NOT (SELECT public.scoreboard_is_hidden());

CREATE OR REPLACE VIEW public.team_scores AS
SELECT
  t.id, t.name,
  (SELECT COUNT(*)::int FROM public.profiles p
    WHERE p.team_id = t.id AND COALESCE(p.is_banned, false) = false) AS member_count,
  GREATEST(
    CASE WHEN (SELECT public.scoreboard_is_masked())
      THEN COALESCE(f.total_points, 0) - COALESCE(f.hint_spend, 0)
      ELSE COALESCE(a.total_points, 0) - COALESCE(a.hint_spend, 0)
    END, 0) AS total_points,
  CASE WHEN (SELECT public.scoreboard_is_masked())
    THEN COALESCE(f.solved_count, 0) ELSE COALESCE(a.solved_count, 0) END AS solved_count,
  CASE WHEN (SELECT public.scoreboard_is_masked())
    THEN f.last_solve ELSE a.last_solve END AS last_solve
FROM public.teams t
LEFT JOIN public.team_score_agg    a ON a.team_id = t.id
LEFT JOIN public.frozen_team_score f ON f.team_id = t.id
WHERE COALESCE(t.is_banned, false) = false
  AND NOT (SELECT public.scoreboard_is_hidden());

-- ══ 6. The progression curve goes dark too ═══════════════════════════

CREATE OR REPLACE FUNCTION public.get_score_progression(p_team_ids uuid[])
RETURNS TABLE(
  team_id     uuid,
  event_key   text,
  points      int,
  occurred_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = '' AS $$
DECLARE
  v_cutoff timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Hidden beats frozen: draw nothing at all.
  IF public.scoreboard_is_hidden() THEN
    RETURN;
  END IF;

  IF p_team_ids IS NULL OR pg_catalog.array_length(p_team_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  IF public.scoreboard_is_masked() THEN
    SELECT e.freeze_time INTO v_cutoff FROM public.event_settings e WHERE e.id = 1;
  END IF;

  RETURN QUERY
  WITH wanted AS (
    SELECT DISTINCT t AS id
    FROM pg_catalog.unnest(p_team_ids[1:50]) AS t
  ),
  solves AS (
    SELECT DISTINCT ON (s.team_id, s.challenge_id)
      s.team_id,
      s.challenge_id::text AS event_key,
      c.points             AS points,
      s.submitted_at       AS occurred_at
    FROM public.submissions s
    JOIN public.challenges c ON c.id = s.challenge_id
    JOIN wanted w            ON w.id = s.team_id
    WHERE s.is_correct = true
      AND (v_cutoff IS NULL OR s.submitted_at <= v_cutoff)
    ORDER BY s.team_id, s.challenge_id, s.submitted_at ASC
  ),
  spends AS (
    SELECT
      p.team_id,
      hu.id::text     AS event_key,
      -h.cost         AS points,
      hu.unlocked_at  AS occurred_at
    FROM public.hint_unlocks hu
    JOIN public.hints h    ON h.id = hu.hint_id
    JOIN public.profiles p ON p.id = hu.user_id
    JOIN wanted w          ON w.id = p.team_id
    WHERE h.cost > 0
      AND (v_cutoff IS NULL OR hu.unlocked_at <= v_cutoff)
  )
  SELECT * FROM solves
  UNION ALL
  SELECT * FROM spends
  ORDER BY occurred_at ASC, event_key ASC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_score_progression(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_score_progression(uuid[]) TO authenticated, service_role;

-- ══ 7. Hints stop when the event does ════════════════════════════════
-- Byte-for-byte 20260825310000 apart from the window check inserted after the
-- ban check. The advisory-free FOR UPDATE balance lock and the
-- only-the-inserting-call-pays rule are load-bearing; they are untouched.

CREATE OR REPLACE FUNCTION public.unlock_hint(p_hint_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_hint     record;
  v_visible  boolean;
  v_team     uuid;
  v_balance  int;
  v_inserted uuid;
  v_event    record;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  SELECT p.team_id INTO v_team
  FROM public.profiles p
  WHERE p.id = auth.uid() AND COALESCE(p.is_banned, false) = false;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Account not found or banned');
  END IF;

  -- Solves already stop at end_time; hint spend must too, or a player can
  -- move the final standings after the CTF has closed.
  SELECT e.start_time, e.end_time INTO v_event
  FROM public.event_settings e WHERE e.id = 1;

  IF NOT public.is_admin() THEN
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

    IF v_team IS NOT NULL THEN
      INSERT INTO public.team_score_agg (team_id, total_points, solved_count, hint_spend)
      VALUES (v_team, 0, 0, v_hint.cost)
      ON CONFLICT (team_id) DO UPDATE
        SET hint_spend = public.team_score_agg.hint_spend + v_hint.cost;
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true, 'text', v_hint.content);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.unlock_hint(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unlock_hint(uuid) TO authenticated, service_role;
