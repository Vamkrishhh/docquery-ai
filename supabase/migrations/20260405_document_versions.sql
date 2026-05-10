-- ─────────────────────────────────────────────────────────────────────────────
-- Document Versioning – Migration
-- Run this in your Supabase SQL editor (or via CLI migrations)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.document_versions (
  id               uuid primary key default gen_random_uuid(),
  document_id      uuid not null references public.documents(id) on delete cascade,
  version_number   integer not null,
  storage_path     text not null,
  file_size        bigint,
  chunk_count      integer,
  uploaded_at      timestamptz not null default now(),
  uploaded_by      uuid not null references auth.users(id),
  notes            text,
  constraint document_versions_unique_version unique (document_id, version_number)
);

-- Enable RLS (mirror documents table policy pattern)
alter table public.document_versions enable row level security;

-- Policy: tenant members can see versions for their own documents
create policy "Tenant members can view their document versions"
  on public.document_versions for select
  using (
    exists (
      select 1 from public.documents d
      where d.id = document_versions.document_id
        and d.tenant_id = get_user_tenant_id()
    )
  );

-- Policy: authenticated users can insert versions for their tenant's documents
create policy "Tenant members can insert document versions"
  on public.document_versions for insert
  with check (
    exists (
      select 1 from public.documents d
      where d.id = document_versions.document_id
        and d.tenant_id = get_user_tenant_id()
    )
  );

-- Policy: authenticated users can update their own versions
create policy "Uploader can update their document versions"
  on public.document_versions for update
  using (uploaded_by = auth.uid());

-- Policy: authenticated users can delete versions for their tenant's documents
create policy "Tenant members can delete document versions"
  on public.document_versions for delete
  using (
    exists (
      select 1 from public.documents d
      where d.id = document_versions.document_id
        and d.tenant_id = get_user_tenant_id()
    )
  );

-- Also add a version_number column to the documents table to track current version
alter table public.documents
  add column if not exists current_version integer not null default 1;

-- Index for fast version lookups per document
create index if not exists idx_document_versions_document_id
  on public.document_versions(document_id, version_number desc);
