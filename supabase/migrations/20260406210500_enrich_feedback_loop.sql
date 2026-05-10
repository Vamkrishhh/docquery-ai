-- Add metadata column to message_feedback for rich diagnostics
ALTER TABLE public.message_feedback
ADD COLUMN metadata JSONB;

-- Add comment
COMMENT ON COLUMN public.message_feedback.metadata IS 'Stores the query, retrieved chunks, and model response for negative feedback analysis.';
