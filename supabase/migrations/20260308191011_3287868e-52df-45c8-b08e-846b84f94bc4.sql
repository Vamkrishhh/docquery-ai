
-- The previous migration failed only on the realtime line. Re-run the parts that didn't apply:
-- (handle_new_user, trigger, evaluation_results table, indexes, etc. may have partially applied)
-- Use IF NOT EXISTS / OR REPLACE to be idempotent.

-- Fix handle_new_user to set tenant_id on user_roles
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_tenant_id UUID;
  user_name TEXT;
BEGIN
  user_name := COALESCE(
    NEW.raw_user_meta_data->>'display_name',
    NEW.raw_user_meta_data->>'full_name',
    split_part(NEW.email, '@', 1)
  );

  IF NEW.raw_user_meta_data->>'tenant_id' IS NOT NULL THEN
    new_tenant_id := (NEW.raw_user_meta_data->>'tenant_id')::UUID;
  ELSE
    INSERT INTO public.tenants (name)
    VALUES (user_name || '''s Organization')
    RETURNING id INTO new_tenant_id;
  END IF;

  INSERT INTO public.profiles (user_id, tenant_id, display_name, email)
  VALUES (NEW.id, new_tenant_id, user_name, NEW.email);

  IF NEW.raw_user_meta_data->>'tenant_id' IS NULL THEN
    INSERT INTO public.user_roles (user_id, role, tenant_id)
    VALUES (NEW.id, 'admin', new_tenant_id);
  ELSE
    INSERT INTO public.user_roles (user_id, role, tenant_id)
    VALUES (NEW.id, 'member', new_tenant_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE IF NOT EXISTS public.evaluation_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  query TEXT NOT NULL,
  expected_answer TEXT,
  generated_answer TEXT,
  accuracy_score NUMERIC(3,2),
  latency_ms INTEGER,
  sources_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.evaluation_results ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'evaluation_results' AND policyname = 'Users can view evaluations in their tenant') THEN
    CREATE POLICY "Users can view evaluations in their tenant"
      ON public.evaluation_results FOR SELECT TO authenticated
      USING (tenant_id = get_user_tenant_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'evaluation_results' AND policyname = 'Users can insert evaluations in their tenant') THEN
    CREATE POLICY "Users can insert evaluations in their tenant"
      ON public.evaluation_results FOR INSERT TO authenticated
      WITH CHECK (tenant_id = get_user_tenant_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'evaluation_results' AND policyname = 'Admins can delete evaluations') THEN
    CREATE POLICY "Admins can delete evaluations"
      ON public.evaluation_results FOR DELETE TO authenticated
      USING (tenant_id = get_user_tenant_id() AND has_role(auth.uid(), 'admin'));
  END IF;
END $$;

ALTER TABLE public.query_logs ADD COLUMN IF NOT EXISTS latency_ms INTEGER;

CREATE INDEX IF NOT EXISTS idx_query_logs_tenant_created ON public.query_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_document_chunks_fts ON public.document_chunks USING GIN(fts);

CREATE OR REPLACE FUNCTION public.get_top_queried_documents(p_tenant_id UUID, p_limit INTEGER DEFAULT 5)
RETURNS TABLE(document_id UUID, filename TEXT, query_count BIGINT)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT dc.document_id, d.filename, count(*) as query_count
  FROM public.document_chunks dc
  JOIN public.documents d ON d.id = dc.document_id
  WHERE dc.tenant_id = p_tenant_id
  GROUP BY dc.document_id, d.filename
  ORDER BY query_count DESC
  LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION public.get_avg_query_latency(p_tenant_id UUID, p_days INTEGER DEFAULT 7)
RETURNS NUMERIC
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(AVG(latency_ms), 0)::NUMERIC
  FROM public.query_logs
  WHERE tenant_id = p_tenant_id
    AND latency_ms IS NOT NULL
    AND created_at >= now() - (p_days || ' days')::interval;
$$;
