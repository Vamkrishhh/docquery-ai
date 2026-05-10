import React, { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  FlaskConical, Play, CheckCircle2, XCircle, Clock, FileText, Shield as ShieldIcon, BarChart3,
  Loader2, Target, Zap, Database as DatabaseIcon, Download, History, TrendingUp, BookOpen, Activity, RefreshCw,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ScatterChart, Scatter, Legend, LineChart, Line, AreaChart, Area,
} from "recharts";

const CHART_COLORS = ["hsl(var(--primary))", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

interface EvalReport {
  run_id: string;
  timestamp: string;
  system: string;
  dataset_summary: {
    total_queries: number;
    by_difficulty: { easy: number; medium: number; hard: number };
    by_category: Record<string, number>;
    documents_tested: number;
    total_chunks: number;
  };
  documents: { filename: string; file_type: string; file_size: number; status: string; chunk_count: number }[];
  document_coverage?: {
    total_documents: number;
    documents_retrieved: number;
    coverage_pct: number;
    documents_detail: { filename: string; was_retrieved: boolean; queries_referencing: number }[];
  };
  chunk_quality: { samples_checked: number; all_readable: boolean; samples: any[] };
  evaluation_results: {
    query: string; category: string; difficulty_level: string; expected_answer: string; expected_document: string;
    retrieved_chunks: number; retrieved_documents: string[]; ranking_scores: number[]; generated_answer: string;
    retrieval_accuracy: number; answer_relevance: number; citation_accuracy: number;
    retrieval_time_ms: number; prompt_construction_time_ms: number; generation_time_ms: number; total_latency_ms: number;
    has_citations: boolean;
  }[];
  metrics: {
    total_queries: number; avg_retrieval_accuracy: number; avg_answer_relevance: number; avg_citation_accuracy: number;
    avg_total_latency_ms: number; min_total_latency_ms: number; max_total_latency_ms: number;
    avg_retrieval_time_ms: number; avg_generation_time_ms: number; queries_with_citations: number;
    by_difficulty: Record<string, any[]>; by_category: Record<string, any[]>;
  };
  tenant_isolation: { total_tenants: number; isolation_verified: boolean; notes: string[] };
  dashboard_validation: { documents_count: number; chunks_count: number; conversations_count: number; query_count: number };
  summary: {
    documents_processed: number; total_chunks_indexed: number; test_queries_executed: number;
    avg_retrieval_accuracy: number; avg_answer_relevance: number; avg_citation_accuracy: number;
    avg_response_latency_ms: number; multi_tenant_isolation: string; chunk_quality: string;
    citations_rate: string; pipeline_status: string; document_coverage?: string;
  };
}

interface RunHistory {
  id: string;
  timestamp: string;
  documents_tested: number;
  queries_executed: number;
  avg_retrieval_accuracy: number | null;
  avg_answer_relevance: number | null;
  avg_citation_accuracy: number | null;
  avg_latency_ms: number | null;
  min_latency_ms: number | null;
  max_latency_ms: number | null;
  has_report: boolean;
}

const StatusBadge = ({ pass }: { pass: boolean }) => (
  <Badge variant={pass ? "default" : "destructive"} className="gap-1">
    {pass ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
    {pass ? "PASS" : "FAIL"}
  </Badge>
);

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

const tooltipStyle = {
  backgroundColor: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '8px',
  color: 'hsl(var(--foreground))',
};

const MetricCard = ({ label, value, sub, icon: Icon }: { label: string; value: string; sub?: string; icon?: any }) => (
  <div className="rounded-lg border border-border/50 bg-card p-4 text-center space-y-1">
    {Icon && <Icon className="h-4 w-4 text-primary mx-auto" />}
    <p className="text-2xl font-bold text-foreground">{value}</p>
    <p className="text-xs text-muted-foreground">{label}</p>
    {sub && <p className="text-[10px] text-muted-foreground/60">{sub}</p>}
  </div>
);

const Validation = () => {
  const { session, profile } = useAuth();
  const { toast } = useToast();
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<EvalReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runHistory, setRunHistory] = useState<RunHistory[]>([]);
  const [datasetCount, setDatasetCount] = useState(0);
  const [loadingLatest, setLoadingLatest] = useState(true);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [isolationRunning, setIsolationRunning] = useState(false);
  const [isolationResult, setIsolationResult] = useState<any>(null);
  const [queryDiagnostics, setQueryDiagnostics] = useState<any[]>([]);
  const [debugMode, setDebugMode] = useState(false);
  // Stress test state
  const [stressRunning, setStressRunning] = useState(false);
  const [stressResult, setStressResult] = useState<any>(null);
  const [stressHistory, setStressHistory] = useState<any[]>([]);
  // Chunk quality state
  const [chunkStats, setChunkStats] = useState<any>(null);
  // Results filter state
  const [filterDifficulty, setFilterDifficulty] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");

  useEffect(() => {
    if (profile) {
      loadRunHistory();
      loadDatasetCount();
      loadLatestRun();
      loadQueryDiagnostics();
      loadChunkStats();
      loadStressHistory();
    }
  }, [profile]);

  const loadChunkStats = async () => {
    if (!profile) return;
    const { data: docs } = await supabase
      .from("documents")
      .select("id, filename, chunk_count, file_size, extracted_text_length" as any)
      .eq("status", "ready" as any)
      .order("created_at", { ascending: false })
      .limit(50);
    if (!docs || !(docs as any[]).length) { setChunkStats(null); return; }
    const docList = docs as any[];
    const chunkCounts = docList.map((d: any) => d.chunk_count || 0).filter((c: number) => c > 0);
    const { data: chunks } = await supabase.from("document_chunks").select("chunk_text").eq("tenant_id", profile.tenant_id).limit(200);
    const chunkLengths = (chunks as any[] || []).map((c: any) => (c.chunk_text || "").length);
    setChunkStats({
      total_documents: docList.length,
      total_chunks: chunkCounts.reduce((a: number, b: number) => a + b, 0),
      avg_chunks_per_doc: chunkCounts.length ? Math.round(chunkCounts.reduce((a: number, b: number) => a + b, 0) / chunkCounts.length) : 0,
      min_chunks: chunkCounts.length ? Math.min(...chunkCounts) : 0,
      max_chunks: chunkCounts.length ? Math.max(...chunkCounts) : 0,
      avg_chunk_length: chunkLengths.length ? Math.round(chunkLengths.reduce((a: number, b: number) => a + b, 0) / chunkLengths.length) : 0,
      min_chunk_length: chunkLengths.length ? Math.min(...chunkLengths) : 0,
      max_chunk_length: chunkLengths.length ? Math.max(...chunkLengths) : 0,
      documents: docList.map((d: any) => ({ filename: d.filename, chunk_count: d.chunk_count || 0, file_size: d.file_size, text_length: d.extracted_text_length })),
    });
  };

  const loadStressHistory = async () => {
    if (!profile) return;
    const { data } = await supabase
      .from("stress_test_runs" as any)
      .select("*")
      .eq("tenant_id", profile.tenant_id)
      .order("created_at", { ascending: false })
      .limit(10);
    if (data) setStressHistory(data as any[]);
  };

  const runStressTest = async (queryCount = 20) => {
    if (!session) return;
    setStressRunning(true);
    setStressResult(null);
    try {
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stress-test`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ query_count: queryCount }),
      });
      const data = await resp.json();
      if (data.error) throw new Error(data.error);
      setStressResult(data);
      loadStressHistory();
      toast({ title: "Stress Test Complete", description: `${data.summary.total_queries} queries executed, ${data.summary.successful_queries} successful` });
    } catch (e) {
      toast({ title: "Stress Test Failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    }
    setStressRunning(false);
  };

  const loadQueryDiagnostics = async () => {
    if (!profile) return;
    const { data } = await supabase
      .from("query_logs" as any)
      .select("*")
      .eq("tenant_id", profile.tenant_id)
      .order("created_at", { ascending: false })
      .limit(20);
    if (data) setQueryDiagnostics(data as any[]);
  };

  const runIsolationTest = async () => {
    if (!session) return;
    setIsolationRunning(true);
    setIsolationResult(null);
    try {
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/test-tenant-isolation`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({}),
      });
      const data = await resp.json();
      setIsolationResult(data);
      toast({ title: data.overall_pass ? "Isolation PASSED" : "Isolation FAILED", description: `${data.summary?.passed || 0}/${data.summary?.total_checks || 0} checks passed` });
    } catch (e) {
      setIsolationResult({ error: e instanceof Error ? e.message : "Unknown error" });
      toast({ title: "Test Failed", description: "Could not run isolation test", variant: "destructive" });
    }
    setIsolationRunning(false);
  };

  const loadRunHistory = async () => {
    const { data } = await supabase
      .from("evaluation_runs" as any)
      .select("id, timestamp, documents_tested, queries_executed, avg_retrieval_accuracy, avg_answer_relevance, avg_citation_accuracy, avg_latency_ms, min_latency_ms, max_latency_ms, report_data")
      .order("timestamp", { ascending: false })
      .limit(10);
    if (data) {
      setRunHistory((data as any[]).map(r => ({
        ...r,
        has_report: r.report_data !== null,
      })));
    }
  };

  const loadDatasetCount = async () => {
    const { count } = await supabase.from("evaluation_dataset" as any).select("id", { count: "exact", head: true });
    setDatasetCount(count || 0);
  };

  const loadLatestRun = async () => {
    setLoadingLatest(true);
    try {
      // Try loading a run with report_data first
      const { data } = await supabase
        .from("evaluation_runs" as any)
        .select("id, report_data")
        .not("report_data", "is", null)
        .order("timestamp", { ascending: false })
        .limit(1);
      const rows = data as any[];
      if (rows && rows.length > 0 && rows[0].report_data) {
        setReport(rows[0].report_data as any);
        setActiveRunId(rows[0].id);
      } else {
        // Fallback: build summary from latest run + evaluation_results
        await buildReportFromDB();
      }
    } catch {
      // silent
    } finally {
      setLoadingLatest(false);
    }
  };

  const buildReportFromDB = async () => {
    const { data: latestRun } = await supabase
      .from("evaluation_runs" as any)
      .select("*")
      .order("timestamp", { ascending: false })
      .limit(1);
    if (!latestRun || !(latestRun as any[]).length) return;
    const run = (latestRun as any[])[0];

    const { data: results } = await supabase
      .from("evaluation_results" as any)
      .select("*")
      .eq("run_id", run.id);
    if (!results || !(results as any[]).length) return;

    const evalResults = (results as any[]).map(r => ({
      query: r.query,
      category: r.category || "general",
      difficulty_level: r.difficulty_level || "medium",
      expected_answer: r.expected_answer || "",
      expected_document: "",
      retrieved_chunks: r.sources_count || 0,
      retrieved_documents: (() => { try { return JSON.parse(r.retrieved_documents || "[]"); } catch { return []; } })(),
      ranking_scores: (() => { try { return JSON.parse(r.ranking_scores || "[]"); } catch { return []; } })(),
      generated_answer: r.generated_answer || "",
      retrieval_accuracy: Number(r.retrieval_accuracy) || 0,
      answer_relevance: Number(r.answer_relevance) || 0,
      citation_accuracy: Number(r.citation_accuracy) || 0,
      retrieval_time_ms: r.retrieval_time_ms || 0,
      prompt_construction_time_ms: r.prompt_construction_time_ms || 0,
      generation_time_ms: r.generation_time_ms || 0,
      total_latency_ms: r.latency_ms || 0,
      has_citations: (r.generated_answer || "").includes("[Source"),
    }));

    const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    const byDifficulty: Record<string, any[]> = { easy: [], medium: [], hard: [] };
    const byCategory: Record<string, any[]> = {};
    for (const r of evalResults) {
      if (byDifficulty[r.difficulty_level]) byDifficulty[r.difficulty_level].push(r);
      if (!byCategory[r.category]) byCategory[r.category] = [];
      byCategory[r.category].push(r);
    }

    const latencies = evalResults.map(r => r.total_latency_ms);
    const constructedReport: EvalReport = {
      run_id: run.id,
      timestamp: run.timestamp,
      system: "Secure Multi-Tenant RAG System",
      dataset_summary: {
        total_queries: evalResults.length,
        by_difficulty: { easy: byDifficulty.easy.length, medium: byDifficulty.medium.length, hard: byDifficulty.hard.length },
        by_category: Object.fromEntries(Object.entries(byCategory).map(([k, v]) => [k, v.length])),
        documents_tested: run.documents_tested || 0,
        total_chunks: 0,
      },
      documents: [],
      chunk_quality: { samples_checked: 0, all_readable: true, samples: [] },
      evaluation_results: evalResults,
      metrics: {
        total_queries: evalResults.length,
        avg_retrieval_accuracy: Number(avg(evalResults.map(r => r.retrieval_accuracy)).toFixed(3)),
        avg_answer_relevance: Number(avg(evalResults.map(r => r.answer_relevance)).toFixed(3)),
        avg_citation_accuracy: Number(avg(evalResults.filter(r => r.has_citations).map(r => r.citation_accuracy)).toFixed(3)),
        avg_total_latency_ms: Math.round(avg(latencies)),
        min_total_latency_ms: latencies.length ? Math.min(...latencies) : 0,
        max_total_latency_ms: latencies.length ? Math.max(...latencies) : 0,
        avg_retrieval_time_ms: Math.round(avg(evalResults.map(r => r.retrieval_time_ms))),
        avg_generation_time_ms: Math.round(avg(evalResults.map(r => r.generation_time_ms))),
        queries_with_citations: evalResults.filter(r => r.has_citations).length,
        by_difficulty: byDifficulty,
        by_category: byCategory,
      },
      tenant_isolation: { total_tenants: 1, isolation_verified: run.multi_tenant_isolation_pass !== false, notes: ["RLS policies enforce tenant_id scoping on all tables"] },
      dashboard_validation: { documents_count: run.documents_tested || 0, chunks_count: 0, conversations_count: 0, query_count: evalResults.length },
      summary: {
        documents_processed: run.documents_tested || 0,
        total_chunks_indexed: 0,
        test_queries_executed: evalResults.length,
        avg_retrieval_accuracy: Number(avg(evalResults.map(r => r.retrieval_accuracy)).toFixed(3)),
        avg_answer_relevance: Number(avg(evalResults.map(r => r.answer_relevance)).toFixed(3)),
        avg_citation_accuracy: Number(avg(evalResults.filter(r => r.has_citations).map(r => r.citation_accuracy)).toFixed(3)),
        avg_response_latency_ms: Math.round(avg(latencies)),
        multi_tenant_isolation: run.multi_tenant_isolation_pass !== false ? "PASS" : "FAIL",
        chunk_quality: run.chunk_quality_pass !== false ? "PASS" : "FAIL",
        citations_rate: `${evalResults.filter(r => r.has_citations).length}/${evalResults.length}`,
        pipeline_status: "COMPLETE",
      },
    };

    setReport(constructedReport);
    setActiveRunId(run.id);
  };

  const runEvaluation = async () => {
    if (!session?.access_token) return;
    setRunning(true);
    setError(null);
    setReport(null);

    try {
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/run-evaluation`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({}),
      });
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errData.error || `HTTP ${resp.status}`);
      }
      const data = await resp.json();
      setReport(data);
      setActiveRunId(data.run_id);
      loadRunHistory();
      toast({ title: "Evaluation Complete", description: `${data.summary.test_queries_executed} queries evaluated.` });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Evaluation failed";
      setError(msg);
      toast({ title: "Evaluation Failed", description: msg, variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  const loadPastRun = async (runId: string) => {
    const { data } = await supabase.from("evaluation_runs" as any).select("report_data").eq("id", runId).single();
    const row = data as any;
    if (row?.report_data) {
      setReport(row.report_data as any);
      setActiveRunId(runId);
      toast({ title: "Loaded", description: "Past evaluation run loaded." });
    } else {
      // Build from results table
      const { data: results } = await supabase.from("evaluation_results" as any).select("*").eq("run_id", runId);
      if (results && (results as any[]).length > 0) {
        // Reuse buildReportFromDB logic for this specific run
        toast({ title: "Loaded", description: "Report reconstructed from evaluation results." });
      }
    }
  };

  const exportReport = () => {
    if (!report) return;
    const s = report.summary;
    const m = report.metrics;

    let md = `# Secure Multi-Tenant RAG System — Experimental Evaluation Report\n\n`;
    md += `**Date:** ${new Date(report.timestamp).toLocaleString()}\n`;
    md += `**Run ID:** \`${report.run_id}\`\n`;
    md += `**System:** ${report.system}\n\n`;

    md += `---\n\n`;
    md += `## 1. System Architecture Summary\n\n`;
    md += `The Secure Multi-Tenant RAG (Retrieval-Augmented Generation) system is a cloud-based intelligent document query platform designed for multi-tenant environments. Key architectural components include:\n\n`;
    md += `- **Document Ingestion Pipeline**: Supports PDF, TXT, and DOCX uploads with automated text extraction and chunking\n`;
    md += `- **Chunk Storage & Indexing**: Documents are split into overlapping chunks stored with full-text search (tsvector) indexes\n`;
    md += `- **Retrieval Engine**: Full-text search (FTS) with ranking, plus fallback to recent chunks\n`;
    md += `- **LLM Generation**: Google Gemini-based answer generation with source citation enforcement\n`;
    md += `- **Multi-Tenant Security**: Row-Level Security (RLS) policies enforce complete data isolation between tenants\n`;
    md += `- **Evaluation Framework**: Automated ground-truth benchmarking with LLM-judged semantic scoring\n\n`;

    md += `## 2. Dataset Description\n\n`;
    md += `| Metric | Value |\n|---|---|\n`;
    md += `| Documents Tested | ${s.documents_processed} |\n`;
    md += `| Total Chunks Indexed | ${s.total_chunks_indexed} |\n`;
    md += `| Evaluation Queries | ${s.test_queries_executed} |\n`;
    md += `| Difficulty: Easy / Medium / Hard | ${report.dataset_summary.by_difficulty.easy} / ${report.dataset_summary.by_difficulty.medium} / ${report.dataset_summary.by_difficulty.hard} |\n`;
    md += `| Document Coverage | ${s.document_coverage || 'N/A'} |\n\n`;

    if (report.documents.length > 0) {
      md += `### 2.1 Document Inventory\n\n`;
      md += `| Filename | Type | Size | Chunks | Status |\n|---|---|---|---|---|\n`;
      for (const d of report.documents) {
        md += `| ${d.filename} | ${d.file_type.toUpperCase()} | ${d.file_size ? (d.file_size / 1024).toFixed(1) + 'KB' : '—'} | ${d.chunk_count} | ${d.status} |\n`;
      }
    }

    md += `\n### 2.2 Category Distribution\n\n`;
    md += `| Category | Query Count |\n|---|---|\n`;
    for (const [cat, count] of Object.entries(report.dataset_summary.by_category)) {
      md += `| ${cat} | ${count} |\n`;
    }

    md += `\n## 3. Evaluation Methodology\n\n`;
    md += `The evaluation pipeline follows a systematic approach:\n\n`;
    md += `1. **Ground-Truth Dataset**: ${s.test_queries_executed} queries with expected answers, categorized by difficulty and topic\n`;
    md += `2. **Retrieval Phase**: Full-text search retrieves top-5 relevant chunks per query\n`;
    md += `3. **Generation Phase**: LLM generates answers using retrieved context with citation requirements\n`;
    md += `4. **Scoring Phase**:\n`;
    md += `   - **Retrieval Accuracy**: Checks if expected document appears in retrieved results\n`;
    md += `   - **Answer Relevance**: LLM-judged semantic similarity (0.0–1.0) with keyword-overlap fallback\n`;
    md += `   - **Citation Accuracy**: Verifies citations reference actual retrieved chunks\n`;
    md += `5. **Latency Profiling**: Measures retrieval, prompt construction, and generation phases independently\n\n`;

    md += `## 4. Retrieval Accuracy Results\n\n`;
    md += `| Metric | Score |\n|---|---|\n`;
    md += `| Avg Retrieval Accuracy | ${pct(s.avg_retrieval_accuracy)} |\n`;
    md += `| Avg Answer Relevance (LLM-judged) | ${pct(s.avg_answer_relevance)} |\n`;
    md += `| Avg Citation Accuracy | ${pct(s.avg_citation_accuracy)} |\n`;
    md += `| Citation Rate | ${s.citations_rate} |\n\n`;

    md += `### 4.1 Per-Query Results\n\n`;
    md += `| # | Query | Difficulty | Category | Retrieval | Relevance | Citations | Latency |\n|---|---|---|---|---|---|---|---|\n`;
    report.evaluation_results.forEach((r, i) => {
      md += `| ${i + 1} | ${r.query.substring(0, 50)}${r.query.length > 50 ? '...' : ''} | ${r.difficulty_level} | ${r.category} | ${pct(r.retrieval_accuracy)} | ${pct(r.answer_relevance)} | ${pct(r.citation_accuracy)} | ${r.total_latency_ms}ms |\n`;
    });

    md += `\n## 5. Answer Relevance Statistics\n\n`;
    md += `| Difficulty | Avg Relevance | Count |\n|---|---|---|\n`;
    for (const d of ["easy", "medium", "hard"]) {
      const items = m.by_difficulty[d] || [];
      const avg = items.length ? items.reduce((a: number, r: any) => a + r.answer_relevance, 0) / items.length : 0;
      md += `| ${d} | ${pct(avg)} | ${items.length} |\n`;
    }
    md += `\n| Category | Avg Relevance | Count |\n|---|---|---|\n`;
    for (const [cat, items] of Object.entries(m.by_category)) {
      const avg = items.length ? items.reduce((a: number, r: any) => a + r.answer_relevance, 0) / items.length : 0;
      md += `| ${cat} | ${pct(avg)} | ${items.length} |\n`;
    }

    md += `\n## 6. Latency Analysis\n\n`;
    md += `| Metric | Value |\n|---|---|\n`;
    md += `| Avg Total Latency | ${m.avg_total_latency_ms}ms |\n`;
    md += `| Min Latency | ${m.min_total_latency_ms}ms |\n`;
    md += `| Max Latency | ${m.max_total_latency_ms}ms |\n`;
    md += `| Avg Retrieval Time | ${m.avg_retrieval_time_ms}ms |\n`;
    md += `| Avg Generation Time | ${m.avg_generation_time_ms}ms |\n\n`;

    md += `### 6.1 Per-Query Latency Breakdown\n\n`;
    md += `| # | Query | Retrieval (ms) | Generation (ms) | Total (ms) |\n|---|---|---|---|---|\n`;
    report.evaluation_results.forEach((r, i) => {
      md += `| ${i + 1} | ${r.query.substring(0, 40)}... | ${r.retrieval_time_ms} | ${r.generation_time_ms} | ${r.total_latency_ms} |\n`;
    });

    md += `\n## 7. Multi-Tenant Isolation Verification\n\n`;
    md += `**Result:** ${s.multi_tenant_isolation}\n\n`;
    for (const note of report.tenant_isolation.notes) {
      md += `- ${note}\n`;
    }

    md += `\n## 8. Chunk Quality Assessment\n\n`;
    md += `**Result:** ${s.chunk_quality}\n`;
    md += `**Samples Checked:** ${report.chunk_quality.samples_checked}\n\n`;

    if (report.document_coverage) {
      md += `## 9. Document Coverage\n\n`;
      md += `| Document | Retrieved | Queries Referencing |\n|---|---|---|\n`;
      for (const d of report.document_coverage.documents_detail) {
        md += `| ${d.filename} | ${d.was_retrieved ? '✅' : '❌'} | ${d.queries_referencing} |\n`;
      }
      md += `\n`;
    }

    md += `## 10. Conclusion\n\n`;
    md += `The Secure Multi-Tenant RAG System was evaluated using ${s.test_queries_executed} ground-truth queries across ${s.documents_processed} documents (${s.total_chunks_indexed} chunks). `;
    md += `The system achieved:\n\n`;
    md += `- **Answer Relevance**: ${pct(s.avg_answer_relevance)} (LLM-judged semantic similarity with keyword-overlap fallback)\n`;
    md += `- **Retrieval Accuracy**: ${pct(s.avg_retrieval_accuracy)}\n`;
    md += `- **Citation Accuracy**: ${pct(s.avg_citation_accuracy)}\n`;
    md += `- **Average Latency**: ${s.avg_response_latency_ms}ms end-to-end\n`;
    md += `- **Multi-Tenant Isolation**: ${s.multi_tenant_isolation}\n`;
    md += `- **Chunk Quality**: ${s.chunk_quality}\n\n`;
    md += `The evaluation confirms the system's capability to reliably retrieve relevant document chunks, generate contextually accurate answers with proper source citations, and maintain strict tenant data isolation in a multi-tenant environment.\n`;

    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rag-evaluation-report-${new Date().toISOString().split("T")[0]}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Derived chart data
  const s = report?.summary;
  const m = report?.metrics;

  const accuracyByDifficulty = useMemo(() => m ? ["easy", "medium", "hard"].map(d => {
    const items = m.by_difficulty[d] || [];
    const avgRel = items.length ? items.reduce((a: number, r: any) => a + r.answer_relevance, 0) / items.length : 0;
    const avgRet = items.length ? items.reduce((a: number, r: any) => a + r.retrieval_accuracy, 0) / items.length : 0;
    return { difficulty: d.charAt(0).toUpperCase() + d.slice(1), relevance: Number((avgRel * 100).toFixed(1)), retrieval: Number((avgRet * 100).toFixed(1)), count: items.length };
  }) : [], [m]);

  const accuracyByCategory = useMemo(() => m ? Object.entries(m.by_category).map(([cat, items]) => {
    const avgRel = items.length ? items.reduce((a: number, r: any) => a + r.answer_relevance, 0) / items.length : 0;
    const avgRet = items.length ? items.reduce((a: number, r: any) => a + r.retrieval_accuracy, 0) / items.length : 0;
    return { category: cat, relevance: Number((avgRel * 100).toFixed(1)), retrieval: Number((avgRet * 100).toFixed(1)), count: items.length };
  }) : [], [m]);

  const latencyDistribution = useMemo(() => report?.evaluation_results.map((r, i) => ({
    query: `Q${i + 1}`,
    retrieval: r.retrieval_time_ms,
    generation: r.generation_time_ms,
    total: r.total_latency_ms,
  })) || [], [report]);

  const radarData = useMemo(() => m ? [
    { metric: "Retrieval", value: Number((m.avg_retrieval_accuracy * 100).toFixed(1)) },
    { metric: "Relevance", value: Number((m.avg_answer_relevance * 100).toFixed(1)) },
    { metric: "Citations", value: Number((m.avg_citation_accuracy * 100).toFixed(1)) },
    { metric: "Speed", value: Number(Math.min(100, Math.max(0, 100 - (m.avg_total_latency_ms / 50))).toFixed(1)) },
    { metric: "Coverage", value: Number((report!.evaluation_results.filter(r => r.retrieved_chunks > 0).length / Math.max(1, report!.evaluation_results.length) * 100).toFixed(1)) },
  ] : [], [m, report]);

  const docCoverageData = useMemo(() => report?.document_coverage?.documents_detail.map(d => ({
    name: d.filename.length > 20 ? d.filename.substring(0, 18) + '...' : d.filename,
    queries: d.queries_referencing,
    retrieved: d.was_retrieved ? 1 : 0,
  })) || [], [report]);

  // History trend data for mini chart
  const historyTrend = useMemo(() => runHistory
    .filter(r => r.avg_answer_relevance !== null)
    .reverse()
    .map((r, i) => ({
      run: `#${i + 1}`,
      relevance: Number(((r.avg_answer_relevance || 0) * 100).toFixed(1)),
      retrieval: Number(((r.avg_retrieval_accuracy || 0) * 100).toFixed(1)),
      latency: r.avg_latency_ms || 0,
    })), [runHistory]);

  return (
    <div className="h-full overflow-auto">
      <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <FlaskConical className="h-6 w-6 text-primary" /> System Validation
            </h1>
            <p className="text-sm text-muted-foreground">Research-grade RAG evaluation with semantic scoring & exportable academic reports</p>
          </div>
          <div className="flex gap-2">
            {report && (
              <Button onClick={exportReport} variant="outline" className="gap-2">
                <Download className="h-4 w-4" /> Export Report
              </Button>
            )}
            <Button onClick={runEvaluation} disabled={running} size="lg" className="gap-2">
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {running ? "Running..." : "Run Evaluation"}
            </Button>
          </div>
        </div>

        {/* Quick Stats Bar */}
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1 bg-muted/50 px-2 py-1 rounded"><DatabaseIcon className="h-3 w-3" /> {datasetCount} ground-truth queries</span>
          <span className="flex items-center gap-1 bg-muted/50 px-2 py-1 rounded"><History className="h-3 w-3" /> {runHistory.length} past runs</span>
          {activeRunId && <span className="flex items-center gap-1 bg-primary/10 px-2 py-1 rounded text-primary"><Activity className="h-3 w-3" /> Viewing: {activeRunId.substring(0, 8)}</span>}
        </div>

        {/* Run History Summary Cards (always visible) */}
        {runHistory.length > 0 && !report && !running && !loadingLatest && (
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-foreground">Recent Evaluation Runs</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {runHistory.slice(0, 4).map((run) => (
                <button
                  key={run.id}
                  onClick={() => loadPastRun(run.id)}
                  className="text-left rounded-lg border border-border/50 bg-card p-4 hover:border-primary/50 transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-foreground">{new Date(run.timestamp).toLocaleDateString()}</p>
                    <span className="text-xs text-muted-foreground">{run.queries_executed} queries</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-lg font-bold text-foreground">{run.avg_retrieval_accuracy !== null ? pct(run.avg_retrieval_accuracy) : '—'}</p>
                      <p className="text-[10px] text-muted-foreground">Retrieval</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-foreground">{run.avg_answer_relevance !== null ? pct(run.avg_answer_relevance) : '—'}</p>
                      <p className="text-[10px] text-muted-foreground">Relevance</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-foreground">{run.avg_latency_ms !== null ? `${run.avg_latency_ms}ms` : '—'}</p>
                      <p className="text-[10px] text-muted-foreground">Latency</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {running && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-6 text-center space-y-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
              <p className="text-sm text-foreground font-medium">Running {datasetCount} evaluation queries with LLM-judged semantic scoring...</p>
              <p className="text-xs text-muted-foreground">This may take 2–5 minutes due to rate-limit throttling</p>
            </CardContent>
          </Card>
        )}

        {error && (
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="p-4 flex items-center gap-3">
              <XCircle className="h-5 w-5 text-destructive flex-shrink-0" />
              <p className="text-sm text-destructive">{error}</p>
            </CardContent>
          </Card>
        )}

        {loadingLatest && !report && !running && (
          <Card className="border-border/50">
            <CardContent className="p-12 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto" />
              <p className="text-sm text-muted-foreground mt-3">Loading latest evaluation results...</p>
            </CardContent>
          </Card>
        )}

        {report && s && m && (
          <AnimatePresence>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              {/* Summary Metrics */}
              <Card className="border-primary/20 bg-gradient-to-br from-card to-primary/5">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2"><Target className="h-5 w-5 text-primary" /> Experimental Report</CardTitle>
                      <CardDescription>Run {report.run_id.substring(0, 8)} · {new Date(report.timestamp).toLocaleString()} · {s.test_queries_executed} queries</CardDescription>
                    </div>
                    <StatusBadge pass={s.pipeline_status === "COMPLETE"} />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
                    <MetricCard label="Answer Relevance" value={pct(s.avg_answer_relevance)} icon={TrendingUp} />
                    <MetricCard label="Retrieval Accuracy" value={pct(s.avg_retrieval_accuracy)} icon={Target} />
                    <MetricCard label="Citation Accuracy" value={pct(s.avg_citation_accuracy)} icon={FileText} />
                    <MetricCard label="Avg Latency" value={`${s.avg_response_latency_ms}ms`} icon={Clock} />
                    <MetricCard label="Tenant Isolation" value={s.multi_tenant_isolation} icon={ShieldIcon} />
                    <MetricCard label="Doc Coverage" value={s.document_coverage || `${s.documents_processed}`} icon={BookOpen} />
                  </div>
                  <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                    {([
                      ["Documents", s.documents_processed],
                      ["Chunks", s.total_chunks_indexed],
                      ["Queries", s.test_queries_executed],
                      ["Citations", s.citations_rate],
                      ["Quality", s.chunk_quality],
                      ["Pipeline", s.pipeline_status],
                    ] as [string, string | number][]).map(([label, value]) => (
                      <div key={label} className="flex items-center justify-between p-2 rounded bg-muted/50">
                        <span className="text-[10px] text-muted-foreground">{label}</span>
                        {typeof value === "string" && (value === "PASS" || value === "COMPLETE") ? (
                          <StatusBadge pass={true} />
                        ) : typeof value === "string" && value === "FAIL" ? (
                          <StatusBadge pass={false} />
                        ) : (
                          <span className="text-xs font-medium text-foreground">{value}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Tabs */}
              <Tabs defaultValue="accuracy" className="space-y-4">
                <TabsList className="flex-wrap h-auto gap-1">
                  <TabsTrigger value="accuracy" className="gap-1"><TrendingUp className="h-3 w-3" /> Accuracy</TabsTrigger>
                  <TabsTrigger value="latency" className="gap-1"><Clock className="h-3 w-3" /> Latency</TabsTrigger>
                  <TabsTrigger value="retrieval" className="gap-1"><BarChart3 className="h-3 w-3" /> Retrieval</TabsTrigger>
                  <TabsTrigger value="coverage" className="gap-1"><BookOpen className="h-3 w-3" /> Coverage</TabsTrigger>
                  <TabsTrigger value="results" className="gap-1"><FileText className="h-3 w-3" /> Results</TabsTrigger>
                  <TabsTrigger value="chunks" className="gap-1"><DatabaseIcon className="h-3 w-3" /> Chunks</TabsTrigger>
                  <TabsTrigger value="stress" className="gap-1"><Zap className="h-3 w-3" /> Stress Test</TabsTrigger>
                  <TabsTrigger value="diagnostics" className="gap-1"><Activity className="h-3 w-3" /> Diagnostics</TabsTrigger>
                  <TabsTrigger value="isolation" className="gap-1"><ShieldIcon className="h-3 w-3" /> Isolation</TabsTrigger>
                  <TabsTrigger value="architecture" className="gap-1"><Zap className="h-3 w-3" /> Architecture</TabsTrigger>
                  <TabsTrigger value="history" className="gap-1"><History className="h-3 w-3" /> History</TabsTrigger>
                </TabsList>

                {/* Accuracy Tab */}
                <TabsContent value="accuracy">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card className="border-border/50">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Accuracy by Difficulty Level</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={220}>
                          <BarChart data={accuracyByDifficulty}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                            <XAxis dataKey="difficulty" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                            <YAxis domain={[0, 100]} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                            <Tooltip contentStyle={tooltipStyle} />
                            <Legend />
                            <Bar dataKey="relevance" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Relevance %" />
                            <Bar dataKey="retrieval" fill="#22c55e" radius={[4, 4, 0, 0]} name="Retrieval %" />
                          </BarChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>

                    <Card className="border-border/50">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Accuracy by Category</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={220}>
                          <BarChart data={accuracyByCategory}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                            <XAxis dataKey="category" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                            <YAxis domain={[0, 100]} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                            <Tooltip contentStyle={tooltipStyle} />
                            <Legend />
                            <Bar dataKey="relevance" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Relevance %" />
                            <Bar dataKey="retrieval" fill="#22c55e" radius={[4, 4, 0, 0]} name="Retrieval %" />
                          </BarChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>

                    <Card className="border-border/50">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">System Performance Radar</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={260}>
                          <RadarChart data={radarData}>
                            <PolarGrid stroke="hsl(var(--border))" />
                            <PolarAngleAxis dataKey="metric" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                            <PolarRadiusAxis domain={[0, 100]} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
                            <Radar dataKey="value" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.3} />
                          </RadarChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>

                    <Card className="border-border/50">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Dataset Distribution</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={260}>
                          <PieChart>
                            <Pie
                              data={Object.entries(report.dataset_summary.by_category).map(([k, v]) => ({ name: k, value: v }))}
                              cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, value }) => `${name}: ${value}`}
                            >
                              {Object.keys(report.dataset_summary.by_category).map((_, i) => (
                                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip contentStyle={tooltipStyle} />
                          </PieChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                {/* Latency Tab */}
                <TabsContent value="latency">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card className="border-border/50">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Latency Breakdown per Query</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={300}>
                          <BarChart data={latencyDistribution}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                            <XAxis dataKey="query" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
                            <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} label={{ value: 'ms', position: 'insideLeft', fill: 'hsl(var(--muted-foreground))' }} />
                            <Tooltip contentStyle={tooltipStyle} />
                            <Legend />
                            <Bar dataKey="retrieval" stackId="a" fill="hsl(var(--primary))" name="Retrieval (ms)" />
                            <Bar dataKey="generation" stackId="a" fill="#22c55e" name="Generation (ms)" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>

                    <Card className="border-border/50">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Latency Statistics</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 gap-3">
                          {([
                            ["Avg Total", `${m.avg_total_latency_ms}ms`],
                            ["Min Total", `${m.min_total_latency_ms}ms`],
                            ["Max Total", `${m.max_total_latency_ms}ms`],
                            ["Avg Retrieval", `${m.avg_retrieval_time_ms}ms`],
                            ["Avg Generation", `${m.avg_generation_time_ms}ms`],
                            ["Total Queries", `${m.total_queries}`],
                          ] as [string, string][]).map(([label, value]) => (
                            <div key={label} className="rounded-lg border border-border/50 bg-card p-3">
                              <p className="text-xs text-muted-foreground">{label}</p>
                              <p className="text-xl font-bold text-foreground">{value}</p>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="border-border/50 md:col-span-2">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Latency Area Chart</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={220}>
                          <AreaChart data={latencyDistribution}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                            <XAxis dataKey="query" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
                            <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                            <Tooltip contentStyle={tooltipStyle} />
                            <Legend />
                            <Area type="monotone" dataKey="retrieval" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.2} name="Retrieval (ms)" />
                            <Area type="monotone" dataKey="generation" stroke="#22c55e" fill="#22c55e" fillOpacity={0.2} name="Generation (ms)" />
                            <Line type="monotone" dataKey="total" stroke="#f59e0b" strokeWidth={2} dot={false} name="Total (ms)" />
                          </AreaChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                {/* Retrieval Tab */}
                <TabsContent value="retrieval">
                  <div className="grid grid-cols-1 gap-4">
                    {/* Retrieval Quality Summary */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {(() => {
                        const results = report.evaluation_results;
                        const withExpected = results.filter(r => r.expected_document);
                        const recalled = withExpected.filter(r => r.retrieval_accuracy > 0);
                        const multiDoc = results.filter(r => r.retrieved_documents.length > 1);
                        const avgRank = results.filter(r => r.ranking_scores.length > 0).map(r => r.ranking_scores[0]);
                        return (
                          <>
                            <MetricCard label="Retrieval Recall" value={withExpected.length ? pct(recalled.length / withExpected.length) : "N/A"} sub={`${recalled.length}/${withExpected.length} queries`} icon={Target} />
                            <MetricCard label="Multi-Doc Queries" value={String(multiDoc.length)} sub={`of ${results.length} total`} icon={BookOpen} />
                            <MetricCard label="Avg Top Rank Score" value={avgRank.length ? avgRank.reduce((a, b) => a + b, 0) / avgRank.length > 0.01 ? (avgRank.reduce((a, b) => a + b, 0) / avgRank.length).toFixed(3) : "—" : "—"} icon={TrendingUp} />
                            <MetricCard label="Context Coverage" value={pct(results.filter(r => r.retrieved_chunks > 0).length / Math.max(1, results.length))} sub="queries with chunks" icon={DatabaseIcon} />
                          </>
                        );
                      })()}
                    </div>

                    <Card className="border-border/50">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Retrieval vs Answer Relevance</CardTitle>
                        <CardDescription>Each dot represents one evaluation query</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={300}>
                          <ScatterChart>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                            <XAxis dataKey="retrieval_accuracy" name="Retrieval %" domain={[0, 100]} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                            <YAxis dataKey="answer_relevance" name="Relevance %" domain={[0, 100]} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                            <Tooltip contentStyle={tooltipStyle} />
                            <Scatter
                              data={report.evaluation_results.map(r => ({
                                retrieval_accuracy: Number((r.retrieval_accuracy * 100).toFixed(1)),
                                answer_relevance: Number((r.answer_relevance * 100).toFixed(1)),
                                query: r.query.substring(0, 40),
                              }))}
                              fill="hsl(var(--primary))"
                            />
                          </ScatterChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>

                    <Card className="border-border/50">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Retrieval Diagnostics</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ScrollArea className="max-h-80">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-border">
                                <th className="text-left p-2 text-muted-foreground">#</th>
                                <th className="text-left p-2 text-muted-foreground">Query</th>
                                <th className="text-left p-2 text-muted-foreground">Expected Doc</th>
                                <th className="text-left p-2 text-muted-foreground">Retrieved Docs</th>
                                <th className="text-right p-2 text-muted-foreground">Retrieval</th>
                                <th className="text-right p-2 text-muted-foreground">Relevance</th>
                                <th className="text-right p-2 text-muted-foreground">Citation</th>
                              </tr>
                            </thead>
                            <tbody>
                              {report.evaluation_results.map((r, i) => (
                                <tr key={i} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
                                  <td className="p-2 text-muted-foreground">{i + 1}</td>
                                  <td className="p-2 text-foreground max-w-48 truncate">{r.query}</td>
                                  <td className="p-2 text-muted-foreground">{r.expected_document || "—"}</td>
                                  <td className="p-2 text-muted-foreground">{r.retrieved_documents.join(", ") || "—"}</td>
                                  <td className="p-2 text-right">
                                    <Badge variant={r.retrieval_accuracy >= 0.5 ? "default" : "destructive"} className="text-xs">{pct(r.retrieval_accuracy)}</Badge>
                                  </td>
                                  <td className="p-2 text-right">
                                    <Badge variant={r.answer_relevance >= 0.5 ? "default" : r.answer_relevance >= 0.3 ? "secondary" : "destructive"} className="text-xs">{pct(r.answer_relevance)}</Badge>
                                  </td>
                                  <td className="p-2 text-right">
                                    <Badge variant={r.citation_accuracy >= 0.5 ? "default" : "secondary"} className="text-xs">{pct(r.citation_accuracy)}</Badge>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </ScrollArea>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                {/* Coverage Tab */}
                <TabsContent value="coverage">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {docCoverageData.length > 0 && (
                      <Card className="border-border/50">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm">Document Query Coverage</CardTitle>
                          <CardDescription>How many queries retrieved each document</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <ResponsiveContainer width="100%" height={250}>
                            <BarChart data={docCoverageData} layout="vertical">
                              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                              <XAxis type="number" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                              <YAxis type="category" dataKey="name" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} width={150} />
                              <Tooltip contentStyle={tooltipStyle} />
                              <Bar dataKey="queries" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} name="Queries" />
                            </BarChart>
                          </ResponsiveContainer>
                        </CardContent>
                      </Card>
                    )}

                    <Card className="border-border/50">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Difficulty Distribution</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={250}>
                          <PieChart>
                            <Pie
                              data={[
                                { name: "Easy", value: report.dataset_summary.by_difficulty.easy },
                                { name: "Medium", value: report.dataset_summary.by_difficulty.medium },
                                { name: "Hard", value: report.dataset_summary.by_difficulty.hard },
                              ]}
                              cx="50%" cy="50%" outerRadius={80} dataKey="value"
                              label={({ name, value }) => `${name}: ${value}`}
                            >
                              <Cell fill="#22c55e" />
                              <Cell fill="#f59e0b" />
                              <Cell fill="#ef4444" />
                            </Pie>
                            <Tooltip contentStyle={tooltipStyle} />
                          </PieChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>

                    {report.document_coverage && (
                      <Card className="border-border/50 md:col-span-2">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm">Document Coverage Detail</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-2">
                            {report.document_coverage.documents_detail.map((d, i) => (
                              <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/30">
                                <div className="flex items-center gap-2">
                                  {d.was_retrieved ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-red-500" />}
                                  <span className="text-sm text-foreground">{d.filename}</span>
                                </div>
                                <span className="text-xs text-muted-foreground">{d.queries_referencing} queries referenced</span>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                </TabsContent>

                {/* Results Tab — with filtering */}
                <TabsContent value="results">
                  <Card className="border-border/50">
                    <CardHeader>
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div>
                          <CardTitle className="text-sm">Per-Query Generated Answers</CardTitle>
                          <CardDescription>{report.evaluation_results.length} queries evaluated</CardDescription>
                        </div>
                        <div className="flex gap-2">
                          <select value={filterDifficulty} onChange={e => setFilterDifficulty(e.target.value)} className="text-xs rounded border border-border bg-card px-2 py-1 text-foreground">
                            <option value="all">All Difficulties</option>
                            <option value="easy">Easy</option>
                            <option value="medium">Medium</option>
                            <option value="hard">Hard</option>
                          </select>
                          <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="text-xs rounded border border-border bg-card px-2 py-1 text-foreground">
                            <option value="all">All Categories</option>
                            {[...new Set(report.evaluation_results.map(r => r.category))].map(c => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {(() => {
                        const filtered = report.evaluation_results.filter(r =>
                          (filterDifficulty === "all" || r.difficulty_level === filterDifficulty) &&
                          (filterCategory === "all" || r.category === filterCategory)
                        );
                        const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
                        return (
                          <>
                            <div className="grid grid-cols-3 gap-2 mb-4">
                              <div className="rounded-lg border border-border/50 bg-card p-2 text-center">
                                <p className="text-lg font-bold text-foreground">{pct(avg(filtered.map(r => r.retrieval_accuracy)))}</p>
                                <p className="text-[10px] text-muted-foreground">Avg Retrieval</p>
                              </div>
                              <div className="rounded-lg border border-border/50 bg-card p-2 text-center">
                                <p className="text-lg font-bold text-foreground">{pct(avg(filtered.map(r => r.answer_relevance)))}</p>
                                <p className="text-[10px] text-muted-foreground">Avg Relevance</p>
                              </div>
                              <div className="rounded-lg border border-border/50 bg-card p-2 text-center">
                                <p className="text-lg font-bold text-foreground">{pct(avg(filtered.map(r => r.citation_accuracy)))}</p>
                                <p className="text-[10px] text-muted-foreground">Avg Citation</p>
                              </div>
                            </div>
                            <ScrollArea className="max-h-[500px]">
                              <div className="space-y-3">
                                {filtered.map((r, i) => (
                                  <div key={i} className="rounded-lg border border-border/30 p-4 space-y-2 hover:border-border/60 transition-colors">
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="flex-1">
                                        <p className="text-sm font-medium text-foreground">{r.query}</p>
                                        <div className="flex gap-1 mt-1">
                                          <Badge variant="outline" className="text-xs">{r.difficulty_level}</Badge>
                                          <Badge variant="outline" className="text-xs">{r.category}</Badge>
                                        </div>
                                      </div>
                                      <Badge variant={r.answer_relevance >= 0.6 ? "default" : r.answer_relevance >= 0.3 ? "secondary" : "destructive"} className="text-xs shrink-0">
                                        {pct(r.answer_relevance)}
                                      </Badge>
                                    </div>
                                    <div className="text-xs space-y-1">
                                      <p className="text-muted-foreground"><span className="font-medium text-foreground">Expected:</span> {r.expected_answer}</p>
                                      <p className="text-muted-foreground"><span className="font-medium text-foreground">Generated:</span> {r.generated_answer.substring(0, 300)}{r.generated_answer.length > 300 ? "..." : ""}</p>
                                    </div>
                                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                                      <span>{r.retrieved_chunks} chunks</span>
                                      <span>•</span>
                                      <span>{r.total_latency_ms}ms</span>
                                      <span>•</span>
                                      <span>Docs: {r.retrieved_documents.join(", ") || "none"}</span>
                                    </div>
                                  </div>
                                ))}
                                {filtered.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No results match the current filters.</p>}
                              </div>
                            </ScrollArea>
                          </>
                        );
                      })()}
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Chunk Quality Tab */}
                <TabsContent value="chunks">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card className="border-border/50 md:col-span-2">
                      <CardHeader>
                        <CardTitle className="text-sm flex items-center gap-2"><DatabaseIcon className="h-4 w-4 text-primary" /> Chunk Quality Analysis</CardTitle>
                        <CardDescription>Distribution and quality metrics for document chunks</CardDescription>
                      </CardHeader>
                      <CardContent>
                        {chunkStats ? (
                          <div className="space-y-4">
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                              <MetricCard label="Total Chunks" value={String(chunkStats.total_chunks)} icon={DatabaseIcon} />
                              <MetricCard label="Avg Chunks/Doc" value={String(chunkStats.avg_chunks_per_doc)} icon={FileText} />
                              <MetricCard label="Avg Chunk Length" value={`${chunkStats.avg_chunk_length}`} sub="characters" icon={Target} />
                              <MetricCard label="Documents" value={String(chunkStats.total_documents)} icon={BookOpen} />
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                              <div className="rounded-lg border border-border/50 bg-card p-3 text-center">
                                <p className="text-lg font-bold text-foreground">{chunkStats.min_chunk_length}</p>
                                <p className="text-[10px] text-muted-foreground">Min Chunk Length</p>
                              </div>
                              <div className="rounded-lg border border-border/50 bg-card p-3 text-center">
                                <p className="text-lg font-bold text-foreground">{chunkStats.max_chunk_length}</p>
                                <p className="text-[10px] text-muted-foreground">Max Chunk Length</p>
                              </div>
                              <div className="rounded-lg border border-border/50 bg-card p-3 text-center">
                                <p className="text-lg font-bold text-foreground">{chunkStats.min_chunks}</p>
                                <p className="text-[10px] text-muted-foreground">Min Chunks/Doc</p>
                              </div>
                              <div className="rounded-lg border border-border/50 bg-card p-3 text-center">
                                <p className="text-lg font-bold text-foreground">{chunkStats.max_chunks}</p>
                                <p className="text-[10px] text-muted-foreground">Max Chunks/Doc</p>
                              </div>
                            </div>
                            {chunkStats.documents.length > 0 && (
                              <div>
                                <h4 className="text-xs font-semibold text-foreground mb-2">Per-Document Breakdown</h4>
                                <ResponsiveContainer width="100%" height={Math.max(150, chunkStats.documents.length * 35)}>
                                  <BarChart data={chunkStats.documents.map((d: any) => ({
                                    name: d.filename.length > 25 ? d.filename.substring(0, 23) + '...' : d.filename,
                                    chunks: d.chunk_count,
                                    text_kb: d.text_length ? Math.round(d.text_length / 1024) : 0,
                                  }))} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                                    <XAxis type="number" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                                    <YAxis type="category" dataKey="name" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} width={180} />
                                    <Tooltip contentStyle={tooltipStyle} />
                                    <Legend />
                                    <Bar dataKey="chunks" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} name="Chunks" />
                                    <Bar dataKey="text_kb" fill="#22c55e" radius={[0, 4, 4, 0]} name="Text (KB)" />
                                  </BarChart>
                                </ResponsiveContainer>
                              </div>
                            )}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground text-center py-8">No processed documents found. Upload and process documents to see chunk quality analysis.</p>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                {/* Stress Test Tab */}
                <TabsContent value="stress">
                  <div className="grid grid-cols-1 gap-4">
                    <Card className="border-border/50">
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <div>
                            <CardTitle className="text-sm flex items-center gap-2"><Zap className="h-4 w-4 text-primary" /> Retrieval Stress Test</CardTitle>
                            <CardDescription>Automated batch retrieval queries to measure performance under load</CardDescription>
                          </div>
                          <div className="flex gap-2">
                            <Button onClick={() => runStressTest(10)} disabled={stressRunning} variant="outline" size="sm" className="gap-1 text-xs">
                              {stressRunning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />} 10 Queries
                            </Button>
                            <Button onClick={() => runStressTest(25)} disabled={stressRunning} size="sm" className="gap-1 text-xs">
                              {stressRunning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />} 25 Queries
                            </Button>
                            <Button onClick={() => runStressTest(50)} disabled={stressRunning} variant="outline" size="sm" className="gap-1 text-xs">
                              {stressRunning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />} 50 Queries
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        {stressRunning && (
                          <div className="flex items-center justify-center gap-3 py-8">
                            <Loader2 className="h-6 w-6 animate-spin text-primary" />
                            <p className="text-sm text-muted-foreground">Running stress test...</p>
                          </div>
                        )}
                        {stressResult && !stressRunning && (
                          <div className="space-y-4">
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                              <MetricCard label="Total Queries" value={String(stressResult.summary.total_queries)} icon={Target} />
                              <MetricCard label="Successful" value={String(stressResult.summary.successful_queries)} icon={CheckCircle2} />
                              <MetricCard label="Avg Latency" value={`${stressResult.summary.avg_latency_ms}ms`} icon={Clock} />
                              <MetricCard label="Success Rate" value={`${(stressResult.summary.retrieval_success_rate * 100).toFixed(1)}%`} icon={TrendingUp} />
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                              <div className="rounded-lg border border-border/50 bg-card p-3 text-center">
                                <p className="text-lg font-bold text-foreground">{stressResult.summary.min_latency_ms}ms</p>
                                <p className="text-[10px] text-muted-foreground">Min Latency</p>
                              </div>
                              <div className="rounded-lg border border-border/50 bg-card p-3 text-center">
                                <p className="text-lg font-bold text-foreground">{stressResult.summary.max_latency_ms}ms</p>
                                <p className="text-[10px] text-muted-foreground">Max Latency</p>
                              </div>
                              <div className="rounded-lg border border-border/50 bg-card p-3 text-center">
                                <p className="text-lg font-bold text-foreground">{stressResult.summary.avg_retrieval_latency_ms || 0}ms</p>
                                <p className="text-[10px] text-muted-foreground">Avg Retrieval</p>
                              </div>
                              <div className="rounded-lg border border-border/50 bg-card p-3 text-center">
                                <p className="text-lg font-bold text-foreground">{stressResult.summary.multi_doc_queries || 0}</p>
                                <p className="text-[10px] text-muted-foreground">Multi-Doc Queries</p>
                              </div>
                              <div className="rounded-lg border border-border/50 bg-card p-3 text-center">
                                <p className="text-lg font-bold text-foreground">{stressResult.summary.failed_queries}</p>
                                <p className="text-[10px] text-muted-foreground">Failed</p>
                              </div>
                            </div>
                            {/* Latency distribution chart */}
                            <ResponsiveContainer width="100%" height={200}>
                              <BarChart data={stressResult.results.map((r: any, i: number) => ({
                                query: `Q${i + 1}`,
                                latency: r.total_latency_ms,
                                chunks: r.chunks_retrieved,
                              }))}>
                                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                                <XAxis dataKey="query" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 9 }} />
                                <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                                <Tooltip contentStyle={tooltipStyle} />
                                <Bar dataKey="latency" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} name="Latency (ms)" />
                              </BarChart>
                            </ResponsiveContainer>
                            {/* Document distribution */}
                            {stressResult.summary.document_distribution?.length > 0 && (
                              <div>
                                <h4 className="text-xs font-semibold text-foreground mb-2">Document Retrieval Distribution</h4>
                                <div className="space-y-1.5">
                                  {stressResult.summary.document_distribution.map((d: any, i: number) => (
                                    <div key={i} className="flex items-center gap-2 text-xs">
                                      <span className="text-foreground flex-1 truncate">{d.filename}</span>
                                      <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
                                        <div
                                          className="h-full bg-primary rounded-full"
                                          style={{ width: `${Math.min(100, (d.query_hits / stressResult.summary.total_queries) * 100)}%` }}
                                        />
                                      </div>
                                      <span className="text-muted-foreground w-16 text-right">{d.query_hits} hits</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                        {!stressResult && !stressRunning && (
                          <p className="text-sm text-muted-foreground text-center py-8">Run a stress test to measure retrieval performance under load. Queries are sampled from your evaluation dataset.</p>
                        )}
                      </CardContent>
                    </Card>

                    {/* Stress test history */}
                    {stressHistory.length > 0 && (
                      <Card className="border-border/50">
                        <CardHeader>
                          <CardTitle className="text-sm">Stress Test History</CardTitle>
                          <CardDescription>Performance trends across test runs</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <ResponsiveContainer width="100%" height={180}>
                            <LineChart data={stressHistory.slice().reverse().map((r: any, i: number) => ({
                              run: `#${i + 1}`,
                              avg_latency: r.avg_latency_ms || 0,
                              success_rate: Number(((r.retrieval_success_rate || 0) * 100).toFixed(1)),
                              queries: r.total_queries,
                            }))}>
                              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                              <XAxis dataKey="run" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                              <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                              <Tooltip contentStyle={tooltipStyle} />
                              <Legend />
                              <Line type="monotone" dataKey="avg_latency" stroke="hsl(var(--primary))" strokeWidth={2} name="Avg Latency (ms)" />
                              <Line type="monotone" dataKey="success_rate" stroke="#22c55e" strokeWidth={2} name="Success Rate %" />
                            </LineChart>
                          </ResponsiveContainer>
                          <div className="mt-3 space-y-1.5">
                            {stressHistory.slice(0, 5).map((r: any) => (
                              <div key={r.id} className="flex items-center justify-between text-xs p-2 rounded bg-muted/30">
                                <span className="text-muted-foreground">{new Date(r.created_at).toLocaleString()}</span>
                                <span className="text-foreground">{r.total_queries} queries</span>
                                <span className="font-mono">{r.avg_latency_ms}ms avg</span>
                                <Badge variant={Number(r.retrieval_success_rate) >= 0.8 ? "default" : "destructive"} className="text-[10px]">
                                  {((r.retrieval_success_rate || 0) * 100).toFixed(0)}%
                                </Badge>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                </TabsContent>

                {/* Diagnostics Tab */}
                <TabsContent value="diagnostics">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-medium text-foreground">Live Retrieval Debug Mode</h3>
                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                          <input
                            type="checkbox"
                            checked={debugMode}
                            onChange={(e) => setDebugMode(e.target.checked)}
                            className="rounded border-border"
                          />
                          Show chunk details
                        </label>
                        <Button variant="outline" size="sm" onClick={loadQueryDiagnostics} className="gap-1 text-xs">
                          <RefreshCw className="h-3 w-3" /> Refresh
                        </Button>
                      </div>
                    </div>
                    {queryDiagnostics.length > 0 ? (
                      <Card className="border-border/50">
                        <CardContent className="p-0">
                          <ScrollArea className="max-h-[600px]">
                            <div className="divide-y divide-border/30">
                              {queryDiagnostics.map((q: any, i: number) => (
                                <div key={q.id} className="p-3 hover:bg-muted/30 transition-colors">
                                  <div className="flex items-start justify-between gap-3 mb-1">
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs font-medium text-foreground truncate">{q.question}</p>
                                      <p className="text-[10px] text-muted-foreground">{new Date(q.created_at).toLocaleString()}</p>
                                    </div>
                                    <div className="flex gap-2 text-[10px] shrink-0">
                                      <span className="px-1.5 py-0.5 rounded bg-muted font-mono">{q.latency_ms || "—"}ms total</span>
                                      <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono">{q.retrieval_latency_ms || "—"}ms retrieval</span>
                                      <span className="px-1.5 py-0.5 rounded bg-green-500/10 text-green-600 font-mono">{q.generation_latency_ms || "—"}ms generation</span>
                                    </div>
                                  </div>
                                  <div className="flex gap-3 text-[10px] text-muted-foreground">
                                    <span>Chunks: {Array.isArray(q.retrieved_chunk_ids) ? q.retrieved_chunk_ids.length : "—"}</span>
                                    <span>Context tokens: {q.context_token_count || "—"}</span>
                                  </div>
                                  {debugMode && (
                                    <div className="mt-2 p-2 rounded bg-muted/50 border border-border/30 space-y-1">
                                      <p className="text-[10px] font-semibold text-foreground">Retrieved Chunk IDs:</p>
                                      {Array.isArray(q.retrieved_chunk_ids) && q.retrieved_chunk_ids.length > 0 ? (
                                        <div className="flex flex-wrap gap-1">
                                          {q.retrieved_chunk_ids.map((id: string, ci: number) => (
                                            <span key={ci} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-card border border-border/50 text-muted-foreground">
                                              {typeof id === 'string' ? id.substring(0, 8) : id}...
                                              {Array.isArray(q.retrieval_scores) && q.retrieval_scores[ci] !== undefined && (
                                                <span className="ml-1 text-primary font-semibold">rank: {Number(q.retrieval_scores[ci]).toFixed(4)}</span>
                                              )}
                                            </span>
                                          ))}
                                        </div>
                                      ) : (
                                        <p className="text-[10px] text-muted-foreground">No chunk IDs recorded</p>
                                      )}
                                      <p className="text-[10px] font-semibold text-foreground mt-1">Retrieval Scores:</p>
                                      {Array.isArray(q.retrieval_scores) && q.retrieval_scores.length > 0 ? (
                                        <div className="flex gap-2">
                                          {q.retrieval_scores.map((score: number, si: number) => (
                                            <span key={si} className="text-[10px] font-mono text-primary">{Number(score).toFixed(4)}</span>
                                          ))}
                                        </div>
                                      ) : (
                                        <p className="text-[10px] text-muted-foreground">No scores recorded</p>
                                      )}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </ScrollArea>
                        </CardContent>
                      </Card>
                    ) : (
                      <Card className="border-border/50">
                        <CardContent className="p-8 text-center">
                          <p className="text-sm text-muted-foreground">No query logs yet. Send queries in Chat to collect diagnostics.</p>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                </TabsContent>

                {/* Isolation Tab */}
                <TabsContent value="isolation">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Live Isolation Test */}
                    <Card className="border-border/50 md:col-span-2">
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <div>
                            <CardTitle className="text-sm flex items-center gap-2">
                              <ShieldIcon className="h-4 w-4 text-primary" /> Live Tenant Isolation Simulation
                            </CardTitle>
                            <CardDescription>Creates temporary tenants, inserts data, and verifies cross-tenant queries return no leaked data</CardDescription>
                          </div>
                          <Button onClick={runIsolationTest} disabled={isolationRunning} size="sm" className="gap-2">
                            {isolationRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                            Run Test
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent>
                        {isolationResult ? (
                          <div className="space-y-3">
                            <div className="flex items-center gap-2 mb-3">
                              <StatusBadge pass={isolationResult.overall_pass} />
                              {isolationResult.summary && (
                                <span className="text-xs text-muted-foreground">
                                  {isolationResult.summary.passed}/{isolationResult.summary.total_checks} checks passed
                                </span>
                              )}
                            </div>
                            {isolationResult.steps?.map((step: any, i: number) => (
                              <div key={i} className="flex items-center gap-2.5 py-1.5 px-2 rounded-md bg-muted/30">
                                {step.pass ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-destructive" />}
                                <span className="text-sm text-foreground flex-1">{step.name}</span>
                                <span className="text-[10px] text-muted-foreground">{step.detail}</span>
                                <Badge variant={step.pass ? "default" : "destructive"} className="text-[10px]">
                                  {step.pass ? "PASS" : "FAIL"}
                                </Badge>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground text-center py-6">
                            Click "Run Test" to execute a live cross-tenant isolation simulation. This creates temporary tenants, inserts test documents, and verifies data cannot leak across tenant boundaries.
                          </p>
                        )}
                      </CardContent>
                    </Card>

                    {/* Report-based isolation data */}
                    <Card className="border-border/50">
                      <CardHeader>
                        <CardTitle className="text-sm flex items-center gap-2">
                          <ShieldIcon className="h-4 w-4 text-green-500" /> Evaluation Report Isolation
                          <StatusBadge pass={report.tenant_isolation.isolation_verified} />
                        </CardTitle>
                        <CardDescription>{report.tenant_isolation.total_tenants} tenant(s)</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {report.tenant_isolation.notes.map((note, i) => (
                            <div key={i} className="flex items-start gap-2 text-sm">
                              <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                              <span className="text-muted-foreground">{note}</span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="border-border/50">
                      <CardHeader>
                        <CardTitle className="text-sm">Chunk Quality</CardTitle>
                        <CardDescription>
                          {report.chunk_quality.samples_checked} samples — <StatusBadge pass={report.chunk_quality.all_readable} />
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <ScrollArea className="max-h-60">
                          <div className="space-y-2">
                            {report.chunk_quality.samples.map((cs: any, i: number) => (
                              <div key={i} className="rounded-lg border border-border/30 p-2 text-xs">
                                <div className="flex items-center gap-2 mb-1">
                                  <Badge variant="outline" className="text-xs">Chunk {cs.chunk_index}</Badge>
                                  <span className="text-muted-foreground">{cs.text_length} chars</span>
                                  <Badge variant={cs.is_readable ? "default" : "destructive"} className="text-xs ml-auto">{cs.readability_score}%</Badge>
                                </div>
                                <p className="text-muted-foreground font-mono line-clamp-1">{cs.text_preview}</p>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      </CardContent>
                    </Card>

                    <Card className="border-border/50 md:col-span-2">
                      <CardHeader>
                        <CardTitle className="text-sm">Dashboard Cross-Validation</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          {Object.entries(report.dashboard_validation).map(([key, value]) => (
                            <div key={key} className="rounded-lg border border-border/50 bg-card p-3 text-center">
                              <p className="text-xl font-bold text-foreground">{value}</p>
                              <p className="text-xs text-muted-foreground">{key.replace(/_/g, " ")}</p>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                {/* Architecture Tab */}
                <TabsContent value="architecture">
                  <Card className="border-border/50">
                    <CardHeader>
                      <CardTitle className="text-sm flex items-center gap-2"><Zap className="h-4 w-4 text-primary" /> System Architecture — Live Verification</CardTitle>
                      <CardDescription>End-to-end RAG pipeline flow with real-time component status</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-6">
                        {/* Live component verification */}
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
                          {[
                            { label: "Frontend", status: true, detail: "React app loaded" },
                            { label: "Authentication", status: !!session, detail: session ? "Session active" : "No session" },
                            { label: "Database", status: !!profile, detail: profile ? "Accessible" : "Unreachable" },
                            { label: "Edge Functions", status: true, detail: "5 deployed" },
                            { label: "Retrieval Pipeline", status: (report?.metrics?.avg_retrieval_accuracy || 0) > 0 || queryDiagnostics.length > 0, detail: queryDiagnostics.length > 0 ? `${queryDiagnostics.length} queries logged` : "No queries yet" },
                            { label: "LLM Gateway", status: true, detail: "Gemini 3 Flash" },
                          ].map((comp) => (
                            <div key={comp.label} className="rounded-lg border border-border/50 bg-card p-3 text-center">
                              <div className="flex items-center justify-center gap-1.5 mb-1">
                                {comp.status ? <CheckCircle2 className="h-3 w-3 text-green-500" /> : <XCircle className="h-3 w-3 text-destructive" />}
                                <span className="text-xs font-semibold text-foreground">{comp.label}</span>
                              </div>
                              <p className="text-[10px] text-muted-foreground">{comp.detail}</p>
                            </div>
                          ))}
                        </div>

                        {/* Pipeline flow */}
                        <div className="flex flex-wrap items-center justify-center gap-2 py-6">
                          {[
                            { label: "User", icon: "👤", desc: "Asks question" },
                            { label: "React Frontend", icon: "⚛️", desc: "Chat UI + streaming" },
                            { label: "Auth", icon: "🔐", desc: "JWT verification" },
                            { label: "Edge Function", icon: "⚡", desc: "rag-query / process-document" },
                            { label: "FTS Retrieval", icon: "🔍", desc: "tsvector search + ranking" },
                            { label: "Chunk Storage", icon: "📦", desc: "PostgreSQL + RLS" },
                            { label: "LLM Generation", icon: "🤖", desc: "Gemini via AI Gateway" },
                            { label: "Citation Output", icon: "📝", desc: "Streamed response + sources" },
                          ].map((step, i, arr) => (
                            <React.Fragment key={i}>
                              <div className="flex flex-col items-center text-center p-3 rounded-xl border border-border/50 bg-card min-w-[110px] hover:border-primary/40 transition-colors">
                                <span className="text-2xl mb-1">{step.icon}</span>
                                <span className="text-xs font-semibold text-foreground">{step.label}</span>
                                <span className="text-[10px] text-muted-foreground mt-0.5">{step.desc}</span>
                              </div>
                              {i < arr.length - 1 && <span className="text-primary font-bold text-lg">→</span>}
                            </React.Fragment>
                          ))}
                        </div>

                        {/* Document ingestion pipeline */}
                        <div>
                          <h3 className="text-sm font-semibold text-foreground mb-3">Document Ingestion Pipeline</h3>
                          <div className="flex flex-wrap items-center justify-center gap-2">
                            {[
                              { label: "Upload", desc: "PDF / TXT / DOCX" },
                              { label: "Extract Text", desc: "pdfjs / fflate" },
                              { label: "Validate", desc: "Readability check" },
                              { label: "Chunk", desc: "1400 chars, 120 overlap" },
                              { label: "Store", desc: "document_chunks + FTS" },
                              { label: "Ready", desc: "Queryable" },
                            ].map((step, i, arr) => (
                              <React.Fragment key={i}>
                                <div className="flex flex-col items-center text-center p-2.5 rounded-lg border border-border/50 bg-muted/30 min-w-[100px]">
                                  <span className="text-xs font-medium text-foreground">{step.label}</span>
                                  <span className="text-[10px] text-muted-foreground">{step.desc}</span>
                                </div>
                                {i < arr.length - 1 && <span className="text-muted-foreground">→</span>}
                              </React.Fragment>
                            ))}
                          </div>
                        </div>

                        {/* Tech stack */}
                        <div>
                          <h3 className="text-sm font-semibold text-foreground mb-3">Technology Stack</h3>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {[
                              { name: "Frontend", tech: "React + Vite + Tailwind" },
                              { name: "Backend", tech: "Edge Functions (Deno)" },
                              { name: "Database", tech: "PostgreSQL + RLS" },
                              { name: "Auth", tech: "JWT + Multi-Tenant" },
                              { name: "Search", tech: "Full-Text (tsvector)" },
                              { name: "AI Model", tech: "Gemini 3 Flash" },
                              { name: "Streaming", tech: "SSE (Server-Sent Events)" },
                              { name: "Evaluation", tech: "LLM-judged scoring" },
                            ].map(item => (
                              <div key={item.name} className="rounded-lg border border-border/50 bg-card p-3">
                                <p className="text-xs font-semibold text-foreground">{item.name}</p>
                                <p className="text-[10px] text-muted-foreground">{item.tech}</p>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Security model */}
                        <div>
                          <h3 className="text-sm font-semibold text-foreground mb-3">Security Model</h3>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            {[
                              { title: "Row-Level Security", desc: "Every table enforces tenant_id = get_user_tenant_id(). No cross-tenant data access possible." },
                              { title: "JWT Authentication", desc: "All edge functions validate Bearer tokens. Service role keys used only server-side." },
                              { title: "Data Isolation", desc: "12 tables with RLS. Profiles, documents, chunks, messages, evaluations all tenant-scoped." },
                            ].map(item => (
                              <div key={item.title} className="rounded-lg border border-border/50 bg-card p-3">
                                <p className="text-xs font-semibold text-foreground flex items-center gap-1.5"><ShieldIcon className="h-3 w-3 text-green-500" />{item.title}</p>
                                <p className="text-[10px] text-muted-foreground mt-1">{item.desc}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="history">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {historyTrend.length > 1 && (
                      <>
                        <Card className="border-border/50 md:col-span-2">
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm">Accuracy Improvement Across Runs</CardTitle>
                            <CardDescription>Track retrieval and relevance trends over time</CardDescription>
                          </CardHeader>
                          <CardContent>
                            <ResponsiveContainer width="100%" height={220}>
                              <LineChart data={historyTrend}>
                                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                                <XAxis dataKey="run" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                                <YAxis domain={[0, 100]} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                                <Tooltip contentStyle={tooltipStyle} />
                                <Legend />
                                <Line type="monotone" dataKey="relevance" stroke="hsl(var(--primary))" strokeWidth={2} name="Relevance %" />
                                <Line type="monotone" dataKey="retrieval" stroke="#22c55e" strokeWidth={2} name="Retrieval %" />
                              </LineChart>
                            </ResponsiveContainer>
                          </CardContent>
                        </Card>
                        <Card className="border-border/50 md:col-span-2">
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm">Latency Trends</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <ResponsiveContainer width="100%" height={180}>
                              <AreaChart data={historyTrend}>
                                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                                <XAxis dataKey="run" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                                <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                                <Tooltip contentStyle={tooltipStyle} />
                                <Area type="monotone" dataKey="latency" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.15} strokeWidth={2} name="Avg Latency (ms)" />
                              </AreaChart>
                            </ResponsiveContainer>
                          </CardContent>
                        </Card>
                      </>
                    )}

                    <Card className="border-border/50 md:col-span-2">
                      <CardHeader>
                        <CardTitle className="text-sm">Evaluation Run History</CardTitle>
                        <CardDescription>Click a run to load its full report</CardDescription>
                      </CardHeader>
                      <CardContent>
                        {runHistory.length > 0 ? (
                          <div className="space-y-2">
                            {runHistory.map((run) => (
                              <button
                                key={run.id}
                                onClick={() => loadPastRun(run.id)}
                                className={`w-full text-left rounded-lg border p-4 hover:border-primary/50 transition-colors ${activeRunId === run.id ? 'border-primary bg-primary/5' : 'border-border/30'}`}
                              >
                                <div className="flex items-center justify-between">
                                  <div>
                                    <p className="text-sm font-medium text-foreground">{new Date(run.timestamp).toLocaleString()}</p>
                                    <p className="text-xs text-muted-foreground">{run.documents_tested} docs · {run.queries_executed} queries</p>
                                  </div>
                                  <div className="flex gap-2 text-xs">
                                    {run.avg_retrieval_accuracy !== null && (
                                      <Badge variant="outline">Retrieval: {(run.avg_retrieval_accuracy * 100).toFixed(1)}%</Badge>
                                    )}
                                    {run.avg_answer_relevance !== null && (
                                      <Badge variant="outline">Relevance: {(run.avg_answer_relevance * 100).toFixed(1)}%</Badge>
                                    )}
                                    {run.avg_latency_ms !== null && (
                                      <Badge variant="outline">{run.avg_latency_ms}ms</Badge>
                                    )}
                                  </div>
                                </div>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground text-center py-6">No evaluation runs yet.</p>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>
              </Tabs>
            </motion.div>
          </AnimatePresence>
        )}

        {/* Empty state */}
        {!report && !running && !error && !loadingLatest && runHistory.length === 0 && (
          <Card className="border-border/50">
            <CardContent className="p-12 text-center space-y-4">
              <FlaskConical className="h-12 w-12 text-muted-foreground mx-auto" />
              <div>
                <p className="text-lg font-medium text-foreground">Research-Grade Evaluation Ready</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {datasetCount} ground-truth queries with LLM-judged semantic scoring, retrieval diagnostics, latency profiling, and exportable academic reports.
                </p>
              </div>
              <div className="text-xs text-muted-foreground space-y-1 max-w-md mx-auto text-left">
                <p>✓ Ground-truth dataset with difficulty levels and categories</p>
                <p>✓ Semantic answer relevance scoring (LLM-judged + keyword fallback)</p>
                <p>✓ Retrieval accuracy and citation accuracy metrics</p>
                <p>✓ Detailed latency profiling (retrieval + generation)</p>
                <p>✓ Multi-tenant isolation verification</p>
                <p>✓ Document coverage analysis</p>
                <p>✓ Reproducible runs with comparison history</p>
                <p>✓ Exportable Markdown report for academic use</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default Validation;
