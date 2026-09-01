-- Invite links.
--
-- A captain used to hand teammates a 12-character code to type into a form
-- after registering. Now they share ctf.cyberhx.com/?invite=<code>, and the
-- app carries the code through sign-up, e-mail confirmation and the Google
-- redirect, then offers "Join <team>?" the moment the player is in.
--
-- The one thing that needs the database is answering "which team is this?"
-- before the visitor has an account, so the sign-in card can say who invited
-- them. Codes are 48 random bits (encode(gen_random_bytes(6), 'hex')), so a
-- lookup by code is not enumerable and telling the holder the team's name
-- gives away nothing the invite itself did not. Nothing else is exposed:
-- no ids, no member names, no other codes. Joining still goes through
-- join_team with all of its checks and its row lock.

CREATE OR REPLACE FUNCTION public.team_invite_preview(p_code text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = '' AS $$
DECLARE
  v_code  text := pg_catalog.btrim(COALESCE(p_code, ''));
  v_team  record;
  v_event record;
  v_count int;
  v_size  int;
BEGIN
  IF v_code !~ '^[0-9A-Za-z_-]{6,64}$' THEN
    RETURN jsonb_build_object('error', 'Invalid invite');
  END IF;

  SELECT t.id, t.name, t.is_banned INTO v_team
  FROM public.teams t WHERE t.invite_code = v_code;

  IF NOT FOUND OR COALESCE(v_team.is_banned, false) THEN
    RETURN jsonb_build_object('error', 'Invalid invite');
  END IF;

  SELECT e.team_size, e.is_active, e.allow_team_changes INTO v_event
  FROM public.event_settings e WHERE e.id = 1;
  v_size := COALESCE(v_event.team_size, 4);

  -- Same count join_team uses, so "full" here means full there.
  SELECT count(*)::int INTO v_count
  FROM public.profiles p WHERE p.team_id = v_team.id;

  RETURN jsonb_build_object(
    'name',    v_team.name,
    'members', v_count,
    'size',    v_size,
    'full',    v_count >= v_size,
    'locked',  COALESCE(v_event.is_active, false) AND NOT COALESCE(v_event.allow_team_changes, true)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.team_invite_preview(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.team_invite_preview(text) TO anon, authenticated, service_role;
