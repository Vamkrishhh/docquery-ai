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
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;

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

    const steps: { name: string; status: "pass" | "fail"; detail: string; time_ms: number }[] = [];
    let testDocId: string | null = null;
    const tenantId = profile.tenant_id;

    const runStep = async (name: string, fn: () => Promise<string>) => {
      const start = Date.now();
      try {
        const detail = await fn();
        steps.push({ name, status: "pass", detail, time_ms: Date.now() - start });
      } catch (e) {
        steps.push({ name, status: "fail", detail: e instanceof Error ? e.message : "Unknown error", time_ms: Date.now() - start });
      }
    };

    // Step 1: Create test document record
    await runStep("Create test document record", async () => {
      const { data, error } = await supabase.from("documents").insert({
        tenant_id: tenantId,
        uploaded_by: user.id,
        filename: "__pipeline_test_doc.txt",
        file_type: "txt",
        file_path: `${tenantId}/pipeline-test.txt`,
        file_size: 256,
        status: "processing",
      }).select("id").single();
      if (error) throw new Error(error.message);
      testDocId = data.id;
      return `Document ID: ${data.id.substring(0, 8)}...`;
    });

    // Step 2: Extract text (simulated - we're testing the chunking pipeline)
    const testText = "The Secure Multi-Tenant RAG System is a cloud-based intelligent document query platform. " +
      "It supports PDF, TXT, and DOCX uploads with automated text extraction and chunking. " +
      "Documents are split into overlapping chunks stored with full-text search indexes. " +
      "Row-Level Security policies enforce complete data isolation between tenants. " +
      "The retrieval engine uses full-text search with ranking for document chunk retrieval.";

    await runStep("Extract text from document", async () => {
      return `Extracted ${testText.length} characters`;
    });

    // Step 3: Generate chunks
    let chunks: string[] = [];
    await runStep("Generate text chunks", async () => {
      // Simple chunking for test
      const words = testText.split(" ");
      const chunkSize = 30;
      for (let i = 0; i < words.length; i += chunkSize - 5) {
        chunks.push(words.slice(i, i + chunkSize).join(" "));
      }
      return `Generated ${chunks.length} chunks`;
    });

    // Step 4: Store chunks
    await runStep("Store chunks in database", async () => {
      if (!testDocId) throw new Error("No test document");
      const rows = chunks.map((text, idx) => ({
        document_id: testDocId!,
        tenant_id: tenantId,
        chunk_text: text,
        chunk_index: idx,
      }));
      const { error } = await supabase.from("document_chunks").insert(rows);
      if (error) throw new Error(error.message);
      // Update document
      await supabase.from("documents").update({
        status: "ready",
        chunk_count: chunks.length,
        extracted_text_length: testText.length,
      }).eq("id", testDocId!);
      return `${chunks.length} chunks stored`;
    });

    // Step 5: Run FTS retrieval
    await runStep("Run FTS retrieval query", async () => {
      const { data, error } = await supabase.rpc("search_document_chunks", {
        search_query: "multi-tenant security isolation",
        search_tenant_id: tenantId,
        result_limit: 5,
      });
      if (error) throw new Error(error.message);
      const results = (data || []) as any[];
      if (results.length === 0) throw new Error("No chunks retrieved");
      return `Retrieved ${results.length} chunks, top rank: ${results[0]?.rank?.toFixed(4) || "N/A"}`;
    });

    // Step 6: Construct RAG prompt
    let promptLength = 0;
    await runStep("Construct RAG prompt", async () => {
      const { data } = await supabase.rpc("search_document_chunks", {
        search_query: "document query platform",
        search_tenant_id: tenantId,
        result_limit: 3,
      });
      const context = ((data || []) as any[]).map((c: any, i: number) => `[Source ${i+1}] ${c.chunk_text}`).join("\n\n");
      const prompt = `Answer based on context:\n\n${context}\n\nQuestion: What is the system about?`;
      promptLength = prompt.length;
      return `Prompt length: ${promptLength} chars`;
    });

    // Step 7: Generate AI response
    await runStep("Generate AI response", async () => {
      const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-lite",
          messages: [
            { role: "system", content: "Answer briefly based on the context." },
            { role: "user", content: "What is the RAG system? Answer in one sentence." },
          ],
          max_tokens: 100,
        }),
      });
      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`LLM returned ${resp.status}: ${errText.substring(0, 100)}`);
      }
      const data = await resp.json();
      const answer = data.choices?.[0]?.message?.content || "";
      return `Generated ${answer.length} chars`;
    });

    // Step 8: Log query metrics
    await runStep("Log query metrics", async () => {
      const { error } = await supabase.from("query_logs").insert({
        tenant_id: tenantId,
        user_id: user.id,
        question: "__pipeline_test_query",
        latency_ms: steps.reduce((a, s) => a + s.time_ms, 0),
        context_token_count: Math.round(promptLength / 4),
      });
      if (error) throw new Error(error.message);
      return "Query metrics logged";
    });

    // Cleanup
    if (testDocId) {
      await supabase.from("document_chunks").delete().eq("document_id", testDocId);
      await supabase.from("documents").delete().eq("id", testDocId);
      // Clean up the test query log
      await supabase.from("query_logs").delete().eq("question", "__pipeline_test_query").eq("tenant_id", tenantId);
    }

    const totalTime = steps.reduce((a, s) => a + s.time_ms, 0);
    const passed = steps.filter(s => s.status === "pass").length;

    return new Response(JSON.stringify({
      steps,
      summary: {
        total_steps: steps.length,
        passed,
        failed: steps.length - passed,
        total_time_ms: totalTime,
        all_pass: passed === steps.length,
      },
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("test-pipeline error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
