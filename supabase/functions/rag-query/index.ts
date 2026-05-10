import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Simple in-memory rate limiter
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 20;
const RATE_WINDOW = 60_000;

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_WINDOW });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const startTime = Date.now();

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;

    // Verify user
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await supabaseAuth.auth.getUser();
    if (userError || !user) {
      console.error("[rag-query] Auth error:", userError?.message);
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userId = user.id;

    // Rate limit
    if (!checkRateLimit(userId)) {
      return new Response(JSON.stringify({ error: "Too many requests. Please wait a moment." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let body;
    try { body = await req.json(); } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers: corsHeaders });
    }

    const { question, tenant_id, mode, document_id, conversation_id, model = "google/gemini-3-flash-preview" } = body;

    let targetModel = "google/gemini-3-flash-preview";
    if (model === "gemini-pro") targetModel = "google/gemini-3-pro-preview";
    else if (model === "gemini-lite") targetModel = "google/gemini-3-lite-preview";
    else if (model.includes("/")) targetModel = model; // pass through

    if (!question || typeof question !== "string" || question.trim().length === 0) {
      return new Response(JSON.stringify({ error: "Question is required" }), { status: 400, headers: corsHeaders });
    }
    if (!tenant_id) {
      return new Response(JSON.stringify({ error: "tenant_id is required" }), { status: 400, headers: corsHeaders });
    }

    // Verify tenant membership
    const { data: profile } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("user_id", userId)
      .single();

    if (!profile || profile.tenant_id !== tenant_id) {
      return new Response(JSON.stringify({ error: "Unauthorized tenant access" }), { status: 403, headers: corsHeaders });
    }

    // Load recent conversation history for query expansion context
    let historyContext = "";
    if (conversation_id) {
      const { data: history } = await supabase
        .from("messages")
        .select("role, content")
        .eq("conversation_id", conversation_id)
        .order("created_at", { ascending: false })
        .limit(10);
      
      if (history) {
        historyContext = history.reverse()
          .map((m: any) => `${m.role === 'user' ? 'Question' : 'Answer'}: ${m.content}`)
          .join("\n");
      }
    }

    // 1. Query Rewriting / Expansion using conversation history
    let expandedQuery = question;
    try {
      const rewriteResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { 
              role: "system", 
              content: `You are a query expansion assistant. Rewrite the user question to be more descriptive and suitable for vector search. 
Expand abbreviations, add context from the conversation history, and resolve pronouns (it, they, that, etc.).
Output ONLY the rewritten question.` 
            },
            { role: "user", content: `CONVERSATION HISTORY:\n${historyContext}\n\nCURRENT QUESTION: ${question}` }
          ],
        }),
      });
      if (rewriteResp.ok) {
        const rewriteData = await rewriteResp.json();
        expandedQuery = rewriteData.choices[0].message.content.trim();
        console.log(`[rag-query] Expanded query: "${expandedQuery}"`);
      }
    } catch (e) {
      console.warn("[rag-query] Query expansion failed:", e);
    }

    // 2. Semantic Embedding Generation for the query
    let queryEmbedding: number[] | null = null;
    try {
      const embResp = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/text-embedding-004",
          input: [expandedQuery]
        })
      });
      if (embResp.ok) {
        const embData = await embResp.json();
        queryEmbedding = embData.data[0].embedding;
      }
    } catch (e) {
      console.warn("[rag-query] Embedding generation failed:", e);
    }

    // 3. Hybrid Retrieval (Semantic + FTS)
    const retrievalStart = Date.now();
    let chunks: any[] = [];

    if (queryEmbedding) {
      // Use hybrid_search RPC (optionally scoped by document_id)
      const { data: hybridResults, error: searchError } = await supabase
        .rpc("hybrid_search", {
          query_text: expandedQuery,
          query_embedding: queryEmbedding,
          match_tenant_id: tenant_id,
          match_count: 20,
          full_text_weight: 0.4,
          semantic_weight: 0.6
        });

      if (!searchError && hybridResults) {
        // Filter by document_id if provided (if RPC doesn't handle it yet)
        let filteredResults = hybridResults;
        if (document_id) {
          filteredResults = hybridResults.filter((r: any) => r.document_id === document_id);
        }

        // 4. Re-ranking: Simple Keyword-Weighted Scoring
        const queryTokens = expandedQuery.toLowerCase().split(/\s+/).filter(t => t.length > 2);
        
        chunks = filteredResults.map((chunk: any) => {
          let keywordBonus = 0;
          const chunkLower = chunk.chunk_text.toLowerCase();
          queryTokens.forEach(token => {
            if (chunkLower.includes(token)) keywordBonus += 0.05;
          });
          
          return {
            ...chunk,
            reRankScore: (chunk.combined_rank || 0) + Math.min(keywordBonus, 0.2)
          };
        })
        .sort((a: any, b: any) => b.reRankScore - a.reRankScore)
        .slice(0, 5); 
        
        console.log(`[rag-query] Hybrid search + Re-ranking returned ${chunks.length} chunks`);
      }
    }

    // Fallback if hybrid search produced nothing or failed
    if (chunks.length === 0) {
      const { data: ftsChunks } = await supabase
        .rpc("search_document_chunks", {
          search_query: expandedQuery.substring(0, 100),
          search_tenant_id: tenant_id,
          result_limit: 5,
        });
      if (ftsChunks) chunks = ftsChunks;
    }

    const retrievalLatencyMs = Date.now() - retrievalStart;

    // 5. Confidence Scoring Logic
    // Based on matching chunks and their semantic scores
    let confidenceScore = 0;
    if (chunks.length > 0) {
      const avgScore = chunks.reduce((acc, c) => acc + (c.reRankScore || c.rank || 0), 0) / chunks.length;
      // Normalize: assuming scores are roughly 0.3-0.8 for good matches
      confidenceScore = Math.min(Math.max((avgScore - 0.2) / 0.6, 0.1), 0.98); 
      if (chunks.length < 3) confidenceScore *= 0.8; // Penalty for low retrieval volume
    }

    // Get document filenames
    const docIds = [...new Set(chunks.map((c: any) => c.document_id))];
    let docMap: Record<string, string> = {};
    if (docIds.length > 0) {
      const { data: docs } = await supabase.from("documents").select("id, filename").in("id", docIds);
      if (docs) docMap = Object.fromEntries(docs.map((d: any) => [d.id, d.filename]));
    }

    const sources = chunks.map((c: any) => ({
      document_id: c.document_id,
      filename: docMap[c.document_id] || "Unknown",
      chunk_index: c.chunk_index,
      chunk_text: c.chunk_text.slice(0, 300),
      similarity: c.reRankScore || c.rank || 0,
    }));

    const context = chunks
      .map((c: any, i: number) =>
        `**[Source ${i + 1}: ${docMap[c.document_id] || "Unknown"}, Chunk ${c.chunk_index}]**\n${c.chunk_text}`
      )
      .join("\n\n---\n\n");

    // Build system prompt (Heavily Engineered)
    let systemPrompt: string;
    if (mode === "summarize") {
      systemPrompt = `You are a professional Document Analyst. Provide a high-fidelity summary of information from the provided context.
Organize with clear markdown headers and bullet points. Cite sources for key metrics.

CONTEXT:
${context || "No documents found."}`;
    } else {
      systemPrompt = `You are a professional Document Analyst for a multi-tenant RAG system.

INSTRUCTIONS:
1. Answer the question using ONLY the provided document context. 
2. If the answer is not contained within the context, state: "The provided knowledge base does not contain sufficient information to answer this query."
3. Cite your evidence meticulously using the format: *[Source: filename, Chunk N]* at the end of every supported statement.
4. Format your output as a professional report using Markdown. Use tables for structural data and bold for technical terms.
5. Example of good citation: "Revenue increased by 20% in Q3 *[Source: financial_report.pdf, Chunk 15]*."

DOCUMENT CONTEXT:
${context || "No relevant document chunks were retrieved for this query. Ensure documents are uploaded and indexed."}`;
    }

    // 6. Resilient Generation (Retries across models if one fails)
    const modelsToTry = [targetModel];
    if (targetModel.includes("flash")) {
      modelsToTry.push("google/gemini-3-pro-preview");
      modelsToTry.push("google/gemini-3-lite-preview");
    } else if (targetModel.includes("pro")) {
      modelsToTry.push("google/gemini-3-flash-preview");
      modelsToTry.push("google/gemini-3-lite-preview");
    }

    let completionResp: Response | null = null;
    let finalModelUsed = targetModel;
    let fallbackTriggered = false;

    for (const currentModel of modelsToTry) {
      try {
        console.log(`[rag-query] Attempting generation with ${currentModel}...`);
        const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${lovableApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: currentModel,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: question }
            ],
            stream: true,
            temperature: body.temperature ?? 0.1,
            max_tokens: body.max_tokens ?? 2000,
            top_p: body.top_p ?? 0.9,
          }),
        });

        if (resp.ok) {
          completionResp = resp;
          finalModelUsed = currentModel;
          break; 
        } else {
          console.warn(`[rag-query] Model ${currentModel} failed with status ${resp.status}`);
          fallbackTriggered = true;
        }
      } catch (e) {
        console.error(`[rag-query] Fetch error for ${currentModel}:`, e);
        fallbackTriggered = true;
      }
    }

    if (!completionResp) {
      return new Response(JSON.stringify({ error: "All AI model attempts failed. Service temporarily unavailable." }), { status: 503, headers: corsHeaders });
    }

    // 7. Log successful query with latency and diagnostics
    const latencyMs = Date.now() - startTime;
    const retrievedChunkIds = chunks.map((c: any) => c.id);
    const retrievalScores = chunks.map((c: any) => c.reRankScore || c.rank || 0);

    await supabase.from("query_logs").insert({
      tenant_id,
      user_id: userId,
      query_text: question,
      latency_ms: latencyMs,
      generation_latency_ms: latencyMs - retrievalLatencyMs,
      retrieval_latency_ms: retrievalLatencyMs,
      retrieved_chunk_ids: retrievedChunkIds,
      retrieval_scores: retrievalScores,
      model_used: finalModelUsed,
      metadata: { 
        fallback_triggered: fallbackTriggered, 
        original_request_model: targetModel,
        chunks_count: chunks.length
      }
    });

    // Mirror to system_logs for monitoring
    await supabase.from("system_logs").insert({
      tenant_id,
      source: "rag-query",
      log_type: fallbackTriggered ? "warning" : "info",
      message: `Query processed via ${finalModelUsed}${fallbackTriggered ? " (FALLBACK ACTIVE)" : ""}`,
      metadata: { 
        latency_ms: latencyMs, 
        chunks: chunks.length, 
        model: finalModelUsed,
        fallback: fallbackTriggered
      }
    });

    const diagnostics = {
      search_query: question,
      expanded_query: expandedQuery,
      chunks_count: chunks.length,
      retrieval_latency_ms: retrievalLatencyMs,
      system_prompt: systemPrompt.substring(0, 500) + "...",
      total_latency_before_stream_ms: Date.now() - startTime,
      model_used: finalModelUsed,
      confidence_score: confidenceScore
    };

    // 8. Proxy the stream (OpenAI-compatible)
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    (async () => {
      let fullContent = "";
      try {
        const reader = (completionResp as Response).body?.getReader();
        if (!reader) throw new Error("No reader from generation response");

        // Send metadata first
        await writer.write(encoder.encode(`data: ${JSON.stringify({ sources, diagnostics, confidence_score: confidenceScore })}\n\n`));

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = new TextDecoder().decode(value);
          // Parse OpenAI/Lovable stream format (data: {...})
          const lines = chunk.split("\n");
          for (const line of lines) {
            if (line.startsWith("data: ") && line !== "data: [DONE]") {
              try {
                const data = JSON.parse(line.substring(6));
                fullContent += data.choices[0].delta?.content || "";
              } catch {}
            }
          }
          await writer.write(value);
        }

        // POST-GENERATION INTELLIGENCE
        // 1. Generate Follow-up Questions
        let followUps = [];
        try {
          const followUpResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${lovableApiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "google/gemini-3-flash-preview",
              messages: [{ role: "system", content: "Based on the provided AI response, generate 3 short follow-up questions (max 10 words each) that a user might ask next. Format as JSON array: [\"Q1\", \"Q2\", \"Q3\"]." }, { role: "user", content: fullContent }],
              response_format: { type: "json_object" }
            })
          });
          if (followUpResp.ok) {
            const fuData = await followUpResp.json();
            const parsed = JSON.parse(fuData.choices[0].message.content);
            followUps = Array.isArray(parsed) ? parsed : (parsed.questions || []);
          }
        } catch (e) { console.warn("[rag-query] Follow-up gen failed:", e); }

        // 2. If 'summarize' mode, update the document
        if (mode === "summarize" && document_id) {
           await supabase.from("documents").update({ summary: fullContent.trim() }).eq("id", document_id);
           console.log(`[rag-query] Persistent summary saved for ${document_id}`);
        }

        await writer.write(encoder.encode(`data: ${JSON.stringify({ followUps, done: true })}\n\n`));
        await writer.write(encoder.encode("data: [DONE]\n\n"));
      } catch (err) {
        console.error("[rag-query] Stream proxy error:", err);
      } finally {
        writer.close();
      }
    })();

    return new Response(readable, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    });
  } catch (e) {
    console.error("rag-query error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "An unexpected error occurred" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
