-- Hint costs are now charged, challenges require a login, and an email can
-- only be registered once.

-- ── 1. Charge for hints ───────────────────────────────────────────────
--
-- unlock_hint handed over the content and nothing ever deducted the cost, so
-- the price shown next to every hint was decorative and hints were free.
-- Track what each player has spent and subtract it from their score.
--
-- total_points on the aggregate rows stays the points earned from solves;
-- the views subtract the spend, so the trigger that records a solve does not
-- need to know about hints at all.

ALTER TABLE public.user_score_agg
  ADD COLUMN IF NOT EXISTS hint_spend int NOT NULL DEFAULT 0;
ALTER TABLE public.team_score_agg
  ADD COLUMN IF NOT EXISTS hint_spend int NOT NULL DEFAULT 0;

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

  -- Spend, folded back in for players who unlocked hints but solved nothing.
  INSERT INTO public.user_score_agg (user_id, total_points, solved_count, hint_spend)
  SELECT hu.user_id, 0, 0, COALESCE(SUM(h.cost), 0)::int
  FROM public.hint_unlocks hu
  JOIN public.hints h ON h.id = hu.hint_id
  GROUP BY hu.user_id
  ON CONFLICT (user_id) DO UPDATE SET hint_spend = EXCLUDED.hint_spend;

  INSERT INTO public.team_score_agg (team_id, total_points, solved_count, hint_spend)
  SELECT p.team_id, 0, 0, COALESCE(SUM(h.cost), 0)::int
  FROM public.hint_unlocks hu
  JOIN public.hints h ON h.id = hu.hint_id
  JOIN public.profiles p ON p.id = hu.user_id
  WHERE p.team_id IS NOT NULL
  GROUP BY p.team_id
  ON CONFLICT (team_id) DO UPDATE SET hint_spend = EXCLUDED.hint_spend;
END;
$$;

-- ── 2. Refuse the unlock when the player cannot afford it ─────────────
CREATE OR REPLACE FUNCTION public.unlock_hint(p_hint_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_hint    record;
  v_visible boolean;
  v_team    uuid;
  v_balance int;
  v_already boolean;
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

  SELECT * INTO v_hint FROM public.hints h WHERE h.id = p_hint_id;
  IF v_hint IS NULL THEN
    RETURN jsonb_build_object('error', 'Hint not found');
  END IF;

  SELECT c.is_visible INTO v_visible
  FROM public.challenges c WHERE c.id = v_hint.challenge_id;

  IF v_visible IS NOT TRUE AND NOT public.is_admin() THEN
    RETURN jsonb_build_object('error', 'Hint not found');
  END IF;

  -- Already paid for: hand it back without charging again.
  SELECT EXISTS (
    SELECT 1 FROM public.hint_unlocks hu
    WHERE hu.user_id = auth.uid() AND hu.hint_id = p_hint_id
  ) INTO v_already;

  IF v_already THEN
    RETURN jsonb_build_object('success', true, 'text', v_hint.content);
  END IF;

  SELECT GREATEST(COALESCE(a.total_points, 0) - COALESCE(a.hint_spend, 0), 0)
    INTO v_balance
  FROM public.user_score_agg a WHERE a.user_id = auth.uid();

  v_balance := COALESCE(v_balance, 0);

  IF v_hint.cost > v_balance THEN
    RETURN jsonb_build_object(
      'error', format('Not enough points. This hint costs %s, you have %s.',
                      v_hint.cost, v_balance)
    );
  END IF;

  INSERT INTO public.hint_unlocks (user_id, hint_id)
  VALUES (auth.uid(), p_hint_id)
  ON CONFLICT (user_id, hint_id) DO NOTHING;

  IF v_hint.cost > 0 THEN
    INSERT INTO public.user_score_agg (user_id, total_points, solved_count, hint_spend)
    VALUES (auth.uid(), 0, 0, v_hint.cost)
    ON CONFLICT (user_id) DO UPDATE
      SET hint_spend = public.user_score_agg.hint_spend + v_hint.cost;

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

-- ── 3. Scores are now net of hint spend ───────────────────────────────
CREATE OR REPLACE VIEW public.user_scores AS
SELECT
  p.id, p.username, p.team_id, p.country, p.avatar_url,
  GREATEST(COALESCE(a.total_points, 0) - COALESCE(a.hint_spend, 0), 0) AS total_points,
  COALESCE(a.solved_count, 0) AS solved_count,
  a.last_solve
FROM public.profiles p
LEFT JOIN public.user_score_agg a ON a.user_id = p.id
WHERE COALESCE(p.is_banned, false) = false
  AND COALESCE(p.is_hidden, false) = false;

CREATE OR REPLACE VIEW public.team_scores AS
SELECT
  t.id, t.name,
  (SELECT COUNT(*)::int FROM public.profiles p
    WHERE p.team_id = t.id AND COALESCE(p.is_banned, false) = false) AS member_count,
  GREATEST(COALESCE(a.total_points, 0) - COALESCE(a.hint_spend, 0), 0) AS total_points,
  COALESCE(a.solved_count, 0) AS solved_count,
  a.last_solve
FROM public.teams t
LEFT JOIN public.team_score_agg a ON a.team_id = t.id
WHERE COALESCE(t.is_banned, false) = false;

-- ── 4. Challenges require a login ─────────────────────────────────────
--
-- public_challenges and public_hints were granted to anon, so titles,
-- descriptions, connection_info and hint costs were readable without an
-- account. The scoreboard views stay public.

REVOKE SELECT ON public.public_challenges FROM anon;
REVOKE SELECT ON public.public_hints FROM anon;

-- ── 5. One account per email address ──────────────────────────────────
--
-- Email confirmation is off, so nothing proves ownership of an address and
-- nothing stopped the same mailbox registering repeatedly through case
-- differences or a +tag, which is the usual way to farm extra accounts.
--
-- Compare on a normalised form: lowercased, with any +suffix removed.
-- The address itself is still stored as entered.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email_normalized text
  GENERATED ALWAYS AS (
    lower(split_part(split_part(email, '@', 1), '+', 1)
          || '@' || split_part(email, '@', 2))
  ) STORED;

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_email_normalized
  ON public.profiles (email_normalized);

-- Reject the duplicate inside the trigger so the whole sign-up rolls back
-- and no orphaned auth user is left behind.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_base      text;
  v_candidate text;
  v_suffix    integer := 0;
  v_norm      text;
BEGIN
  v_norm := lower(split_part(split_part(NEW.email, '@', 1), '+', 1)
                  || '@' || split_part(NEW.email, '@', 2));

  IF EXISTS (SELECT 1 FROM public.profiles p WHERE p.email_normalized = v_norm) THEN
    RAISE EXCEPTION 'An account already exists for this email address';
  END IF;

  v_base := NULLIF(trim(NEW.raw_user_meta_data->>'username'), '');

  IF v_base IS NULL THEN
    v_base := split_part(NEW.email, '@', 1);
  END IF;

  v_base := regexp_replace(v_base, '[^a-zA-Z0-9_-]', '_', 'g');
  v_base := left(v_base, 30);

  IF v_base IS NULL OR length(v_base) < 3 THEN
    v_base := left('user_' || replace(NEW.id::text, '-', ''), 30);
  END IF;

  v_candidate := v_base;

  WHILE EXISTS (SELECT 1 FROM public.profiles p WHERE p.username = v_candidate) LOOP
    v_suffix := v_suffix + 1;
    v_candidate := left(v_base, 30 - length(v_suffix::text)) || v_suffix::text;
  END LOOP;

  INSERT INTO public.profiles (id, username, email)
  VALUES (NEW.id, v_candidate, NEW.email);

  RETURN NEW;
END;
$$;

SELECT public.recompute_scores();
