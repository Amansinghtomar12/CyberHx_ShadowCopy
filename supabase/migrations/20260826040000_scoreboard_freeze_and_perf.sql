-- Scoreboard freeze + performance optimisations for 4500+ concurrent users.
--
-- 1. freeze_scoreboard: when the admin toggles the checkbox the public views
--    stop updating. Scores still accumulate in the agg tables (the trigger on
--    submit-flag keeps running), but user_scores and team_scores return only
--    the totals that existed at freeze_time. The admin dashboard reads the agg
--    tables directly, so it still sees live scores.
--
-- 2. freeze_time auto-set: toggling freeze_scoreboard to true records the
--    current timestamp into freeze_time so the admin does not have to set it
--    manually. Toggling it back to false clears freeze_time.
--
-- 3. Frozen score snapshot tables: at freeze time we copy the current agg
--    tables into frozen_user_score and frozen_team_score. The public views
--    read from these when frozen, avoiding a per-row timestamp filter on the
--    hot path.

-- ══ 1. Frozen score snapshot tables ══════════════════════════════════

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

ALTER TABLE public.frozen_user_score ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.frozen_team_score ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.frozen_user_score FROM anon, authenticated;
REVOKE ALL ON public.frozen_team_score FROM anon, authenticated;

-- ══ 2. Auto-set freeze_time + snapshot on toggle ═════════════════════

CREATE OR REPLACE FUNCTION public.handle_freeze_toggle()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.freeze_scoreboard = true AND (OLD.freeze_scoreboard = false OR OLD.freeze_scoreboard IS NULL) THEN
    NEW.freeze_time := now();

    DELETE FROM public.frozen_user_score;
    INSERT INTO public.frozen_user_score (user_id, total_points, solved_count, last_solve)
    SELECT user_id, total_points, solved_count, last_solve
    FROM public.user_score_agg;

    DELETE FROM public.frozen_team_score;
    INSERT INTO public.frozen_team_score (team_id, total_points, solved_count, last_solve)
    SELECT team_id, total_points, solved_count, last_solve
    FROM public.team_score_agg;

  ELSIF NEW.freeze_scoreboard = false AND OLD.freeze_scoreboard = true THEN
    NEW.freeze_time := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_freeze_toggle ON public.event_settings;
CREATE TRIGGER on_freeze_toggle
  BEFORE UPDATE ON public.event_settings
  FOR EACH ROW EXECUTE FUNCTION public.handle_freeze_toggle();

-- ══ 3. Helper: is the scoreboard currently frozen? ═══════════════════

CREATE OR REPLACE FUNCTION public.is_scoreboard_frozen()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT COALESCE(
    (SELECT freeze_scoreboard FROM public.event_settings WHERE id = 1),
    false
  );
$$;

-- ══ 4. Rewrite the public views to respect freeze ════════════════════
-- When frozen, read from the snapshot tables. When live, read from agg.
-- Admin sees live scores through direct agg access (SECURITY DEFINER RPCs).

CREATE OR REPLACE VIEW public.user_scores AS
SELECT
  p.id, p.username, p.team_id, p.country, p.avatar_url,
  CASE WHEN public.is_scoreboard_frozen() AND NOT public.is_admin()
    THEN COALESCE(f.total_points, 0)
    ELSE COALESCE(a.total_points, 0)
  END AS total_points,
  CASE WHEN public.is_scoreboard_frozen() AND NOT public.is_admin()
    THEN COALESCE(f.solved_count, 0)
    ELSE COALESCE(a.solved_count, 0)
  END AS solved_count,
  CASE WHEN public.is_scoreboard_frozen() AND NOT public.is_admin()
    THEN f.last_solve
    ELSE a.last_solve
  END AS last_solve
FROM public.profiles p
LEFT JOIN public.user_score_agg a ON a.user_id = p.id
LEFT JOIN public.frozen_user_score f ON f.user_id = p.id
WHERE p.is_banned = false AND p.is_hidden = false;

CREATE OR REPLACE VIEW public.team_scores AS
SELECT
  t.id, t.name,
  (SELECT COUNT(*)::int FROM public.profiles p
    WHERE p.team_id = t.id AND p.is_banned = false) AS member_count,
  CASE WHEN public.is_scoreboard_frozen() AND NOT public.is_admin()
    THEN COALESCE(f.total_points, 0)
    ELSE COALESCE(a.total_points, 0)
  END AS total_points,
  CASE WHEN public.is_scoreboard_frozen() AND NOT public.is_admin()
    THEN COALESCE(f.solved_count, 0)
    ELSE COALESCE(a.solved_count, 0)
  END AS solved_count,
  CASE WHEN public.is_scoreboard_frozen() AND NOT public.is_admin()
    THEN f.last_solve
    ELSE a.last_solve
  END AS last_solve
FROM public.teams t
LEFT JOIN public.team_score_agg a ON a.team_id = t.id
LEFT JOIN public.frozen_team_score f ON f.team_id = t.id
WHERE t.is_banned = false;

-- ══ 5. Default privilege fence for the new tables ════════════════════

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON TABLES FROM authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon;
