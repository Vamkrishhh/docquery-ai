-- Document Intelligence Enhancements
-- Adds support for automated tagging, categorization, and summarization

-- Update documents table
ALTER TABLE public.documents 
ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS category TEXT,
ADD COLUMN IF NOT EXISTS summary TEXT;

-- Index for category search
CREATE INDEX IF NOT EXISTS idx_documents_category ON public.documents(category);

-- Update query_logs for smarter tracking
ALTER TABLE public.query_logs
ADD COLUMN IF NOT EXISTS follow_up_questions TEXT[] DEFAULT '{}';

-- Create RPC to fetch query suggestions (Autocomplete)
CREATE OR REPLACE FUNCTION get_query_suggestions(
  search_prefix TEXT,
  match_tenant_id UUID,
  max_results INT DEFAULT 5
)
RETURNS TABLE (suggestion TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT query_text
  FROM query_logs
  WHERE tenant_id = match_tenant_id
    AND query_text ILIKE search_prefix || '%'
    AND length(query_text) < 100
  ORDER BY query_text
  LIMIT max_results;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
