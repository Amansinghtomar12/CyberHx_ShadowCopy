-- Banning a user was half-built: profiles.is_banned existed and several paths
-- honoured it, but nothing could set it. The admin Users tab was a read-only
-- table, and only teams had ban controls.
--
-- It also read from user_scores, which filters banned players out, so a banned
-- user would have vanished from the admin's own list and could never have been
-- unbanned through the UI.

-- ── Helper: is the caller in good standing? ───────────────────────────
CREATE OR REPLACE FUNCTION public.is_not_banned()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND COALESCE(p.is_banned, false) = false
  );
$$;

-- ── A ban now actually locks the content ──────────────────────────────
--
-- Previously a banned player kept full read access to challenges, hints and
-- files; the ban only stopped them scoring. For cheating that is the wrong
-- shape: they could still collect every challenge and feed them to someone
-- else. Cut off the content too.

DROP POLICY IF EXISTS "challenges_select" ON public.challenges;
CREATE POLICY "challenges_select" ON public.challenges FOR SELECT
  USING (
    public.is_admin()
    OR (is_visible = true AND auth.uid() IS NOT NULL AND public.is_not_banned())
  );

DROP POLICY IF EXISTS "hints_select" ON public.hints;
CREATE POLICY "hints_select" ON public.hints FOR SELECT
  USING (
    public.is_admin()
    OR (
      auth.uid() IS NOT NULL
      AND public.is_not_banned()
      AND EXISTS (SELECT 1 FROM public.challenges c
                  WHERE c.id = challenge_id AND c.is_visible = true)
    )
  );

DROP POLICY IF EXISTS "files_select" ON public.challenge_files;
CREATE POLICY "files_select" ON public.challenge_files FOR SELECT
  USING (
    public.is_admin()
    OR (
      auth.uid() IS NOT NULL
      AND public.is_not_banned()
      AND EXISTS (SELECT 1 FROM public.challenges c
                  WHERE c.id = challenge_id AND c.is_visible = true)
    )
  );

-- ── Ban / unban, admin only, recorded ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_set_user_ban(p_user_id uuid, p_banned boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_username text;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  -- Banning yourself would remove your own access with no way back through
  -- the UI, so refuse it outright.
  IF p_user_id = auth.uid() THEN
    RETURN jsonb_build_object('error', 'You cannot ban your own account');
  END IF;

  SELECT p.username INTO v_username FROM public.profiles p WHERE p.id = p_user_id;
  IF v_username IS NULL THEN
    RETURN jsonb_build_object('error', 'User not found');
  END IF;

  UPDATE public.profiles SET is_banned = p_banned WHERE id = p_user_id;

  INSERT INTO public.audit_log (actor_id, action, metadata)
  VALUES (
    auth.uid(),
    CASE WHEN p_banned THEN 'ban_user' ELSE 'unban_user' END,
    jsonb_build_object('user_id', p_user_id, 'username', v_username)
  );

  RETURN jsonb_build_object('success', true, 'username', v_username, 'is_banned', p_banned);
END;
$$;

-- ── Admin listing that still shows banned players ─────────────────────
CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE(
  id uuid, username text, email text, role text,
  is_banned boolean, is_hidden boolean, team_id uuid,
  total_points int, solved_count int, created_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = '' AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  RETURN QUERY
  SELECT
    p.id, p.username, p.email, p.role,
    COALESCE(p.is_banned, false), COALESCE(p.is_hidden, false), p.team_id,
    GREATEST(COALESCE(a.total_points, 0) - COALESCE(a.hint_spend, 0), 0)::int,
    COALESCE(a.solved_count, 0)::int,
    p.created_at
  FROM public.profiles p
  LEFT JOIN public.user_score_agg a ON a.user_id = p.id
  ORDER BY GREATEST(COALESCE(a.total_points, 0) - COALESCE(a.hint_spend, 0), 0) DESC,
           p.username ASC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_set_user_ban(uuid, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_list_users() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_ban(uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated, service_role;
