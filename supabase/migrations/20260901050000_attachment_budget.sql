-- Attachment sizes and a per-challenge budget.
--
-- Egress is what attachments cost at 5,000 players, and it scales with
-- bytes per challenge, not files per challenge. Record each attachment's
-- size and hold every challenge to 200 MB in total. The per-file ceiling
-- stays at the bucket's 50 MB, which is the plan's own limit.
--
-- Enforced in a trigger rather than the editor alone, so no client build
-- can overshoot it. The editor uploads the object first and inserts the
-- row second; when this trigger refuses the row, the editor deletes the
-- object it just uploaded, so nothing is left behind.

ALTER TABLE public.challenge_files
  ADD COLUMN IF NOT EXISTS size_bytes bigint NOT NULL DEFAULT 0
  CHECK (size_bytes >= 0);

COMMENT ON COLUMN public.challenge_files.size_bytes IS
  'Object size as uploaded. Summed per challenge against the 200 MB budget.';

CREATE OR REPLACE FUNCTION public.enforce_attachment_budget()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_budget bigint := 200 * 1024 * 1024;
  v_used   bigint;
BEGIN
  -- Serialise per challenge so two uploads cannot both squeeze under.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('att:' || NEW.challenge_id::text, 0));

  SELECT COALESCE(SUM(f.size_bytes), 0) INTO v_used
  FROM public.challenge_files f
  WHERE f.challenge_id = NEW.challenge_id AND f.id <> NEW.id;

  IF v_used + NEW.size_bytes > v_budget THEN
    RAISE EXCEPTION 'Attachment budget exceeded: this challenge already holds % MB of its 200 MB',
      round(v_used / 1048576.0, 1)
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_enforce_attachment_budget ON public.challenge_files;
CREATE TRIGGER trigger_enforce_attachment_budget
  BEFORE INSERT OR UPDATE OF size_bytes ON public.challenge_files
  FOR EACH ROW EXECUTE FUNCTION public.enforce_attachment_budget();

-- Players read name and url; the size is harmless and useful ("12.4 MB").
GRANT SELECT (id, challenge_id, name, url, size_bytes, created_at) ON public.challenge_files TO authenticated;
