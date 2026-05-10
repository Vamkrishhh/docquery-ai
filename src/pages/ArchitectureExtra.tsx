import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Brain, Database as DatabaseIcon, FileText, Globe, Key, Layers, MessageSquare,
  Search, Server, Shield as ShieldIcon, Sparkles, Upload, Zap, Monitor, Activity,
  ArrowDown, ChevronRight,
} from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

/* ── Pipeline step data ─────────────────────────────── */
const pipelineSteps = [
  {
    icon: MessageSquare,
    title: "User Question",
    desc: "A natural-language question entered through the chat interface.",
    accent: "text-primary",
    bg: "bg-primary/10 border-primary/25",
  },
  {
    icon: Globe,
    title: "Frontend (React UI)",
    desc: "React 18 + Vite SPA renders the chat, documents, and dashboard views with real-time streaming support.",
    accent: "text-primary",
    bg: "bg-primary/10 border-primary/25",
  },
  {
    icon: Key,
    title: "Authentication",
    desc: "JWT-based auth verifies identity and attaches tenant context to every request via Lovable Cloud.",
    accent: "text-amber-500",
    bg: "bg-amber-500/10 border-amber-500/25",
  },
  {
    icon: ShieldIcon,
    title: "Multi-Tenant Database + RLS",
    desc: "PostgreSQL with Row-Level Security ensures each tenant can only access their own data. The tenant_id is enforced on every query.",
    accent: "text-green-500",
    bg: "bg-green-500/10 border-green-500/25",
  },
  {
    icon: Server,
    title: "Edge Functions",
    desc: "Deno serverless functions (rag-query, process-document, run-evaluation, stress-test) handle all backend logic at the edge.",
    accent: "text-violet-500",
    bg: "bg-violet-500/10 border-violet-500/25",
  },
  {
    icon: Upload,
    title: "Document Processing Pipeline",
    desc: "Uploaded PDFs, DOCX, and TXT files are extracted, validated for readability, and split into overlapping chunks (~1 400 chars, 120 overlap).",
    accent: "text-blue-500",
    bg: "bg-blue-500/10 border-blue-500/25",
  },
  {
    icon: DatabaseIcon,
    title: "Chunk Storage & Indexing",
    desc: "Document chunks are stored with a tsvector full-text-search column, enabling fast keyword retrieval scoped to the tenant.",
    accent: "text-green-500",
    bg: "bg-green-500/10 border-green-500/25",
  },
  {
    icon: Search,
    title: "Retrieval Engine (FTS)",
    desc: "Full-text search ranks chunks by relevance using ts_rank. A fallback returns the newest chunks when no FTS match is found.",
    accent: "text-blue-500",
    bg: "bg-blue-500/10 border-blue-500/25",
  },
  {
    icon: Layers,
    title: "RAG Prompt Construction",
    desc: "Retrieved chunks are assembled into a structured prompt with citation metadata, instructing the LLM to ground answers in the provided context.",
    accent: "text-violet-500",
    bg: "bg-violet-500/10 border-violet-500/25",
  },
  {
    icon: Sparkles,
    title: "AI Generation via AI Gateway",
    desc: "The prompt is sent to Google Gemini via Lovable's AI Gateway with SSE streaming, delivering tokens to the user in real time.",
    accent: "text-amber-500",
    bg: "bg-amber-500/10 border-amber-500/25",
  },
  {
    icon: FileText,
    title: "Response with Citations",
    desc: "The final answer is delivered with source references ([Source: filename, Chunk N]) and a confidence indicator so users can verify claims.",
    accent: "text-green-500",
    bg: "bg-green-500/10 border-green-500/25",
  },
];

/* ── System components data ─────────────────────────── */
const systemComponents = [
  {
    icon: Globe,
    title: "Frontend",
    tech: "React 18 + Vite + TypeScript + Tailwind CSS",
    details: [
      "Single-page app with client-side routing",
      "Framer Motion animations & dark-mode support",
      "Real-time SSE streaming for chat responses",
      "Responsive sidebar with collapsible navigation",
    ],
  },
  {
    icon: Key,
    title: "Authentication",
    tech: "Lovable Cloud Auth (JWT)",
    details: [
      "Email + password signup & login",
      "JWT session tokens attached to every request",
      "Auto-provisioned profile & tenant on signup",
      "Role-based access control (admin / member)",
    ],
  },
  {
    icon: DatabaseIcon,
    title: "Database",
    tech: "PostgreSQL + Row-Level Security",
    details: [
      "14 tables, each protected by RLS policies",
      "tenant_id foreign key on every row",
      "get_user_tenant_id() + has_role() security-definer helpers",
      "Full-text search via tsvector/tsquery indexes",
    ],
  },
  {
    icon: Server,
    title: "Edge Functions",
    tech: "Deno Serverless",
    details: [
      "process-document — PDF/DOCX/TXT extraction & chunking",
      "rag-query — retrieval + LLM generation + streaming",
      "run-evaluation — automated accuracy benchmarks",
      "stress-test — load testing with latency profiling",
    ],
  },
  {
    icon: Sparkles,
    title: "AI Gateway",
    tech: "Lovable AI Gateway → Google Gemini",
    details: [
      "Proxied through Lovable — no API key required",
      "SSE streaming for token-by-token delivery",
      "LLM-judged scoring for evaluation pipeline",
      "Supports multiple model tiers (Pro / Flash / Lite)",
    ],
  },
  {
    icon: Activity,
    title: "Monitoring & Observability",
    tech: "Built-in Logging + Evaluation Framework",
    details: [
      "query_logs table tracks latency per query stage",
      "system_logs captures events across all edge functions",
      "Evaluation runs measure retrieval accuracy & relevance",
      "Stress-test dashboard visualises p50/p95/max latencies",
    ],
  },
];

const anim = { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 } };

const ArchitectureExtra = () => (
  <div className="h-full overflow-auto">
    <div className="p-4 md:p-6 space-y-8 max-w-5xl mx-auto pb-12">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Brain className="h-6 w-6 text-primary" /> Architecture Overview
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          End-to-end visual walkthrough of the Secure Multi-Tenant RAG Knowledge Platform
        </p>
      </div>

      {/* ── RAG Pipeline Diagram ────────────────────── */}
      <motion.div {...anim}>
        <Card className="border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" /> Full RAG Pipeline
            </CardTitle>
            <CardDescription>
              How a user question flows through every layer and returns a cited answer
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center gap-0 py-2">
              {pipelineSteps.map((step, i) => (
                <React.Fragment key={step.title}>
                  <motion.div
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className={cn(
                      "w-full max-w-lg flex items-start gap-3 rounded-xl border px-4 py-3",
                      step.bg,
                    )}
                  >
                    <step.icon className={cn("h-5 w-5 mt-0.5 shrink-0", step.accent)} />
                    <div>
                      <p className="text-xs font-bold text-foreground leading-tight">
                        {step.title}
                      </p>
                      <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">
                        {step.desc}
                      </p>
                    </div>
                  </motion.div>

                  {i < pipelineSteps.length - 1 && (
                    <ArrowDown className="h-4 w-4 text-muted-foreground my-1 shrink-0" />
                  )}
                </React.Fragment>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* ── System Components ───────────────────────── */}
      <motion.div {...anim} transition={{ delay: 0.15 }}>
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Monitor className="h-4 w-4 text-primary" /> System Components
            </CardTitle>
            <CardDescription>
              Core building blocks of the platform and their responsibilities
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              {systemComponents.map((comp, i) => (
                <motion.div
                  key={comp.title}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 + i * 0.05 }}
                  className="rounded-xl border border-border bg-card p-4 space-y-2"
                >
                  <div className="flex items-center gap-2">
                    <comp.icon className="h-4 w-4 text-primary" />
                    <span className="text-xs font-bold text-foreground">{comp.title}</span>
                  </div>
                  <Badge variant="secondary" className="text-[10px]">{comp.tech}</Badge>
                  <ul className="text-[11px] text-muted-foreground space-y-1 pl-5 list-disc">
                    {comp.details.map((d) => (
                      <li key={d}>{d}</li>
                    ))}
                  </ul>
                </motion.div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  </div>
);

export default ArchitectureExtra;
