
-- Add model_used column to query_logs for tracking LLM usage
ALTER TABLE public.query_logs 
ADD COLUMN IF NOT EXISTS model_used TEXT DEFAULT 'google/gemini-pro';

-- Add comment explaining usage
COMMENT ON COLUMN public.query_logs.model_used IS 'The specific LLM model identifier used for this query (e.g., gemini-pro, gpt-4)';

-- Ensure the get_daily_query_counts RPC handles time zones properly if needed, 
-- but the original is mostly okay. We will fill missing days in frontend.

-- Ensure evaluation_results and evaluation_runs have correct columns for the dashboard
-- (These already exist but let's make sure they are NOT NULL where possible or have defaults)
ALTER TABLE public.evaluation_runs 
ALTER COLUMN avg_answer_relevance SET DEFAULT 0,
ALTER COLUMN avg_retrieval_accuracy SET DEFAULT 0;
