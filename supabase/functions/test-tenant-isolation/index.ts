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

    // Verify user
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await supabaseAuth.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get caller's tenant
    const { data: profile } = await supabase.from("profiles").select("tenant_id").eq("user_id", user.id).single();
    if (!profile) {
      return new Response(JSON.stringify({ error: "Profile not found" }), { status: 400, headers: corsHeaders });
    }
    const callerTenantId = profile.tenant_id;

    const results: any = {
      timestamp: new Date().toISOString(),
      steps: [],
      overall_pass: true,
    };

    const addStep = (name: string, pass: boolean, detail: string) => {
      results.steps.push({ name, pass, detail });
      if (!pass) results.overall_pass = false;
    };

    // Step 1: Create temporary tenant A
    const { data: tenantA, error: tAErr } = await supabase
      .from("tenants")
      .insert({ name: "__isolation_test_tenant_A__" })
      .select("id")
      .single();
    if (tAErr || !tenantA) {
      addStep("Create Tenant A", false, tAErr?.message || "Failed");
      // Clean up and return
      await supabase.from("tenants").delete().eq("name", "__isolation_test_tenant_A__");
      await supabase.from("tenants").delete().eq("name", "__isolation_test_tenant_B__");
      return new Response(JSON.stringify(results), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    addStep("Create Tenant A", true, `ID: ${tenantA.id.substring(0, 8)}...`);

    // Step 2: Create temporary tenant B
    const { data: tenantB, error: tBErr } = await supabase
      .from("tenants")
      .insert({ name: "__isolation_test_tenant_B__" })
      .select("id")
      .single();
    if (tBErr || !tenantB) {
      addStep("Create Tenant B", false, tBErr?.message || "Failed");
      await supabase.from("tenants").delete().eq("id", tenantA.id);
      return new Response(JSON.stringify(results), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    addStep("Create Tenant B", true, `ID: ${tenantB.id.substring(0, 8)}...`);

    // Step 3: Insert test document for Tenant A
    const { data: docA } = await supabase.from("documents").insert({
      tenant_id: tenantA.id,
      uploaded_by: user.id,
      filename: "__test_isolation_doc_A.txt",
      file_type: "txt",
      file_path: `${tenantA.id}/isolation-test-A.txt`,
      file_size: 100,
      status: "ready",
      chunk_count: 1,
    }).select("id").single();

    // Step 4: Insert test document for Tenant B
    const { data: docB } = await supabase.from("documents").insert({
      tenant_id: tenantB.id,
      uploaded_by: user.id,
      filename: "__test_isolation_doc_B.txt",
      file_type: "txt",
      file_path: `${tenantB.id}/isolation-test-B.txt`,
      file_size: 100,
      status: "ready",
      chunk_count: 1,
    }).select("id").single();

    if (!docA || !docB) {
      addStep("Insert Test Documents", false, "Could not create test documents");
    } else {
      addStep("Insert Test Documents", true, `Doc A: ${docA.id.substring(0, 8)}, Doc B: ${docB.id.substring(0, 8)}`);

      // Step 5: Insert chunks for both tenants
      await supabase.from("document_chunks").insert({
        tenant_id: tenantA.id,
        document_id: docA.id,
        chunk_text: "Tenant A secret data: Project Alpha confidential report.",
        chunk_index: 0,
      });
      await supabase.from("document_chunks").insert({
        tenant_id: tenantB.id,
        document_id: docB.id,
        chunk_text: "Tenant B secret data: Project Beta confidential report.",
        chunk_index: 0,
      });
      addStep("Insert Test Chunks", true, "1 chunk per tenant");

      // Step 6: Query as Tenant A - should only get Tenant A's data
      const { data: tenantAChunks } = await supabase
        .rpc("search_document_chunks", {
          search_query: "confidential report",
          search_tenant_id: tenantA.id,
          result_limit: 10,
        });

      const tenantAResults = (tenantAChunks || []) as any[];
      const tenantAHasOwnData = tenantAResults.some((c: any) => c.document_id === docA.id);
      const tenantAHasLeakedData = tenantAResults.some((c: any) => c.document_id === docB.id);

      addStep("Tenant A retrieval returns own data", tenantAHasOwnData, 
        `Found ${tenantAResults.length} chunks, own data: ${tenantAHasOwnData}`);
      addStep("Tenant B data NOT leaked to Tenant A", !tenantAHasLeakedData, 
        tenantAHasLeakedData ? "CRITICAL: Tenant B data was returned!" : "No cross-tenant data leakage");

      // Step 7: Query as Tenant B - should only get Tenant B's data
      const { data: tenantBChunks } = await supabase
        .rpc("search_document_chunks", {
          search_query: "confidential report",
          search_tenant_id: tenantB.id,
          result_limit: 10,
        });

      const tenantBResults = (tenantBChunks || []) as any[];
      const tenantBHasOwnData = tenantBResults.some((c: any) => c.document_id === docB.id);
      const tenantBHasLeakedData = tenantBResults.some((c: any) => c.document_id === docA.id);

      addStep("Tenant B retrieval returns own data", tenantBHasOwnData,
        `Found ${tenantBResults.length} chunks, own data: ${tenantBHasOwnData}`);
      addStep("Tenant A data NOT leaked to Tenant B", !tenantBHasLeakedData,
        tenantBHasLeakedData ? "CRITICAL: Tenant A data was returned!" : "No cross-tenant data leakage");

      // Step 8: Verify caller's tenant can't see test data
      const { data: callerChunksA } = await supabase
        .rpc("search_document_chunks", {
          search_query: "Project Alpha",
          search_tenant_id: callerTenantId,
          result_limit: 10,
        });
      const callerSeesTestData = ((callerChunksA || []) as any[]).some(
        (c: any) => c.document_id === docA.id || c.document_id === docB.id
      );
      addStep("Caller tenant isolated from test data", !callerSeesTestData,
        callerSeesTestData ? "CRITICAL: Test data visible to caller!" : "Test data not visible to caller tenant");
    }

    // Cleanup: remove test data
    if (docA) {
      await supabase.from("document_chunks").delete().eq("document_id", docA.id);
      await supabase.from("documents").delete().eq("id", docA.id);
    }
    if (docB) {
      await supabase.from("document_chunks").delete().eq("document_id", docB.id);
      await supabase.from("documents").delete().eq("id", docB.id);
    }
    await supabase.from("tenants").delete().eq("id", tenantA.id);
    await supabase.from("tenants").delete().eq("id", tenantB.id);
    addStep("Cleanup test data", true, "All temporary data removed");

    results.summary = {
      total_checks: results.steps.length,
      passed: results.steps.filter((s: any) => s.pass).length,
      failed: results.steps.filter((s: any) => !s.pass).length,
      isolation_verified: results.overall_pass,
    };

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("test-tenant-isolation error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
