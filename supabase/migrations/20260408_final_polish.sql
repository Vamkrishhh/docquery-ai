
-- ─────────────────────────────────────────────────────────────────────────────
-- FINAL SCHEMA ENHANCEMENT: RELATIONSHIPS & ANALYTICS
-- Fixes broken joins in Intelligence & Tenant Analytics dashboards.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Correct the query_logs -> user_id relationship
-- Some dashboards use .select("*, profiles!inner(*)")
-- For this to work, we need a foreign key from query_logs(user_id) to profiles(user_id)
-- Or useauth.users(id). 
-- Actually, profiles table uses user_id as its primary key or unique index.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'query_logs_user_id_fkey'
  ) THEN
    ALTER TABLE public.query_logs 
    ADD CONSTRAINT query_logs_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 2. Ensure system_logs also has a user_id foreign key
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'system_logs_user_id_fkey'
  ) THEN
    ALTER TABLE public.system_logs 
    ADD CONSTRAINT system_logs_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3. Document Category Metadata
-- Ensure category column exists (used for filtering in Documents.tsx)
-- And set default Categories for existing docs
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'Uncategorized';

UPDATE public.documents SET category = 'Technical' WHERE file_type = 'pdf' AND category = 'Uncategorized';
UPDATE public.documents SET category = 'Legal' WHERE filename ILIKE '%contract%' OR filename ILIKE '%agreement%';
UPDATE public.documents SET category = 'Financial' WHERE filename ILIKE '%invoice%' OR filename ILIKE '%report%';

-- 4. Re-verify RLS for system_logs
-- Ensure it can be fetched by the tenant members
DROP POLICY IF EXISTS "Tenant members can view system logs" ON public.system_logs;
CREATE POLICY "Tenant members can view system logs"
  ON public.system_logs FOR SELECT
  USING (tenant_id = (SELECT tenant_id FROM public.profiles WHERE user_id = auth.uid()));

-- 5. Final check for missing RPCs
CREATE OR REPLACE FUNCTION public.get_avg_query_latency(p_tenant_id UUID)
RETURNS FLOAT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN (SELECT COALESCE(AVG(latency_ms), 0) FROM public.query_logs WHERE tenant_id = p_tenant_id);
END;
$$;
