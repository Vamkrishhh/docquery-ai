
-- ─────────────────────────────────────────────────────────────────────────────
-- Document Tagging & Organization System
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.document_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  tag_name TEXT NOT NULL,
  color TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id)
);

-- Enable RLS
ALTER TABLE public.document_tags ENABLE ROW LEVEL SECURITY;

-- Select policy: users can see tags for their own tenant
CREATE POLICY "Tenant members can view document tags"
  ON public.document_tags FOR SELECT
  USING (tenant_id = public.get_user_tenant_id());

-- Insert policy: authenticated users can add tags for their tenant
CREATE POLICY "Tenant members can insert document tags"
  ON public.document_tags FOR INSERT
  WITH CHECK (tenant_id = public.get_user_tenant_id());

-- Delete policy: users can delete tags for their tenant
CREATE POLICY "Tenant members can delete document tags"
  ON public.document_tags FOR DELETE
  USING (tenant_id = public.get_user_tenant_id());

-- Update policy: users can update tags for their tenant
CREATE POLICY "Tenant members can update document tags"
  ON public.document_tags FOR UPDATE
  USING (tenant_id = public.get_user_tenant_id());

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_document_tags_document_id ON public.document_tags(document_id);
CREATE INDEX IF NOT EXISTS idx_document_tags_tenant_id ON public.document_tags(tenant_id);
CREATE INDEX IF NOT EXISTS idx_document_tags_name ON public.document_tags(tag_name);

-- Composite index for bulk operations
CREATE INDEX IF NOT EXISTS idx_document_tags_composite ON public.document_tags(tenant_id, tag_name);
