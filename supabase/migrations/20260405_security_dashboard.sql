
-- ─────────────────────────────────────────────────────────────────────────────
-- Security Dashboard Tables
-- Enables: real-time event logging, session tracking, anomaly detection
-- All tables are tenant-scoped via RLS using get_user_tenant_id()
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. security_events ────────────────────────────────────────────────────────
-- Immutable log of all security-relevant platform events (logins, accesses, etc.)

CREATE TABLE IF NOT EXISTS public.security_events (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  event_type     TEXT        NOT NULL,          -- e.g. 'login_success', 'login_failure', 'document_access'
  user_id        UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email     TEXT,
  ip_address     INET,
  device_info    TEXT,
  location       TEXT,
  severity       TEXT        NOT NULL DEFAULT 'low'
                   CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  details        TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view security events"
  ON public.security_events FOR SELECT
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Tenant members can insert security events"
  ON public.security_events FOR INSERT
  WITH CHECK (tenant_id = public.get_user_tenant_id());

-- Indexes
CREATE INDEX IF NOT EXISTS idx_security_events_tenant_id  ON public.security_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_security_events_created_at ON public.security_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_event_type ON public.security_events(event_type);
CREATE INDEX IF NOT EXISTS idx_security_events_severity   ON public.security_events(severity);
CREATE INDEX IF NOT EXISTS idx_security_events_user_id    ON public.security_events(user_id);

-- ── 2. active_sessions ────────────────────────────────────────────────────────
-- Tracks currently authenticated sessions per tenant for session management

CREATE TABLE IF NOT EXISTS public.active_sessions (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email     TEXT,
  display_name   TEXT,
  device_info    TEXT,
  ip_address     INET,
  location       TEXT,
  user_agent     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE public.active_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view active sessions"
  ON public.active_sessions FOR SELECT
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Tenant members can insert active sessions"
  ON public.active_sessions FOR INSERT
  WITH CHECK (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Tenant members can update active sessions"
  ON public.active_sessions FOR UPDATE
  USING (tenant_id = public.get_user_tenant_id());

-- Admins can revoke any session in their tenant
CREATE POLICY "Tenant members can delete active sessions"
  ON public.active_sessions FOR DELETE
  USING (tenant_id = public.get_user_tenant_id());

-- Indexes
CREATE INDEX IF NOT EXISTS idx_active_sessions_tenant_id     ON public.active_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_active_sessions_user_id       ON public.active_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_active_sessions_last_active   ON public.active_sessions(last_active_at DESC);

-- ── 3. security_anomalies ─────────────────────────────────────────────────────
-- Anomalies surfaced by the detection engine (can be auto-inserted by edge functions)

CREATE TABLE IF NOT EXISTS public.security_anomalies (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  type           TEXT        NOT NULL,          -- e.g. 'High Query Volume', 'Off-Hours Access'
  description    TEXT        NOT NULL,
  severity       TEXT        NOT NULL DEFAULT 'medium'
                   CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  affected_user  TEXT,                          -- email or name of affected user (nullable)
  resolved       BOOLEAN     NOT NULL DEFAULT FALSE,
  resolved_at    TIMESTAMPTZ,
  resolved_by    UUID        REFERENCES auth.users(id),
  detected_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE public.security_anomalies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view anomalies"
  ON public.security_anomalies FOR SELECT
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Tenant members can insert anomalies"
  ON public.security_anomalies FOR INSERT
  WITH CHECK (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Tenant members can update anomalies"
  ON public.security_anomalies FOR UPDATE
  USING (tenant_id = public.get_user_tenant_id());

-- Indexes
CREATE INDEX IF NOT EXISTS idx_security_anomalies_tenant_id  ON public.security_anomalies(tenant_id);
CREATE INDEX IF NOT EXISTS idx_security_anomalies_severity   ON public.security_anomalies(severity);
CREATE INDEX IF NOT EXISTS idx_security_anomalies_detected   ON public.security_anomalies(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_anomalies_resolved   ON public.security_anomalies(resolved);

-- ── 4. Auto-seed helper: login event trigger ───────────────────────────────────
-- Automatically logs auth events into security_events via a PostgreSQL trigger
-- This requires the tenant_id to be available on the profile row.

CREATE OR REPLACE FUNCTION public.log_security_event(
  p_tenant_id   UUID,
  p_event_type  TEXT,
  p_user_id     UUID       DEFAULT NULL,
  p_user_email  TEXT       DEFAULT NULL,
  p_ip_address  INET       DEFAULT NULL,
  p_device_info TEXT       DEFAULT NULL,
  p_location    TEXT       DEFAULT NULL,
  p_severity    TEXT       DEFAULT 'low',
  p_details     TEXT       DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.security_events (
    tenant_id, event_type, user_id, user_email,
    ip_address, device_info, location, severity, details
  )
  VALUES (
    p_tenant_id, p_event_type, p_user_id, p_user_email,
    p_ip_address, p_device_info, p_location, p_severity, p_details
  );
END;
$$;
