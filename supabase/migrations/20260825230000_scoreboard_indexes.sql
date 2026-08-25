-- Indexes for the scoreboard read path, which is the hottest query in the
-- app: every player polls both score views every 30 seconds.
--
-- The base schema indexes submissions three ways but never indexes the
-- columns the score views filter profiles by.

-- team_scores runs, once per team in the result:
--   SELECT COUNT(*) FROM profiles WHERE team_id = t.id AND is_banned = false
-- With no index that is a sequential scan of profiles per team, so rendering
-- the team table costs teams x players row reads on every poll.
CREATE INDEX IF NOT EXISTS idx_profiles_team_id
  ON public.profiles (team_id)
  WHERE team_id IS NOT NULL;

-- user_scores computes its LATERAL for every profile before ORDER BY/LIMIT
-- can discard any, and that subquery filters user_id AND is_correct. The
-- existing idx_submissions_user_challenge covers the user_id prefix but
-- carries every wrong guess too, which is the bulk of the table during an
-- event. A partial index holds only solves.
CREATE INDEX IF NOT EXISTS idx_submissions_user_correct
  ON public.submissions (user_id, challenge_id)
  WHERE is_correct = true;
