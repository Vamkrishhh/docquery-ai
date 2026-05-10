
CREATE TABLE public.stress_test_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  total_queries integer NOT NULL DEFAULT 0,
  successful_queries integer NOT NULL DEFAULT 0,
  failed_queries integer NOT NULL DEFAULT 0,
  avg_latency_ms integer,
  max_latency_ms integer,
  min_latency_ms integer,
  avg_retrieval_latency_ms integer,
  avg_generation_latency_ms integer,
  retrieval_success_rate numeric,
  results jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.stress_test_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert stress tests in their tenant" ON public.stress_test_runs
  FOR INSERT TO authenticated WITH CHECK (tenant_id = get_user_tenant_id() AND user_id = auth.uid());

CREATE POLICY "Users can view stress tests in their tenant" ON public.stress_test_runs
  FOR SELECT TO authenticated USING (tenant_id = get_user_tenant_id());
