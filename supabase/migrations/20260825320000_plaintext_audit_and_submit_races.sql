-- Anti-cheat submission log, plus the races on the submission path.

-- ══ 1. Record what was actually typed, readable by admins only ════════
--
-- submissions only kept a SHA-256 of the attempt, so an organiser could not
-- see what a player submitted and had no way to spot flag sharing: identical
-- wrong guesses across unrelated teams, a correct flag from someone who never
-- opened the challenge, or a flag appearing before its challenge was released.
--
-- Store the raw text as well. The hash column stays exactly as it is so
-- nothing that reads it changes.

ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS submitted_flag text;

COMMENT ON COLUMN public.submissions.submitted_flag IS
  'Raw text of the attempt, for cheat investigation. Admin-readable only: '
  'SELECT is granted per-column to authenticated and this column is excluded.';

-- Column privileges, not RLS: RLS filters rows, and a player is still allowed
-- to read their own submission rows. Table-level SELECT has to go first,
-- because a column-level REVOKE cannot carve an exception out of it.
REVOKE SELECT ON public.submissions FROM authenticated;
GRANT SELECT (
  id, user_id, challenge_id, team_id,
  submitted_flag_hash, is_correct, ip_address, submitted_at
) ON public.submissions TO authenticated;

-- ── Admin view of the log, with the plaintext ─────────────────────────
CREATE OR REPLACE FUNCTION public.admin_list_submissions(p_limit int DEFAULT 100)
RETURNS TABLE(
  id uuid, user_id uuid, username text, team_id uuid, team_name text,
  challenge_id uuid, challenge_title text,
  submitted_flag text, submitted_flag_hash text,
  is_correct boolean, ip_address text, submitted_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = '' AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  RETURN QUERY
  SELECT
    s.id, s.user_id, p.username, s.team_id, t.name,
    s.challenge_id, c.title,
    s.submitted_flag, s.submitted_flag_hash,
    s.is_correct, host(s.ip_address), s.submitted_at
  FROM public.submissions s
  LEFT JOIN public.profiles p   ON p.id = s.user_id
  LEFT JOIN public.teams t      ON t.id = s.team_id
  LEFT JOIN public.challenges c ON c.id = s.challenge_id
  ORDER BY s.submitted_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 100), 1000));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_list_submissions(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_submissions(int) TO authenticated, service_role;

-- ══ 2. Serialise everything on the submission path ════════════════════
--
-- enforce_max_attempts counted prior attempts with no lock at all — its own
-- comment claimed "uses FOR UPDATE to lock rows", which was never true. Two
-- requests sent together both counted the same total and both passed, so the
-- attempt limit could be walked past by submitting in parallel.
--
-- The same gap let scoring be double-counted: apply_solve_to_scores decides
-- whether a solve is the player's first by looking for another correct row,
-- and under READ COMMITTED a concurrent insert is invisible until it commits,
-- so two simultaneous correct submissions each looked like the first and each
-- awarded full points.
--
-- One transaction-scoped advisory lock keyed on (user, challenge) closes both:
-- it is taken BEFORE INSERT, so it is held while the AFTER INSERT scoring
-- trigger runs in the same transaction. The second request waits, and once it
-- proceeds its statements see the committed row.
CREATE OR REPLACE FUNCTION public.enforce_max_attempts()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_max_attempts  integer;
  v_current_count integer;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(NEW.user_id::text || ':' || NEW.challenge_id::text, 0)
  );

  SELECT c.max_attempts INTO v_max_attempts
  FROM public.challenges c WHERE c.id = NEW.challenge_id;

  IF v_max_attempts IS NULL OR v_max_attempts = 0 THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_current_count
  FROM public.submissions s
  WHERE s.user_id = NEW.user_id AND s.challenge_id = NEW.challenge_id;

  IF v_current_count >= v_max_attempts THEN
    RAISE EXCEPTION 'Max attempts exceeded for this challenge';
  END IF;

  RETURN NEW;
END;
$$;

-- Structural backstop: one correct row per player per challenge, so a double
-- award is impossible even if a future change drops the lock.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_submission_correct_per_user_challenge
  ON public.submissions (user_id, challenge_id)
  WHERE is_correct = true;

-- Teammates solving the same challenge at the same instant are two different
-- (user, challenge) keys, so the advisory lock above does not order them.
-- Lock the team's aggregate row before deciding whether the team already had
-- this challenge.
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

  INSERT INTO public.user_score_agg (user_id, total_points, solved_count, hint_spend)
  VALUES (NEW.user_id, 0, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;

  PERFORM 1 FROM public.user_score_agg a
  WHERE a.user_id = NEW.user_id FOR UPDATE;

  IF NOT EXISTS (
    SELECT 1 FROM public.submissions s
    WHERE s.user_id = NEW.user_id AND s.challenge_id = NEW.challenge_id
      AND s.is_correct = true AND s.id <> NEW.id
  ) THEN
    UPDATE public.user_score_agg a SET
      total_points = a.total_points + v_points,
      solved_count = a.solved_count + 1,
      last_solve   = GREATEST(a.last_solve, NEW.submitted_at)
    WHERE a.user_id = NEW.user_id;
  END IF;

  IF NEW.team_id IS NOT NULL THEN
    INSERT INTO public.team_score_agg (team_id, total_points, solved_count, hint_spend)
    VALUES (NEW.team_id, 0, 0, 0)
    ON CONFLICT (team_id) DO NOTHING;

    PERFORM 1 FROM public.team_score_agg a
    WHERE a.team_id = NEW.team_id FOR UPDATE;

    IF NOT EXISTS (
      SELECT 1 FROM public.submissions s
      WHERE s.team_id = NEW.team_id AND s.challenge_id = NEW.challenge_id
        AND s.is_correct = true AND s.id <> NEW.id
    ) THEN
      UPDATE public.team_score_agg a SET
        total_points = a.total_points + v_points,
        solved_count = a.solved_count + 1,
        last_solve   = GREATEST(a.last_solve, NEW.submitted_at)
      WHERE a.team_id = NEW.team_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
