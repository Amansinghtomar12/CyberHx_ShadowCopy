-- Two holes the deep audit surfaced before the event.
--
-- ── 1. THE RATE LIMIT WAS PER-INSTANCE, NOT PER-USER ─────────────────
--   submit-flag holds its "30 submissions per minute" in a module-scope
--   Map. Deno Deploy runs many isolates in parallel, each with its own
--   Map, and a cold isolate starts empty -- so the real ceiling is
--   30 x however many isolates a burst happens to land on. At 5k users
--   that is enough to turn brute-forcing a short flag into a real
--   option and to burn a lot of DB CPU on hash comparisons.
--
--   Move the check into the database, where every isolate agrees on the
--   same count. A BEFORE trigger on submissions rejects the 31st insert
--   inside a rolling 60-second window with a signal the Edge Function
--   already handles.
--
-- ── 2. safe_profiles WAS OPEN TO EVERYONE ────────────────────────────
--   Anyone logged out could dump the full user roster -- usernames,
--   country, team. That is inconvenient on its own; the sharper edge
--   is that Google signups default the username to the email
--   local-part, so a public username leaks part of a real address.
--
--   Both frontend readers are on authenticated routes (App and
--   TeamProfile), so requiring auth breaks nothing: leaderboards run
--   through user_scores and team_scores, which stay open. This is the
--   smallest change that closes the anonymous leak now; renaming
--   Google-derived usernames is a separate follow-up.

-- ── 1. RATE LIMIT ────────────────────────────────────────────────────
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

DROP TRIGGER IF EXISTS trigger_enforce_global_rate_limit ON public.submissions;
CREATE TRIGGER trigger_enforce_global_rate_limit
  BEFORE INSERT ON public.submissions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_global_rate_limit();

-- ── 2. SEAL THE ROSTER ───────────────────────────────────────────────
REVOKE SELECT ON public.safe_profiles FROM anon;
-- authenticated already has SELECT by default privilege; kept explicit so
-- the intent is visible without hunting the schema.
GRANT SELECT ON public.safe_profiles TO authenticated;
