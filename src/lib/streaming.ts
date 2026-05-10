export type Msg = { role: "user" | "assistant"; content: string };

export interface StreamSource {
  document_id: string;
  filename: string;
  chunk_index: number;
  chunk_text: string;
  similarity: number;
}

export interface MessageDiagnostics {
  search_query: string;
  expanded_query?: string;
  chunks_count: number;
  retrieval_latency_ms: number;
  system_prompt: string;
  total_latency_before_stream_ms: number;
  confidence_score?: number;
}

export function calculateConfidence(sources: StreamSource[], backendScore?: number): number {
  if (backendScore !== undefined) return Math.round(backendScore * 100);
  if (!sources || sources.length === 0) return 0;
  const chunkCount = sources.length;
  // FTS ranks are small (0.01-1.0), similarity can be 0-1 range
  const avgScore = sources.reduce((sum, s) => sum + (s.similarity || 0), 0) / chunkCount;
  // Normalize: if scores look like FTS ranks (< 1), boost them
  const normalizedScore = avgScore < 1 ? Math.min(avgScore * 5, 1) : avgScore;
  const chunkBonus = Math.min(chunkCount / 3, 1) * 30; // up to 30% for 3+ chunks
  const scoreWeight = normalizedScore * 60; // up to 60% from relevance
  const baseConfidence = sources.length > 0 ? 10 : 0; // minimum 10% if sources exist
  return Math.round(Math.min(baseConfidence + scoreWeight + chunkBonus, 99));
}

const RAG_QUERY_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/rag-query`;

export async function streamRagQuery({
  question,
  conversationId,
  tenantId,
  accessToken,
  mode,
  documentId,
  model,
  temperature,
  max_tokens,
  top_p,
  onDelta,
  onSources,
  onDiagnostics,
  onDone,
  onError,
}: {
  question: string;
  conversationId?: string;
  tenantId: string;
  accessToken: string;
  mode?: string;
  documentId?: string;
  model?: string;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  onDelta: (text: string) => void;
  onSources: (sources: StreamSource[]) => void;
  onDiagnostics?: (diagnostics: MessageDiagnostics) => void;
  onFollowUps?: (questions: string[]) => void;
  onDone: () => void;
  onError: (error: string) => void;
}) {
  try {
    const resp = await fetch(RAG_QUERY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ 
        question, 
        conversation_id: conversationId, 
        tenant_id: tenantId,
        mode,
        document_id: documentId,
        model,
        temperature,
        max_tokens,
        top_p,
      }),
    });

    if (resp.status === 429) {
      onError("Rate limit exceeded. Please try again later.");
      return;
    }
    if (resp.status === 402) {
      onError("AI credits exhausted. Please add credits to your workspace.");
      return;
    }
    if (!resp.ok || !resp.body) {
      let errorMsg = "Failed to get response";
      try {
        const errBody = await resp.json();
        errorMsg = errBody.error || errorMsg;
      } catch {
        errorMsg = await resp.text() || errorMsg;
      }
      onError(errorMsg);
      return;
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let textBuffer = "";
    let streamDone = false;

    while (!streamDone) {
      const { done, value } = await reader.read();
      if (done) break;
      textBuffer += decoder.decode(value, { stream: true });

      let newlineIndex: number;
      while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
        let line = textBuffer.slice(0, newlineIndex);
        textBuffer = textBuffer.slice(newlineIndex + 1);

        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (line.startsWith(":") || line.trim() === "") continue;
        if (!line.startsWith("data: ")) continue;

        const jsonStr = line.slice(6).trim();
        if (jsonStr === "[DONE]") {
          streamDone = true;
          break;
        }

        try {
          const parsed = JSON.parse(jsonStr);
          
          if (parsed.sources) {
            onSources(parsed.sources);
            if (parsed.diagnostics && onDiagnostics) {
              onDiagnostics(parsed.diagnostics);
            }
            continue;
          }

          const content = parsed.choices?.[0]?.delta?.content as string | undefined;
          if (content) onDelta(content);
        } catch {
          textBuffer = line + "\n" + textBuffer;
          break;
        }
      }
    }

    // Flush remaining
    if (textBuffer.trim()) {
      for (let raw of textBuffer.split("\n")) {
        if (!raw) continue;
        if (raw.endsWith("\r")) raw = raw.slice(0, -1);
        if (raw.startsWith(":") || raw.trim() === "") continue;
        if (!raw.startsWith("data: ")) continue;
        const jsonStr = raw.slice(6).trim();
        if (jsonStr === "[DONE]") continue;
        try {
          const parsed = JSON.parse(jsonStr);
          if (parsed.sources) {
            onSources(parsed.sources);
            if (parsed.diagnostics && onDiagnostics) {
              onDiagnostics(parsed.diagnostics);
            }
            continue;
          }
          const content = parsed.choices?.[0]?.delta?.content as string | undefined;
          if (content) onDelta(content);
        } catch { /* ignore partial */ }
      }
    }

    onDone();
  } catch (e) {
    onError(e instanceof Error ? e.message : "Network error. Please check your connection.");
  }
}
