
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- Create app_role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'member');

-- Create document_status enum
CREATE TYPE public.document_status AS ENUM ('pending', 'processing', 'ready', 'error');

-- Tenants table
CREATE TABLE public.tenants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

-- Profiles table
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  display_name TEXT,
  email TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- User roles table (separate from profiles per security rules)
CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'member',
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Documents table
CREATE TABLE public.documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT,
  status public.document_status NOT NULL DEFAULT 'pending',
  chunk_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- Document chunks with vector embeddings
CREATE TABLE public.document_chunks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  chunk_text TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  embedding extensions.vector(1536),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;

-- Conversations table
CREATE TABLE public.conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT DEFAULT 'New Chat',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

-- Messages table
CREATE TABLE public.messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  sources JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Helper function to get tenant_id for current user
CREATE OR REPLACE FUNCTION public.get_user_tenant_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1
$$;

-- Helper function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Apply updated_at triggers
CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON public.tenants FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_documents_updated_at BEFORE UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON public.conversations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS Policies for tenants
CREATE POLICY "Users can view their own tenant" ON public.tenants
  FOR SELECT USING (id = public.get_user_tenant_id());

CREATE POLICY "Users can update their own tenant" ON public.tenants
  FOR UPDATE USING (id = public.get_user_tenant_id());

-- RLS Policies for profiles
CREATE POLICY "Users can view profiles in their tenant" ON public.profiles
  FOR SELECT USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own profile" ON public.profiles
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- RLS Policies for user_roles
CREATE POLICY "Users can view their own roles" ON public.user_roles
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Admins can manage roles in tenant" ON public.user_roles
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for documents (tenant-isolated)
CREATE POLICY "Users can view documents in their tenant" ON public.documents
  FOR SELECT USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Users can upload documents to their tenant" ON public.documents
  FOR INSERT WITH CHECK (tenant_id = public.get_user_tenant_id() AND uploaded_by = auth.uid());

CREATE POLICY "Users can delete documents in their tenant" ON public.documents
  FOR DELETE USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Users can update documents in their tenant" ON public.documents
  FOR UPDATE USING (tenant_id = public.get_user_tenant_id());

-- RLS Policies for document_chunks (tenant-isolated)
CREATE POLICY "Users can view chunks in their tenant" ON public.document_chunks
  FOR SELECT USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Service can insert chunks" ON public.document_chunks
  FOR INSERT WITH CHECK (tenant_id = public.get_user_tenant_id());

-- RLS Policies for conversations (tenant-isolated)
CREATE POLICY "Users can view their conversations" ON public.conversations
  FOR SELECT USING (tenant_id = public.get_user_tenant_id() AND user_id = auth.uid());

CREATE POLICY "Users can create conversations" ON public.conversations
  FOR INSERT WITH CHECK (tenant_id = public.get_user_tenant_id() AND user_id = auth.uid());

CREATE POLICY "Users can delete their conversations" ON public.conversations
  FOR DELETE USING (user_id = auth.uid());

CREATE POLICY "Users can update their conversations" ON public.conversations
  FOR UPDATE USING (user_id = auth.uid());

-- RLS Policies for messages (tenant-isolated)
CREATE POLICY "Users can view messages in their conversations" ON public.messages
  FOR SELECT USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Users can insert messages" ON public.messages
  FOR INSERT WITH CHECK (tenant_id = public.get_user_tenant_id());

-- Vector similarity search function
CREATE OR REPLACE FUNCTION public.match_document_chunks(
  query_embedding extensions.vector(1536),
  match_tenant_id UUID,
  match_count INTEGER DEFAULT 5,
  match_threshold FLOAT DEFAULT 0.7
)
RETURNS TABLE (
  id UUID,
  document_id UUID,
  chunk_text TEXT,
  chunk_index INTEGER,
  similarity FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.id,
    dc.document_id,
    dc.chunk_text,
    dc.chunk_index,
    1 - (dc.embedding <=> query_embedding) AS similarity
  FROM public.document_chunks dc
  WHERE dc.tenant_id = match_tenant_id
    AND 1 - (dc.embedding <=> query_embedding) > match_threshold
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Create index for vector similarity search
CREATE INDEX idx_document_chunks_embedding ON public.document_chunks
  USING ivfflat (embedding extensions.vector_cosine_ops) WITH (lists = 100);

-- Create indexes for common queries
CREATE INDEX idx_profiles_user_id ON public.profiles(user_id);
CREATE INDEX idx_profiles_tenant_id ON public.profiles(tenant_id);
CREATE INDEX idx_documents_tenant_id ON public.documents(tenant_id);
CREATE INDEX idx_document_chunks_tenant_id ON public.document_chunks(tenant_id);
CREATE INDEX idx_document_chunks_document_id ON public.document_chunks(document_id);
CREATE INDEX idx_conversations_tenant_id ON public.conversations(tenant_id);
CREATE INDEX idx_conversations_user_id ON public.conversations(user_id);
CREATE INDEX idx_messages_conversation_id ON public.messages(conversation_id);

-- Auto-create profile and tenant on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_tenant_id UUID;
  user_name TEXT;
BEGIN
  -- Get display name from metadata or email
  user_name := COALESCE(
    NEW.raw_user_meta_data->>'display_name',
    NEW.raw_user_meta_data->>'full_name',
    split_part(NEW.email, '@', 1)
  );

  -- Check if user was invited to a tenant (via metadata)
  IF NEW.raw_user_meta_data->>'tenant_id' IS NOT NULL THEN
    new_tenant_id := (NEW.raw_user_meta_data->>'tenant_id')::UUID;
  ELSE
    -- Create a new tenant for this user
    INSERT INTO public.tenants (name)
    VALUES (user_name || '''s Organization')
    RETURNING id INTO new_tenant_id;
  END IF;

  -- Create profile
  INSERT INTO public.profiles (user_id, tenant_id, display_name, email)
  VALUES (NEW.id, new_tenant_id, user_name, NEW.email);

  -- Assign admin role if they created the tenant
  IF NEW.raw_user_meta_data->>'tenant_id' IS NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'member');
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger for new user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Storage bucket for documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false);

-- Storage policies - tenant-isolated via folder structure: tenant_id/filename
CREATE POLICY "Users can upload documents to their tenant folder" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = public.get_user_tenant_id()::text
  );

CREATE POLICY "Users can view documents in their tenant folder" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = public.get_user_tenant_id()::text
  );

CREATE POLICY "Users can delete documents in their tenant folder" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = public.get_user_tenant_id()::text
  );
