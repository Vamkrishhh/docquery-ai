
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS storage_limit_mb integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS query_limit_monthly integer NOT NULL DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

-- Allow admins to insert new tenants
CREATE POLICY "Admins can create tenants"
  ON public.tenants FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to delete tenants (not their own)
CREATE POLICY "Admins can delete other tenants"
  ON public.tenants FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND id != get_user_tenant_id());
