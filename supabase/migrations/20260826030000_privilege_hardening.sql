-- Defence in depth against privilege escalation from a logged-in session.
--
-- The anon key is public by design -- it ships in the JS bundle and always
-- will. It is already inert on its own: the initial schema ran
-- REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, so an anon caller gets
-- 42501 on every table. Verified against production.
--
-- The exposure is one step later. Registering is trivial, and the same schema
-- ran GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, so every
-- logged-in player holds table-level INSERT/UPDATE/DELETE on profiles --
-- including the role column. The only thing between a player and
--   PATCH /rest/v1/profiles?id=eq.<self>  {"role":"admin"}
-- is the WITH CHECK expression on profiles_update_self.
--
-- That expression is correct today. But it is a hand-written boolean listing
-- every column that must not move, and in this schema's short history it has
-- been wrong three times: email was writable until 20260825250000, created_at
-- until 20260826000000, and teams.is_banned had USING with no WITH CHECK at
-- all until 20260825220000. Each was one forgotten conjunct. A single layer
-- whose failure mode is silent and whose track record is three misses is not
-- what should be standing between a competitor and the admin role during a
-- live event.
--
-- So stop relying on it alone. PostgreSQL checks column privileges before RLS
-- ever runs, and they are declarative -- there is no expression to get wrong.
-- Take write access to the sensitive columns away from authenticated
-- entirely. RLS stays exactly as it is; this sits underneath it.
--
-- SECURITY DEFINER functions are unaffected: they execute as the function
-- owner, so privilege checks inside them are made against the owner, not the
-- caller. Every legitimate privileged write already goes through one
-- (handle_new_user, join_team, leave_team, unlock_hint, admin_set_user_role,
-- admin_set_user_ban, admin_upsert_challenge...), as does everything the Edge
-- Functions do with service_role.

-- ══ 1. Tables no browser has any business writing ═════════════════════
--
-- These already have RLS enabled with zero policies, which default-denies
-- everything. That is the strongest position available -- but it is one
-- CREATE POLICY away from not being true, and a future migration adding a
-- read policy would silently hand over the write privilege that has been
-- sitting there the whole time. Take the privilege away so the policy is not
-- load-bearing on its own.

-- The flag hashes. Nothing client-side may read or touch these; submit-flag
-- verifies through service_role and admin_upsert_challenge writes as owner.
REVOKE ALL ON public.challenge_secrets FROM authenticated;

-- Score totals. A single UPDATE here would set a team's score to anything.
-- SELECT stays: user_scores and team_scores are plain views, which read with
-- the view owner's rights, but leaving SELECT costs nothing and avoids
-- depending on that.
REVOKE INSERT, UPDATE, DELETE ON public.user_score_agg FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.team_score_agg FROM authenticated;

-- The submission log is append-only, and only the Edge Function appends.
-- Rewriting is_correct on your own row would be a free solve.
REVOKE INSERT, UPDATE, DELETE ON public.submissions FROM authenticated;

-- Hint unlocks are the record of what has been paid for. Inserting a row here
-- directly is a free hint; deleting one is a refund.
REVOKE INSERT, UPDATE, DELETE ON public.hint_unlocks FROM authenticated;

-- The audit log is the record of admin action. It must not be editable by the
-- people it records, and admins are authenticated too.
REVOKE ALL ON public.audit_log FROM authenticated;

-- ══ 2. profiles: only the six fields a player actually edits ══════════
--
-- Settings.tsx writes username, avatar_url, website, affiliation, country and
-- bio, and useAuth.updateProfile allow-lists exactly those six. Everything
-- else on the row -- role, is_banned, is_hidden, team_id, email,
-- email_normalized, created_at, id -- is now unwritable through PostgREST by
-- any logged-in user, admin included, with no expression involved.
--
-- Table-level UPDATE has to go first: a column-level REVOKE cannot carve an
-- exception out of a table-level grant.
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (
  username, avatar_url, website, affiliation, country, bio
) ON public.profiles TO authenticated;

-- No client creates or destroys a profile row. handle_new_user creates it on
-- sign-up as owner, and the FK to auth.users cascades the delete.
REVOKE INSERT, DELETE ON public.profiles FROM authenticated;

-- ══ 3. teams: a captain edits presentation, nothing else ═════════════
--
-- teams_update is USING (captain_id = auth.uid() OR is_admin()). Its WITH
-- CHECK pins is_banned, which is the conjunct that was missing once already.
-- Back it with privileges: is_banned, invite_code and captain_id come off the
-- writable list, so a captain cannot unban their own team, mint a new invite
-- code, or hand captaincy around behind the policy's back.
REVOKE UPDATE ON public.teams FROM authenticated;
GRANT UPDATE (
  name, website, affiliation, country
) ON public.teams TO authenticated;

-- create_team inserts as owner; teams_insert_blocked already refuses direct
-- inserts. Deletes move to admin_delete_team below.
REVOKE INSERT, DELETE ON public.teams FROM authenticated;

-- ══ 4. The two admin paths that wrote these tables directly ══════════
--
-- The dashboard banned teams with a direct UPDATE and deleted them with a
-- direct DELETE plus a profiles UPDATE to clear members. Both now go through
-- SECURITY DEFINER functions, which is what lets the grants above be this
-- tight. Making them functions also fixes a real defect in the delete: it
-- cleared members and dropped the team in two separate requests, so a failure
-- between them left every member teamless and the team still standing.

CREATE OR REPLACE FUNCTION public.admin_set_team_ban(p_team_id uuid, p_banned boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_name text;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  SELECT t.name INTO v_name FROM public.teams t WHERE t.id = p_team_id;
  IF v_name IS NULL THEN
    RETURN jsonb_build_object('error', 'Team not found');
  END IF;

  UPDATE public.teams SET is_banned = COALESCE(p_banned, false) WHERE id = p_team_id;

  INSERT INTO public.audit_log (actor_id, action, metadata)
  VALUES (auth.uid(), CASE WHEN p_banned THEN 'ban_team' ELSE 'unban_team' END,
          jsonb_build_object('team_id', p_team_id, 'team_name', v_name));

  RETURN jsonb_build_object('success', true, 'name', v_name);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_set_team_ban(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_team_ban(uuid, boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_delete_team(p_team_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_name    text;
  v_members int;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  SELECT t.name INTO v_name FROM public.teams t WHERE t.id = p_team_id;
  IF v_name IS NULL THEN
    RETURN jsonb_build_object('error', 'Team not found');
  END IF;

  -- One transaction, so members are never orphaned by a half-done delete.
  UPDATE public.profiles SET team_id = NULL WHERE team_id = p_team_id;
  GET DIAGNOSTICS v_members = ROW_COUNT;

  -- submissions.team_id references teams and has no cascade, so the delete
  -- below would fail on any team that ever scored. Detach those rows; the
  -- per-user solve record is what matters once the team is gone.
  UPDATE public.submissions SET team_id = NULL WHERE team_id = p_team_id;

  DELETE FROM public.team_score_agg WHERE team_id = p_team_id;
  DELETE FROM public.teams WHERE id = p_team_id;

  INSERT INTO public.audit_log (actor_id, action, metadata)
  VALUES (auth.uid(), 'delete_team',
          jsonb_build_object('team_id', p_team_id, 'team_name', v_name,
                             'members_released', v_members));

  RETURN jsonb_build_object('success', true, 'name', v_name, 'members_released', v_members);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_delete_team(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_team(uuid) TO authenticated, service_role;

-- ══ 5. Stop the blanket grant reaching anything added later ═══════════
--
-- The initial schema's GRANT ALL ON ALL TABLES TO authenticated applied to the
-- tables that existed at the time, but Supabase also ships default privileges
-- that hand new tables to authenticated automatically. A table added in a
-- later migration would arrive fully writable and rely entirely on somebody
-- remembering to write its policies. Make the default nothing, so a new table
-- starts closed and access is granted deliberately.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
