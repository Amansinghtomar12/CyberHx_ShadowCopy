-- Two fixes found while auditing the sign-up and team paths.

-- ── 1. handle_new_user discarded the chosen username ──────────────────
--
-- The frontend passes the username through signUp options.data, which lands in
-- auth.users.raw_user_meta_data, but the trigger derived the username from the
-- email local part and ignored it. Every account was therefore named after its
-- email address, and the REGISTER form's username field did nothing.
--
-- The derived name also had no collision or length handling, so sign-up failed
-- outright when it violated the profiles constraints:
--   * two addresses sharing a local part (a@gmail.com, a@outlook.com) collided
--     on the UNIQUE username and raised inside the trigger
--   * a local part shorter than 3 or longer than 30 characters violated the
--     length CHECK
-- Both surfaced to the user as an opaque sign-up failure.
--
-- Prefer the supplied username, fall back to the email local part, sanitise it
-- to the characters the CHECK allows, clamp it to the permitted length, and
-- append a counter when it is already taken.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_base text;
  v_candidate text;
  v_suffix integer := 0;
BEGIN
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

-- ── 2. teams_update had no WITH CHECK ─────────────────────────────────
--
-- USING alone only decides which existing rows a captain may update; without a
-- WITH CHECK the resulting row is never validated. A captain could therefore
-- write any column on their own team, including clearing is_banned, which
-- join_team relies on to keep a banned team unjoinable.
--
-- Keep captains able to edit their team's presentation, but pin the columns
-- they should not control. Admins stay unrestricted.

DROP POLICY IF EXISTS "teams_update" ON public.teams;

CREATE POLICY "teams_update" ON public.teams FOR UPDATE
  USING (captain_id = auth.uid() OR public.is_admin())
  WITH CHECK (
    public.is_admin()
    OR (
      captain_id = auth.uid()
      AND is_banned IS NOT DISTINCT FROM
          (SELECT t.is_banned FROM public.teams t WHERE t.id = teams.id)
    )
  );
