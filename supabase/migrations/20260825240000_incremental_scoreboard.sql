-- Make the scoreboard cheap to read.
--
-- user_scores and team_scores recomputed every score from the submissions
-- table on every read, through a LATERAL evaluated once per profile (or per
-- team) before ORDER BY/LIMIT could discard anything. Every player polls both
-- views every 30 seconds, so the cost of the hottest read path in the app grew
-- with players x submissions while the instance stayed a t4g.nano.
--
-- Invert it: keep running totals updated when a solve happens, which is rare,
-- and let reads be an indexed join, which is constant. Same view names and
-- columns, so nothing in the frontend changes.

CREATE TABLE IF NOT EXISTS public.user_score_agg (
  user_id      uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  total_points int NOT NULL DEFAULT 0,
  solved_count int NOT NULL DEFAULT 0,
  last_solve   timestamptz
);

CREATE TABLE IF NOT EXISTS public.team_score_agg (
  team_id      uuid PRIMARY KEY REFERENCES public.teams(id) ON DELETE CASCADE,
  total_points int NOT NULL DEFAULT 0,
  solved_count int NOT NULL DEFAULT 0,
  last_solve   timestamptz
);

-- No policies: these are internal totals. The score views are security definer
-- (the PostgreSQL default for views), so they read these tables as the owner
-- while direct client access stays denied.
ALTER TABLE public.user_score_agg ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_score_agg ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.user_score_agg FROM anon, authenticated;
REVOKE ALL ON public.team_score_agg FROM anon, authenticated;

-- ── Full rebuild, used to seed and as the repair path ─────────────────
CREATE OR REPLACE FUNCTION public.recompute_scores()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  DELETE FROM public.user_score_agg;
  DELETE FROM public.team_score_agg;

  INSERT INTO public.user_score_agg (user_id, total_points, solved_count, last_solve)
  SELECT d.user_id, COALESCE(SUM(d.pts), 0)::int, COUNT(*)::int, MAX(d.solved_at)
  FROM (
    SELECT DISTINCT ON (s.user_id, s.challenge_id)
      s.user_id, c.points AS pts, s.submitted_at AS solved_at
    FROM public.submissions s
    JOIN public.challenges c ON c.id = s.challenge_id
    WHERE s.is_correct = true
    ORDER BY s.user_id, s.challenge_id, s.submitted_at ASC
  ) d
  GROUP BY d.user_id;

  INSERT INTO public.team_score_agg (team_id, total_points, solved_count, last_solve)
  SELECT d.team_id, COALESCE(SUM(d.pts), 0)::int, COUNT(*)::int, MAX(d.solved_at)
  FROM (
    SELECT DISTINCT ON (s.team_id, s.challenge_id)
      s.team_id, c.points AS pts, s.submitted_at AS solved_at
    FROM public.submissions s
    JOIN public.challenges c ON c.id = s.challenge_id
    WHERE s.is_correct = true AND s.team_id IS NOT NULL
    ORDER BY s.team_id, s.challenge_id, s.submitted_at ASC
  ) d
  GROUP BY d.team_id;
END;
$$;

-- ── Incremental update on each solve ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.apply_solve_to_scores()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_points int;
BEGIN
  IF NEW.is_correct IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  SELECT c.points INTO v_points FROM public.challenges c WHERE c.id = NEW.challenge_id;
  IF v_points IS NULL THEN
    RETURN NEW;
  END IF;

  -- Count a challenge once per user, however many correct rows exist.
  IF NOT EXISTS (
    SELECT 1 FROM public.submissions s
    WHERE s.user_id = NEW.user_id AND s.challenge_id = NEW.challenge_id
      AND s.is_correct = true AND s.id <> NEW.id
  ) THEN
    INSERT INTO public.user_score_agg (user_id, total_points, solved_count, last_solve)
    VALUES (NEW.user_id, v_points, 1, NEW.submitted_at)
    ON CONFLICT (user_id) DO UPDATE SET
      total_points = public.user_score_agg.total_points + v_points,
      solved_count = public.user_score_agg.solved_count + 1,
      last_solve   = GREATEST(public.user_score_agg.last_solve, NEW.submitted_at);
  END IF;

  -- And once per team, so a second member re-solving adds nothing.
  IF NEW.team_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.submissions s
    WHERE s.team_id = NEW.team_id AND s.challenge_id = NEW.challenge_id
      AND s.is_correct = true AND s.id <> NEW.id
  ) THEN
    INSERT INTO public.team_score_agg (team_id, total_points, solved_count, last_solve)
    VALUES (NEW.team_id, v_points, 1, NEW.submitted_at)
    ON CONFLICT (team_id) DO UPDATE SET
      total_points = public.team_score_agg.total_points + v_points,
      solved_count = public.team_score_agg.solved_count + 1,
      last_solve   = GREATEST(public.team_score_agg.last_solve, NEW.submitted_at);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_solve_to_scores ON public.submissions;
CREATE TRIGGER trg_apply_solve_to_scores
  AFTER INSERT ON public.submissions
  FOR EACH ROW EXECUTE FUNCTION public.apply_solve_to_scores();

-- ── Views now read the totals instead of deriving them ────────────────
CREATE OR REPLACE VIEW public.user_scores AS
SELECT
  p.id, p.username, p.team_id, p.country, p.avatar_url,
  COALESCE(a.total_points, 0) AS total_points,
  COALESCE(a.solved_count, 0) AS solved_count,
  a.last_solve
FROM public.profiles p
LEFT JOIN public.user_score_agg a ON a.user_id = p.id
WHERE p.is_banned = false AND p.is_hidden = false;

CREATE OR REPLACE VIEW public.team_scores AS
SELECT
  t.id, t.name,
  (SELECT COUNT(*)::int FROM public.profiles p
    WHERE p.team_id = t.id AND p.is_banned = false) AS member_count,
  COALESCE(a.total_points, 0) AS total_points,
  COALESCE(a.solved_count, 0) AS solved_count,
  a.last_solve
FROM public.teams t
LEFT JOIN public.team_score_agg a ON a.team_id = t.id
WHERE t.is_banned = false;

-- ── Keep the totals honest where submissions are removed wholesale ────

CREATE OR REPLACE FUNCTION public.admin_reset_event()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.is_admin() THEN RETURN jsonb_build_object('error', 'Unauthorized'); END IF;
  DELETE FROM public.submissions;
  DELETE FROM public.hint_unlocks;
  DELETE FROM public.user_score_agg;
  DELETE FROM public.team_score_agg;
  INSERT INTO public.audit_log (actor_id, action, metadata)
  VALUES (auth.uid(), 'reset_event', jsonb_build_object('ts', now()));
  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_challenge(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_submissions int;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.challenges c WHERE c.id = p_id) THEN
    RETURN jsonb_build_object('error', 'Challenge not found');
  END IF;

  SELECT COUNT(*) INTO v_submissions
  FROM public.submissions s WHERE s.challenge_id = p_id;

  DELETE FROM public.submissions s WHERE s.challenge_id = p_id;
  UPDATE public.challenges c SET unlock_after = NULL WHERE c.unlock_after = p_id;
  DELETE FROM public.challenges c WHERE c.id = p_id;

  -- Its points were folded into the running totals.
  PERFORM public.recompute_scores();

  INSERT INTO public.audit_log (actor_id, action, metadata)
  VALUES (auth.uid(), 'delete_challenge',
          jsonb_build_object('challenge_id', p_id,
                             'submissions_removed', v_submissions));

  RETURN jsonb_build_object('success', true, 'submissions_removed', v_submissions);
END;
$$;

-- Admins can repair totals after editing a challenge's points, which the
-- incremental path cannot see.
CREATE OR REPLACE FUNCTION public.admin_recompute_scores()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.is_admin() THEN RETURN jsonb_build_object('error', 'Unauthorized'); END IF;
  PERFORM public.recompute_scores();
  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_recompute_scores() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.recompute_scores() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_recompute_scores() TO authenticated, service_role;

-- Seed from whatever is already there.
SELECT public.recompute_scores();
