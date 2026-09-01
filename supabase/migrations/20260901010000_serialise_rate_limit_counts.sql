-- Two rate limiters counted before they locked, so they could be walked past.
--
-- Both public.check_rate_limit (the per-IP submit budget and the create_team
-- cap) and the enforce_global_rate_limit trigger (30 submissions per minute
-- per account) do the same thing: count recent rows, compare to a ceiling,
-- then add a row. Under READ COMMITTED a row another session has not yet
-- committed is invisible, so N requests sent at the same instant all see the
-- same count and all pass. Reproduced with 5 concurrent sessions and 1 slot
-- left: the 30/min cap admitted 34, the 60/min IP budget admitted 65.
--
-- The 30/min trigger has an extra wrinkle. enforce_max_attempts DOES take an
-- advisory lock on (user, challenge), and it is on the same table -- but
-- Postgres fires BEFORE ROW triggers in name order, and
-- trigger_enforce_global_rate_limit sorts before trigger_enforce_max_attempts.
-- So the rate count runs first, unlocked, and only THEN does the row wait on
-- the lock. A second request parks on the lock having already been admitted.
-- Also, the lock is per-challenge, and the 30/min cap is per-account, so
-- submitting to five different challenges at once never touches the same
-- lock at all.
--
-- Fix is the pattern enforce_max_attempts already uses: take a transaction-
-- scoped advisory lock keyed on the thing being counted BEFORE counting.
-- Requests for the same key serialise; everything else is untouched.
--
-- Lock order, so the two triggers cannot deadlock each other or the scoring
-- trigger that follows them:
--   1. rl:<user>            (this migration, enforce_global_rate_limit)
--   2. <user>:<challenge>   (enforce_max_attempts)
--   3. user_score_agg row   (apply_solve_to_scores, FOR UPDATE)
--   4. team_score_agg row   (apply_solve_to_scores, FOR UPDATE)
-- Every submission takes them in that order because trigger name order is
-- fixed and apply_solve_to_scores is AFTER INSERT. Different users never
-- share 1 or 2, so cross-user contention is only on 4, which was already
-- the case.
--
-- max_attempts is not changed: its lock was already correct, and the
-- concurrent test held it at exactly 3 of 3.

-- ── 1. check_rate_limit ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_bucket          text,
  p_key             text,
  p_window_seconds  int,
  p_max_hits        int
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_recent int;
BEGIN
  -- Serialise on (bucket, key). Held to end of transaction, so the INSERT
  -- below is visible to the next caller before it counts.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('rl:' || p_bucket || ':' || p_key, 0)
  );

  SELECT count(*) INTO v_recent
  FROM public.rate_limit_events
  WHERE bucket = p_bucket AND key = p_key
    AND ts > now() - make_interval(secs => p_window_seconds);

  IF v_recent >= p_max_hits THEN
    RAISE EXCEPTION 'Rate limit exceeded (% per % seconds)', p_max_hits, p_window_seconds
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.rate_limit_events (bucket, key) VALUES (p_bucket, p_key);

  -- Lazy cleanup, once every ~100 calls.
  IF random() < 0.01 THEN
    DELETE FROM public.rate_limit_events WHERE ts < now() - interval '1 hour';
  END IF;
END;
$$;

-- Grants are unchanged by CREATE OR REPLACE; restated so a reader of this
-- file alone can see the function is service_role-only.
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text,text,int,int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text,text,int,int) TO service_role;

-- ── 2. enforce_global_rate_limit ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_global_rate_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_recent int;
  v_role   text;
BEGIN
  -- Admins test their own challenges and stress the platform on purpose.
  -- Matches the isAdmin exemption in submit-flag.
  SELECT p.role INTO v_role
  FROM public.profiles p WHERE p.id = NEW.user_id;
  IF v_role = 'admin' THEN
    RETURN NEW;
  END IF;

  -- Per-account lock, taken before the count. This trigger fires first by
  -- name order, so it is always the first lock a submission takes.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('rl:' || NEW.user_id::text, 0)
  );

  -- Only the user's own writes count. The index on (user_id, challenge_id)
  -- backs this scan; a separate index on submitted_at is not worth its cost.
  SELECT COUNT(*)::int INTO v_recent
  FROM public.submissions s
  WHERE s.user_id = NEW.user_id
    AND s.submitted_at > now() - interval '60 seconds';

  IF v_recent >= 30 THEN
    -- The Edge Function forwards any exception starting with these words as
    -- a 429; matches how the per-challenge cooldown surfaces.
    RAISE EXCEPTION 'Rate limit exceeded: max 30 submissions per minute'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;
