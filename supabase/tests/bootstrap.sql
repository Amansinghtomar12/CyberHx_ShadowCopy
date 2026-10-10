-- ════════════════════════════════════════════════════════════════════════
--  What Supabase provides and a bare Postgres does not.
--
--  Applied to a throwaway test database BEFORE the migrations, and never
--  anywhere else. These are stubs with the shape the migrations expect,
--  not reimplementations: enough for every CREATE POLICY, GRANT and
--  FOREIGN KEY in supabase/migrations to apply and run.
--
--  auth.uid() reads a session setting, so a test can say who it is:
--      SET LOCAL request.jwt.claim.sub = '<uuid>';
--  Unset, it is NULL — an anonymous caller, which is what most of the
--  gates below check first.
-- ════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- The three roles every GRANT in the migrations names, plus the one the
-- auth hooks grant to. NOLOGIN: nothing connects as these here, policies
-- are exercised with SET ROLE.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
    THEN CREATE ROLE anon NOLOGIN NOINHERIT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated')
    THEN CREATE ROLE authenticated NOLOGIN NOINHERIT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role')
    THEN CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin')
    THEN CREATE ROLE supabase_auth_admin NOLOGIN NOINHERIT; END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- ── auth ────────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

-- Only the columns the migrations reference: the primary key two tables
-- point at, the email the profile trigger copies, and the metadata the
-- sign-up trigger reads a username out of.
CREATE TABLE IF NOT EXISTS auth.users (
  id                 uuid PRIMARY KEY,
  email              text,
  raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION auth.role() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), 'anon');
$$;

GRANT EXECUTE ON FUNCTION auth.uid(), auth.role() TO anon, authenticated, service_role;

-- ── storage ─────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS storage;
GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS storage.buckets (
  id                 text PRIMARY KEY,
  name               text NOT NULL,
  public             boolean NOT NULL DEFAULT false,
  file_size_limit    bigint,
  allowed_mime_types text[]
);

CREATE TABLE IF NOT EXISTS storage.objects (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text REFERENCES storage.buckets(id),
  name      text,
  owner     uuid,
  metadata  jsonb
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated, service_role;
GRANT SELECT ON storage.objects TO anon;
