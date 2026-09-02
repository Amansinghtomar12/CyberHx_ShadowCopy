-- Challenge attachments.
--
-- challenge_files has existed since the first migration and the player's
-- operation panel has always rendered its rows as download buttons, but no
-- code ever wrote a row and no bucket existed: forensics images and binaries
-- could only be linked from somewhere else. This adds the storage half.
--
-- BUCKET
--   challenge-files, public for reads. A CTF attachment is meant for every
--   player, so a public URL served from the CDN is the right shape: zero
--   database work per download, and it survives 5,000 people fetching the
--   same image in the same minute. Unreleased challenges are protected by
--   the path, not the bucket: the admin panel writes to
--   <challenge_id>/<64 random bits>/<name>, which cannot be guessed, and
--   the challenge_files rows that carry the URLs stay behind the existing
--   visibility-gated RLS.
--
--   50 MB per file is the platform's own ceiling on this plan. Larger
--   material (disk images, memory dumps) should live on a host with free
--   egress and be added as a resource link -- see the egress note in the
--   commit that introduced this.
--
-- WRITES
--   Only admins may create, replace or delete objects, and only in this
--   bucket. Listing is admin-only too; players never enumerate, they follow
--   the URL the challenge gives them.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('challenge-files', 'challenge-files', true, 52428800, NULL)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "challenge_files_admin_insert" ON storage.objects;
CREATE POLICY "challenge_files_admin_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'challenge-files' AND public.is_admin());

DROP POLICY IF EXISTS "challenge_files_admin_update" ON storage.objects;
CREATE POLICY "challenge_files_admin_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'challenge-files' AND public.is_admin())
  WITH CHECK (bucket_id = 'challenge-files' AND public.is_admin());

DROP POLICY IF EXISTS "challenge_files_admin_delete" ON storage.objects;
CREATE POLICY "challenge_files_admin_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'challenge-files' AND public.is_admin());

-- Admins list the bucket from the panel. The public object endpoint does
-- not consult this policy, so it grants nothing to players beyond the URL
-- they already hold.
DROP POLICY IF EXISTS "challenge_files_admin_select" ON storage.objects;
CREATE POLICY "challenge_files_admin_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'challenge-files' AND public.is_admin());
