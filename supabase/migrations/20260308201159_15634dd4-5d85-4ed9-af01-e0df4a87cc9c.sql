
-- Evaluation dataset: ground truth queries for benchmarking
CREATE TABLE public.evaluation_dataset (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  query TEXT NOT NULL,
  expected_answer TEXT NOT NULL,
  expected_document TEXT,
  expected_chunk_index INTEGER,
  difficulty_level TEXT NOT NULL DEFAULT 'medium' CHECK (difficulty_level IN ('easy', 'medium', 'hard')),
  category TEXT NOT NULL DEFAULT 'general',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.evaluation_dataset ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view evaluation dataset in their tenant"
  ON public.evaluation_dataset FOR SELECT TO authenticated
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Users can insert evaluation dataset in their tenant"
  ON public.evaluation_dataset FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_user_tenant_id());

CREATE POLICY "Users can delete evaluation dataset in their tenant"
  ON public.evaluation_dataset FOR DELETE TO authenticated
  USING (tenant_id = get_user_tenant_id());

-- Evaluation runs: track each experiment run for reproducibility
CREATE TABLE public.evaluation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  user_id UUID NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  documents_tested INTEGER NOT NULL DEFAULT 0,
  queries_executed INTEGER NOT NULL DEFAULT 0,
  avg_retrieval_accuracy NUMERIC,
  avg_answer_relevance NUMERIC,
  avg_citation_accuracy NUMERIC,
  avg_latency_ms INTEGER,
  min_latency_ms INTEGER,
  max_latency_ms INTEGER,
  multi_tenant_isolation_pass BOOLEAN DEFAULT true,
  chunk_quality_pass BOOLEAN DEFAULT true,
  report_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.evaluation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view evaluation runs in their tenant"
  ON public.evaluation_runs FOR SELECT TO authenticated
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Users can insert evaluation runs in their tenant"
  ON public.evaluation_runs FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_user_tenant_id());

-- Add new columns to evaluation_results for richer metrics
ALTER TABLE public.evaluation_results
  ADD COLUMN IF NOT EXISTS run_id UUID REFERENCES public.evaluation_runs(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS retrieval_accuracy NUMERIC,
  ADD COLUMN IF NOT EXISTS answer_relevance NUMERIC,
  ADD COLUMN IF NOT EXISTS citation_accuracy NUMERIC,
  ADD COLUMN IF NOT EXISTS retrieval_time_ms INTEGER,
  ADD COLUMN IF NOT EXISTS generation_time_ms INTEGER,
  ADD COLUMN IF NOT EXISTS prompt_construction_time_ms INTEGER,
  ADD COLUMN IF NOT EXISTS retrieved_documents JSONB,
  ADD COLUMN IF NOT EXISTS ranking_scores JSONB,
  ADD COLUMN IF NOT EXISTS difficulty_level TEXT,
  ADD COLUMN IF NOT EXISTS category TEXT;
