-- Scoreboard freeze: capture the live standings, show players the snapshot.
--
-- HOW IT WORKS
--   Admin presses Freeze. A trigger stamps freeze_time and copies the current
--   user_score_agg / team_score_agg rows into frozen_user_score /
--   frozen_team_score. Scores keep accumulating behind the scenes -- solves
--   still count, the agg tables still update -- but the public views serve the
--   snapshot. Admins keep seeing live standings so they can prepare the
--   reveal. Unfreezing clears freeze_time and the views return to live.
--
-- WHY IT IS ALSO AN OPTIMISATION
--   Frozen data cannot change. The client therefore stops refetching the
--   standings and the progression RPC entirely, and polls one tiny boolean
--   instead. During the final hour of a CTF -- peak traffic, everyone staring
--   at the board -- the hottest read path in the app goes to near zero.
--
-- TWO CONSTRAINTS THIS FILE HAS TO RESPECT
--   1. pg_safeupdate is enabled on Supabase. It rejects any DELETE or UPDATE
--      without a WHERE clause and it hooks the executor, so it fires inside
--      SECURITY DEFINER functions and triggers too. Every bare DELETE below
--      says WHERE true explicitly. Getting this wrong would make the BEFORE
--      UPDATE trigger throw, which would block *every* event_settings save,
--      not just the freeze toggle. See 20260825300000 for the same trap.
--   2. The masking test must be evaluated ONCE per query, not once per row.
--      user_scores has one row per player; at 4500 players a per-row
--      SECURITY DEFINER call is 4500 extra function calls on the hottest
--      query in the app. Writing it as an uncorrelated scalar subquery --
--      (SELECT public.scoreboard_is_masked()) -- makes PostgreSQL hoist it
--      into an InitPlan, executed exactly once per query.

-- ══ 1. Snapshot tables ════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.frozen_user_score (
  user_id      uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  total_points int NOT NULL DEFAULT 0,
  solved_count int NOT NULL DEFAULT 0,
  last_solve   timestamptz
);

CREATE TABLE IF NOT EXISTS public.frozen_team_score (
  team_id      uuid PRIMARY KEY REFERENCES public.teams(id) ON DELETE CASCADE,
  total_points int NOT NULL DEFAULT 0,
  solved_count int NOT NULL DEFAULT 0,
  last_solve   timestamptz
);

-- No policies and no grants: these are internal. The score views are plain
-- views, which read with the view owner's rights, so they can see these
-- tables while a direct client SELECT stays denied.
ALTER TABLE public.frozen_user_score ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.frozen_team_score ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.frozen_user_score FROM anon, authenticated;
REVOKE ALL ON public.frozen_team_score FROM anon, authenticated;

-- ══ 2. Is the board masked for THIS caller? ═══════════════════════════
-- Frozen and not an admin. One function so the views carry one InitPlan
-- rather than two.

CREATE OR REPLACE FUNCTION public.scoreboard_is_masked()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT COALESCE(
           (SELECT e.freeze_scoreboard FROM public.event_settings e WHERE e.id = 1),
           false
         )
     AND NOT public.is_admin();
$$;

REVOKE EXECUTE ON FUNCTION public.scoreboard_is_masked() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.scoreboard_is_masked() TO anon, authenticated, service_role;

-- ══ 3. Snapshot on the freeze transition ══════════════════════════════
-- Guarded on the transition, so an ordinary event_settings save does no work.
-- Lives in a trigger rather than the RPC so that every path -- the button,
-- the settings form, a hand-written UPDATE in the SQL editor -- produces a
-- consistent snapshot.

CREATE OR REPLACE FUNCTION public.handle_freeze_toggle()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF COALESCE(NEW.freeze_scoreboard, false) = COALESCE(OLD.freeze_scoreboard, false) THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.freeze_scoreboard, false) THEN
    NEW.freeze_time := now();

    -- WHERE true is required: pg_safeupdate rejects a bare DELETE even here.
    DELETE FROM public.frozen_user_score WHERE true;
    INSERT INTO public.frozen_user_score (user_id, total_points, solved_count, last_solve)
    SELECT a.user_id, a.total_points, a.solved_count, a.last_solve
    FROM public.user_score_agg a;

    DELETE FROM public.frozen_team_score WHERE true;
    INSERT INTO public.frozen_team_score (team_id, total_points, solved_count, last_solve)
    SELECT a.team_id, a.total_points, a.solved_count, a.last_solve
    FROM public.team_score_agg a;
  ELSE
    NEW.freeze_time := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_freeze_toggle ON public.event_settings;
CREATE TRIGGER on_freeze_toggle
  BEFORE UPDATE ON public.event_settings
  FOR EACH ROW EXECUTE FUNCTION public.handle_freeze_toggle();

-- ══ 4. One-press freeze, with an audit entry ══════════════════════════
-- The settings form saves seven fields at once behind a Save button. Freezing
-- is time-critical and happens while the event is live, so it gets its own
-- atomic call that touches exactly one column and records who did it and when.

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
  SET freeze_scoreboard = p_frozen
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

REVOKE EXECUTE ON FUNCTION public.admin_set_scoreboard_freeze(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_scoreboard_freeze(boolean) TO authenticated, service_role;

-- ══ 5. Views serve the snapshot while masked ══════════════════════════
-- (SELECT public.scoreboard_is_masked()) is uncorrelated, so it becomes an
-- InitPlan: one evaluation per query regardless of row count. Both the live
-- and frozen sides are joined on their primary keys, which is an index lookup
-- per row either way.

CREATE OR REPLACE VIEW public.user_scores AS
SELECT
  p.id, p.username, p.team_id, p.country, p.avatar_url,
  CASE WHEN (SELECT public.scoreboard_is_masked())
    THEN COALESCE(f.total_points, 0) ELSE COALESCE(a.total_points, 0) END AS total_points,
  CASE WHEN (SELECT public.scoreboard_is_masked())
    THEN COALESCE(f.solved_count, 0) ELSE COALESCE(a.solved_count, 0) END AS solved_count,
  CASE WHEN (SELECT public.scoreboard_is_masked())
    THEN f.last_solve ELSE a.last_solve END AS last_solve
FROM public.profiles p
LEFT JOIN public.user_score_agg   a ON a.user_id = p.id
LEFT JOIN public.frozen_user_score f ON f.user_id = p.id
WHERE p.is_banned = false AND p.is_hidden = false;

CREATE OR REPLACE VIEW public.team_scores AS
SELECT
  t.id, t.name,
  (SELECT COUNT(*)::int FROM public.profiles p
    WHERE p.team_id = t.id AND p.is_banned = false) AS member_count,
  CASE WHEN (SELECT public.scoreboard_is_masked())
    THEN COALESCE(f.total_points, 0) ELSE COALESCE(a.total_points, 0) END AS total_points,
  CASE WHEN (SELECT public.scoreboard_is_masked())
    THEN COALESCE(f.solved_count, 0) ELSE COALESCE(a.solved_count, 0) END AS solved_count,
  CASE WHEN (SELECT public.scoreboard_is_masked())
    THEN f.last_solve ELSE a.last_solve END AS last_solve
FROM public.teams t
LEFT JOIN public.team_score_agg   a ON a.team_id = t.id
LEFT JOIN public.frozen_team_score f ON f.team_id = t.id
WHERE t.is_banned = false;

-- ══ 6. The progression graph must freeze with the board ═══════════════
-- Otherwise the curve keeps drawing solves the standings table is hiding,
-- which leaks exactly what the freeze is meant to conceal.

-- Identical to 20260826020000 except for the freeze cutoff. The session guard,
-- the [1:50] input bound, the cost > 0 filter and the event_key tiebreaker are
-- all carried over unchanged.

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

  IF p_team_ids IS NULL OR pg_catalog.array_length(p_team_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  -- While the board is masked for this caller the curve stops at the freeze
  -- point as well. NULL means no cutoff, which is both the live case and the
  -- admin case.
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
