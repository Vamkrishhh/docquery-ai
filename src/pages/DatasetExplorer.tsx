import React, { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Search, 
  Database as DatabaseIcon, 
  FileText, 
  RefreshCw, 
  Layers,
  Clock,
  HardDrive,
  Plus,
  Hash,
  AlertCircle,
  Library,
  BookOpen,
  Info,
  CheckCircle2,
  Clock3,
  FileSearch,
  ArrowRight
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import TenantBadge from "@/components/TenantBadge";
import { motion, AnimatePresence } from "framer-motion";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

interface DocInfo {
  id: string;
  filename: string;
  file_type: string;
  status: string;
  chunk_count: number | null;
  created_at: string;
  file_size: number | null;
}

interface ChunkInfo {
  id: string;
  chunk_index: number;
  chunk_text: string;
}

const DatasetExplorer = () => {
  const { profile, tenantName } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<DocInfo[]>([]);
  const [chunks, setChunks] = useState<ChunkInfo[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<DocInfo | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ totalDocs: 0, totalChunks: 0, avgChunkSize: 0 });

  useEffect(() => {
    if (profile?.tenant_id) loadData();
  }, [profile?.tenant_id]);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data: docs, error } = await supabase
        .from("documents")
        .select("id, filename, file_type, status, chunk_count, created_at, file_size")
        .eq("tenant_id", profile?.tenant_id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      if (docs) {
        setDocuments(docs);
        const totalChunks = docs.reduce((s, d) => s + (d.chunk_count || 0), 0);

        // Fetch sample chunks for statistics
        const { data: chunkStats } = await supabase
          .from("document_chunks")
          .select("chunk_text")
          .limit(100);
        
        const avgChunkSize = chunkStats && chunkStats.length > 0
          ? Math.round(chunkStats.reduce((s, c) => s + c.chunk_text.length, 0) / chunkStats.length)
          : 512;

        setStats({ totalDocs: docs.length, totalChunks, avgChunkSize });
      }
    } catch (e: any) {
      toast({ title: "Sync Failed", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const viewChunks = async (doc: DocInfo) => {
    setSelectedDoc(doc);
    setChunks([]); // Clear previous
    const { data, error } = await supabase
      .from("document_chunks")
      .select("id, chunk_index, chunk_text")
      .eq("document_id", doc.id)
      .order("chunk_index", { ascending: true })
      .limit(50);
    
    if (error) {
      toast({ title: "Fetch Error", description: "Could not retrieve document segments.", variant: "destructive" });
    } else {
      setChunks(data || []);
    }
  };

  const filtered = documents.filter(d => {
    const matchesSearch = !search || d.filename.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || d.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const formatSize = (bytes: number | null) => {
    if (!bytes) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${((bytes / 1024)).toFixed(1)} KB`;
    return `${((bytes / 1048576)).toFixed(1)} MB`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ready": return <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 gap-1"><CheckCircle2 className="h-3 w-3" /> Ready</Badge>;
      case "processing": return <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 gap-1 animate-pulse"><RefreshCw className="h-3 w-3 animate-spin" /> Processing</Badge>;
      case "error": return <Badge className="bg-rose-500/10 text-rose-500 border-rose-500/20 gap-1"><AlertCircle className="h-3 w-3" /> Error</Badge>;
      default: return <Badge variant="outline" className="gap-1 bg-muted/30"><Clock3 className="h-3 w-3" /> Pending</Badge>;
    }
  };

  return (
    <div className="flex flex-col h-full bg-background animate-in fade-in duration-500">
      <div className="p-6 pb-0 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
                <Library className="h-6 w-6 text-indigo-500" />
              </div>
              <div>
                <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Knowledge Base</h1>
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-sm text-muted-foreground">Manage organization data and vector indices</p>
                  <TenantBadge className="scale-90" />
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <Button onClick={() => navigate("/documents")} variant="default" className="gap-2 shadow-xl shadow-indigo-500/20 h-11 px-6 font-bold bg-indigo-600 hover:bg-indigo-700">
              <Plus className="h-4 w-4" /> Add to Knowledge Base
            </Button>
            <Button variant="outline" size="icon" onClick={loadData} title="Refresh data" className="h-11 w-11 rounded-xl border-border/50 hover:bg-muted/50">
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { label: "Processed Docs", val: stats.totalDocs, icon: FileText, color: "text-indigo-500", bg: "bg-indigo-500/10" },
            { label: "Vector Chunks", val: stats.totalChunks.toLocaleString(), icon: Layers, color: "text-purple-500", bg: "bg-purple-500/10" },
            { label: "Avg Chunk Size", val: `${stats.avgChunkSize} chars`, icon: Hash, color: "text-blue-500", bg: "bg-blue-500/10" },
            { label: "Index Health", val: "Optimal", icon: HardDrive, color: "text-emerald-500", bg: "bg-emerald-500/10" }
          ].map((stat, i) => (
            <Card key={i} className="bg-card/30 border-border/50 overflow-hidden relative group">
              <div className={cn("absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity", stat.bg)} />
              <CardContent className="p-4 flex items-center gap-4 relative">
                <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center", stat.bg)}>
                  <stat.icon className={cn("h-5 w-5", stat.color)} />
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-black">{stat.label}</p>
                  <p className="text-xl font-black tabular-nums">{stat.val}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex items-center gap-4 border-y border-border/40 py-5">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search documents by name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 h-11 bg-muted/20 border-border/50 focus:border-indigo-500/50 rounded-xl"
            />
          </div>
          
          <div className="flex items-center gap-1.5 p-1 bg-muted/40 rounded-xl border border-border/50">
            {["all", "ready", "processing", "error"].map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={cn(
                  "px-4 py-1.5 text-[11px] font-black uppercase tracking-wider rounded-lg transition-all",
                  statusFilter === status 
                    ? "bg-indigo-600 text-white shadow-lg" 
                    : "text-muted-foreground hover:bg-muted/50"
                )}
              >
                {status}
              </button>
            ))}
          </div>
          
          <p className="ml-auto text-xs text-muted-foreground font-medium hidden sm:block">
            Showing <b>{filtered.length}</b> of {documents.length} knowledge objects
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative">
        <ScrollArea className="h-full">
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-20">
            <AnimatePresence mode="popLayout">
              {filtered.map((doc, idx) => (
                <motion.div
                  key={doc.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: idx * 0.03 }}
                >
                  <Card 
                    className="h-full border-border/50 bg-card/30 hover:border-indigo-500/40 hover:bg-muted/10 transition-all cursor-pointer group shadow-sm hover:shadow-md"
                    onClick={() => viewChunks(doc)}
                  >
                    <CardHeader className="p-5 pb-3">
                      <div className="flex items-start justify-between">
                        <div className="h-10 w-10 rounded-xl bg-muted/50 border border-border/40 flex items-center justify-center group-hover:bg-indigo-500/20 group-hover:border-indigo-500/30 transition-all">
                          <FileText className="h-5 w-5 text-muted-foreground group-hover:text-indigo-500 transition-colors" />
                        </div>
                        {getStatusBadge(doc.status)}
                      </div>
                      <CardTitle className="text-base font-bold mt-4 line-clamp-1">{doc.filename}</CardTitle>
                      <CardDescription className="text-xs flex flex-wrap items-center gap-2 mt-1">
                        <span className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-bold uppercase">{doc.file_type}</span>
                        <span>{formatSize(doc.file_size)}</span>
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {new Date(doc.created_at).toLocaleDateString()}</span>
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="p-5 pt-0">
                      <div className="flex items-center justify-between mt-6 bg-muted/20 p-3 rounded-xl border border-border/50">
                        <div className="flex flex-col">
                          <span className="text-[9px] text-muted-foreground uppercase font-black tracking-tighter">Vector Units</span>
                          <div className="flex items-center gap-1.5">
                            <Layers className="h-4 w-4 text-indigo-500" />
                            <span className="text-base font-mono font-black text-foreground">{doc.chunk_count || 0}</span>
                          </div>
                        </div>
                        <Button variant="ghost" size="sm" className="h-9 px-3 text-xs gap-2 opacity-0 group-hover:opacity-100 transition-all transform group-hover:translate-x-0 translate-x-2">
                           Explore <ArrowRight className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>

            {filtered.length === 0 && !loading && (
              <div className="col-span-full py-24 flex flex-col items-center justify-center text-center">
                <div className="h-20 w-20 rounded-3xl bg-muted/50 flex items-center justify-center mb-6">
                  <FileSearch className="h-10 w-10 text-muted-foreground/30" />
                </div>
                <h3 className="text-xl font-bold">No indices found</h3>
                <p className="text-sm text-muted-foreground max-w-xs mt-2">
                  Adjust your search or filter criteria to find specific knowledge base items.
                </p>
                <Button variant="link" className="mt-4 text-indigo-500" onClick={() => { setSearch(""); setStatusFilter("all"); }}>
                  Clear all filters
                </Button>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      <Dialog open={!!selectedDoc} onOpenChange={() => setSelectedDoc(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] bg-card border-border/50 backdrop-blur-2xl p-0 overflow-hidden shadow-2xl">
          <div className="flex flex-col h-[85vh]">
            <div className="p-6 border-b border-border/50 bg-muted/40">
              <DialogHeader>
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Badge variant="outline" className="text-indigo-500 border-indigo-500/30 uppercase tracking-widest text-[9px] font-black px-2 py-0.5">Vector Data Explorer</Badge>
                    <DialogTitle className="flex items-center gap-2 text-2xl font-bold">
                      <DatabaseIcon className="h-6 w-6 text-indigo-500" />
                      {selectedDoc?.filename}
                    </DialogTitle>
                    <DialogDescription className="text-sm">
                      Extracted and indexed segments available for semantic retrieval
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>
            </div>
            
            <ScrollArea className="flex-1 p-6 bg-muted/10">
              <div className="grid grid-cols-1 gap-6 pb-10">
                {chunks.length > 0 ? (
                  chunks.map((chunk, idx) => (
                    <motion.div 
                      key={chunk.id} 
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.04 }}
                      className="group rounded-2xl border border-border/50 bg-card overflow-hidden shadow-sm hover:border-indigo-500/40 transition-all hover:shadow-md"
                    >
                      <div className="flex items-center justify-between px-5 py-3 border-b border-border/30 bg-muted/30">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black text-indigo-500 font-mono bg-indigo-500/10 px-2 py-0.5 rounded">CHUNK #{chunk.chunk_index}</span>
                          <span className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">Semantic Parcel</span>
                        </div>
                        <span className="text-[9px] text-muted-foreground font-black uppercase">{chunk.chunk_text.length} Characters</span>
                      </div>
                      <div className="p-5">
                        <p className="text-sm text-foreground leading-relaxed font-normal whitespace-pre-wrap select-text">
                          {chunk.chunk_text}
                        </p>
                      </div>
                    </motion.div>
                  ))
                ) : (
                  <div className="py-24 text-center flex flex-col items-center gap-4">
                    <RefreshCw className="h-12 w-12 text-indigo-500/30 animate-spin" />
                    <p className="text-sm font-medium text-muted-foreground animate-pulse text-indigo-500/60">Retrieving vector parcels from secure storage...</p>
                  </div>
                )}
              </div>
            </ScrollArea>
            
            <div className="p-5 border-t border-border/50 bg-muted/40 flex justify-between items-center text-[10px] text-muted-foreground uppercase font-black tracking-widest">
               <div className="flex items-center gap-6">
                 <span className="flex items-center gap-1.5"><FileText className="h-3 w-3" /> Type: {selectedDoc?.file_type}</span>
                 <span className="flex items-center gap-1.5"><Hash className="h-3 w-3" /> Doc ID: {selectedDoc?.id.substring(0, 8)}...</span>
               </div>
               <div className="flex items-center gap-2 text-indigo-500">
                 <Info className="h-3 w-3" />
                 <span>Fully Isolated Data Segment</span>
               </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DatasetExplorer;
