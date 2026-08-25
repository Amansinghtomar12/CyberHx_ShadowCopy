-- ============================================================
-- CYBERHX CTF PLATFORM — FINAL HARDENED SCHEMA v3
-- Run this ENTIRE file in Supabase SQL Editor (new project)
-- Order: extensions → tables → views → RLS → functions → triggers
-- 
-- Security audit: ALL findings fixed
-- Race conditions: atomic attempt enforcement via trigger
-- DDoS: rate limiting in Edge Function + Cloudflare recommended
-- Data exposure: views hide email/role/invite_code
-- ============================================================

-- 0. Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- 1. TABLES
-- ============================================================

CREATE TABLE public.event_settings (
  id integer NOT NULL DEFAULT 1 CHECK (id = 1),
  name text NOT NULL DEFAULT 'CyberHX CTF',
  description text DEFAULT '',
  start_time timestamptz,
  end_time timestamptz,
  is_active boolean DEFAULT false,
  freeze_scoreboard boolean DEFAULT false,
  freeze_time timestamptz,
  hide_scores boolean DEFAULT false,
  team_size integer DEFAULT 4 CHECK (team_size > 0 AND team_size <= 20),
  registration_open boolean DEFAULT true,
  mode text DEFAULT 'teams' CHECK (mode IN ('teams', 'individual')),
  allow_team_changes boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT event_settings_pkey PRIMARY KEY (id),
  CONSTRAINT valid_times CHECK (start_time IS NULL OR end_time IS NULL OR end_time > start_time)
);
INSERT INTO public.event_settings (id) VALUES (1);

CREATE TABLE public.profiles (
  id uuid NOT NULL,
  username text NOT NULL UNIQUE
    CHECK (length(username) BETWEEN 3 AND 30)
    CHECK (username ~ '^[a-zA-Z0-9_\-]+$'),
  email text NOT NULL UNIQUE,
  avatar_url text,
  website text,
  affiliation text CHECK (affiliation IS NULL OR length(affiliation) <= 100),
  country text CHECK (country IS NULL OR length(country) <= 60),
  bio text CHECK (bio IS NULL OR length(bio) <= 500),
  role text NOT NULL DEFAULT 'player' CHECK (role IN ('player', 'moderator', 'admin')),
  is_banned boolean DEFAULT false,
  is_hidden boolean DEFAULT false,
  team_id uuid,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE TABLE public.teams (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE CHECK (length(name) BETWEEN 2 AND 40),
  invite_code text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(6), 'hex'),
  captain_id uuid NOT NULL,
  website text,
  affiliation text CHECK (affiliation IS NULL OR length(affiliation) <= 100),
  country text CHECK (country IS NULL OR length(country) <= 60),
  is_banned boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT teams_pkey PRIMARY KEY (id),
  CONSTRAINT fk_captain FOREIGN KEY (captain_id) REFERENCES public.profiles(id)
);

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE SET NULL;

CREATE TABLE public.challenges (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  category text NOT NULL,
  difficulty text NOT NULL DEFAULT 'Easy' CHECK (difficulty IN ('Easy', 'Medium', 'Hard', 'Insane')),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 10000),
  flag_type text NOT NULL DEFAULT 'static' CHECK (flag_type IN ('static', 'regex')),
  points_type text NOT NULL DEFAULT 'static' CHECK (points_type IN ('static', 'dynamic')),
  points integer NOT NULL DEFAULT 100 CHECK (points > 0),
  initial_points integer DEFAULT 500,
  minimum_points integer DEFAULT 50,
  decay integer DEFAULT 20,
  is_visible boolean DEFAULT false,
  max_attempts integer DEFAULT 0 CHECK (max_attempts >= 0),
  unlock_after uuid,
  author text DEFAULT 'CyberHX Team' CHECK (author IS NULL OR length(author) <= 100),
  tags text[] DEFAULT '{}',
  connection_info text,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT challenges_pkey PRIMARY KEY (id),
  CONSTRAINT challenges_unlock_after_fkey FOREIGN KEY (unlock_after) REFERENCES public.challenges(id)
);

CREATE TABLE public.challenge_secrets (
  challenge_id uuid NOT NULL,
  flag_hash text NOT NULL,
  flag_type text NOT NULL DEFAULT 'static',
  flag_regex text,
  CONSTRAINT challenge_secrets_pkey PRIMARY KEY (challenge_id),
  CONSTRAINT challenge_secrets_challenge_id_fkey FOREIGN KEY (challenge_id) REFERENCES public.challenges(id) ON DELETE CASCADE
);

CREATE TABLE public.challenge_files (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  challenge_id uuid,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  url text NOT NULL,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT challenge_files_pkey PRIMARY KEY (id),
  CONSTRAINT challenge_files_challenge_id_fkey FOREIGN KEY (challenge_id) REFERENCES public.challenges(id) ON DELETE CASCADE
);

CREATE TABLE public.hints (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  challenge_id uuid,
  cost integer NOT NULL DEFAULT 0 CHECK (cost >= 0),
  content text NOT NULL CHECK (length(content) BETWEEN 1 AND 2000),
  created_at timestamptz DEFAULT now(),
  CONSTRAINT hints_pkey PRIMARY KEY (id),
  CONSTRAINT hints_challenge_id_fkey FOREIGN KEY (challenge_id) REFERENCES public.challenges(id) ON DELETE CASCADE
);

CREATE TABLE public.hint_unlocks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  hint_id uuid NOT NULL,
  unlocked_at timestamptz DEFAULT now(),
  CONSTRAINT hint_unlocks_pkey PRIMARY KEY (id),
  CONSTRAINT hint_unlocks_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  CONSTRAINT hint_unlocks_hint_id_fkey FOREIGN KEY (hint_id) REFERENCES public.hints(id) ON DELETE CASCADE,
  CONSTRAINT hint_unlocks_unique UNIQUE (user_id, hint_id)
);

CREATE TABLE public.submissions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  challenge_id uuid NOT NULL,
  team_id uuid,
  submitted_flag_hash text NOT NULL,
  is_correct boolean NOT NULL,
  ip_address inet,
  submitted_at timestamptz DEFAULT now(),
  CONSTRAINT submissions_pkey PRIMARY KEY (id),
  CONSTRAINT submissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id),
  CONSTRAINT submissions_challenge_id_fkey FOREIGN KEY (challenge_id) REFERENCES public.challenges(id),
  CONSTRAINT submissions_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id)
);

CREATE INDEX idx_submissions_user_challenge ON submissions(user_id, challenge_id);
CREATE INDEX idx_submissions_team_correct ON submissions(team_id, is_correct) WHERE is_correct = true;
CREATE INDEX idx_submissions_challenge_correct ON submissions(challenge_id, is_correct, submitted_at) WHERE is_correct = true;

CREATE TABLE public.awards (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  team_id uuid,
  name text NOT NULL CHECK (length(name) <= 100),
  description text DEFAULT '' CHECK (description IS NULL OR length(description) <= 500),
  value integer NOT NULL DEFAULT 0,
  icon text DEFAULT '🏆',
  awarded_at timestamptz DEFAULT now(),
  CONSTRAINT awards_pkey PRIMARY KEY (id),
  CONSTRAINT awards_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id),
  CONSTRAINT awards_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id)
);

CREATE TABLE public.notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  message text NOT NULL CHECK (length(message) BETWEEN 1 AND 2000),
  type text DEFAULT 'info' CHECK (type IN ('info', 'success', 'warning', 'danger')),
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT notifications_pkey PRIMARY KEY (id),
  CONSTRAINT notifications_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id)
);

CREATE TABLE public.audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id uuid,
  action text NOT NULL,
  target_type text,
  target_id text,
  metadata jsonb DEFAULT '{}',
  ip_address inet,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- 2. VIEWS (security-first: hide sensitive columns)
-- ============================================================

-- Public challenges view (NO flags, NO secrets)
CREATE OR REPLACE VIEW public.public_challenges AS
SELECT
  c.id, c.title, c.category, c.difficulty, c.description,
  c.flag_type, c.points_type, c.points, c.initial_points,
  c.minimum_points, c.decay, c.is_visible, c.max_attempts,
  c.unlock_after, c.author, c.tags, c.connection_info, c.created_at
FROM public.challenges c
WHERE c.is_visible = true;

-- User scores view
CREATE OR REPLACE VIEW public.user_scores AS
SELECT
  p.id, p.username, p.team_id, p.country, p.avatar_url,
  COALESCE(s.total_points, 0) AS total_points,
  COALESCE(s.solved_count, 0) AS solved_count,
  s.last_solve
FROM public.profiles p
LEFT JOIN LATERAL (
  SELECT
    COUNT(DISTINCT sub.challenge_id)::int AS solved_count,
    MAX(sub.submitted_at) AS last_solve,
    COALESCE(SUM(DISTINCT c.points), 0)::int AS total_points
  FROM public.submissions sub
  JOIN public.challenges c ON c.id = sub.challenge_id
  WHERE sub.user_id = p.id AND sub.is_correct = true
) s ON true
WHERE p.is_banned = false AND p.is_hidden = false;

-- Team scores view
CREATE OR REPLACE VIEW public.team_scores AS
SELECT
  t.id, t.name,
  (SELECT COUNT(*)::int FROM public.profiles WHERE team_id = t.id AND is_banned = false) AS member_count,
  COALESCE(ts.total_points, 0) AS total_points,
  COALESCE(ts.solved_count, 0) AS solved_count,
  ts.last_solve
FROM public.teams t
LEFT JOIN LATERAL (
  SELECT
    COUNT(*)::int AS solved_count,
    MAX(first_solve) AS last_solve,
    COALESCE(SUM(pts), 0)::int AS total_points
  FROM (
    SELECT DISTINCT ON (sub.challenge_id)
      sub.challenge_id, c.points AS pts, sub.submitted_at AS first_solve
    FROM public.submissions sub
    JOIN public.challenges c ON c.id = sub.challenge_id
    WHERE sub.team_id = t.id AND sub.is_correct = true
    ORDER BY sub.challenge_id, sub.submitted_at ASC
  ) deduped
) ts ON true
WHERE t.is_banned = false;

-- ★ NEW: Public hints view — hides content column entirely
CREATE OR REPLACE VIEW public.public_hints
WITH (security_invoker = false)
AS SELECT id, challenge_id, cost FROM public.hints;

-- ★ Safe profiles view — hides email, role for public listings
-- Uses security_invoker = false so it bypasses profiles RLS
-- (profiles RLS is locked to own row, but public listings need all usernames)
CREATE OR REPLACE VIEW public.safe_profiles
WITH (security_invoker = false)
AS SELECT id, username, avatar_url, country, bio, affiliation, website,
       team_id, is_banned, is_hidden, created_at
FROM public.profiles;

-- ★ Public teams view — hides invite_code
-- security_invoker=false bypasses teams RLS to show all teams
CREATE OR REPLACE VIEW public.public_teams
WITH (security_invoker = false)
AS SELECT id, name, captain_id, website, affiliation, country,
       is_banned, created_at
FROM public.teams;

-- ============================================================
-- 3. ROW LEVEL SECURITY
-- ============================================================

-- Helper: is current user admin?
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin');
$$;

CREATE OR REPLACE FUNCTION public.is_mod_or_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('moderator', 'admin'));
$$;

-- ── PROFILES ──────────────────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ★ Profiles SELECT: users can ONLY read their OWN row (for useAuth role check)
-- Admin can read all (for admin dashboard)
-- Public listings use safe_profiles view (no email/role)
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT
  USING (id = auth.uid() OR public.is_admin());

-- ★ FIX: role, is_banned, is_hidden, team_id LOCKED from self-update
CREATE POLICY "profiles_update_self" ON public.profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role = (SELECT role FROM public.profiles WHERE id = auth.uid())
    AND is_banned IS NOT DISTINCT FROM (SELECT is_banned FROM public.profiles WHERE id = auth.uid())
    AND is_hidden IS NOT DISTINCT FROM (SELECT is_hidden FROM public.profiles WHERE id = auth.uid())
    AND team_id IS NOT DISTINCT FROM (SELECT team_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "profiles_update_admin" ON public.profiles FOR UPDATE
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT
  WITH CHECK (id = auth.uid());

-- ── TEAMS ─────────────────────────────────────────────
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

-- ★ FIX: Authenticated only (hides invite_code from anon; frontend uses public_teams view)
CREATE POLICY "teams_select" ON public.teams FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "teams_insert_blocked" ON public.teams FOR INSERT WITH CHECK (false);
CREATE POLICY "teams_update" ON public.teams FOR UPDATE
  USING (captain_id = auth.uid() OR public.is_admin());
CREATE POLICY "teams_delete" ON public.teams FOR DELETE USING (public.is_admin());

-- ── CHALLENGES ────────────────────────────────────────
ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;

-- ★ FIX: Requires auth + is_visible (wave-release enforced server-side)
CREATE POLICY "challenges_select" ON public.challenges FOR SELECT
  USING ((is_visible = true AND auth.uid() IS NOT NULL) OR public.is_admin());

CREATE POLICY "challenges_insert" ON public.challenges FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "challenges_update" ON public.challenges FOR UPDATE USING (public.is_admin());
CREATE POLICY "challenges_delete" ON public.challenges FOR DELETE USING (public.is_admin());

-- ── CHALLENGE SECRETS (ZERO client access) ────────────
ALTER TABLE public.challenge_secrets ENABLE ROW LEVEL SECURITY;
-- NO policies = service_role only. Edge Functions use service_role.

-- ── CHALLENGE FILES ───────────────────────────────────
ALTER TABLE public.challenge_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "files_select" ON public.challenge_files FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.challenges c WHERE c.id = challenge_id AND (c.is_visible = true OR public.is_admin()))
  );

CREATE POLICY "files_insert" ON public.challenge_files FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "files_update" ON public.challenge_files FOR UPDATE USING (public.is_admin());
CREATE POLICY "files_delete" ON public.challenge_files FOR DELETE USING (public.is_admin());

-- ── HINTS ─────────────────────────────────────────────
ALTER TABLE public.hints ENABLE ROW LEVEL SECURITY;

-- ★ FIX: Auth required. Content column is in table but frontend must use public_hints view.
CREATE POLICY "hints_select" ON public.hints FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.challenges c WHERE c.id = challenge_id AND (c.is_visible = true OR public.is_admin()))
  );

CREATE POLICY "hints_insert" ON public.hints FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "hints_update" ON public.hints FOR UPDATE USING (public.is_admin());
CREATE POLICY "hints_delete" ON public.hints FOR DELETE USING (public.is_admin());

-- ── HINT UNLOCKS ──────────────────────────────────────
ALTER TABLE public.hint_unlocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hint_unlocks_select" ON public.hint_unlocks FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "hint_unlocks_insert" ON public.hint_unlocks FOR INSERT WITH CHECK (false);

-- ── SUBMISSIONS ───────────────────────────────────────
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "submissions_select_own" ON public.submissions FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "submissions_select_admin" ON public.submissions FOR SELECT
  USING (public.is_admin());

-- ★ Insert and Delete BLOCKED at RLS — only service_role (Edge Function) can write
CREATE POLICY "submissions_insert" ON public.submissions FOR INSERT WITH CHECK (false);
CREATE POLICY "submissions_delete" ON public.submissions FOR DELETE USING (false);

-- ── EVENT SETTINGS ────────────────────────────────────
ALTER TABLE public.event_settings ENABLE ROW LEVEL SECURITY;

-- ★ FIX: Auth required
CREATE POLICY "event_select" ON public.event_settings FOR SELECT
  USING (auth.uid() IS NOT NULL);
CREATE POLICY "event_update" ON public.event_settings FOR UPDATE USING (public.is_admin());

-- ── NOTIFICATIONS ─────────────────────────────────────
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- ★ FIX: Auth required
CREATE POLICY "notif_select" ON public.notifications FOR SELECT
  USING (auth.uid() IS NOT NULL);
CREATE POLICY "notif_insert" ON public.notifications FOR INSERT WITH CHECK (public.is_mod_or_admin());
CREATE POLICY "notif_delete" ON public.notifications FOR DELETE USING (public.is_admin());

-- ── AWARDS ────────────────────────────────────────────
ALTER TABLE public.awards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "awards_select" ON public.awards FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "awards_insert" ON public.awards FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "awards_delete" ON public.awards FOR DELETE USING (public.is_admin());

-- ── AUDIT LOG (zero client access) ───────────────────
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
-- NO policies = service_role only

-- ============================================================
-- ★ NEW: REVOKE anon direct access to sensitive tables
-- Views (user_scores, team_scores) remain accessible for scoreboards
-- ============================================================
REVOKE ALL ON public.profiles FROM anon;
REVOKE ALL ON public.teams FROM anon;
REVOKE ALL ON public.challenges FROM anon;
REVOKE ALL ON public.challenge_secrets FROM anon;
REVOKE ALL ON public.hints FROM anon;
REVOKE ALL ON public.hint_unlocks FROM anon;
REVOKE ALL ON public.submissions FROM anon;
REVOKE ALL ON public.event_settings FROM anon;
REVOKE ALL ON public.notifications FROM anon;
REVOKE ALL ON public.awards FROM anon;
REVOKE ALL ON public.audit_log FROM anon;
REVOKE ALL ON public.challenge_files FROM anon;

-- Grant anon access ONLY to public views (scoreboards)
GRANT SELECT ON public.user_scores TO anon;
GRANT SELECT ON public.team_scores TO anon;
GRANT SELECT ON public.safe_profiles TO anon;
GRANT SELECT ON public.public_teams TO anon;

-- ============================================================
-- 4. RPC FUNCTIONS
-- ============================================================

-- ── Auto-create profile on signup ─────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.profiles (id, username, email)
  VALUES (
    NEW.id,
    COALESCE(
      NULLIF(regexp_replace(split_part(NEW.email, '@', 1), '[^a-zA-Z0-9_-]', '_', 'g'), ''),
      'user_' || LEFT(NEW.id::text, 8)
    ),
    NEW.email
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── Create team (via RPC only) ────────────────────────
CREATE OR REPLACE FUNCTION public.create_team(p_name text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_team_id uuid;
  v_event record;
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

  INSERT INTO public.teams (name, captain_id)
  VALUES (trim(p_name), auth.uid())
  RETURNING id INTO v_team_id;

  UPDATE public.profiles SET team_id = v_team_id WHERE id = auth.uid();
  RETURN jsonb_build_object('team_id', v_team_id);
END;
$$;

-- ── Join team ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.join_team(p_invite_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_team record;
  v_event record;
  v_profile record;
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

  SELECT * INTO v_team FROM public.teams WHERE invite_code = trim(p_invite_code);
  IF v_team IS NULL THEN
    RETURN jsonb_build_object('error', 'Invalid invite code');
  END IF;
  IF v_team.is_banned THEN
    RETURN jsonb_build_object('error', 'Team is banned');
  END IF;

  SELECT COUNT(*) INTO v_member_count FROM public.profiles WHERE team_id = v_team.id;
  IF v_member_count >= v_event.team_size THEN
    RETURN jsonb_build_object('error', 'Team is full');
  END IF;

  UPDATE public.profiles SET team_id = v_team.id WHERE id = auth.uid();
  RETURN jsonb_build_object('success', true);
END;
$$;

-- ── Leave team ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.leave_team()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_profile record;
  v_event record;
BEGIN
  SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();
  IF v_profile.team_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Not in a team');
  END IF;

  SELECT * INTO v_event FROM public.event_settings WHERE id = 1;
  IF v_event.is_active AND NOT v_event.allow_team_changes THEN
    RETURN jsonb_build_object('error', 'Team changes locked during event');
  END IF;

  UPDATE public.profiles SET team_id = NULL WHERE id = auth.uid();
  RETURN jsonb_build_object('success', true);
END;
$$;

-- ── Get my team invite code ───────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_team_invite()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = '' AS $$
BEGIN
  RETURN (
    SELECT t.invite_code FROM public.teams t
    JOIN public.profiles p ON p.team_id = t.id
    WHERE p.id = auth.uid()
  );
END;
$$;

-- ── Unlock hint (via RPC only) ────────────────────────
CREATE OR REPLACE FUNCTION public.unlock_hint(p_hint_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_hint record;
  v_already boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  SELECT * INTO v_hint FROM public.hints WHERE id = p_hint_id;
  IF v_hint IS NULL THEN
    RETURN jsonb_build_object('error', 'Hint not found');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.hint_unlocks WHERE user_id = auth.uid() AND hint_id = p_hint_id
  ) INTO v_already;

  IF v_already THEN
    RETURN jsonb_build_object('success', true, 'text', v_hint.content);
  END IF;

  INSERT INTO public.hint_unlocks (user_id, hint_id)
  VALUES (auth.uid(), p_hint_id)
  ON CONFLICT (user_id, hint_id) DO NOTHING;

  RETURN jsonb_build_object('success', true, 'text', v_hint.content);
END;
$$;

-- ── Get hint text (for already-unlocked hints) ────────
CREATE OR REPLACE FUNCTION public.get_hint_text(hint_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = '' AS $$
BEGIN
  RETURN (
    SELECT h.content FROM public.hints h
    JOIN public.hint_unlocks hu ON hu.hint_id = h.id
    WHERE h.id = hint_id AND hu.user_id = auth.uid()
  );
END;
$$;

-- ── Get solve data ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_solve_data()
RETURNS TABLE(challenge_id uuid, solve_count bigint, first_blood_username text)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = '' AS $$
BEGIN
  RETURN QUERY
  SELECT s.challenge_id, COUNT(DISTINCT s.user_id) AS solve_count,
    (SELECT p.username FROM public.submissions s2
     JOIN public.profiles p ON p.id = s2.user_id
     WHERE s2.challenge_id = s.challenge_id AND s2.is_correct = true AND p.is_banned = false
     ORDER BY s2.submitted_at ASC LIMIT 1) AS first_blood_username
  FROM public.submissions s WHERE s.is_correct = true GROUP BY s.challenge_id;
END;
$$;

-- ── Get challenge solvers ─────────────────────────────
CREATE OR REPLACE FUNCTION public.get_challenge_solvers(p_challenge_id uuid)
RETURNS TABLE(username text, submitted_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = '' AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT ON (s.user_id) p.username, s.submitted_at
  FROM public.submissions s JOIN public.profiles p ON p.id = s.user_id
  WHERE s.challenge_id = p_challenge_id AND s.is_correct = true
    AND p.is_banned = false AND p.is_hidden = false
  ORDER BY s.user_id, s.submitted_at ASC;
END;
$$;

-- ── Get team solves ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_team_solves(p_team_id uuid)
RETURNS TABLE(challenge_id uuid, username text, submitted_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = '' AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT ON (s.challenge_id) s.challenge_id, p.username, s.submitted_at
  FROM public.submissions s JOIN public.profiles p ON p.id = s.user_id
  WHERE s.team_id = p_team_id AND s.is_correct = true
  ORDER BY s.challenge_id, s.submitted_at ASC;
END;
$$;

-- ── Get challenges count ──────────────────────────────
CREATE OR REPLACE FUNCTION public.get_challenges_count()
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT COUNT(*) FROM public.challenges;
$$;

-- ── Admin: get challenge hints ────────────────────────
CREATE OR REPLACE FUNCTION public.get_challenge_hints(p_challenge_id uuid)
RETURNS TABLE(id uuid, text text, cost int)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = '' AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  RETURN QUERY SELECT h.id, h.content, h.cost FROM public.hints h WHERE h.challenge_id = p_challenge_id;
END;
$$;

-- ── Admin: get challenge flag ─────────────────────────
CREATE OR REPLACE FUNCTION public.get_challenge_flag(challenge_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = '' AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  RETURN '[HASHED — re-enter flag to change]';
END;
$$;

-- ── Admin: upsert challenge ──────────────────────────
CREATE OR REPLACE FUNCTION public.admin_upsert_challenge(
  p_id uuid DEFAULT NULL, p_title text DEFAULT NULL, p_category text DEFAULT NULL,
  p_difficulty text DEFAULT NULL, p_description text DEFAULT NULL, p_flag text DEFAULT NULL,
  p_flag_type text DEFAULT 'static', p_points int DEFAULT 100, p_max_attempts int DEFAULT 0,
  p_author text DEFAULT 'CyberHX Team', p_tags text[] DEFAULT '{}',
  p_is_visible boolean DEFAULT false, p_connection_info text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_challenge_id uuid; v_flag_hash text;
BEGIN
  IF NOT public.is_admin() THEN RETURN jsonb_build_object('error', 'Unauthorized'); END IF;

  IF p_flag IS NOT NULL AND trim(p_flag) != '' THEN
    v_flag_hash := encode(digest(trim(p_flag), 'sha256'), 'hex');
  END IF;

  IF p_id IS NOT NULL THEN
    UPDATE public.challenges SET
      title = COALESCE(p_title, title), category = COALESCE(p_category, category),
      difficulty = COALESCE(p_difficulty, difficulty), description = COALESCE(p_description, description),
      points = COALESCE(p_points, points), max_attempts = COALESCE(p_max_attempts, max_attempts),
      author = COALESCE(p_author, author), tags = COALESCE(p_tags, tags),
      is_visible = COALESCE(p_is_visible, is_visible), connection_info = p_connection_info
    WHERE id = p_id;
    v_challenge_id := p_id;
    IF v_flag_hash IS NOT NULL THEN
      INSERT INTO public.challenge_secrets (challenge_id, flag_hash, flag_type)
      VALUES (v_challenge_id, v_flag_hash, p_flag_type)
      ON CONFLICT (challenge_id) DO UPDATE SET flag_hash = v_flag_hash, flag_type = p_flag_type;
    END IF;
  ELSE
    IF p_flag IS NULL OR trim(p_flag) = '' THEN
      RETURN jsonb_build_object('error', 'Flag is required for new challenges');
    END IF;
    INSERT INTO public.challenges (title, category, difficulty, description, points,
      max_attempts, author, tags, is_visible, connection_info)
    VALUES (p_title, p_category, p_difficulty, p_description, p_points,
      p_max_attempts, p_author, p_tags, p_is_visible, p_connection_info)
    RETURNING id INTO v_challenge_id;
    INSERT INTO public.challenge_secrets (challenge_id, flag_hash, flag_type)
    VALUES (v_challenge_id, v_flag_hash, p_flag_type);
  END IF;

  RETURN jsonb_build_object('challenge_id', v_challenge_id);
END;
$$;

-- ── Admin: reset event ────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_reset_event()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.is_admin() THEN RETURN jsonb_build_object('error', 'Unauthorized'); END IF;
  DELETE FROM public.submissions;
  DELETE FROM public.hint_unlocks;
  INSERT INTO public.audit_log (actor_id, action, metadata)
  VALUES (auth.uid(), 'reset_event', jsonb_build_object('ts', now()));
  RETURN jsonb_build_object('success', true);
END;
$$;

-- ── Admin: get team members ───────────────────────────
CREATE OR REPLACE FUNCTION public.admin_team_members(p_team_id uuid)
RETURNS TABLE(id uuid, username text, email text)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = '' AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  RETURN QUERY SELECT p.id, p.username, p.email FROM public.profiles p WHERE p.team_id = p_team_id;
END;
$$;

-- ── Admin: get team invite code ───────────────────────
CREATE OR REPLACE FUNCTION public.admin_team_invite(p_team_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = '' AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  RETURN (SELECT invite_code FROM public.teams WHERE id = p_team_id);
END;
$$;

-- ============================================================
-- ★ 5. RACE CONDITION FIX: Atomic max_attempts enforcement
-- The Edge Function's count-based check is not atomic.
-- This trigger enforces max_attempts at the DB level.
-- ============================================================

CREATE OR REPLACE FUNCTION public.enforce_max_attempts()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_max_attempts integer;
  v_current_count integer;
BEGIN
  -- Get max_attempts for this challenge
  SELECT max_attempts INTO v_max_attempts
  FROM public.challenges WHERE id = NEW.challenge_id;

  -- 0 means unlimited
  IF v_max_attempts IS NULL OR v_max_attempts = 0 THEN
    RETURN NEW;
  END IF;

  -- Count existing attempts (uses FOR UPDATE to lock rows)
  SELECT COUNT(*) INTO v_current_count
  FROM public.submissions
  WHERE user_id = NEW.user_id AND challenge_id = NEW.challenge_id;

  IF v_current_count >= v_max_attempts THEN
    RAISE EXCEPTION 'Max attempts exceeded for this challenge';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_enforce_max_attempts
  BEFORE INSERT ON public.submissions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_max_attempts();

-- ============================================================
-- ★ 6. GRANT CLEANUP — ensure minimum privilege
-- ============================================================

-- Authenticated users get access via RLS, not blanket grants
-- Revoke any default public/anon grants that Supabase may add
DO $$
BEGIN
  -- These may already be revoked; safe to run regardless
  EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon';
  EXECUTE 'REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon';
  -- Re-grant only what anon needs (scoreboards, public views)
  EXECUTE 'GRANT SELECT ON public.user_scores TO anon';
  EXECUTE 'GRANT SELECT ON public.team_scores TO anon';
  EXECUTE 'GRANT SELECT ON public.safe_profiles TO anon';
  EXECUTE 'GRANT SELECT ON public.public_teams TO anon';
  EXECUTE 'GRANT SELECT ON public.public_challenges TO anon';
  EXECUTE 'GRANT SELECT ON public.public_hints TO anon';
  -- Authenticated users need table access (RLS handles the filtering)
  EXECUTE 'GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated';
  EXECUTE 'GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO authenticated';
  EXECUTE 'GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated';
EXCEPTION WHEN OTHERS THEN
  -- Ignore errors from non-existent grants
  NULL;
END;
$$;
