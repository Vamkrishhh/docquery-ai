
-- ─────────────────────────────────────────────────────────────────────────────
-- Two-Factor Authentication (2FA / TOTP)
-- user_2fa          : Stores TOTP secret + hashed backup codes per user
-- user_2fa_devices  : Stores "remember this device" tokens
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. user_2fa ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_2fa (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  secret_key      TEXT        NOT NULL,          -- Base32-encoded TOTP secret (store encrypted at rest)
  backup_codes    TEXT[]      NOT NULL,           -- Array of 10 hex backup codes (hashed recommended in prod)
  enabled_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS: each user can only access their own 2FA record
ALTER TABLE public.user_2fa ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own 2FA"
  ON public.user_2fa FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own 2FA"
  ON public.user_2fa FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own 2FA"
  ON public.user_2fa FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own 2FA"
  ON public.user_2fa FOR DELETE
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_user_2fa_user_id ON public.user_2fa(user_id);

-- ── 2. user_2fa_devices ───────────────────────────────────────────────────────
-- "Remember this device for 30 days" token storage

CREATE TABLE IF NOT EXISTS public.user_2fa_devices (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_token TEXT       NOT NULL UNIQUE,  -- Random token stored in browser localStorage
  device_name  TEXT,
  user_agent   TEXT,
  ip_address   INET,
  expires_at   TIMESTAMPTZ NOT NULL,         -- NOW() + 30 days
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.user_2fa_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own devices"
  ON public.user_2fa_devices FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own devices"
  ON public.user_2fa_devices FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own devices"
  ON public.user_2fa_devices FOR DELETE
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_user_2fa_devices_user_id ON public.user_2fa_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_user_2fa_devices_token   ON public.user_2fa_devices(device_token);

-- Auto-expire: clean up expired device tokens
CREATE OR REPLACE FUNCTION public.cleanup_expired_2fa_devices()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  DELETE FROM public.user_2fa_devices WHERE expires_at < NOW();
END;
$$;
