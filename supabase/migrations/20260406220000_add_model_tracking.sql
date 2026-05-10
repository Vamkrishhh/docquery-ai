-- Add model_used column to query_logs for tracking performance per-model
ALTER TABLE query_logs ADD COLUMN IF NOT EXISTS model_used text;

-- Add model-specific performance columns to query_logs (optional but helpful)
ALTER TABLE query_logs ADD COLUMN IF NOT EXISTS tokens_used int;

-- Create an index to support dashboard aggregations by model
CREATE INDEX IF NOT EXISTS idx_query_logs_model_used ON query_logs(model_used);
