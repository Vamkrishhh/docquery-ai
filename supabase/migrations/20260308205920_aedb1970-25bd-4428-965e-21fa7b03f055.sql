
-- Message feedback table
CREATE TABLE public.message_feedback (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL,
  user_id UUID NOT NULL,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  feedback_type TEXT NOT NULL CHECK (feedback_type IN ('helpful', 'not_helpful')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- System logs table
CREATE TABLE public.system_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  log_type TEXT NOT NULL DEFAULT 'info',
  source TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- RLS for message_feedback
ALTER TABLE public.message_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert feedback" ON public.message_feedback
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_user_tenant_id() AND user_id = auth.uid());

CREATE POLICY "Users can view their feedback" ON public.message_feedback
  FOR SELECT TO authenticated
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Users can delete their feedback" ON public.message_feedback
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- RLS for system_logs
ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view logs in tenant" ON public.system_logs
  FOR SELECT TO authenticated
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Users can insert logs" ON public.system_logs
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_user_tenant_id());

-- Index for faster queries
CREATE INDEX idx_message_feedback_message ON public.message_feedback(message_id);
CREATE INDEX idx_system_logs_tenant_created ON public.system_logs(tenant_id, created_at DESC);
CREATE INDEX idx_system_logs_type ON public.system_logs(log_type);
