import React, { useState, useEffect, useCallback } from "react";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogTrigger 
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search as SearchIcon, FileText, MessageSquare, Hash, Command, ArrowRight, Loader2, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface SearchResult {
  result_id: string;
  result_type: 'document' | 'chunk' | 'message';
  title: string;
  content: string;
  parent_id: string;
}

const GlobalSearch = ({ collapsed }: { collapsed?: boolean }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const { profile } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const handleSearch = useCallback(async (q: string) => {
    if (!q.trim() || !profile) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      let { data, error } = await supabase.rpc("unified_global_search", {
        search_query: q.split(' ').filter(w => w.length > 2).join(' | '),
        match_tenant_id: profile.tenant_id,
        max_results: 6
      });
      
      // Fallback if RPC is missing (PGRST202)
      if (error && (error.code === 'PGRST202' || error.message?.includes('not found'))) {
        console.warn("Unified search RPC missing, falling back to simple document search");
        const { data: fallbackData, error: fallbackError } = await supabase
          .from("documents")
          .select("id, filename")
          .ilike("filename", `%${q}%`)
          .limit(6);
        
        if (!fallbackError && fallbackData) {
          data = fallbackData.map(d => ({
            result_id: d.id,
            result_type: 'document',
            title: d.filename,
            content: "Document in knowledge base",
            parent_id: d.id
          }));
          error = null;
        }
      }

      if (error) throw error;
      setResults(data || []);
    } catch (err) {
      console.error("Global search error:", err);
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    const timer = setTimeout(() => handleSearch(query), 300);
    return () => clearTimeout(timer);
  }, [query, handleSearch]);

  const onSelect = (r: SearchResult) => {
    setOpen(false);
    setQuery("");
    if (r.result_type === 'document' || r.result_type === 'chunk') {
      navigate(`/documents?id=${r.parent_id}`);
    } else {
      navigate(`/chat?conversation=${r.parent_id}`);
    }
  };

  return (
    <div className="w-full px-2 mb-4">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <div className={cn(
            "group relative flex items-center gap-2 rounded-lg border border-sidebar-border/60 bg-sidebar-accent/30 p-2 cursor-pointer transition-all hover:bg-sidebar-accent hover:border-primary/20",
            collapsed ? "justify-center w-8 h-8 p-0 mx-auto" : "w-full"
          )}>
            <SearchIcon className="h-4 w-4 text-sidebar-foreground/40 group-hover:text-primary transition-colors" />
            {!collapsed && (
              <div className="flex flex-1 items-center justify-between">
                <span className="text-[11px] font-medium text-sidebar-foreground/40">Search knowledge...</span>
                <kbd className="hidden sm:inline-flex h-5 select-none items-center gap-1 rounded bg-sidebar-accent px-1.5 font-mono text-[9px] font-bold text-muted-foreground opacity-100 uppercase tracking-tighter">
                  ⌘K
                </kbd>
              </div>
            )}
          </div>
        </DialogTrigger>
        <DialogContent className="max-w-2xl p-0 overflow-hidden border-border/40 bg-background/95 backdrop-blur-2xl shadow-2xl">
          <DialogHeader className="p-4 border-b border-border/40">
             <div className="flex items-center gap-3">
                <SearchIcon className="h-5 w-5 text-primary" />
                <Input 
                  autoFocus
                  placeholder="Unified global query..." 
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="border-0 bg-transparent focus-visible:ring-0 text-lg font-medium p-0 h-auto"
                />
                <Badge variant="outline" className="text-[9px] font-black uppercase tracking-widest bg-muted/40">Neural Index</Badge>
             </div>
          </DialogHeader>
          <div className="max-h-[400px] overflow-y-auto p-2">
            {loading ? (
              <div className="py-20 flex flex-col items-center justify-center space-y-3">
                 <Loader2 className="h-6 w-6 text-primary animate-spin" />
                 <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground animate-pulse">Consulting Knowledge Chunks...</p>
              </div>
            ) : query === "" ? (
              <div className="p-10 text-center space-y-4">
                 <div className="h-16 w-16 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20">
                    <Command className="h-8 w-8 text-primary" />
                 </div>
                 <div className="space-y-1">
                    <p className="text-sm font-black uppercase tracking-tight">DocQuery Intelligent Command</p>
                    <p className="text-[11px] text-muted-foreground font-medium">Search cross-domain through shards, vectors, and histories.</p>
                 </div>
              </div>
            ) : results.length === 0 ? (
              <div className="py-20 text-center">
                 <p className="text-xs font-black uppercase tracking-widest text-muted-foreground opacity-40 italic">No matches in current shard</p>
              </div>
            ) : (
              <div className="space-y-1 p-1">
                 {results.map((r, i) => (
                   <div 
                     key={i} 
                     onClick={() => onSelect(r)}
                     className="flex items-center justify-between p-3 rounded-xl hover:bg-primary/5 cursor-pointer group transition-all border border-transparent hover:border-primary/10"
                   >
                      <div className="flex items-center gap-4 min-w-0">
                         <div className={cn(
                           "h-10 w-10 shrink-0 rounded-lg flex items-center justify-center border",
                           r.result_type === 'document' ? "bg-indigo-500/10 border-indigo-500/20 text-indigo-500" :
                           r.result_type === 'chunk' ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500" :
                           "bg-primary/10 border-primary/20 text-primary"
                         )}>
                            {r.result_type === 'document' && <FileText className="h-5 w-5" />}
                            {r.result_type === 'chunk' && <Hash className="h-5 w-5" />}
                            {r.result_type === 'message' && <MessageSquare className="h-5 w-5" />}
                         </div>
                         <div className="min-w-0">
                            <p className="text-sm font-bold truncate group-hover:text-primary transition-colors">{r.title}</p>
                            <p className="text-[10px] font-medium text-muted-foreground truncate italic opacity-70">
                               {r.result_type.toUpperCase()} • {r.content.slice(0, 100)}...
                            </p>
                         </div>
                      </div>
                      <ArrowRight className="h-4 w-4 opacity-0 group-hover:opacity-40 -translate-x-2 group-hover:translate-x-0 transition-all text-primary" />
                   </div>
                 ))}
                 
                 <div className="mt-4 pt-4 border-t border-border/40">
                   <Button 
                     variant="ghost" 
                     className="w-full h-10 gap-2 font-black uppercase text-[10px] tracking-widest hover:bg-primary hover:text-primary-foreground"
                     onClick={() => { setOpen(false); navigate(`/search?q=${query}`); }}
                   >
                      Advanced Search Results
                      <ArrowRight className="h-3 w-3" />
                   </Button>
                 </div>
              </div>
            )}
          </div>
          <div className="bg-muted/10 p-3 border-t border-border/40 flex items-center justify-between">
             <div className="flex items-center gap-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
                <span className="flex items-center gap-1"><kbd className="rounded border bg-muted/40 px-1 font-mono text-[9px]">ENTER</kbd> View</span>
                <span className="flex items-center gap-1"><kbd className="rounded border bg-muted/40 px-1 font-mono text-[9px]">ESC</kbd> Close</span>
             </div>
             <p className="text-[9px] font-mono text-muted-foreground/30">DOCQUERY.SEARCH.V1</p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default GlobalSearch;
