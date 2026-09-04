-- Evaluate auth.uid() and the admin/ban helpers once per query, not per row.
--
-- Supabase's advisor flags every RLS policy that calls auth.uid() (or a
-- function like public.is_admin(), which itself reads profiles) directly:
-- Postgres treats the call as volatile-per-row and re-runs it for every row
-- the query scans. Written as (select auth.uid()) the planner evaluates it
-- once as an InitPlan and compares rows against a constant. Same result,
-- a fraction of the work -- and submissions, notifications and profiles are
-- exactly the tables 5,000 players will be hitting at once.
--
-- Done generically: walk every policy in public, rewrite the deparsed
-- USING / WITH CHECK text, and ALTER POLICY it back. Command, roles and
-- permissiveness are untouched; ALTER POLICY cannot change them anyway.
-- Expressions already in the wrapped form are left alone.

DO $$
DECLARE
  r      record;
  v_qual text;
  v_chk  text;
  v_sql  text;
  n      int := 0;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
  LOOP
    v_qual := r.qual;
    v_chk  := r.with_check;

    -- auth.uid(), unless already inside a (SELECT ...)
    v_qual := regexp_replace(v_qual, '(?<!SELECT )(?<!select )auth\.uid\(\)', '(select auth.uid())', 'g');
    v_chk  := regexp_replace(v_chk,  '(?<!SELECT )(?<!select )auth\.uid\(\)', '(select auth.uid())', 'g');
    -- our helpers, schema-qualified or not
    v_qual := regexp_replace(v_qual, '(?<!SELECT )(?<!select )(public\.)?(is_admin|is_owner|is_not_banned)\(\)', '(select public.\2())', 'g');
    v_chk  := regexp_replace(v_chk,  '(?<!SELECT )(?<!select )(public\.)?(is_admin|is_owner|is_not_banned)\(\)', '(select public.\2())', 'g');

    IF v_qual IS DISTINCT FROM r.qual OR v_chk IS DISTINCT FROM r.with_check THEN
      v_sql := format('ALTER POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
      IF v_qual IS NOT NULL THEN v_sql := v_sql || format(' USING (%s)', v_qual); END IF;
      IF v_chk  IS NOT NULL THEN v_sql := v_sql || format(' WITH CHECK (%s)', v_chk); END IF;
      EXECUTE v_sql;
      n := n + 1;
    END IF;
  END LOOP;
  RAISE NOTICE 'rls_initplan: rewrote % policies', n;
END $$;
