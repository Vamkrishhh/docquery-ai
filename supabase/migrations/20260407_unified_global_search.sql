-- Unified Global Search RPC
-- Searches across documents, chunks, and messages with tenant isolation

CREATE OR REPLACE FUNCTION unified_global_search(
  search_query TEXT,
  match_tenant_id UUID,
  max_results INT DEFAULT 5
)
RETURNS TABLE (
  result_id TEXT,
  result_type TEXT, -- 'document', 'chunk', 'message'
  title TEXT,
  content TEXT,
  parent_id TEXT, -- For chunks/messages (document_id or conversation_id)
  created_at TIMESTAMPTZ,
  rank FLOAT
) AS $$
BEGIN
  RETURN QUERY
  -- 1. Search Documents by title
  (
    SELECT 
      id::TEXT as result_id,
      'document'::TEXT as result_type,
      filename as title,
      COALESCE(description, 'Document from knowledge base') as content,
      id::TEXT as parent_id,
      created_at,
      ts_rank(to_tsvector('english', filename), plainto_tsquery('english', search_query)) as rank
    FROM documents
    WHERE tenant_id = match_tenant_id
      AND to_tsvector('english', filename) @@ plainto_tsquery('english', search_query)
    LIMIT max_results
  )
  UNION ALL
  -- 2. Search Document Chunks by FTS
  (
    SELECT 
      c.id::TEXT as result_id,
      'chunk'::TEXT as result_type,
      d.filename as title,
      c.chunk_text as content,
      d.id::TEXT as parent_id,
      c.created_at,
      ts_rank(to_tsvector('english', c.chunk_text), plainto_tsquery('english', search_query)) as rank
    FROM document_chunks c
    JOIN documents d ON c.document_id = d.id
    WHERE d.tenant_id = match_tenant_id
      AND to_tsvector('english', c.chunk_text) @@ plainto_tsquery('english', search_query)
    LIMIT max_results
  )
  UNION ALL
  -- 3. Search Messages
  (
    SELECT 
      m.id::TEXT as result_id,
      'message'::TEXT as result_type,
      c.title as title,
      m.content as content,
      c.id::TEXT as parent_id,
      m.created_at,
      ts_rank(to_tsvector('english', m.content), plainto_tsquery('english', search_query)) as rank
    FROM messages m
    JOIN conversations c ON m.conversation_id = c.id
    WHERE m.tenant_id = match_tenant_id
      AND to_tsvector('english', m.content) @@ plainto_tsquery('english', search_query)
    LIMIT max_results
  )
  ORDER BY rank DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
