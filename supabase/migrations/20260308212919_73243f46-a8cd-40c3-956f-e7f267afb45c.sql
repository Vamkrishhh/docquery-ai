
-- Add diagnostic columns to query_logs
ALTER TABLE public.query_logs 
ADD COLUMN IF NOT EXISTS retrieved_chunk_ids jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS retrieval_scores jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS retrieval_latency_ms integer,
ADD COLUMN IF NOT EXISTS generation_latency_ms integer,
ADD COLUMN IF NOT EXISTS context_token_count integer;

-- Add processing diagnostics to documents
ALTER TABLE public.documents
ADD COLUMN IF NOT EXISTS extracted_text_length integer,
ADD COLUMN IF NOT EXISTS processing_time_ms integer;
