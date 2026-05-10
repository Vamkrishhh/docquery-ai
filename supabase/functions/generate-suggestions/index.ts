import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SuggestionsRequest {
  tenant_id: string;
  last_message?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("Authorization")!;
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) throw new Error("Unauthorized");

    const { tenant_id, last_message }: SuggestionsRequest = await req.json();

    // Verify tenant access
    const { data: profile } = await supabase.from("profiles").select("tenant_id").eq("user_id", user.id).single();
    if (!profile || profile.tenant_id !== tenant_id) throw new Error("Unauthorized tenant access");

    let prompt = "";
    if (last_message) {
      // Goal: 2-3 follow-up questions
      prompt = `You are a helpful AI assistant for a document knowledge base.
Based on the following previous response, generate 2-3 unique, contextual follow-up questions that a user might want to ask next.

RESPONSE:
"${last_message}"

INSTRUCTIONS:
- Return a JSON object with a "suggestions" key containing an array of objects.
- Each object should have:
  - "question": string (concise, max 15 words)
  - "description": string (short preview of what this question explores, max 20 words)
- Keep them specific to the information in the response.
- Example: { "suggestions": [{ "question": "Can you explain the pricing?", "description": "Get a detailed breakdown of costs and tiers." }] }`;
    } else {
      // Goal: 3-4 starting questions based on documents
      const { data: docs } = await supabase
        .from("documents")
        .select("filename, file_type")
        .eq("tenant_id", tenant_id)
        .limit(10);

      if (!docs || docs.length === 0) {
        return new Response(JSON.stringify({ 
          suggestions: [
            { question: "How do I upload my first document?", description: "Learn about the basics of document management." },
            { question: "What types of files are supported?", description: "Check compatibility for PDF, TXT, and DOCX." },
            { question: "Can you summarize a PDF for me?", description: "Try our AI summarization tool on any document." },
            { question: "How does the multi-tenant security work?", description: "Read about our enterprise-grade data isolation." }
          ]
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const docInfo = docs.map(d => `${d.filename} (${d.file_type})`).join(", ");
      prompt = `You are a helpful AI assistant for a document knowledge base.
An organization has uploaded these documents: ${docInfo}

Generate 3-4 unique, interesting questions that a user might want to ask about these documents to explore their content.

INSTRUCTIONS:
- Return a JSON object with a "suggestions" key containing an array of objects.
- Each object should have:
  - "question": string (concise, max 15 words)
  - "description": string (short preview of what this question explores, max 20 words)
- Keep them relevant to the document titles and types provided.
- Example: { "suggestions": [{ "question": "What are the Q3 results?", "description": "Review the financial performance summary from the recent report." }] }`;
    }

    const llmResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      }),
    });

    if (!llmResponse.ok) throw new Error("LLM generation failed");
    const result = await llmResponse.json();
    const content = result.choices[0].message.content;
    
    // Parse carefully if it's not a clean array
    let suggestions = [];
    try {
      const parsed = JSON.parse(content);
      suggestions = Array.isArray(parsed) ? parsed : (parsed.suggestions || []);
    } catch {
      // Fallback: simple split if needed, but the model should return JSON
      suggestions = content.match(/"([^"]+)"/g)?.map((s: string) => s.replace(/"/g, "")) || [];
    }

    return new Response(JSON.stringify({ suggestions: suggestions.slice(0, 4) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Suggestions error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "An unexpected error occurred" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
