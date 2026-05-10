import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  AlertTriangle, Bookmark, BookmarkCheck, Calendar, CheckCircle2, ChevronDown, Clock,
  Command, Eye, FileText, Filter, Hash, HardDrive, Layers, Loader2, RefreshCw, Search,
  Sparkles, Trash2, Upload, User, X,
  PlusCircle,
  Copy,
  ChevronRight,
  History,
  RotateCcw,
  AlignLeft,
  SearchX,
  Tag as TagIconLine, CheckSquare, Square, MinusSquare, Palette, MoreVertical, Settings2,
  Plus, Trash, Tag, Activity, Database as DatabaseIcon
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import TenantBadge from "@/components/TenantBadge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Document {
  id: string;
  filename: string;
  file_type: string;
  file_path: string;
  file_size: number | null;
  status: string;
  chunk_count: number | null;
  created_at: string;
  uploaded_by: string;
  current_version?: number;
  processing_time_ms?: number | null;
  tags?: string[];
  category?: string;
  summary?: string;
}

interface DocumentVersion {
  id: string;
  document_id: string;
  version_number: number;
  storage_path: string;
  uploaded_at: string;
  uploaded_by: string;
  file_size: number | null;
  chunk_count: number | null;
  notes?: string | null;
}

interface DocumentTag {
  id: string;
  document_id: string;
  tag_name: string;
  color: string;
  created_at: string;
}

interface ChunkPreview {
  id: string;
  chunk_index: number;
  chunk_text: string;
}

interface Filters {
  docType: string;   // "all" | "pdf" | "txt" | "docx"
  status: string;    // "all" | "ready" | "processing" | "error"
  dateRange: string; // "all" | "7d" | "30d" | "custom"
  customFrom: string;
  customTo: string;
  sizeRange: string; // "all" | "small" | "medium" | "large"
  uploader: string;  // "all" | "me" (extend as needed)
  category: string;
}

interface SavedFilter {
  id: string;
  name: string;
  filters: Filters;
  query: string;
}

const DEFAULT_FILTERS: Filters = {
  docType: "all",
  status: "all",
  dateRange: "all",
  customFrom: "",
  customTo: "",
  sizeRange: "all",
  uploader: "all",
  category: "all",
};

const formatSize = (bytes: number | null) => {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDate = (dateStr: string) =>
  new Date(dateStr).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

const TAG_COLORS = [
  "bg-red-500/20 text-red-300 border-red-500/30",
  "bg-orange-500/20 text-orange-300 border-orange-500/30",
  "bg-amber-500/20 text-amber-300 border-amber-500/30",
  "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  "bg-green-500/20 text-green-300 border-green-500/30",
  "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  "bg-teal-500/20 text-teal-300 border-teal-500/30",
  "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
  "bg-sky-500/20 text-sky-300 border-sky-500/30",
  "bg-blue-500/20 text-blue-300 border-blue-500/30",
  "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
  "bg-violet-500/20 text-violet-300 border-violet-500/30",
  "bg-purple-500/20 text-purple-300 border-purple-500/30",
  "bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/30",
  "bg-pink-500/20 text-pink-300 border-pink-500/30",
  "bg-rose-500/20 text-rose-300 border-rose-500/30",
];

const generateTagColor = (tagName: string) => {
  let hash = 0;
  for (let i = 0; i < tagName.length; i++) hash = tagName.charCodeAt(i) + ((hash << 5) - hash);
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
};

const FilterSelect = ({
  label, value, onChange, options, icon: Icon,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  icon?: React.ElementType;
}) => (
  <div className="flex flex-col gap-1.5">
    <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/80 flex items-center gap-1.5 ml-1">
      {Icon && <Icon className="h-2.5 w-2.5 text-primary/50" />}
      {label}
    </label>
    <div className="relative group">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "w-full appearance-none rounded-xl border px-3.5 py-2.5 pr-9 text-xs font-semibold",
          "bg-card/40 backdrop-blur-md transition-all duration-300 cursor-pointer",
          "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50",
          "hover:border-primary/30 hover:bg-card/60",
          value !== "all"
            ? "border-primary/40 text-primary bg-primary/[0.03]"
            : "border-border/40 text-foreground/90"
        )}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-popover text-foreground">{o.label}</option>
        ))}
      </select>
      <ChevronDown className={cn(
        "pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 transition-all duration-300",
        value !== "all" ? "text-primary rotate-180" : "text-muted-foreground group-hover:text-foreground"
      )} />
    </div>
  </div>
);

const Documents = () => {
  const { session, profile, tenantName } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [documents, setDocuments] = useState<Document[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
  const [tags, setTags] = useState<DocumentTag[]>([]);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [newTagInput, setNewTagInput] = useState<{ [docId: string]: string }>({});
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkTagAction, setBulkTagAction] = useState<"add" | "remove">("add");
  const [bulkTagName, setBulkTagName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [chunks, setChunks] = useState<ChunkPreview[]>([]);
  const [loadingChunks, setLoadingChunks] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [summarizing, setSummarizing] = useState(false);
  const [conflictFile, setConflictFile] = useState<{ file: File; existingDoc: Document } | null>(null);
  const [docVersions, setDocVersions] = useState<DocumentVersion[]>([]);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const loadDocuments = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.from("documents").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      setDocuments((data as Document[]) || []);

      // Check storage bucket
      try {
        const { data: bucket, error: bucketError } = await supabase.storage.getBucket("documents");
        if (bucketError) {
          console.warn("Storage 'documents' bucket not found");
        }
      } catch (e) {
        console.warn("Error checking bucket");
      }

      const { data: tagData, error: tagError } = await supabase.from("document_tags").select("*");
      if (tagError) console.warn("document_tags table missing", tagError.message);
      if (tagData) setTags(tagData as DocumentTag[]);
    } catch (error: any) {
      toast({ title: "Fetch failed", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [profile, toast]);

  useEffect(() => { 
    loadDocuments();
    
    // Polling for processing documents
    pollRef.current = setInterval(() => {
      const processing = documents.some(d => d.status === "pending" || d.status === "processing");
      if (processing) {
        loadDocuments();
      }
    }, 5000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [loadDocuments, documents]);
  
  useEffect(() => {
    const cats = Array.from(new Set(documents.map(d => d.category).filter(Boolean))) as string[];
    setAvailableCategories(cats);
  }, [documents]);

  const addTag = async (docId: string, tagName: string) => {
    if (!tagName.trim() || !profile) return;
    const normalized = tagName.trim().toUpperCase();
    const color = generateTagColor(normalized);
    const { data, error } = await supabase.from("document_tags").insert({ document_id: docId, tag_name: normalized, color }).select().single();
    if (!error && data) {
      setTags([...tags, data as DocumentTag]);
      setNewTagInput({ ...newTagInput, [docId]: "" });
    }
  };

  const removeTag = async (tagId: string) => {
    const { error } = await supabase.from("document_tags").delete().eq("id", tagId);
    if (!error) setTags(tags.filter(t => t.id !== tagId));
  };

  const processUpload = async (file: File, existingId?: string) => {
    if (!session || !profile) return;
    setUploading(true);
    setUploadProgress(10);
    const ext = file.name.split(".").pop()?.toLowerCase();
    const filePath = `${profile.tenant_id}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from("documents").upload(filePath, file);
    if (uploadError) { toast({ title: "Upload failed", variant: "destructive" }); setUploading(false); return; }
    setUploadProgress(50);
    if (existingId) {
      await supabase.from("documents").update({ file_path: filePath, file_size: file.size, status: "pending", current_version: 1 }).eq("id", existingId);
      supabase.functions.invoke("process-document", { body: { document_id: existingId } });
    } else {
      const { data: doc } = await (supabase.from("documents") as any).insert({ filename: file.name, file_type: ext || "unknown", file_path: filePath, file_size: file.size, status: "pending", tenant_id: profile.tenant_id, uploaded_by: session.user.id }).select("id").single();
      if (doc) supabase.functions.invoke("process-document", { body: { document_id: doc.id } });
    }
    setUploadProgress(100);
    setTimeout(() => { setUploading(false); loadDocuments(); }, 1000);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !session || !profile) return;
    for (const file of Array.from(files)) {
      const existing = documents.find(d => d.filename === file.name);
      if (existing) { setConflictFile({ file, existingDoc: existing }); break; }
      else await processUpload(file);
    }
    e.target.value = "";
  };

  const resolveConflict = async (choice: 'new_version' | 'separate') => {
    if (!conflictFile) return;
    const { file, existingDoc } = conflictFile;
    setConflictFile(null);
    if (choice === 'new_version') await processUpload(file, existingDoc.id);
    else await processUpload(new File([file], `(Copy) ${file.name}`, { type: file.type }));
  };

  const handleDelete = async (doc: Document) => {
    setDeleting(doc.id);
    await supabase.storage.from("documents").remove([doc.file_path]);
    await supabase.from("documents").delete().eq("id", doc.id);
    setDocuments(documents.filter(d => d.id !== doc.id));
    setDeleting(null);
  };

  const revertToVersion = async (version: DocumentVersion) => {
    if (!selectedDoc) return;
    await supabase.from("documents").update({ file_path: version.storage_path, status: "ready", current_version: version.version_number }).eq("id", selectedDoc.id);
    loadDocuments();
  };

  const summarizeDocument = async (doc: Document) => {
    if (!doc.id) return;
    setSummarizing(true);
    try {
      await supabase.functions.invoke("rag-query", { 
        body: { 
          mode: "summarize", 
          question: "Summarize this document in 3-5 bullet points.", 
          document_id: doc.id,
          tenant_id: profile.tenant_id 
        } 
      });
      toast({ title: "Summarization Engaged" });
      setTimeout(loadDocuments, 4000);
    } catch (e: any) { toast({ title: "Failed", variant: "destructive" }); }
    finally { setSummarizing(false); }
  };

  const loadDocVersions = async (docId: string) => {
    const { data } = await supabase.from("document_versions").select("*").eq("document_id", docId).order("version_number", { ascending: false });
    if (data) setDocVersions(data as DocumentVersion[]);
  };

  const viewDocDetail = async (doc: Document) => {
    setSelectedDoc(doc);
    setLoadingChunks(true);
    loadDocVersions(doc.id);
    const { data } = await supabase.from("document_chunks").select("id, chunk_index, chunk_text").eq("document_id", doc.id).order("chunk_index", { ascending: true }).limit(50);
    setChunks((data as ChunkPreview[]) || []);
    setLoadingChunks(false);
  };

  const filteredDocs = documents.filter((doc) => {
    if (searchQuery && !doc.filename.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (selectedTag && !tags.some(t => t.document_id === doc.id && t.tag_name === selectedTag)) return false;
    if (filters.docType !== "all" && doc.file_type !== filters.docType) return false;
    if (filters.status !== "all" && doc.status !== filters.status) return false;
    if (filters.category !== "all" && doc.category !== filters.category) return false;
    return true;
  });

  const tagCounts = tags.reduce((acc: { [key: string]: number }, tag) => {
    acc[tag.tag_name] = (acc[tag.tag_name] || 0) + 1;
    return acc;
  }, {});
  const sortedTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 border-r border-border/50 bg-card/30 backdrop-blur-sm hidden lg:flex flex-col">
          <div className="p-6 border-b border-border/50">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-4">Labels & Tags</h3>
            <ScrollArea className="h-64">
              <div className="space-y-1">
                {sortedTags.map(([name, count]) => (
                  <Button key={name} variant="ghost" size="sm" onClick={() => setSelectedTag(selectedTag === name ? null : name)} className={cn("w-full justify-between h-8 text-xs", selectedTag === name && "bg-primary/10 text-primary")}>
                    <div className="flex items-center gap-2"><div className={cn("h-1.5 w-1.5 rounded-full", generateTagColor(name).split(" ")[0])} />{name}</div>
                    <Badge variant="outline" className="h-4 px-1 text-[8px]">{count}</Badge>
                  </Button>
                ))}
              </div>
            </ScrollArea>
          </div>
        </aside>

        {/* Main content */}
        <div className="flex-1 flex flex-col p-8 max-w-6xl mx-auto overflow-hidden">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Enterprise Knowledge Base</h1>
              <p className="text-xs text-muted-foreground">{tenantName} • {documents.length} Managed Records</p>
            </div>
            <div className="flex gap-2">
              <input type="file" id="file-up" className="hidden" multiple onChange={handleUpload} />
              <Button asChild className="rounded-xl font-bold">
                <label htmlFor="file-up" className="cursor-pointer flex items-center gap-2">
                  <Plus className="h-4 w-4" /> Add Knowledge
                </label>
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mb-6">
            <Button variant={filters.category === "all" ? "secondary" : "outline"} size="sm" onClick={() => setFilters({...filters, category: "all"})} className="h-8 rounded-full px-4 text-[10px] font-bold">ALL ARCHIVE</Button>
            {availableCategories.map(cat => (
              <Button key={cat} variant={filters.category === cat ? "secondary" : "outline"} size="sm" onClick={() => setFilters({...filters, category: cat})} className="h-8 rounded-full px-4 text-[10px] font-bold uppercase tracking-widest">
                <Sparkles className="h-3 w-3 mr-1.5 text-primary" /> {cat}
              </Button>
            ))}
          </div>

          <div className="flex flex-col gap-4 mb-8">
            <div className="flex gap-3">
              <div className="relative flex-1 group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                <Input 
                  placeholder="Search across enterprise knowledge..." 
                  value={searchQuery} 
                  onChange={(e) => setSearchQuery(e.target.value)} 
                  className="h-12 pl-12 rounded-2xl bg-card/40 border-border/40 focus:border-primary/50 shadow-sm transition-all" 
                />
              </div>
              <Sheet open={filterOpen} onOpenChange={setFilterOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" className={cn("h-12 px-5 rounded-2xl gap-2 font-bold border-border/40 transition-all", Object.values(filters).some(v => v !== "all") && "border-primary/50 bg-primary/5 text-primary")}>
                    <Filter className="h-4 w-4" />
                    <span className="hidden sm:inline">Advanced Filters</span>
                    {Object.values(filters).filter(v => v !== "all").length > 0 && (
                      <Badge className="h-5 w-5 p-0 flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px]">
                        {Object.values(filters).filter(v => v !== "all").length}
                      </Badge>
                    )}
                  </Button>
                </SheetTrigger>
                <SheetContent className="w-[340px] sm:w-[400px] bg-card/95 backdrop-blur-3xl border-l border-border/50">
                  <SheetHeader className="pb-6 border-b border-border/50">
                    <SheetTitle className="text-xl font-black uppercase tracking-widest italic flex items-center gap-2">
                       <Filter className="h-5 w-5 text-primary" /> Refine Archive
                    </SheetTitle>
                    <SheetDescription className="text-xs font-semibold uppercase tracking-tight opacity-60">Adjust criteria to narrow your search.</SheetDescription>
                  </SheetHeader>
                  <div className="py-8 space-y-8">
                    <FilterSelect 
                      label="Document Profile" 
                      value={filters.docType} 
                      onChange={(v) => setFilters({...filters, docType: v})}
                      icon={FileText}
                      options={[
                        { value: "all", label: "Any Extension" },
                        { value: "pdf", label: "Adobe PDF (Verified)" },
                        { value: "docx", label: "Word Document" },
                        { value: "txt", label: "Plain Text Fragment" },
                      ]} 
                    />
                    <FilterSelect 
                      label="Neural Status" 
                      value={filters.status} 
                      onChange={(v) => setFilters({...filters, status: v})}
                      icon={Activity}
                      options={[
                        { value: "all", label: "Global Status" },
                        { value: "ready", label: "Segmented & Ready" },
                        { value: "processing", label: "Neural Ingestion" },
                        { value: "error", label: "Integrity Failed" },
                      ]} 
                    />
                    <FilterSelect 
                      label="Data Volume" 
                      value={filters.sizeRange} 
                      onChange={(v) => setFilters({...filters, sizeRange: v})}
                      icon={HardDrive}
                      options={[
                        { value: "all", label: "Universal Size" },
                        { value: "small", label: "Below 5MB (Small)" },
                        { value: "medium", label: "5MB - 50MB" },
                        { value: "large", label: "Above 50MB (Large)" },
                      ]} 
                    />
                    <div className="pt-6 border-t border-border/50">
                      <Button variant="outline" className="w-full h-11 rounded-xl text-[11px] font-black uppercase tracking-widest gap-2 bg-muted/20" onClick={() => setFilters(DEFAULT_FILTERS)}>
                         <RefreshCw className="h-4 w-4" /> Reset Filters
                      </Button>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            </div>

            {/* Active Filter Badges */}
            <AnimatePresence>
              {(Object.values(filters).some(v => v !== "all") || searchQuery) && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }} 
                  animate={{ opacity: 1, y: 0 }} 
                  exit={{ opacity: 0, y: -10 }}
                  className="flex flex-wrap items-center gap-2 mt-4"
                >
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 mr-2">Active:</span>
                  {searchQuery && (
                    <Badge variant="secondary" className="h-7 pl-3 pr-2 gap-2 rounded-lg bg-primary/10 text-primary border-primary/20 text-[10px] uppercase font-bold group">
                      Query: {searchQuery}
                      <X className="h-3 w-3 cursor-pointer hover:scale-125 transition-transform" onClick={() => setSearchQuery("")} />
                    </Badge>
                  )}
                  {filters.docType !== "all" && (
                    <Badge variant="secondary" className="h-7 pl-3 pr-2 gap-2 rounded-lg bg-blue-500/10 text-blue-400 border-blue-500/20 text-[10px] uppercase font-bold">
                      Ext: {filters.docType}
                      <X className="h-3 w-3 cursor-pointer hover:scale-125 transition-transform" onClick={() => setFilters({...filters, docType: "all"})} />
                    </Badge>
                  )}
                  {filters.status !== "all" && (
                    <Badge variant="secondary" className="h-7 pl-3 pr-2 gap-2 rounded-lg bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px] uppercase font-bold">
                      Status: {filters.status}
                      <X className="h-3 w-3 cursor-pointer hover:scale-125 transition-transform" onClick={() => setFilters({...filters, status: "all"})} />
                    </Badge>
                  )}
                  {filters.category !== "all" && (
                    <Badge variant="secondary" className="h-7 pl-3 pr-2 gap-2 rounded-lg bg-purple-500/10 text-purple-400 border-purple-500/20 text-[10px] uppercase font-bold">
                      Cat: {filters.category}
                      <X className="h-3 w-3 cursor-pointer hover:scale-125 transition-transform" onClick={() => setFilters({...filters, category: "all"})} />
                    </Badge>
                  )}
                  <Button variant="ghost" className="h-7 px-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-destructive transition-colors ml-auto" onClick={() => { setSearchQuery(""); setFilters(DEFAULT_FILTERS); }}>
                     Clear All
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <ScrollArea className="flex-1">
            <div className="grid gap-4 pb-8">
              {filteredDocs.length > 0 ? filteredDocs.map((doc, i) => (
                <motion.div key={doc.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} onClick={() => viewDocDetail(doc)}>
                  <Card className="group hover:border-primary/40 cursor-pointer bg-card/20 backdrop-blur-md border-border/30 transition-all hover:bg-card/40 hover:-translate-y-0.5">
                    <CardContent className="p-5 flex items-center gap-5">
                      <div className="h-12 w-12 rounded-xl bg-primary/5 flex items-center justify-center text-primary group-hover:scale-110 transition-transform"><FileText className="h-6 w-6" /></div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-black tracking-tight group-hover:text-primary transition-colors truncate">{doc.filename}</p>
                        <div className="flex flex-wrap items-center gap-3 mt-1.5">
                          <Badge variant="outline" className="text-[9px] uppercase tracking-tighter bg-primary/5 border-primary/20 text-primary px-2">{doc.category || "Uncategorized"}</Badge>
                          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-bold uppercase tracking-tight">
                            <Clock className="h-3 w-3" /> {formatDate(doc.created_at)}
                          </div>
                          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-bold uppercase tracking-tight">
                            <HardDrive className="h-3 w-3" /> {formatSize(doc.file_size)}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="hidden sm:flex flex-col items-end gap-1">
                           <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Neural Status</p>
                           {doc.status === "ready" ? (
                             <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[9px] font-black uppercase">READY</Badge>
                           ) : doc.status === "error" ? (
                             <Badge className="bg-destructive/10 text-destructive border-destructive/20 text-[9px] font-black uppercase">FAILED</Badge>
                           ) : (
                             <div className="flex items-center gap-2">
                               <Loader2 className="h-3 w-3 animate-spin text-amber-500" />
                               <span className="text-[9px] font-black uppercase text-amber-500">INGESTING...</span>
                             </div>
                           )}
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-primary group-hover:translate-x-1 transition-all" />
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )) : (
                <div className="flex flex-col items-center justify-center py-20 text-center animate-in fade-in duration-500">
                  <div className="h-16 w-16 rounded-full bg-muted/20 flex items-center justify-center mb-4">
                    <SearchX className="h-8 w-8 text-muted-foreground/40" />
                  </div>
                  <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground">No matches in vault</h3>
                  <p className="text-xs text-muted-foreground/60 max-w-[200px] mt-1">Adjust filters or try a different search pattern to find your data.</p>
                  <Button variant="link" className="mt-4 text-[10px] font-black uppercase text-primary" onClick={() => { setSearchQuery(""); setFilters(DEFAULT_FILTERS); }}>Reset View</Button>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>

      <Dialog open={!!selectedDoc} onOpenChange={(o) => !o && setSelectedDoc(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col p-0">
          <DialogHeader className="p-6 border-b bg-muted/10">
            <DialogTitle className="flex items-center gap-2 font-bold"><FileText className="h-5 w-5 text-primary" /> {selectedDoc?.filename}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
             <div className="grid grid-cols-3 gap-4">
                <div className="bg-card border p-4 rounded-xl text-center"><DatabaseIcon className="h-4 w-4 mx-auto mb-1 text-primary" /><p className="text-lg font-black">{selectedDoc?.chunk_count || 0}</p><p className="text-[9px] font-bold text-muted-foreground">SEGMENTS</p></div>
                <div className="bg-card border p-4 rounded-xl text-center"><Activity className="h-4 w-4 mx-auto mb-1 text-primary" /><p className="text-lg font-black">{selectedDoc?.status.toUpperCase()}</p><p className="text-[9px] font-bold text-muted-foreground">STATUS</p></div>
                <div className="bg-card border p-4 rounded-xl text-center"><Clock className="h-4 w-4 mx-auto mb-1 text-primary" /><p className="text-lg font-black">{selectedDoc?.processing_time_ms || 0}MS</p><p className="text-[9px] font-bold text-muted-foreground">LATENCY</p></div>
             </div>

             {selectedDoc?.summary ? (
               <div className="bg-primary/[0.03] border border-primary/20 rounded-2xl p-6 space-y-3">
                  <h4 className="text-xs font-black uppercase tracking-widest flex items-center gap-2 text-primary"><Sparkles className="h-4 w-4" /> AI Research Summary</h4>
                  <p className="text-sm font-medium leading-relaxed whitespace-pre-wrap italic opacity-90">"{selectedDoc.summary}"</p>
               </div>
             ) : (
               <div className="bg-muted/20 border border-dashed rounded-2xl p-8 text-center space-y-4">
                  <p className="text-xs text-muted-foreground">Perform neural extraction to generate a high-level executive summary.</p>
                  <Button onClick={() => selectedDoc && summarizeDocument(selectedDoc)} disabled={summarizing} className="h-9 px-6 bg-primary font-bold rounded-xl">
                    {summarizing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />} Generate Executive Summary
                  </Button>
               </div>
             )}

             <div className="space-y-3">
                <h4 className="text-xs font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2"><Hash className="h-3 w-3" /> Vector Fragments</h4>
                {loadingChunks ? <div className="space-y-2"><div className="h-10 bg-muted animate-pulse rounded-lg" /></div> : (
                  <div className="space-y-2">
                    {chunks.map(c => (
                      <div key={c.id} className="p-3 bg-muted/20 border rounded-lg text-xs font-medium leading-relaxed">
                        <span className="text-[9px] font-black text-primary mr-2">#{c.chunk_index}</span> {c.chunk_text.slice(0, 300)}...
                      </div>
                    ))}
                  </div>
                )}
             </div>
          </div>
        </DialogContent>
      </Dialog>
      
      <Dialog open={!!conflictFile} onOpenChange={(o) => !o && setConflictFile(null)}>
        <DialogContent className="max-w-md p-6 text-center">
          <History className="h-10 w-10 text-amber-500 mx-auto mb-4" />
          <DialogTitle>Duplicate Conflict</DialogTitle>
          <p className="text-sm text-muted-foreground mt-2 mb-6">"{conflictFile?.file.name}" already exists. Create a new version or save as duplicate?</p>
          <div className="grid gap-2">
            <Button onClick={() => resolveConflict('new_version')}>Increment Version</Button>
            <Button variant="outline" onClick={() => resolveConflict('separate')}>Save as Copy</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Documents;
