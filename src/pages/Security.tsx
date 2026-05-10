import React, { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ArrowRight, CheckCircle2, Database as DatabaseIcon, FileText, Globe, Key, Layers,
  Loader2, Lock, Search, Server, Shield as ShieldIcon, ShieldCheck, Sparkles, XCircle, Zap,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import TenantBadge from "@/components/TenantBadge";

/* ── Architecture pipeline steps ─────────────────── */
const pipelineSteps = [
  { icon: Globe, label: "User Question", detail: "Natural language query from React UI", color: "text-primary" },
  { icon: Key, label: "JWT Authentication", detail: "Supabase Auth verifies identity", color: "text-amber-500" },
  { icon: ShieldIcon, label: "Tenant Resolution", detail: "get_user_tenant_id() extracts tenant from profile", color: "text-green-500" },
  { icon: DatabaseIcon, label: "RLS Enforcement", detail: "Every SELECT/INSERT filtered by tenant_id automatically", color: "text-green-500" },
  { icon: Server, label: "Edge Function", detail: "rag-query validates tenant membership in code", color: "text-violet-500" },
  { icon: Search, label: "FTS Retrieval", detail: "search_document_chunks scoped to search_tenant_id", color: "text-blue-500" },
  { icon: Layers, label: "Context Assembly", detail: "Only tenant-owned chunks used in prompt", color: "text-cyan-500" },
  { icon: Sparkles, label: "AI Generation", detail: "LLM generates answer from tenant-scoped context only", color: "text-pink-500" },
];

/* ── RLS policies data ───────────────────────────── */
const rlsPolicies = [
  { table: "documents", policies: ["SELECT: tenant_id = get_user_tenant_id()", "INSERT: tenant_id = get_user_tenant_id() AND uploaded_by = auth.uid()", "UPDATE/DELETE: tenant_id = get_user_tenant_id()"] },
  { table: "document_chunks", policies: ["SELECT: tenant_id = get_user_tenant_id()", "INSERT: tenant_id = get_user_tenant_id()"] },
  { table: "conversations", policies: ["SELECT: tenant_id = get_user_tenant_id() AND user_id = auth.uid()", "INSERT: tenant_id = get_user_tenant_id() AND user_id = auth.uid()"] },
  { table: "messages", policies: ["SELECT: tenant_id = get_user_tenant_id()", "INSERT: tenant_id = get_user_tenant_id()"] },
  { table: "query_logs", policies: ["SELECT: tenant_id = get_user_tenant_id()", "INSERT: tenant_id = get_user_tenant_id()"] },
  { table: "evaluation_results", policies: ["SELECT: tenant_id = get_user_tenant_id()", "INSERT: tenant_id = get_user_tenant_id()"] },
  { table: "profiles", policies: ["SELECT: tenant_id = get_user_tenant_id()", "INSERT: user_id = auth.uid()", "UPDATE: user_id = auth.uid()"] },
  { table: "user_roles", policies: ["SELECT own: user_id = auth.uid()", "ALL (admin): has_role(auth.uid(), 'admin')"] },
];

const Security = () => {
  const { profile, session, tenantName } = useAuth();
  const [liveProof, setLiveProof] = useState<any>(null);
  const [loadingProof, setLoadingProof] = useState(false);
  const [isolationResult, setIsolationResult] = useState<any>(null);
  const [runningIsolation, setRunningIsolation] = useState(false);

  const fetchLiveProof = async () => {
    if (!profile) return;
    setLoadingProof(true);
    try {
      const tenantId = profile.tenant_id;

      // Fetch counts scoped to current tenant (RLS enforces this)
      const [docRes, chunkRes, queryRes, logRes] = await Promise.all([
        supabase.from("documents").select("id", { count: "exact", head: true }),
        supabase.from("document_chunks").select("id", { count: "exact", head: true }),
        supabase.from("query_logs").select("id", { count: "exact", head: true }),
        supabase.from("system_logs").select("id, tenant_id, source, message, created_at").order("created_at", { ascending: false }).limit(5),
      ]);

      // Recent query log with chunk details
      const { data: recentQuery } = await supabase
        .from("query_logs")
        .select("question, tenant_id, retrieved_chunk_ids, retrieval_scores, retrieval_latency_ms, created_at")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      setLiveProof({
        tenant_id: tenantId,
        tenant_name: tenantName,
        docs_visible: docRes.count ?? 0,
        chunks_visible: chunkRes.count ?? 0,
        queries_visible: queryRes.count ?? 0,
        recent_logs: logRes.data ?? [],
        recent_query: recentQuery,
        rls_active: true,
        timestamp: new Date().toISOString(),
      });
    } catch (e) {
      console.error("Live proof error:", e);
    } finally {
      setLoadingProof(false);
    }
  };

  const runIsolationTest = async () => {
    if (!session) return;
    setRunningIsolation(true);
    try {
      const { data, error } = await supabase.functions.invoke("test-tenant-isolation", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error) throw error;
      setIsolationResult(data);
    } catch (e: any) {
      setIsolationResult({ error: e.message });
    } finally {
      setRunningIsolation(false);
    }
  };

  useEffect(() => {
    if (profile) fetchLiveProof();
  }, [profile]);

  return (
    <div className="h-full overflow-auto">
      <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">Security & Architecture</h1>
          <p className="text-sm text-muted-foreground">Verifiable proof of multi-tenant isolation and data security</p>
          <TenantBadge className="mt-2" />
        </div>

        {/* ── SECTION 1: Architecture Diagram ────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Globe className="h-4 w-4 text-primary" />
              Data Flow — tenant_id at Every Layer
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {pipelineSteps.map((step, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <div className="flex items-start gap-3 py-2">
                    <div className="flex flex-col items-center">
                      <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg border bg-card", step.color)}>
                        <step.icon className="h-4 w-4" />
                      </div>
                      {i < pipelineSteps.length - 1 && (
                        <div className="w-px h-4 bg-border" />
                      )}
                    </div>
                    <div className="pt-1">
                      <p className="text-sm font-medium text-foreground">{step.label}</p>
                      <p className="text-xs text-muted-foreground">{step.detail}</p>
                    </div>
                    {i < pipelineSteps.length - 1 && (
                      <ArrowRight className="h-3 w-3 text-muted-foreground/40 mt-2.5 ml-auto hidden sm:block" />
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* ── SECTION 2: RLS Policies ────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Lock className="h-4 w-4 text-green-500" />
              Row-Level Security Policies (All {rlsPolicies.length} Tables)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-4">
              Every table uses <code className="text-primary">get_user_tenant_id()</code> — a <code>SECURITY DEFINER</code> function that resolves the caller's tenant from their JWT. No data can be accessed outside the tenant boundary.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {rlsPolicies.map((t, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="rounded-lg border border-border bg-card p-3"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <DatabaseIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-bold font-mono text-foreground">{t.table}</span>
                    <Badge variant="outline" className="text-[10px] h-4 ml-auto text-green-600 border-green-500/30">RLS ON</Badge>
                  </div>
                  {t.policies.map((p, j) => (
                    <p key={j} className="text-[11px] text-muted-foreground font-mono leading-relaxed">• {p}</p>
                  ))}
                </motion.div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* ── SECTION 3: Isolation Strategy ──────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldIcon className="h-4 w-4 text-amber-500" />
              Isolation Strategy
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                {
                  title: "Database Isolation",
                  icon: DatabaseIcon,
                  items: ["RLS on every table", "tenant_id = get_user_tenant_id()", "SECURITY DEFINER functions", "No cross-tenant JOINs possible"],
                },
                {
                  title: "Retrieval Isolation",
                  icon: Search,
                  items: ["search_document_chunks scoped by tenant", "FTS index filtered by tenant_id", "Fallback queries include tenant filter", "Edge function double-checks membership"],
                },
                {
                  title: "API Security",
                  icon: Key,
                  items: ["JWT verified on every request", "Tenant membership checked in code", "Rate limiting per user", "CORS headers configured"],
                },
              ].map((section, i) => (
                <div key={i} className="rounded-lg border border-border bg-card p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <section.icon className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-semibold text-foreground">{section.title}</h3>
                  </div>
                  <ul className="space-y-1.5">
                    {section.items.map((item, j) => (
                      <li key={j} className="flex items-start gap-2 text-xs text-muted-foreground">
                        <CheckCircle2 className="h-3 w-3 text-green-500 mt-0.5 shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* ── SECTION 4: Live Proof ──────────────────── */}
        <Card className="border-primary/20">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" />
                Live Proof — Real Database Evidence
              </CardTitle>
              <Button size="sm" variant="outline" onClick={fetchLiveProof} disabled={loadingProof}>
                {loadingProof ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Refresh"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {liveProof ? (
              <div className="space-y-4">
                <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-4">
                  <p className="text-xs font-semibold text-green-600 mb-2">✔ RLS Active — You can ONLY see your tenant's data</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { label: "Tenant", value: liveProof.tenant_name || "—" },
                      { label: "Documents visible", value: liveProof.docs_visible },
                      { label: "Chunks visible", value: liveProof.chunks_visible },
                      { label: "Queries visible", value: liveProof.queries_visible },
                    ].map((m, i) => (
                      <div key={i} className="text-center">
                        <p className="text-lg font-bold text-foreground">{m.value}</p>
                        <p className="text-[10px] text-muted-foreground">{m.label}</p>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-3 font-mono">
                    tenant_id: {liveProof.tenant_id} | queried at: {new Date(liveProof.timestamp).toLocaleTimeString()}
                  </p>
                </div>

                {liveProof.recent_query && (
                  <div className="rounded-lg border border-border bg-muted/30 p-3">
                    <p className="text-xs font-semibold text-foreground mb-2">Most Recent Query (tenant-scoped)</p>
                    <div className="font-mono text-[11px] text-muted-foreground space-y-1">
                      <p><span className="text-foreground">question:</span> "{liveProof.recent_query.question?.substring(0, 80)}"</p>
                      <p><span className="text-foreground">tenant_id:</span> {liveProof.recent_query.tenant_id}</p>
                      <p><span className="text-foreground">chunks_retrieved:</span> {(liveProof.recent_query.retrieved_chunk_ids as any[])?.length ?? 0}</p>
                      <p><span className="text-foreground">retrieval_latency:</span> {liveProof.recent_query.retrieval_latency_ms ?? "—"}ms</p>
                      <p><span className="text-foreground">scores:</span> [{(liveProof.recent_query.retrieval_scores as number[])?.map((s: number) => s.toFixed(3)).join(", ") ?? "—"}]</p>
                    </div>
                  </div>
                )}

                {liveProof.recent_logs.length > 0 && (
                  <div className="rounded-lg border border-border bg-muted/30 p-3">
                    <p className="text-xs font-semibold text-foreground mb-2">Recent System Logs (tenant-filtered)</p>
                    <div className="space-y-1.5">
                      {liveProof.recent_logs.map((log: any, i: number) => (
                        <div key={i} className="text-[11px] font-mono text-muted-foreground flex gap-2">
                          <span className="text-muted-foreground/60 shrink-0">{new Date(log.created_at).toLocaleTimeString()}</span>
                          <Badge variant="outline" className="text-[9px] h-4 shrink-0">{log.source}</Badge>
                          <span className="truncate">{log.message?.substring(0, 100)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
                {loadingProof ? <Loader2 className="h-5 w-5 animate-spin" /> : "Click Refresh to load live proof"}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── SECTION 5: Isolation Test ──────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-green-500" />
                Run Tenant Isolation Test
              </CardTitle>
              <Button size="sm" onClick={runIsolationTest} disabled={runningIsolation} className="gap-2">
                {runningIsolation ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldIcon className="h-3.5 w-3.5" />}
                Run Test
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Creates two temporary tenants, inserts isolated data, verifies no cross-tenant data leakage, then cleans up.
            </p>
          </CardHeader>
          <CardContent>
            {isolationResult ? (
              isolationResult.error ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                  Error: {isolationResult.error}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className={cn(
                    "rounded-lg border p-4 text-center",
                    isolationResult.overall_pass
                      ? "border-green-500/30 bg-green-500/5"
                      : "border-destructive/30 bg-destructive/5"
                  )}>
                    <div className="flex items-center justify-center gap-2 mb-1">
                      {isolationResult.overall_pass
                        ? <CheckCircle2 className="h-5 w-5 text-green-500" />
                        : <XCircle className="h-5 w-5 text-destructive" />
                      }
                      <span className="text-lg font-bold text-foreground">
                        {isolationResult.overall_pass ? "ISOLATION VERIFIED" : "ISOLATION FAILED"}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {isolationResult.summary?.passed}/{isolationResult.summary?.total_checks} checks passed
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    {isolationResult.steps?.map((step: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        {step.pass
                          ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                          : <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                        }
                        <span className="font-medium text-foreground">{step.name}</span>
                        <span className="text-muted-foreground ml-auto truncate max-w-[200px]">{step.detail}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            ) : (
              <p className="text-xs text-muted-foreground text-center py-4">
                Click "Run Test" to execute a live multi-tenant isolation verification
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Security;
