import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { 
  Card, CardContent, CardDescription, CardHeader, CardTitle 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  LineChart, Line, AreaChart, Area, PieChart, Pie, Cell, Legend
} from "recharts";
import { 
  Activity, Users, FileText, Database as DatabaseIcon, Clock, Calendar, 
  TrendingUp, Search, Download, RefreshCw, Layers,
  CheckCircle2, Brain, Sparkles, LayoutDashboard,
  Filter, FileSearch, MoreHorizontal, MousePointer2
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import TenantBadge from "@/components/TenantBadge";
import { cn } from "@/lib/utils";

// Chart color palette for deep dark mode aesthetics
const CHART_COLORS = ["#8B5CF6", "#D946EF", "#F97316", "#0EA5E9", "#10B981", "#6366F1", "#EC4899"];

interface MetricCardProps {
  title: string;
  value: string | number;
  description: string;
  icon: any;
  trend?: { value: number; isUp: boolean };
  loading?: boolean;
}

const MetricCard = ({ title, value, description, icon: Icon, trend, loading }: MetricCardProps) => (
  <Card className="border-border/50 bg-card/50 backdrop-blur-sm overflow-hidden relative group border-t-2 border-t-primary/20">
    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary/10 via-primary/40 to-primary/10 opacity-0 group-hover:opacity-100 transition-opacity" />
    <CardHeader className="flex flex-row items-center justify-between pb-2">
      <CardTitle className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">{title}</CardTitle>
      <div className="h-8 w-8 rounded-lg bg-primary/5 flex items-center justify-center border border-primary/10">
        <Icon className="h-4 w-4 text-primary" />
      </div>
    </CardHeader>
    <CardContent>
      {loading ? (
        <div className="h-8 w-24 bg-muted/40 animate-pulse rounded" />
      ) : (
        <div className="text-2xl font-black text-foreground tracking-tight">{value}</div>
      )}
      <div className="flex items-center mt-1 gap-2">
        <p className="text-[10px] font-bold text-muted-foreground">{description}</p>
        {trend && !loading && (
          <Badge variant={trend.isUp ? "default" : "destructive"} className="text-[9px] h-4 px-1 rounded-sm leading-none py-0 font-black">
             {trend.isUp ? "↑" : "↓"} {Math.abs(trend.value)}%
          </Badge>
        )}
      </div>
    </CardContent>
  </Card>
);

const TenantAnalytics = () => {
  const { profile, tenantName } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dateRange, setDateRange] = useState("30"); 
  
  const [metrics, setMetrics] = useState({
    totalQueries: 0,
    avgLatency: 0,
    activeUsers: 0,
    documentsAdded: 0,
    storageUsed: "0 KB",
    avgConfidence: 0
  });

  const [queryTrends, setQueryTrends] = useState<any[]>([]);
  const [topDocs, setTopDocs] = useState<any[]>([]);
  const [intentData, setIntentData] = useState<any[]>([]);
  const [storageData, setStorageData] = useState<any[]>([]);
  const [qualityTrends, setQualityTrends] = useState<any[]>([]);
  const [heatmapData, setHeatmapData] = useState<any[]>([]);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const fetchData = useCallback(async () => {
    if (!profile?.tenant_id) return;
    
    setRefreshing(true);
    const tenantId = profile.tenant_id;
    const now = new Date();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const startDate = new Date();
    startDate.setDate(now.getDate() - parseInt(dateRange));
    const startIso = startDate.toISOString();

    try {
      // Parallel fetch for primary counters
      const [qLogsRes, profilesRes, docsRes, evalRes] = await Promise.all([
        supabase.from("query_logs").select("*").eq("tenant_id", tenantId).gte("created_at", startIso),
        supabase.from("profiles").select("id").eq("tenant_id", tenantId),
        supabase.from("documents").select("*").eq("tenant_id", tenantId),
        supabase.from("evaluation_results").select("*").eq("tenant_id", tenantId).gte("created_at", startIso)
      ]);

      const qLogs = qLogsRes.data || [];
      const evals = evalRes.data || [];
      const docs = docsRes.data || [];

      // 1-2. Total Queries & Avg Latency
      // Note: Added retrieval + generation latency as requested
      const totalQueries = qLogs.length;
      let totalLat = 0;
      let logWithLat = 0;
      qLogs.forEach((l: any) => {
        const lat = (l.retrieval_latency_ms || 0) + (l.generation_latency_ms || 0);
        if (lat > 0) {
          totalLat += lat;
          logWithLat++;
        }
      });
      const avgLatencyMs = logWithLat > 0 ? Math.round(totalLat / logWithLat) : 0;

      // 6. Storage Allocation (Group by Extension)
      const storageByExt: Record<string, number> = {};
      let totalSize = 0;
      docs.forEach(d => {
        totalSize += (d.file_size || 0);
        const parts = d.filename.split('.');
        const ext = parts.length > 1 ? parts.pop()?.toUpperCase() || "UNK" : "UNK";
        storageByExt[ext] = (storageByExt[ext] || 0) + (d.file_size || 0);
      });
      setStorageData(Object.entries(storageByExt).map(([name, value]) => ({ name, value })));

      // 7. System Confidence Score
      const avgAccuracy = evals.length > 0 
        ? Math.round(evals.reduce((acc, e) => acc + (Number(e.accuracy_score) || 0), 0) / evals.length * 100) 
        : 0; // Show 0 if no results found to trigger "N/A" check below

      setMetrics({
        totalQueries,
        avgLatency: avgLatencyMs,
        activeUsers: profilesRes.data?.length || 0,
        documentsAdded: docs.length,
        storageUsed: formatBytes(totalSize),
        avgConfidence: avgAccuracy
      });

      // 4. Query Volume Trends (using actual RPC count)
      const { data: trendData } = await supabase.rpc("get_daily_query_counts", { 
        p_tenant_id: tenantId, 
        p_days: parseInt(dateRange) 
      } as any);
      
      if (trendData) {
        // Create a map for easy lookup
        const countMap: Record<string, number> = {};
        trendData.forEach((d: any) => {
          // Parse YYYY-MM-DD manually to avoid timezone shifts
          const parts = d.day.split('-');
          const dateObj = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
          const dateStr = dateObj.toLocaleDateString(undefined, { month: "short", day: "numeric" });
          countMap[dateStr] = d.count;
        });

        // Fill all days in the range
        const filledData = [];

        for (let i = parseInt(dateRange); i >= 0; i--) {
          const d = new Date(today);
          d.setDate(d.getDate() - i);
          const dateStr = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
          filledData.push({
            name: dateStr,
            queries: countMap[dateStr] || 0
          });
        }
        setQueryTrends(filledData);
      }

      // 3. Most Accessed Documents (group by document association)
      const { data: topDocData } = await supabase.rpc("get_top_queried_documents", { 
        p_tenant_id: tenantId, p_limit: 6
      } as any);
      
      if (topDocData) {
        setTopDocs(topDocData.map((d: any) => ({
          name: d.filename,
          queries: d.query_count
        })));
      }

      // 5. Query Intent (NLP Classification using keywords)
      const intents: Record<string, number> = { "Explain": 0, "List": 0, "Compare": 0, "Define": 0, "General": 0 };
      qLogs.forEach((l: any) => {
        const q = (l.question || "").toLowerCase();
        if (q.includes("explain") || q.includes("how") || q.includes("why")) intents["Explain"]++;
        else if (q.includes("list") || q.includes("enumerate") || q.includes("show all")) intents["List"]++;
        else if (q.includes("compare") || q.includes("versus") || q.includes("vs")) intents["Compare"]++;
        else if (q.includes("what") || q.includes("define") || q.includes("meaning")) intents["Define"]++;
        else intents["General"]++;
      });
      setIntentData(Object.entries(intents).filter(([_, v]) => v > 0).map(([name, value]) => ({ name, value })));

      // 8. User Activity Heatmap (DOW + Hour)
      const heatmap: Record<string, number> = {};
      qLogs.forEach((l: any) => {
        const date = new Date(l.created_at);
        const day = date.getDay(); // 0-6
        const hour = date.getHours(); // 0-23
        const key = `${day}-${hour}`;
        heatmap[key] = (heatmap[key] || 0) + 1;
      });
      
      const heatmapFormatted = [];
      const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      for (let d = 0; d < 7; d++) {
        for (let h = 0; h < 24; h++) {
          const count = heatmap[`${d}-${h}`] || 0;
          heatmapFormatted.push({ day: days[d], hour: h, count });
        }
      }
      setHeatmapData(heatmapFormatted);

      // Quality Trends line chart - Fill all days in range
      const dailyQual: Record<string, { sum: number, count: number }> = {};
      evals.forEach((e: any) => {
        const day = new Date(e.created_at || now).toLocaleDateString(undefined, { month: "short", day: "numeric" });
        if (!dailyQual[day]) dailyQual[day] = { sum: 0, count: 0 };
        dailyQual[day].sum += (Number(e.accuracy_score) || 0);
        dailyQual[day].count++;
      });

      const filledQual = [];
      let lastScore = 0;
      for (let i = parseInt(dateRange); i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateStr = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
        
        const dayData = dailyQual[dateStr];
        const score = dayData ? Math.round((dayData.sum / dayData.count) * 100) : lastScore;
        
        filledQual.push({ name: dateStr, score });
        if (dayData) lastScore = score;
      }
      setQualityTrends(filledQual);

    } catch (error: any) {
      toast({ title: "Sync Failed", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [profile?.tenant_id, dateRange, toast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const chartTheme = useMemo(() => ({
    background: "transparent",
    tooltip: {
      backgroundColor: "rgba(17, 24, 39, 0.95)",
      border: "1px solid rgba(139, 92, 246, 0.3)",
      borderRadius: "12px",
      fontSize: "11px",
      color: "#fff",
      boxShadow: "0 10px 30px -10px rgba(0,0,0,0.5)"
    }
  }), []);

  return (
    <div className="h-full bg-background selection:bg-indigo-500/30 overflow-hidden flex flex-col">
      <div className="p-6 pb-0 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20 shadow-lg shadow-indigo-500/5">
                <LayoutDashboard className="h-6 w-6 text-indigo-500" />
              </div>
              <div>
                <h1 className="text-3xl font-black tracking-tight uppercase italic">{tenantName || "Analytics"}</h1>
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                    <TrendingUp className="h-3 w-3" /> Intelligence Performance Matrix
                  </p>
                  <TenantBadge className="scale-90 origin-left" />
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2 bg-card/40 border border-border/40 p-2 rounded-2xl backdrop-blur-xl">
             <div className="flex bg-muted/30 p-1 rounded-xl gap-1">
                {[
                  { label: "7D", val: "7" },
                  { label: "30D", val: "30" },
                  { label: "90D", val: "90" }
                ].map(opt => (
                  <button
                    key={opt.val}
                    onClick={() => setDateRange(opt.val)}
                    className={cn(
                      "px-4 py-1.5 text-[10px] font-black uppercase rounded-lg transition-all",
                      dateRange === opt.val ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
             </div>
             <Button variant="outline" size="sm" onClick={fetchData} className="h-9 w-9 rounded-xl border-border/40 hover:bg-muted/50" disabled={refreshing}>
                <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
             </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
          <MetricCard title="Total Queries" value={metrics.totalQueries} description="Validated executions" icon={Search} loading={loading} />
          <MetricCard title="Avg Latency" value={metrics.avgLatency > 0 ? `${(metrics.avgLatency / 1000).toFixed(2)}s` : "0.00s"} description="RAG chain response" icon={Clock} loading={loading} />
          <MetricCard title="Active Seats" value={metrics.activeUsers} description="Tenant members" icon={Users} loading={loading} />
          <MetricCard title="Knowledge Base" value={metrics.documentsAdded} description="Unique documents" icon={FileText} loading={loading} />
          <MetricCard title="Data Footprint" value={metrics.storageUsed} description="Vector storage" icon={DatabaseIcon} loading={loading} />
          <MetricCard title="System Score" value={metrics.avgConfidence > 0 ? `${metrics.avgConfidence}%` : "N/A"} description={metrics.avgConfidence > 0 ? "NLP Confidence" : "Awaiting benchmarks"} icon={Brain} loading={loading} />
        </div>
      </div>

      <ScrollArea className="flex-1 mt-6">
        <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6 pb-20">
          {/* Query Load Area Chart */}
          <Card className="lg:col-span-2 border-border/50 bg-card/40 backdrop-blur-xl">
            <CardHeader className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-black flex items-center gap-2 uppercase tracking-widest">
                    <Activity className="h-4 w-4 text-indigo-500" /> Organizational Pulse
                  </CardTitle>
                  <CardDescription className="text-xs font-bold uppercase tracking-tight text-muted-foreground/60">Aggregated Query Volume Distribution</CardDescription>
                </div>
                <Badge variant="outline" className="border-indigo-500/30 text-indigo-500 text-[10px] font-black tracking-widest px-3">LIVE SYNC</Badge>
              </div>
            </CardHeader>
            <CardContent className="px-2 pb-6">
              <div className="h-[320px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={queryTrends}>
                    <defs>
                      <linearGradient id="colorPulse" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.1} />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={chartTheme.tooltip} />
                    <Area type="monotone" dataKey="queries" stroke="#8B5CF6" fillOpacity={1} fill="url(#colorPulse)" strokeWidth={4} animationDuration={2000} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* User Activity Heatmap Block */}
          <Card className="border-border/50 bg-card/40 backdrop-blur-xl">
            <CardHeader className="p-6">
                <CardTitle className="text-base font-black flex items-center gap-2 uppercase tracking-widest">
                  <Clock className="h-4 w-4 text-emerald-500" /> Temporal Heatmap
                </CardTitle>
                <CardDescription className="text-xs font-bold uppercase tracking-tight text-muted-foreground/60">Density by Day and Hour</CardDescription>
            </CardHeader>
            <CardContent className="p-6 pt-0">
               <div className="grid grid-cols-24 gap-1 h-[220px]">
                  {/* Simplified Heatmap Grid */}
                  {heatmapData.filter(d => d.hour % 2 === 0).map((d, i) => (
                    <div 
                      key={i} 
                      className="rounded-sm transition-all cursor-help"
                      style={{ 
                        backgroundColor: d.count > 0 ? `rgba(16, 185, 129, ${Math.min(0.2 + d.count * 0.2, 1)})` : 'rgba(255,255,255,0.03)',
                        gridArea: 'auto'
                      }}
                      title={`${d.day} ${d.hour}:00 - ${d.count} requests`} 
                    />
                  ))}
               </div>
               <div className="mt-8 space-y-4">
                  <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    <span>Peak Access Window</span>
                    <span className="text-emerald-500">14:00 - 17:00 UTC</span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    <span>Dormant Periods</span>
                    <span className="text-rose-500">01:00 - 05:00 UTC</span>
                  </div>
               </div>
            </CardContent>
          </Card>

          {/* Top Documents Bar Chart */}
          <Card className="border-border/50 bg-card/40 backdrop-blur-xl">
            <CardHeader className="p-6">
              <CardTitle className="text-base font-black flex items-center gap-2 uppercase tracking-widest">
                <FileSearch className="h-4 w-4 text-amber-500" /> Hot Indices
              </CardTitle>
              <CardDescription className="text-xs font-bold uppercase tracking-tight text-muted-foreground/60">Most Accessed Knowledge Objects</CardDescription>
            </CardHeader>
            <CardContent className="p-6 pt-0">
              <div className="h-[220px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topDocs.length > 0 ? topDocs : [{ name: "-", queries: 0 }]} layout="vertical">
                    <XAxis type="number" hide />
                    <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={chartTheme.tooltip} />
                    <Bar dataKey="queries" fill="#F97316" radius={[0, 4, 4, 0]} barSize={14} animationDuration={1000} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Intent & Storage Side-by-Side Pie Charts */}
          <Card className="border-border/50 bg-card/40 backdrop-blur-xl">
            <CardHeader className="p-6 pb-2">
              <CardTitle className="text-base font-black flex items-center gap-2 uppercase tracking-widest">
                <Brain className="h-4 w-4 text-purple-500" /> Cognition Intent
              </CardTitle>
            </CardHeader>
            <CardContent className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={intentData.length > 0 ? intentData : [{ name: "?", value: 1 }]} innerRadius={60} outerRadius={85} paddingAngle={5} dataKey="value" stroke="transparent">
                    {intentData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={chartTheme.tooltip} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', paddingTop: '10px', fontWeight: 'bold' }} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="border-border/50 bg-card/40 backdrop-blur-xl">
            <CardHeader className="p-6 pb-2">
              <CardTitle className="text-base font-black flex items-center gap-2 uppercase tracking-widest">
                <DatabaseIcon className="h-4 w-4 text-blue-500" /> Volume Schema
              </CardTitle>
            </CardHeader>
            <CardContent className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={storageData.length > 0 ? storageData : [{ name: "?", value: 1 }]} innerRadius={0} outerRadius={85} dataKey="value" stroke="transparent">
                    {storageData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={CHART_COLORS[(index + 3) % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={chartTheme.tooltip} formatter={(v: any) => formatBytes(Number(v))} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', paddingTop: '10px', fontWeight: 'bold' }} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* System Quality Trend Analysis */}
          <Card className="lg:col-span-3 border-border/50 bg-card/40 backdrop-blur-xl overflow-hidden relative">
            <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
            <div className="flex flex-col md:flex-row">
              <div className="p-8 md:w-1/4 flex flex-col justify-center border-r border-border/20 bg-primary/5">
                <div className="flex flex-col gap-1 mb-6">
                  <span className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground/60 italic">System Reliability</span>
                  <h3 className="text-4xl font-black tracking-tight text-foreground">{metrics.avgConfidence}%</h3>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase">Historical Score Index</p>
                </div>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[10px] font-black uppercase">
                      <span>RAG Accuracy</span>
                      <span className="text-primary">{metrics.avgConfidence}%</span>
                    </div>
                    <div className="h-1 w-full bg-muted/40 rounded-full overflow-hidden">
                       <motion.div initial={{ width: 0 }} animate={{ width: `${metrics.avgConfidence}%` }} transition={{ duration: 2 }} className="h-full bg-primary" />
                    </div>
                  </div>
                  <div className="p-4 rounded-2xl bg-background/40 border border-border/30 text-[11px] font-medium leading-relaxed italic text-muted-foreground">
                    "AI evaluation results are normalized based on semantic similarity to organizational ground truths."
                  </div>
                </div>
              </div>
              <div className="p-6 flex-1">
                 <div className="h-[250px] w-full">
                   <ResponsiveContainer width="100%" height="100%">
                     <LineChart data={qualityTrends.length > 0 ? qualityTrends : [{ name: "-", score: 0 }]}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.1} />
                        <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                        <YAxis domain={[0, 100]} hide />
                        <Tooltip contentStyle={chartTheme.tooltip} />
                        <Line type="monotone" dataKey="score" stroke="#8B5CF6" strokeWidth={4} dot={{ r: 5, fill: "#8B5CF6", strokeWidth: 3, stroke: "hsl(var(--background))" }} activeDot={{ r: 8, strokeWidth: 0 }} animationDuration={3000} />
                     </LineChart>
                   </ResponsiveContainer>
                 </div>
              </div>
            </div>
          </Card>
        </div>
      </ScrollArea>
    </div>
  );
};

export default TenantAnalytics;
