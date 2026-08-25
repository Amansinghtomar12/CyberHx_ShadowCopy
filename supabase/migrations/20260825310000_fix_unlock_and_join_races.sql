-- Two check-then-act races a competitor could drive on purpose.

-- ── 1. unlock_hint could be made to overspend ─────────────────────────
--
-- The balance was read with a plain SELECT and the charge applied afterwards,
-- with nothing serialising concurrent calls. Firing N unlock requests at once
-- meant every one of them read the same pre-charge balance and passed the
-- affordability check, so a player holding 100 points could unlock an
-- unlimited number of 100 point hints by issuing them in parallel. During a
-- CTF that is a deliberate exploit, not a rare accident.
--
-- Second defect in the same block: the charge ran whether or not the
-- ON CONFLICT DO NOTHING insert actually created the unlock, so two
-- simultaneous calls for the SAME hint could both bill for it.
--
-- Take a row lock on the player's aggregate before reading the balance, which
-- serialises that player's unlocks for the length of the transaction, and only
-- charge when this call is the one that created the row.

CREATE OR REPLACE FUNCTION public.unlock_hint(p_hint_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_hint     record;
  v_visible  boolean;
  v_team     uuid;
  v_balance  int;
  v_inserted uuid;
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

  -- Already paid for: return it without touching the balance.
  IF EXISTS (
    SELECT 1 FROM public.hint_unlocks hu
    WHERE hu.user_id = auth.uid() AND hu.hint_id = p_hint_id
  ) THEN
    RETURN jsonb_build_object('success', true, 'text', v_hint.content);
  END IF;

  -- Guarantee the row exists so there is something to lock, then lock it.
  -- Concurrent unlocks by this player now queue here instead of all reading
  -- the same stale balance.
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

  -- Only the call that actually created the unlock pays for it.
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

-- ── 2. join_team could be raced past the size limit ───────────────────
--
-- The member count was read without locking the team, so N players submitting
-- the same invite code at once all saw a count below team_size and all joined,
-- putting a team over the limit the organiser set. Lock the team row while
-- counting. Also return a clear message when a team name is already taken
-- instead of letting the UNIQUE violation surface as an unhandled 500.

CREATE OR REPLACE FUNCTION public.join_team(p_invite_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_team         record;
  v_event        record;
  v_profile      record;
  v_member_count int;
BEGIN
  SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();
  IF v_profile IS NULL OR v_profile.is_banned THEN
    RETURN jsonb_build_object('error', 'Account not found or banned');
  END IF;
  IF v_profile.team_id IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'Already in a team');
  END IF;

  SELECT * INTO v_event FROM public.event_settings WHERE id = 1;
  IF v_event.is_active AND NOT v_event.allow_team_changes THEN
    RETURN jsonb_build_object('error', 'Team changes locked during event');
  END IF;

  -- FOR UPDATE: serialise everyone racing the same invite code.
  SELECT * INTO v_team FROM public.teams
  WHERE invite_code = trim(p_invite_code)
  FOR UPDATE;

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

CREATE OR REPLACE FUNCTION public.create_team(p_name text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_team_id uuid;
  v_event   record;
  v_profile record;
BEGIN
  SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();
  IF v_profile IS NULL OR v_profile.is_banned THEN
    RETURN jsonb_build_object('error', 'Account not found or banned');
  END IF;
  IF v_profile.team_id IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'Already in a team');
  END IF;

  SELECT * INTO v_event FROM public.event_settings WHERE id = 1;
  IF v_event.is_active AND NOT v_event.allow_team_changes THEN
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
