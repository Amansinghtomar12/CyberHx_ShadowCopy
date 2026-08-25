-- Two findings from the account-takeover / privilege-escalation / flag-leak pass.

-- ── 1. Hints for unreleased challenges were obtainable ────────────────
--
-- public_hints selected every row of hints with no filter on the parent
-- challenge, and the schema grants it to anon, so anyone could enumerate the
-- hint ids and costs of challenges that had never been released.
--
-- unlock_hint then looked the hint up by id and returned its content without
-- ever checking that the challenge was visible. Together that let a player
-- read the hints of unreleased challenges before they went live, which for a
-- waved release is most of the solution path.
--
-- Filter the view to released challenges, and make unlock_hint verify
-- visibility itself rather than trusting the id it was handed. It also now
-- refuses banned accounts, which it never checked.

CREATE OR REPLACE VIEW public.public_hints
WITH (security_invoker = false)
AS SELECT h.id, h.challenge_id, h.cost
FROM public.hints h
JOIN public.challenges c ON c.id = h.challenge_id
WHERE c.is_visible = true;

CREATE OR REPLACE FUNCTION public.unlock_hint(p_hint_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_hint    record;
  v_visible boolean;
  v_already boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND COALESCE(p.is_banned, false) = false
  ) THEN
    RETURN jsonb_build_object('error', 'Account not found or banned');
  END IF;

  SELECT * INTO v_hint FROM public.hints h WHERE h.id = p_hint_id;
  IF v_hint IS NULL THEN
    RETURN jsonb_build_object('error', 'Hint not found');
  END IF;

  SELECT c.is_visible INTO v_visible
  FROM public.challenges c WHERE c.id = v_hint.challenge_id;

  -- Same answer as a missing hint, so the response cannot be used to probe
  -- which unreleased challenges exist.
  IF v_visible IS NOT TRUE AND NOT public.is_admin() THEN
    RETURN jsonb_build_object('error', 'Hint not found');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.hint_unlocks hu
    WHERE hu.user_id = auth.uid() AND hu.hint_id = p_hint_id
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

-- ── 2. A player could rewrite their own profiles.email ────────────────
--
-- profiles_update_self pinned role, is_banned, is_hidden and team_id but left
-- email writable, and profiles.email is a plain column decoupled from
-- auth.users.email, which is the real identity. A player could therefore PATCH
-- their profile to any unused address, including an organiser's.
--
-- That matters because the admin dashboard identifies people by
-- profiles.email, and promoting an admin is normally done by matching on it:
--   update public.profiles set role = 'admin' where email = '...'
-- Against a squatted address that promotes the attacker. Pin the column so it
-- only changes through the auth flow or by an admin.
--
-- username stays writable: it is a real feature, it is UNIQUE so an existing
-- name cannot be taken, and the schema CHECKs its charset and length.

DROP POLICY IF EXISTS "profiles_update_self" ON public.profiles;

CREATE POLICY "profiles_update_self" ON public.profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role = (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid())
    AND email = (SELECT p.email FROM public.profiles p WHERE p.id = auth.uid())
    AND is_banned IS NOT DISTINCT FROM
        (SELECT p.is_banned FROM public.profiles p WHERE p.id = auth.uid())
    AND is_hidden IS NOT DISTINCT FROM
        (SELECT p.is_hidden FROM public.profiles p WHERE p.id = auth.uid())
    AND team_id IS NOT DISTINCT FROM
        (SELECT p.team_id FROM public.profiles p WHERE p.id = auth.uid())
  );
