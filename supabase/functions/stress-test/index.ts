import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await supabaseAuth.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: profile } = await supabase.from("profiles").select("tenant_id").eq("user_id", user.id).single();
    if (!profile) {
      return new Response(JSON.stringify({ error: "Profile not found" }), { status: 400, headers: corsHeaders });
    }

    const body = await req.json().catch(() => ({}));
    const queryCount = Math.min(Math.max(body.query_count || 20, 5), 50);
    const tenantId = profile.tenant_id;

    // Load evaluation dataset for query sampling
    const { data: dataset } = await supabase
      .from("evaluation_dataset")
      .select("query")
      .eq("tenant_id", tenantId);

    // Also load some recent user queries as fallback
    const { data: recentQueries } = await supabase
      .from("query_logs")
      .select("question")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(20);

    const queryPool: string[] = [];
    if (dataset) queryPool.push(...dataset.map((d: any) => d.query));
    if (recentQueries) queryPool.push(...recentQueries.map((q: any) => q.question));
    
    // Fallback queries if no dataset exists
    if (queryPool.length === 0) {
      queryPool.push(
        "What is this system about?",
        "How does document processing work?",
        "Explain the architecture",
        "What security features are implemented?",
        "How does retrieval work?",
      );
    }

    const results: { query: string; success: boolean; retrieval_latency_ms: number; total_latency_ms: number; chunks_retrieved: number; documents_retrieved: string[]; error?: string }[] = [];
    const startedAt = new Date().toISOString();
    const docDistribution: Record<string, number> = {};

    for (let i = 0; i < queryCount; i++) {
      const query = queryPool[Math.floor(Math.random() * queryPool.length)];
      const qStart = Date.now();
      
      try {
        // Run FTS retrieval
        const retrievalStart = Date.now();
        const searchTerms = query.replace(/[^\w\s'-]/g, "").trim()
          .split(/\s+/).filter((w: string) => w.length > 2).slice(0, 8).join(" | ");
        
        const { data: chunks, error: searchError } = await supabase
          .rpc("search_document_chunks", {
            search_query: searchTerms || "test",
            search_tenant_id: tenantId,
            result_limit: 5,
          });

        const retrievalLatency = Date.now() - retrievalStart;
        const totalLatency = Date.now() - qStart;

        if (searchError) {
          results.push({ query, success: false, retrieval_latency_ms: retrievalLatency, total_latency_ms: totalLatency, chunks_retrieved: 0, documents_retrieved: [], error: searchError.message });
        } else {
          const chunkList = (chunks || []) as any[];
          const docIds = [...new Set(chunkList.map((c: any) => c.document_id))];
          docIds.forEach(id => { docDistribution[id] = (docDistribution[id] || 0) + 1; });
          results.push({ query, success: true, retrieval_latency_ms: retrievalLatency, total_latency_ms: totalLatency, chunks_retrieved: chunkList.length, documents_retrieved: docIds });
        }
      } catch (e) {
        results.push({ query, success: false, retrieval_latency_ms: Date.now() - qStart, total_latency_ms: Date.now() - qStart, chunks_retrieved: 0, documents_retrieved: [], error: e instanceof Error ? e.message : "Unknown" });
      }

      // Small delay to avoid hammering the DB
      if (i < queryCount - 1) await new Promise(r => setTimeout(r, 50));
    }

    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    const latencies = successful.map(r => r.total_latency_ms);
    const retrievalLatencies = successful.map(r => r.retrieval_latency_ms);
    const withChunks = successful.filter(r => r.chunks_retrieved > 0);
    const multiDocQueries = successful.filter(r => r.documents_retrieved.length > 1);

    // Get document filenames for distribution
    const allDocIds = Object.keys(docDistribution);
    let docNames: Record<string, string> = {};
    if (allDocIds.length > 0) {
      const { data: docs } = await supabase.from("documents").select("id, filename").in("id", allDocIds);
      if (docs) docNames = Object.fromEntries((docs as any[]).map((d: any) => [d.id, d.filename]));
    }
    const documentDistribution = allDocIds.map(id => ({
      document_id: id,
      filename: docNames[id] || id.substring(0, 8),
      query_hits: docDistribution[id],
    })).sort((a, b) => b.query_hits - a.query_hits);

    const summary = {
      total_queries: results.length,
      successful_queries: successful.length,
      failed_queries: failed.length,
      avg_latency_ms: latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0,
      max_latency_ms: latencies.length ? Math.max(...latencies) : 0,
      min_latency_ms: latencies.length ? Math.min(...latencies) : 0,
      avg_retrieval_latency_ms: retrievalLatencies.length ? Math.round(retrievalLatencies.reduce((a, b) => a + b, 0) / retrievalLatencies.length) : 0,
      avg_generation_latency_ms: 0,
      retrieval_success_rate: results.length ? Number((withChunks.length / results.length).toFixed(3)) : 0,
      multi_doc_queries: multiDocQueries.length,
      unique_documents_retrieved: allDocIds.length,
      document_distribution: documentDistribution,
    };

    // Store run
    await supabase.from("stress_test_runs").insert({
      tenant_id: tenantId,
      user_id: user.id,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      ...summary,
      results,
    });

    return new Response(JSON.stringify({ summary, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("stress-test error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
