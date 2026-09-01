-- One round trip for a flag submission instead of nine.
--
-- submit-flag did its work as a chain of sequential PostgREST calls from
-- Deno: profile, event, challenge, solved-check, attempt count, cooldown,
-- secret, then the INSERT. Each is a network hop to the database, so a
-- submission cost eight hops before the triggers even ran -- measured at
-- 2-3 seconds of server time end to end, which the client's "validating"
-- stage can only hide 620ms of.
--
-- This moves all of it into one SECURITY DEFINER function. The Edge
-- Function still owns what belongs at the edge -- CORS, the per-IP budget
-- (checked BEFORE JWT verification so a flood stays cheap), JWT
-- verification, and input validation -- and then makes exactly one call.
--
-- CONTRACT
--   The function returns {"status": <http>, "body": <json>} and the Edge
--   Function relays both verbatim. Every status and body below is the one
--   the old TypeScript produced for the same case, so the client sees no
--   change. The order of checks is also unchanged.
--
-- TWO THINGS THIS FIXES ON THE WAY
--   1. attemptsLeft was read before the INSERT with no lock, so parallel
--      submissions reported jumbled counts (seen live: 9996, 9998, 9997 for
--      eight requests sent together). The count is now taken under the same
--      per-(user, challenge) advisory lock enforce_max_attempts uses, so it
--      is exact.
--   2. The 10-second per-challenge cooldown was read-then-act in Deno with
--      nothing behind it, so N parallel requests all passed it. It is now
--      checked under that lock too. Same message, same 429.
--
-- LOCK ORDER (unchanged from 20260901010000, now taken explicitly up front
-- so the count and cooldown are covered, and re-acquired by the triggers
-- without waiting because transaction-level advisory locks are re-entrant):
--   1. rl:<user>            2. <user>:<challenge>
--   3. user_score_agg row   4. team_score_agg row
--
-- REGEX FLAGS
--   flag_type = 'regex' is evaluated with Postgres ~ (POSIX ARE) rather than
--   JavaScript RegExp. Nothing in the admin path has ever written flag_regex
--   (checked: only the schema mentions the column), so no live flag is
--   affected. If one is ever added, note that \b means backspace in ARE --
--   use \y for a word boundary -- and named groups are not supported. An
--   invalid pattern counts as a miss, matching the old try/catch.
--
-- TRIM
--   The old code compared JavaScript trim(); this uses btrim(), which is
--   what admin_upsert_challenge used to hash the flag in the first place.
--   The two differ only on exotic Unicode whitespace, which control-char
--   rejection at the edge already refuses.

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

  -- ── 2. Is the event open ─────────────────────────────────────────────
  SELECT e.is_active, e.start_time, e.end_time INTO v_event
  FROM public.event_settings e WHERE e.id = 1;

  IF NOT FOUND OR NOT COALESCE(v_event.is_active, false) THEN
    RETURN jsonb_build_object('status', 200, 'body',
      jsonb_build_object('correct', false, 'error', 'Event not active'));
  END IF;
  IF v_event.start_time IS NOT NULL AND v_event.start_time > v_now THEN
    RETURN jsonb_build_object('status', 200, 'body',
      jsonb_build_object('correct', false, 'error', 'Event has not started'));
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
      jsonb_build_object('error', 'Challenge misconfigured'));
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

-- Trusts p_user_id, so nothing but the Edge Function may call it.
REVOKE EXECUTE ON FUNCTION public.submit_flag_tx(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.submit_flag_tx(uuid, uuid, text, text) TO service_role;
