import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Extract text from PDF using pdfjs-serverless.
 * Handles compressed (FlateDecode) streams properly.
 */
async function extractTextFromPDF(bytes: Uint8Array): Promise<string> {
  try {
    const { getDocument } = await import("https://esm.sh/pdfjs-serverless@1.1.0");
    
    const doc = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
    const pages: string[] = [];
    
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(" ");
      if (pageText.trim()) pages.push(pageText.trim());
    }
    
    const result = pages.join("\n\n");
    console.log(`[process-document] pdfjs-serverless: ${result.length} chars from ${doc.numPages} pages`);
    return result;
  } catch (e) {
    console.error(`[process-document] pdfjs-serverless failed:`, e);
    // Fallback to basic extraction
    return extractTextBasic(bytes);
  }
}

/**
 * Basic fallback for simple PDFs with uncompressed text.
 */
function extractTextBasic(bytes: Uint8Array): string {
  const WINDOW = 65536;
  const parts: string[] = [];
  let total = 0;
  
  for (let ws = 0; ws < bytes.length && total < 100000; ws += WINDOW) {
    const we = Math.min(ws + WINDOW + 1000, bytes.length);
    const raw = new TextDecoder("latin1").decode(bytes.subarray(ws, we));
    let pos = 0;
    while (pos < raw.length && total < 100000) {
      const bt = raw.indexOf("BT", pos);
      if (bt === -1) break;
      const et = raw.indexOf("ET", bt + 2);
      if (et === -1) break;
      if (et - bt > 10000) { pos = bt + 2; continue; }
      const block = raw.substring(bt + 2, et);
      let tp = 0;
      while (tp < block.length && total < 100000) {
        const op = block.indexOf("(", tp);
        if (op === -1) break;
        let d = 1, cp = op + 1;
        while (cp < block.length && d > 0) {
          if (block[cp] === "(" && block[cp-1] !== "\\") d++;
          else if (block[cp] === ")" && block[cp-1] !== "\\") d--;
          cp++;
        }
        if (d === 0) {
          const t = block.substring(op+1, cp-1)
            .replace(/\\n/g,"\n").replace(/\\r/g," ").replace(/\\t/g," ")
            .replace(/\\\(/g,"(").replace(/\\\)/g,")").replace(/\\\\/g,"\\");
          if (t.trim().length > 0) { parts.push(t); total += t.length; }
        }
        tp = cp;
      }
      pos = et + 2;
    }
  }
  return parts.join(" ").replace(/\s+/g," ").replace(/\u0000/g,"").trim();
}

/**
 * Extract text from DOCX using fflate to decompress the ZIP archive,
 * then parse word/document.xml for <w:t> text nodes.
 */
async function extractTextFromDOCX(bytes: Uint8Array): Promise<string> {
  try {
    const { unzipSync } = await import("https://esm.sh/fflate@0.8.2");
    const unzipped = unzipSync(bytes);

    // Find word/document.xml (the main content file)
    let xmlBytes: Uint8Array | null = null;
    for (const [name, data] of Object.entries(unzipped)) {
      if (name === "word/document.xml") {
        xmlBytes = data as Uint8Array;
        break;
      }
    }

    if (!xmlBytes) {
      console.error("[process-document] DOCX: word/document.xml not found in archive");
      return "";
    }

    const xml = new TextDecoder("utf-8").decode(xmlBytes);
    const texts: string[] = [];
    let pos = 0;

    // Extract text from <w:t> and <w:t xml:space="preserve"> tags
    while (pos < xml.length) {
      const ts = xml.indexOf("<w:t", pos);
      if (ts === -1) break;
      const cs = xml.indexOf(">", ts);
      if (cs === -1) break;
      const ce = xml.indexOf("</w:t>", cs);
      if (ce === -1) break;
      const t = xml.substring(cs + 1, ce);
      if (t.trim()) texts.push(t);
      pos = ce + 6;
    }

    // Also handle paragraph breaks: insert newlines between <w:p> blocks
    const result = texts.join(" ");
    console.log(`[process-document] DOCX extracted: ${result.length} chars`);
    return result;
  } catch (e) {
    console.error("[process-document] DOCX extraction failed:", e);
    return "";
  }
}

function chunkText(text: string, chunkSize = 1400, overlap = 120): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + chunkSize, text.length);
    if (end < text.length) {
      const la = Math.min(end + 200, text.length);
      const seg = text.substring(start, la);
      const lp = seg.lastIndexOf(". ");
      const ln = seg.lastIndexOf("\n");
      const br = Math.max(lp, ln);
      if (br > chunkSize * 0.5) end = start + br + 1;
    }
    const c = text.substring(start, end).trim();
    if (c.length > 15) chunks.push(c);
    const ns = end - overlap;
    start = ns <= start ? end : ns;
    if (start >= text.length) break;
  }
  return chunks;
}

/**
 * Validate extracted text is actually readable (not binary garbage).
 * Checks ratio of printable ASCII characters.
 */
function isReadableText(text: string): boolean {
  if (text.length === 0) return false;
  const sample = text.substring(0, Math.min(2000, text.length));
  let printable = 0;
  for (let i = 0; i < sample.length; i++) {
    const c = sample.charCodeAt(i);
    if ((c >= 32 && c <= 126) || c === 10 || c === 13 || c === 9) printable++;
  }
  const ratio = printable / sample.length;
  // Readable text should be >85% printable ASCII
  return ratio > 0.85;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await supabaseAuth.auth.getUser();
    if (userError || !user) {
      console.error("[process-document] Auth error:", userError?.message);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let body;
    try { body = await req.json(); } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { document_id } = body;
    if (!document_id) {
      return new Response(JSON.stringify({ error: "Missing document_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[process-document] Starting: ${document_id}`);
    const processingStartTime = Date.now();

    // Log processing start
    await supabase.from("system_logs").insert({
      tenant_id: body.tenant_id || "00000000-0000-0000-0000-000000000000",
      source: "process-document",
      log_type: "info",
      message: `Starting document processing: ${document_id}`,
      metadata: { document_id },
    });

    const { data: doc, error: docError } = await supabase
      .from("documents").select("*").eq("id", document_id).single();

    if (docError || !doc) {
      return new Response(JSON.stringify({ error: "Document not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[process-document] Doc: ${doc.filename} (${doc.file_type}, ${doc.file_size} bytes)`);
    await supabase.from("documents").update({ status: "processing" }).eq("id", document_id);

    const { data: fileData, error: dlError } = await supabase.storage.from("documents").download(doc.file_path);
    if (dlError || !fileData) {
      await supabase.from("documents").update({ status: "error" }).eq("id", document_id);
      return new Response(JSON.stringify({ error: "Download failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[process-document] Downloaded: ${fileData.size} bytes`);

    let text = "";
    try {
      if (doc.file_type === "txt") {
        text = await fileData.text();
      } else if (doc.file_type === "pdf") {
        const buffer = await fileData.arrayBuffer();
        text = await extractTextFromPDF(new Uint8Array(buffer));
      } else if (doc.file_type === "docx") {
        const buffer = await fileData.arrayBuffer();
        text = await extractTextFromDOCX(new Uint8Array(buffer));
      } else {
        text = await fileData.text();
      }
      console.log(`[process-document] Raw extracted: ${text.length} chars`);
    } catch (parseError) {
      console.error(`[process-document] Parse error:`, parseError);
      await supabase.from("documents").update({ status: "error" }).eq("id", document_id);
      return new Response(JSON.stringify({
        error: "Parse failed: " + (parseError instanceof Error ? parseError.message : "unknown"),
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    text = text.replace(/\u0000/g, "").trim();

    // Validate the extracted text is actually readable
    if (!isReadableText(text)) {
      console.error(`[process-document] Extracted text is not readable (binary/garbage). Length: ${text.length}`);
      await supabase.from("documents").update({ status: "error", chunk_count: 0 }).eq("id", document_id);
      return new Response(JSON.stringify({
        error: `Could not extract readable text from ${doc.file_type.toUpperCase()} file. The file may be scanned/image-based or use unsupported encoding.`,
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!text || text.length < 10) {
      await supabase.from("documents").update({ status: "error", chunk_count: 0 }).eq("id", document_id);
      return new Response(JSON.stringify({
        error: `Insufficient text extracted: ${text.length} chars.`,
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log(`[process-document] Validated readable text: ${text.length} chars`);

    const chunks = chunkText(text, 1400, 120);
    console.log(`[process-document] ${chunks.length} chunks`);

    if (chunks.length === 0) {
      await supabase.from("documents").update({ status: "error", chunk_count: 0 }).eq("id", document_id);
      return new Response(JSON.stringify({ error: "Chunking produced no results." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Clean up existing chunks
    await supabase.from("document_chunks").delete().eq("document_id", document_id);

    // Generate embeddings in batches
    console.log(`[process-document] Generating embeddings for ${chunks.length} chunks...`);
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;
    
    const batchSize = 20;
    let totalInserted = 0;
    for (let i = 0; i < chunks.length; i += batchSize) {
      const currentBatch = chunks.slice(i, i + batchSize);
      
      let embeddings: number[][] = [];
      try {
        // Use Gemini-3 Embedding API via Lovable Gateway
        const embResp = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${lovableApiKey}`
          },
          body: JSON.stringify({
            model: "google/text-embedding-004",
            input: currentBatch
          })
        });

        if (!embResp.ok) {
          const err = await embResp.text();
          console.error(`[process-document] Embedding error:`, embResp.status, err);
          // Fallback to null embeddings if API fails
          embeddings = new Array(currentBatch.length).fill(null);
        } else {
          const embData = await embResp.json();
          embeddings = embData.data.map((d: any) => d.embedding);
        }
      } catch (e) {
        console.error(`[process-document] Embedding fetch failed:`, e);
        embeddings = new Array(currentBatch.length).fill(null);
      }

      const insertBatch = currentBatch.map((ct, idx) => ({
        document_id: doc.id,
        tenant_id: doc.tenant_id,
        chunk_text: ct,
        chunk_index: i + idx,
        embedding: embeddings[idx] // Store as vector
      }));

      const { error: insertError } = await supabase.from("document_chunks").insert(insertBatch);
      if (insertError) {
        console.error(`[process-document] Insert error batch ${i}:`, insertError);
        await supabase.from("documents").update({ status: "error", chunk_count: totalInserted }).eq("id", document_id);
        return new Response(JSON.stringify({ error: "Chunk insert failed: " + insertError.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      totalInserted += insertBatch.length;
    }

    if (totalInserted > 0) {
      const processingTimeMs = Date.now() - processingStartTime;
      
      // AI Intelligence: Auto-Tagging & Categorization
      let tags: string[] = [];
      let category: string = "Uncategorized";
      
      try {
        const intelResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${lovableApiKey}`
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              { role: "system", content: "You are a document classifier. Extract 3-5 keywords as tags and exactly one category (e.g., Technical, Legal, Financial, Medical, Research, Administrative, Other). Format your response as a JSON object: { \"tags\": [\"tag1\", \"tag2\"], \"category\": \"CategoryName\" }." },
              { role: "user", content: `Classify this document content sample:\n\n${text.substring(0, 2000)}` }
            ],
            response_format: { type: "json_object" }
          })
        });
        
        if (intelResp.ok) {
           const intelData = await intelResp.json();
           const parsed = JSON.parse(intelData.choices[0].message.content);
           tags = parsed.tags || [];
           category = parsed.category || "Uncategorized";
           console.log(`[process-document] Intelligence Extracted: ${category}, Tags: ${tags.join(", ")}`);
        }
      } catch (e) {
        console.warn("[process-document] Intelligence extraction failed:", e);
      }

      await supabase.from("documents").update({ 
        status: "ready", 
        chunk_count: totalInserted,
        extracted_text_length: text.length,
        processing_time_ms: processingTimeMs,
        tags,
        category
      }).eq("id", document_id);
      
      console.log(`[process-document] ✅ ${doc.filename} → ${totalInserted} chunks, ${category}, ${tags.length} tags`);
      await supabase.from("system_logs").insert({
        tenant_id: doc.tenant_id,
        source: "process-document",
        log_type: "info",
        message: `Document processed: ${doc.filename} → ${totalInserted} chunks, ${text.length} chars`,
        metadata: { document_id, filename: doc.filename, file_type: doc.file_type, file_size: doc.file_size, text_length: text.length, chunk_count: totalInserted },
      });
    } else {
      await supabase.from("documents").update({ status: "error", chunk_count: 0 }).eq("id", document_id);
      await supabase.from("system_logs").insert({
        tenant_id: doc.tenant_id,
        source: "process-document",
        log_type: "error",
        message: `Document processing failed: ${doc.filename} - no chunks produced`,
        metadata: { document_id, filename: doc.filename },
      });
    }

    return new Response(
      JSON.stringify({ success: true, chunks: totalInserted, text_length: text.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[process-document] Unhandled error:", e);
    // Try to log the error
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const sb = createClient(supabaseUrl, supabaseServiceKey);
      await sb.from("system_logs").insert({
        tenant_id: "00000000-0000-0000-0000-000000000000",
        source: "process-document",
        log_type: "error",
        message: `Unhandled error: ${e instanceof Error ? e.message : "Unknown"}`,
      });
    } catch {}
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
