
-- 1. Add query_count tracking table
CREATE TABLE public.query_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  question text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_query_logs_tenant_id ON public.query_logs(tenant_id);
CREATE INDEX idx_query_logs_created_at ON public.query_logs(created_at);

ALTER TABLE public.query_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view query logs in their tenant"
  ON public.query_logs FOR SELECT TO authenticated
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Users can insert query logs"
  ON public.query_logs FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_user_tenant_id());

-- 2. Add DELETE policy on messages so users can delete messages
CREATE POLICY "Users can delete messages in their conversations"
  ON public.messages FOR DELETE TO authenticated
  USING (tenant_id = get_user_tenant_id());

-- 3. Add DELETE policy on profiles for admin user removal
CREATE POLICY "Admins can delete profiles in tenant"
  ON public.profiles FOR DELETE TO authenticated
  USING (tenant_id = get_user_tenant_id() AND has_role(auth.uid(), 'admin'));

-- 4. Add tenant_id to user_roles for tenant-scoped role management
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;

-- Backfill tenant_id from profiles
UPDATE public.user_roles ur
SET tenant_id = p.tenant_id
FROM public.profiles p
WHERE ur.user_id = p.user_id AND ur.tenant_id IS NULL;

-- 5. Create a function to get daily query counts for charts
CREATE OR REPLACE FUNCTION public.get_daily_query_counts(p_tenant_id uuid, p_days integer DEFAULT 14)
RETURNS TABLE(day date, count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
  SELECT date_trunc('day', created_at)::date AS day, count(*) AS count
  FROM public.query_logs
  WHERE tenant_id = p_tenant_id
    AND created_at >= now() - (p_days || ' days')::interval
  GROUP BY day
  ORDER BY day;
$$;

-- 6. Enable realtime on query_logs for live dashboard updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.query_logs;
