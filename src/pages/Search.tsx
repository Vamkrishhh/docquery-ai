import React, { useState, useEffect } from "react";
import AppLayout from "@/components/AppLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search as SearchIcon, FileText, MessageSquare, Hash, Clock, Filter, ArrowRight, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate, useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface SearchResult {
  result_id: string;
  result_type: 'document' | 'chunk' | 'message';
  title: string;
  content: string;
  parent_id: string;
  created_at: string;
  rank: number;
}

const SearchPage = () => {
  const { profile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  
  const query = searchParams.get("q") || "";
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  
  // Advanced filters
  const [filters, setFilters] = useState({
    type: 'all',
    minScore: 0.1,
    dateRange: 'all'
  });

  useEffect(() => {
    const saved = localStorage.getItem("recent_searches");
    if (saved) setRecentSearches(JSON.parse(saved));
  }, []);

  const saveSearch = (q: string) => {
    if (!q.trim()) return;
    const updated = [q, ...recentSearches.filter(s => s !== q)].slice(0, 10);
    setRecentSearches(updated);
    localStorage.setItem("recent_searches", JSON.stringify(updated));
  };

  const handleSearch = async (q: string) => {
    if (!q.trim() || !profile) return;
    setLoading(true);
    saveSearch(q);
    
    try {
      let { data, error } = await supabase.rpc("unified_global_search", {
        search_query: q,
        match_tenant_id: profile.tenant_id,
        max_results: 50
      });

      // Fallback if RPC is missing
      if (error && (error.code === 'PGRST202' || error.message?.includes('not found'))) {
        const { data: fallbackData, error: fallbackError } = await supabase
          .from("documents")
          .select("*")
          .ilike("filename", `%${q}%`)
          .limit(50);
        
        if (!fallbackError && fallbackData) {
          data = fallbackData.map(d => ({
            result_id: d.id,
            result_type: 'document',
            title: d.filename,
            content: d.description || "Document in knowledge base",
            parent_id: d.id,
            created_at: d.created_at,
            rank: 1.0
          }));
          error = null;
        }
      }

      if (error) throw error;
      setResults(data || []);
    } catch (err) {
      console.error("Search error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (query) handleSearch(query);
  }, [query]);

  const filteredResults = results.filter(r => {
    if (filters.type !== 'all' && r.result_type !== filters.type) return false;
    if (r.rank < filters.minScore) return false;
    return true;
  });

  const groupedResults = {
    document: filteredResults.filter(r => r.result_type === 'document'),
    chunk: filteredResults.filter(r => r.result_type === 'chunk'),
    message: filteredResults.filter(r => r.result_type === 'message')
  };

  const highlightMatches = (text: string, q: string) => {
    if (!q) return text;
    const parts = text.split(new RegExp(`(${q})`, 'gi'));
    return (
      <>
        {parts.map((part, i) => 
          part.toLowerCase() === q.toLowerCase() 
            ? <mark key={i} className="bg-primary/20 text-primary rounded px-0.5">{part}</mark> 
            : part
        )}
      </>
    );
  };

  return (
    <AppLayout>
      <div className="h-full flex flex-col bg-background">
        <div className="border-b border-border/40 bg-card/40 p-8">
          <div className="max-w-5xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-black tracking-tight uppercase">Unified <span className="text-primary">Search</span></h1>
                <p className="text-sm text-muted-foreground font-medium mt-1">Cross-domain retrieval across documents, chunks, and sessions.</p>
              </div>
              <Badge variant="outline" className="h-6 font-black uppercase text-[10px] tracking-widest border-primary/20 bg-primary/5 text-primary">
                Engine: PostgreSQL FTS
              </Badge>
            </div>

            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 to-purple-500/20 rounded-2xl blur-lg opacity-0 group-focus-within:opacity-100 transition-opacity duration-500" />
              <div className="relative flex items-center">
                <SearchIcon className="absolute left-4 h-5 w-5 text-muted-foreground" />
                <Input 
                  value={query}
                  onChange={(e) => setSearchParams({ q: e.target.value })}
                  placeholder="Search across all organizational knowledge..."
                  className="h-14 pl-12 pr-32 rounded-xl bg-card border-border/50 text-lg font-medium shadow-xl transition-all"
                />
                <div className="absolute right-3 flex items-center gap-2">
                   {loading && <div className="h-4 w-4 border-2 border-primary border-t-transparent animate-spin rounded-full mr-2" />}
                   <kbd className="hidden sm:inline-flex h-6 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100">
                     <span className="text-xs">⌘</span>K
                   </kbd>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4">
               <div className="flex items-center gap-2 bg-muted/30 p-1 rounded-lg border border-border/40">
                  <Button 
                    variant={filters.type === 'all' ? 'secondary' : 'ghost'} 
                    size="sm" 
                    className="h-7 text-[10px] font-black uppercase tracking-widest"
                    onClick={() => setFilters({...filters, type: 'all'})}
                  >All</Button>
                  <Button 
                    variant={filters.type === 'document' ? 'secondary' : 'ghost'} 
                    size="sm" 
                    className="h-7 text-[10px] font-black uppercase tracking-widest"
                    onClick={() => setFilters({...filters, type: 'document'})}
                  >Docs</Button>
                  <Button 
                    variant={filters.type === 'message' ? 'secondary' : 'ghost'} 
                    size="sm" 
                    className="h-7 text-[10px] font-black uppercase tracking-widest"
                    onClick={() => setFilters({...filters, type: 'message'})}
                  >Chat</Button>
               </div>
               
               <div className="h-4 w-[1px] bg-border/60 mx-1" />
               
               <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground mr-2">
                  <Filter className="h-3 w-3" /> Min Score: {filters.minScore}
               </div>
               <input 
                 type="range" min="0" max="1" step="0.05"
                 value={filters.minScore}
                 onChange={(e) => setFilters({...filters, minScore: parseFloat(e.target.value)})}
                 className="w-32 accent-primary h-1.5"
               />
            </div>
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="max-w-5xl mx-auto p-8">
            {query === "" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                 <div className="space-y-4">
                    <h3 className="text-xs font-black uppercase tracking-[0.2em] italic flex items-center gap-2 text-primary">
                       <Clock className="h-4 w-4" /> Recent Searches
                    </h3>
                    <div className="space-y-1">
                       {recentSearches.length > 0 ? recentSearches.map((s, i) => (
                         <div 
                           key={i} 
                           className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 cursor-pointer group transition-colors"
                           onClick={() => setSearchParams({ q: s })}
                         >
                            <div className="flex items-center gap-3">
                               <SearchIcon className="h-4 w-4 text-muted-foreground/40" />
                               <span className="text-sm font-medium">{s}</span>
                            </div>
                            <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-40 transition-opacity" />
                         </div>
                       )) : (
                         <p className="text-xs text-muted-foreground/60 italic p-2">Search history is empty.</p>
                       )}
                    </div>
                 </div>
                 
                 <div className="space-y-4 p-6 rounded-2xl bg-indigo-500/[0.03] border border-indigo-500/10">
                    <h3 className="text-xs font-black uppercase tracking-[0.2em] italic flex items-center gap-2 text-indigo-500">
                       <Hash className="h-4 w-4" /> Intelligence Search
                    </h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                       Our semantic search engine indexes document content, chat history, and metadata. Matches are ranked using BM25 with tenant-level isolation.
                    </p>
                    <ul className="space-y-2">
                       <li className="flex items-center gap-2 text-[10px] font-bold uppercase"><div className="h-1 w-1 bg-indigo-500 rounded-full" /> Full Text Indexed</li>
                       <li className="flex items-center gap-2 text-[10px] font-bold uppercase"><div className="h-1 w-1 bg-indigo-500 rounded-full" /> Grouped by Relevance</li>
                       <li className="flex items-center gap-2 text-[10px] font-bold uppercase"><div className="h-1 w-1 bg-indigo-500 rounded-full" /> Neural Fallbacks</li>
                    </ul>
                 </div>
              </div>
            ) : filteredResults.length === 0 && !loading ? (
              <div className="py-20 text-center space-y-4">
                 <div className="h-20 w-20 rounded-3xl bg-muted/30 flex items-center justify-center mx-auto border border-border/50">
                    <X className="h-10 w-10 text-muted-foreground/40" />
                 </div>
                 <p className="text-muted-foreground font-black uppercase tracking-widest text-xs">No matches found for "{query}"</p>
                 <Button variant="outline" size="sm" onClick={() => setSearchParams({})}>Clear Search</Button>
              </div>
            ) : (
              <div className="space-y-12">
                 {groupedResults.document.length > 0 && (
                   <section className="space-y-4">
                      <div className="flex items-center gap-2 pb-2 border-b border-border/40">
                         <FileText className="h-4 w-4 text-indigo-500" />
                         <h2 className="text-xs font-black uppercase tracking-widest italic">Documents ({groupedResults.document.length})</h2>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                         {groupedResults.document.map(r => (
                           <Card key={r.result_id} className="border-border/50 hover:border-primary/40 transition-colors shadow-sm cursor-pointer group" onClick={() => navigate(`/documents?id=${r.result_id}`)}>
                              <CardHeader className="p-4 space-y-1">
                                 <div className="flex justify-between items-start">
                                    <CardTitle className="text-sm font-bold truncate group-hover:text-primary transition-colors">
                                       {highlightMatches(r.title, query)}
                                    </CardTitle>
                                    <Badge variant="outline" className="text-[8px] h-4">{Math.round(r.rank * 100)}%</Badge>
                                 </div>
                                 <CardDescription className="text-[10px]">Indexed on {format(new Date(r.created_at), 'PPP')}</CardDescription>
                              </CardHeader>
                              <CardContent className="px-4 pb-4">
                                 <p className="text-xs text-muted-foreground line-clamp-2 italic">"{r.content.slice(0, 150)}..."</p>
                              </CardContent>
                           </Card>
                         ))}
                      </div>
                   </section>
                 )}

                 {groupedResults.chunk.length > 0 && (
                   <section className="space-y-4">
                      <div className="flex items-center gap-2 pb-2 border-b border-border/40">
                         <Hash className="h-4 w-4 text-emerald-500" />
                         <h2 className="text-xs font-black uppercase tracking-widest italic">Content Fragments ({groupedResults.chunk.length})</h2>
                      </div>
                      <div className="space-y-3">
                         {groupedResults.chunk.map(r => (
                           <div key={r.result_id} className="p-4 rounded-xl border border-border/40 bg-card hover:bg-muted/30 transition-all cursor-pointer group" onClick={() => navigate(`/documents?id=${r.parent_id}`)}>
                              <div className="flex justify-between items-center mb-2">
                                 <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500 italic flex items-center gap-2">
                                    <FileText className="h-3 w-3" /> {r.title}
                                 </p>
                                 <Badge variant="secondary" className="text-[8px] h-4 bg-muted text-muted-foreground">SCORE: {r.rank.toFixed(2)}</Badge>
                              </div>
                              <p className="text-xs font-medium leading-relaxed">
                                {highlightMatches(r.content, query)}
                              </p>
                           </div>
                         ))}
                      </div>
                   </section>
                 )}

                 {groupedResults.message.length > 0 && (
                   <section className="space-y-4">
                      <div className="flex items-center gap-2 pb-2 border-b border-border/40">
                         <MessageSquare className="h-4 w-4 text-primary" />
                         <h2 className="text-xs font-black uppercase tracking-widest italic">Conversations ({groupedResults.message.length})</h2>
                      </div>
                      <div className="space-y-3">
                         {groupedResults.message.map(r => (
                           <div key={r.result_id} className="p-4 rounded-xl border border-border/40 bg-card hover:border-primary/20 transition-all cursor-pointer group" onClick={() => navigate(`/chat?conversation=${r.parent_id}`)}>
                              <div className="flex justify-between items-center mb-2">
                                 <p className="text-[10px] font-black uppercase tracking-widest text-primary truncate italic max-w-[300px]">
                                    {r.title || "Augmented Session"}
                                 </p>
                                 <span className="text-[9px] font-mono text-muted-foreground uppercase">{format(new Date(r.created_at), 'MMM d, HH:mm')}</span>
                              </div>
                              <p className="text-xs font-medium bg-muted/20 p-2 rounded-lg border border-dashed border-border/60">
                                {highlightMatches(r.content, query)}
                              </p>
                           </div>
                         ))}
                      </div>
                   </section>
                 )}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </AppLayout>
  );
};

export default SearchPage;
