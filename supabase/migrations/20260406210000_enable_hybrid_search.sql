-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column to document_chunks
-- For Gemini embeddings (text-embedding-004), the dimension is 768
ALTER TABLE public.document_chunks
ADD COLUMN embedding vector(768);

-- Create a vector index for semantic search
CREATE INDEX ON public.document_chunks 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Create hybrid search function
CREATE OR REPLACE FUNCTION public.hybrid_search(
  query_text TEXT,
  query_embedding VECTOR(768),
  match_tenant_id UUID,
  match_count INT DEFAULT 10,
  full_text_weight FLOAT DEFAULT 0.5,
  semantic_weight FLOAT DEFAULT 0.5
)
RETURNS TABLE (
  id UUID,
  document_id UUID,
  chunk_text TEXT,
  chunk_index INT,
  fts_rank FLOAT,
  semantic_score FLOAT,
  combined_rank FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH fts_results AS (
    SELECT 
      dc.id,
      ts_rank_cd(dc.fts, websearch_to_tsquery('english', query_text)) as fts_rank
    FROM public.document_chunks dc
    WHERE dc.tenant_id = match_tenant_id
      AND dc.fts @@ websearch_to_tsquery('english', query_text)
    LIMIT 50
  ),
  semantic_results AS (
    SELECT 
      dc.id,
      1 - (dc.embedding <=> query_embedding) as semantic_score
    FROM public.document_chunks dc
    WHERE dc.tenant_id = match_tenant_id
    ORDER BY dc.embedding <=> query_embedding
    LIMIT 50
  )
  SELECT 
    dc.id,
    dc.document_id,
    dc.chunk_text,
    dc.chunk_index,
    COALESCE(fr.fts_rank, 0)::FLOAT as fts_rank,
    COALESCE(sr.semantic_score, 0)::FLOAT as semantic_score,
    (COALESCE(fr.fts_rank, 0) * full_text_weight + COALESCE(sr.semantic_score, 0) * semantic_weight)::FLOAT as combined_rank
  FROM public.document_chunks dc
  LEFT JOIN fts_results fr ON dc.id = fr.id
  LEFT JOIN semantic_results sr ON dc.id = sr.id
  WHERE (fr.id IS NOT NULL OR sr.id IS NOT NULL)
  ORDER BY combined_rank DESC
  LIMIT match_count;
END;
$$;
