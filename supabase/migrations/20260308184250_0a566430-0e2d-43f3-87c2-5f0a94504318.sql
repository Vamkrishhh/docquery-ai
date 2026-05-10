
-- Add full-text search column to document_chunks
ALTER TABLE public.document_chunks ADD COLUMN IF NOT EXISTS fts tsvector
  GENERATED ALWAYS AS (to_tsvector('english', chunk_text)) STORED;

-- Create GIN index for full-text search
CREATE INDEX IF NOT EXISTS idx_document_chunks_fts ON public.document_chunks USING gin(fts);

-- Create full-text search function
CREATE OR REPLACE FUNCTION public.search_document_chunks(
  search_query TEXT,
  search_tenant_id UUID,
  result_limit INTEGER DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  document_id UUID,
  chunk_text TEXT,
  chunk_index INTEGER,
  rank REAL
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.id,
    dc.document_id,
    dc.chunk_text,
    dc.chunk_index,
    ts_rank(dc.fts, websearch_to_tsquery('english', search_query)) AS rank
  FROM public.document_chunks dc
  WHERE dc.tenant_id = search_tenant_id
    AND dc.fts @@ websearch_to_tsquery('english', search_query)
  ORDER BY rank DESC
  LIMIT result_limit;
END;
$$;
