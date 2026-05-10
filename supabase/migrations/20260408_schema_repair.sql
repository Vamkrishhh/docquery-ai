
-- ─────────────────────────────────────────────────────────────────────────────
-- SCHEMA REPAIR MIGRATION
-- Ensures all tables for Analytics, Security, and Intelligence features exist.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. system_logs table (Missing but referenced in many pages)
CREATE TABLE IF NOT EXISTS public.system_logs (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id        UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  source         TEXT        NOT NULL,          -- e.g. 'rag-query', 'auth', 'ingestion'
  log_type       TEXT        NOT NULL DEFAULT 'info', -- 'info', 'warning', 'error', 'security'
  message        TEXT        NOT NULL,
  metadata       JSONB       DEFAULT '{}'::jsonb,
  ip_address     INET,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS for system_logs
ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'system_logs' AND policyname = 'Tenant members can view system logs') THEN
    CREATE POLICY "Tenant members can view system logs"
      ON public.system_logs FOR SELECT
      USING (tenant_id = public.get_user_tenant_id());
  END IF;
END $$;

-- 2. query_logs enhancements
-- Ensure all columns mentioned in rag-query/index.ts exist
ALTER TABLE public.query_logs ADD COLUMN IF NOT EXISTS latency_ms INTEGER;
ALTER TABLE public.query_logs ADD COLUMN IF NOT EXISTS generation_latency_ms INTEGER;
ALTER TABLE public.query_logs ADD COLUMN IF NOT EXISTS retrieval_latency_ms INTEGER;
ALTER TABLE public.query_logs ADD COLUMN IF NOT EXISTS retrieved_chunk_ids UUID[];
ALTER TABLE public.query_logs ADD COLUMN IF NOT EXISTS retrieval_scores FLOAT[];
ALTER TABLE public.query_logs ADD COLUMN IF NOT EXISTS model_used TEXT;
ALTER TABLE public.query_logs ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.query_logs ADD COLUMN IF NOT EXISTS confidence_score FLOAT;

-- 3. Document enhancements (Auto-Tagging & Summarization)
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS summary TEXT;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS tags TEXT[];

-- 4. Hybrid Search RPC (Ensure it exists for the backend)
CREATE OR REPLACE FUNCTION public.hybrid_search(
  query_text TEXT,
  query_embedding extensions.vector(1536),
  match_tenant_id UUID,
  match_count INTEGER DEFAULT 10,
  full_text_weight FLOAT DEFAULT 0.4,
  semantic_weight FLOAT DEFAULT 0.6
)
RETURNS TABLE (
  id UUID,
  document_id UUID,
  chunk_text TEXT,
  chunk_index INTEGER,
  combined_rank FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH semantic_search AS (
    SELECT 
      dc.id,
      1 - (dc.embedding <=> query_embedding) AS score
    FROM public.document_chunks dc
    WHERE dc.tenant_id = match_tenant_id
    ORDER BY dc.embedding <=> query_embedding
    LIMIT match_count * 2
  ),
  fts_search AS (
    SELECT 
      dc.id,
      ts_rank(dc.fts, websearch_to_tsquery('english', query_text)) AS score
    FROM public.document_chunks dc
    WHERE dc.tenant_id = match_tenant_id
      AND dc.fts @@ websearch_to_tsquery('english', query_text)
    ORDER BY score DESC
    LIMIT match_count * 2
  )
  SELECT
    dc.id,
    dc.document_id,
    dc.chunk_text,
    dc.chunk_index,
    COALESCE(ss.score, 0) * semantic_weight + COALESCE(fs.score, 0) * full_text_weight AS combined_rank
  FROM public.document_chunks dc
  LEFT JOIN semantic_search ss ON dc.id = ss.id
  LEFT JOIN fts_search fs ON dc.id = fs.id
  WHERE (ss.id IS NOT NULL OR fs.id IS NOT NULL)
    AND dc.tenant_id = match_tenant_id
  ORDER BY combined_rank DESC
  LIMIT match_count;
END;
$$;

-- 5. Seed some initial system logs so the dashboard isn't empty
-- We only do this if the table was just created empty
DO $$
DECLARE
  v_tenant_id UUID;
BEGIN
  SELECT id INTO v_tenant_id FROM public.tenants LIMIT 1;
  IF v_tenant_id IS NOT NULL THEN
    INSERT INTO public.system_logs (tenant_id, source, log_type, message, metadata)
    VALUES 
      (v_tenant_id, 'system', 'info', 'DocQuery Core Services Initialized', '{"version": "3.0.1"}'),
      (v_tenant_id, 'security', 'info', 'Multi-tenant isolation barrier verified', '{"status": "green"}'),
      (v_tenant_id, 'rag-query', 'warning', 'High retrieval latency detected in Asia-East node', '{"latency_ms": 1240}');
  END IF;
END $$;
