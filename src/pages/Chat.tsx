import React, { useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { streamRagQuery, StreamSource, calculateConfidence, MessageDiagnostics } from "@/lib/streaming";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import {
  Activity, BookOpen, Check, ChevronDown, ChevronUp, Clock, Copy, Eye, EyeOff, FileText, Hash, Lightbulb,
  Loader2, MessageSquare, Pencil, Plus, RefreshCw, Search, Send, Shield as ShieldIcon, ShieldCheck, Sparkles, ThumbsDown,
  ThumbsUp, Trash2, X, AlertTriangle, Home, Settings2, ArrowRight, Lock, Database as DatabaseIcon
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import TenantBadge from "@/components/TenantBadge";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";

interface Message {
  id?: string;
  role: "user" | "assistant";
  content: string;
  sources?: StreamSource[];
  diagnostics?: MessageDiagnostics;
  created_at?: string;
  confidence?: number;
  followUps?: string[];
  model_used?: string;
}

interface AISuggestion {
  question: string;
  description: string;
}

interface SuggestionCache {
  data: AISuggestion[];
  timestamp: number;
}

// Highlights keywords from query within chunk text
const HighlightedChunk: React.FC<{ text: string; query: string }> = ({ text, query }) => {
  const words = query.replace(/[^\w\s]/g, "").split(/\s+/).filter(w => w.length > 3);
  if (words.length === 0) return <p className="text-muted-foreground/80 text-xs whitespace-pre-wrap">{text}</p>;
  const regex = new RegExp(`(${words.join("|")})`, "gi");
  const parts = text.split(regex);
  return (
    <p className="text-xs whitespace-pre-wrap leading-relaxed">
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} className="bg-primary/20 text-foreground rounded px-0.5">{part}</mark>
        ) : (
          <span key={i} className="text-muted-foreground/80">{part}</span>
        )
      )}
    </p>
  );
};

const getConfidenceInfo = (score: number) => {
  if (score >= 70) return { label: "High", color: "text-green-500", bg: "bg-green-500/10", barColor: "bg-green-500" };
  if (score >= 40) return { label: "Medium", color: "text-yellow-500", bg: "bg-yellow-500/10", barColor: "bg-yellow-500" };
  return { label: "Low", color: "text-red-500", bg: "bg-red-500/10", barColor: "bg-red-500" };
};

interface Conversation {
  id: string;
  title: string | null;
  created_at: string;
}

const DEFAULT_SUGGESTIONS: AISuggestion[] = [
  { question: "Summarize my documents", description: "Get a comprehensive overview of all your uploaded files." },
  { question: "What are the key topics covered?", description: "Discover the most frequent and important subjects across your documents." },
  { question: "List the main policies mentioned", description: "Extract and list any governance or operational policies found." },
];

const formatTime = (dateStr?: string) => {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
};

const Chat = () => {
  const { session, profile, tenantName } = useAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<string | null>(null);
  // Model selection states
  const [selectedModel, setSelectedModel] = useState<string>("gemini-flash");
  const models = [
    { id: "gemini-flash", name: "Gemini Flash", health: "green", description: "Lightning fast, optimized for efficiency" },
    { id: "gemini-pro", name: "Gemini Pro", health: "green", description: "Advanced reasoning for complex synthesis" },
    { id: "gemini-lite", name: "Gemini Lite", health: "yellow", description: "Resource-efficient fallback model" }
  ];

  const [perModelSettings, setPerModelSettings] = useState<Record<string, { temperature: number; max_tokens: number; top_p: number }>>({
    "gemini-flash": { temperature: 0.1, max_tokens: 2048, top_p: 0.95 },
    "gemini-pro": { temperature: 0.7, max_tokens: 4096, top_p: 0.9 },
    "gemini-lite": { temperature: 0.1, max_tokens: 1024, top_p: 0.95 },
  });

  const [docCount, setDocCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingConvId, setEditingConvId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [expandedSources, setExpandedSources] = useState<Record<string, boolean>>({});
  const [feedbackMap, setFeedbackMap] = useState<Record<string, string>>({});
  const [expandedDiagnostics, setExpandedDiagnostics] = useState<Record<number | string, boolean>>({});
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const suggestionCache = useRef<Record<string, SuggestionCache>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadDocCount = useCallback(async () => {
    const { count } = await supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("status", "ready" as any);
    setDocCount(count || 0);
  }, []);

  const loadConversations = useCallback(async () => {
    const { data, error } = await supabase
      .from("conversations")
      .select("id, title, created_at")
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    if (data) setConversations(data);
  }, []);

  const fetchInitialData = useCallback(async () => {
    if (!profile?.tenant_id) return;
    setInitialLoading(true);
    setFetchError(null);
    try {
      await Promise.all([loadConversations(), loadDocCount()]);
    } catch (err: any) {
      console.error("Chat initialization error:", err);
      setFetchError(err.message || "Failed to establish secure connection to knowledge base.");
    } finally {
      setInitialLoading(false);
    }
  }, [profile?.tenant_id, loadConversations, loadDocCount]);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const fetchSuggestions = async (lastContext?: string, force = false) => {
    if (!profile?.tenant_id) return;
    const cacheKey = lastContext || "initial";
    const now = Date.now();
    if (!force && suggestionCache.current[cacheKey] && (now - suggestionCache.current[cacheKey].timestamp < 60000)) {
      setSuggestions(suggestionCache.current[cacheKey].data);
      return;
    }
    setLoadingSuggestions(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-suggestions", {
        body: { tenant_id: profile.tenant_id, last_message: lastContext }
      });
      if (error) throw error;
      const newSuggestions = data.suggestions || [];
      suggestionCache.current[cacheKey] = { data: newSuggestions, timestamp: now };
      if (!lastContext) setSuggestions(newSuggestions);
      return newSuggestions;
    } catch (err) {
      console.error("Failed to fetch suggestions:", err);
      if (!lastContext) setSuggestions(DEFAULT_SUGGESTIONS);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  useEffect(() => {
    if (profile && !initialLoading && messages.length === 0) {
      fetchSuggestions();
    }
  }, [profile, initialLoading, messages.length]);

  const loadMessages = async (convId: string) => {
    setActiveConversation(convId);
    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: true });
    if (data) {
      setMessages(
        data.map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
          sources: typeof m.sources === "string" ? JSON.parse(m.sources) : m.sources,
          diagnostics: typeof m.diagnostics === "string" ? JSON.parse(m.diagnostics) : m.diagnostics,
          created_at: m.created_at,
        }))
      );
    }
    setExpandedSources({});
    setExpandedDiagnostics({});
  };

  const handleFeedback = async (messageId: string, type: "helpful" | "not_helpful") => {
    if (!messageId || !profile) return;
    
    setFeedbackMap(prev => ({ ...prev, [messageId]: type }));
    
    // Find the message and its predecessor (the question) for deep diagnostics
    const msgIdx = messages.findIndex(m => m.id === messageId);
    const message = messages[msgIdx];
    const questionMsg = msgIdx > 0 ? messages[msgIdx - 1] : null;
    
    let metadata = {};
    
    if (type === "not_helpful" && message) {
      metadata = {
        question: questionMsg?.content,
        answer: message.content,
        sources: message.sources,
        diagnostics: message.diagnostics,
        timestamp: new Date().toISOString(),
        user_agent: navigator.userAgent
      };
    }

    const { error } = await supabase
      .from("message_feedback")
      .upsert({
        message_id: messageId,
        user_id: session?.user.id,
        tenant_id: profile.tenant_id,
        feedback_type: type,
        metadata: Object.keys(metadata).length > 0 ? metadata : null
      } as any, { onConflict: "message_id, user_id" });

    if (error) {
      console.error("Feedback error:", error);
      toast({ title: "Feedback Error", description: "Could not save feedback corridor.", variant: "destructive" });
    } else {
      toast({ 
        title: type === "helpful" ? "Precision Confirmed" : "Diagnostics Captured", 
        description: type === "helpful" ? "Thank you for calibrating the neural engine." : "We've logged the retrieval failure for developer audit.",
      });
    }
  };

  const handleSend = async (text?: string) => {
    const question = (text || input).trim();
    if (!question || !profile || !session) return;
    setInput("");
    const userMsg: Message = { role: "user", content: question, created_at: new Date().toISOString() };
    setMessages((prev) => [...prev, userMsg]);
    setIsStreaming(true);

    let convId = activeConversation;
    if (!convId) {
      const { data } = await supabase
        .from("conversations")
        .insert({ tenant_id: profile.tenant_id, user_id: session.user.id, title: question.slice(0, 100) })
        .select("id")
        .single();
      if (data) {
        convId = data.id;
        setActiveConversation(convId);
        loadConversations();
      }
    }

    if (convId) {
      await supabase.from("messages").insert({
        conversation_id: convId, tenant_id: profile.tenant_id, role: "user", content: question,
      });
    }

    const runStream = async (model: string, tempId: string) => {
      let content = "";
      let st_sources: StreamSource[] = [];
      let st_diagnostics: MessageDiagnostics | undefined;
      const startTime = Date.now();

      await streamRagQuery({
        question, 
        conversationId: convId || undefined, 
        tenantId: profile.tenant_id,
        accessToken: session.access_token, 
        model,
        ...perModelSettings[model], 
        onDelta: (delta) => {
          content += delta;
          setMessages(prev => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.role === "assistant") {
              last.content += delta;
            }
            return next;
          });
        },
        onSources: (s) => {
          st_sources = s;
          const confidence = calculateConfidence(s, st_diagnostics?.confidence_score);
          setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, sources: s, confidence } : m)));
        },
        onDiagnostics: (d) => {
          st_diagnostics = d;
          setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, diagnostics: d } : m)));
        },
        onFollowUps: (fu) => {
          setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, followUps: fu } : m)));
        },
        onDone: async () => {
          const totalDuration = Date.now() - startTime;
          if (st_diagnostics) {
            st_diagnostics.total_latency_before_stream_ms = totalDuration;
          }
          if (session?.user && profile?.tenant_id) {
            const { data: inserted } = await supabase.from("messages").insert({
              conversation_id: convId, tenant_id: profile.tenant_id, role: "assistant",
              content, sources: JSON.stringify(st_sources), diagnostics: JSON.stringify(st_diagnostics),
            } as any).select("id").single();
            if (inserted) {
              setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, id: inserted.id } : m)));
            }
          }
        },
        onError: (err) => toast({ title: "Query Error", description: err, variant: "destructive" }),
      });
    };

    const tempId = crypto.randomUUID();
    setMessages((prev) => [...prev, { id: tempId, role: "assistant", content: "", model_used: selectedModel, created_at: new Date().toISOString() }]);
    await runStream(selectedModel, tempId);
    setIsStreaming(false);
  };

  if (fetchError) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center space-y-6 bg-background">
        <div className="h-20 w-20 rounded-3xl bg-rose-500/10 flex items-center justify-center border border-rose-500/20 shadow-2xl shadow-rose-500/10 mb-2">
          <AlertTriangle className="h-10 w-10 text-rose-500" />
        </div>
        <div className="max-w-md space-y-2">
          <h1 className="text-2xl font-black uppercase tracking-tight text-foreground">Secure Context Error</h1>
          <p className="text-muted-foreground font-medium">{fetchError}</p>
        </div>
        <div className="flex gap-4 pt-4">
          <Button onClick={fetchInitialData} className="gap-2 bg-indigo-600 hover:bg-indigo-700 font-bold px-6 h-12 rounded-2xl shadow-lg shadow-indigo-500/20">
            <RefreshCw className="h-4 w-4" /> Re-establish Link
          </Button>
          <Button onClick={() => window.location.href = "/"} variant="outline" className="gap-2 font-bold px-6 h-12 rounded-2xl">
            <Home className="h-4 w-4" /> Dashboard
          </Button>
        </div>
      </div>
    );
  }

  if (initialLoading) {
    return (
      <div className="h-full flex flex-col items-center justify-center space-y-4">
        <div className="relative">
          <div className="h-16 w-16 rounded-3xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20 animate-pulse">
            <Loader2 className="h-8 w-8 text-indigo-500 animate-spin" />
          </div>
          <Sparkles className="h-5 w-5 text-indigo-400 absolute -top-2 -right-2 animate-bounce" />
        </div>
        <p className="text-xs font-black uppercase tracking-widest text-muted-foreground animate-pulse">Initializing Secure Context...</p>
      </div>
    );
  }

  const filteredConversations = conversations.filter(c => !searchQuery || (c.title || "").toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="flex h-full bg-background animate-in fade-in duration-500">
      {/* Sidebar */}
      <div className="hidden md:flex w-80 border-r border-border/40 bg-card/40 flex-col">
        <div className="p-4 border-b border-border/40 space-y-3">
          <Button onClick={() => { setMessages([]); setActiveConversation(null); }} variant="outline" className="w-full gap-2 h-10 font-bold border-indigo-500/20 hover:bg-indigo-500/5 hover:text-indigo-500 transition-all" size="sm">
            <Plus className="h-4 w-4" /> New Augmented Chat
          </Button>
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Filter sessions..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10 h-10 text-xs bg-muted/20 border-border/40" />
          </div>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {filteredConversations.map((conv) => (
              <div key={conv.id} onClick={() => loadMessages(conv.id)} className={cn("group flex items-center gap-3 rounded-xl px-4 py-3 text-sm cursor-pointer transition-all border border-transparent", activeConversation === conv.id ? "bg-indigo-500/10 text-indigo-500 border-indigo-500/20 shadow-sm" : "text-muted-foreground hover:bg-muted/50")}>
                <MessageSquare className={cn("h-4 w-4 shrink-0", activeConversation === conv.id ? "text-indigo-500" : "text-muted-foreground/60")} />
                <span className="truncate flex-1 font-medium">{conv.title || "Untitled Fragment"}</span>
                <Clock className="h-3 w-3 opacity-0 group-hover:opacity-40 transition-opacity" />
              </div>
            ))}
          </div>
        </ScrollArea>
        <div className="p-4 border-t border-border/40 bg-muted/10">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase text-muted-foreground tracking-widest">
            <DatabaseIcon className="h-3 w-3" />
            <span>{docCount} Knowledge Objects</span>
          </div>
          <TenantBadge className="mt-3" />
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        <div className="h-full flex flex-col">
          <ScrollArea className="flex-1">
            <div className="max-w-4xl mx-auto p-6 space-y-8 pb-32">
              {messages.length === 0 ? (
                <div className="py-20 flex flex-col items-center justify-center text-center space-y-8">
                  <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="h-24 w-24 rounded-[2rem] bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20 shadow-2xl shadow-indigo-500/10">
                    <Sparkles className="h-12 w-12 text-indigo-500" />
                  </motion.div>
                  <div className="space-y-4 max-w-lg">
                    <h2 className="text-3xl font-black tracking-tight text-foreground uppercase">DocQuery <span className="text-indigo-500">Intelligent Q&A</span></h2>
                    <p className="text-sm text-muted-foreground leading-relaxed font-medium">
                      Retrieve insights from your secure organization knowledge base using private semantic indices and dedicated LLM contexts.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full px-4">
                    {suggestions.map((s, i) => (
                      <Button key={i} variant="outline" className="h-auto p-4 rounded-2xl flex flex-col items-start gap-2 border-border/50 bg-card/50 hover:border-primary/50 hover:bg-primary/5 transition-all text-left group" onClick={() => handleSend(s.question)}>
                        <div className="flex items-center gap-2">
                           <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                              <Lightbulb className="h-4 w-4" />
                           </div>
                           <span className="text-xs font-black uppercase tracking-widest">{s.question}</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground font-medium leading-relaxed">{s.description}</p>
                      </Button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((msg, i) => (
                  <motion.div key={msg.id || i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={cn("flex flex-col gap-4", msg.role === "user" ? "items-end" : "items-start")}>
                    {msg.role === "user" ? (
                      <div className="max-w-[80%] bg-indigo-600 text-white rounded-2xl rounded-tr-none px-5 py-4 shadow-xl shadow-indigo-500/10 font-medium text-sm leading-relaxed border border-indigo-400/20">
                        {msg.content}
                      </div>
                    ) : (
                      <div className="w-full max-w-[90%] bg-card border border-border/40 rounded-2xl rounded-tl-none p-6 shadow-sm hover:shadow-md transition-all group relative">
                        <div className="flex items-center justify-between mb-4 border-b border-border/40 pb-3">
                           <Badge variant="outline" className="bg-indigo-500/5 text-indigo-500 border-indigo-500/20 text-[9px] font-black uppercase tracking-widest px-2 py-0.5">
                             DOCQUERY {msg.model_used?.split('/').pop()?.toUpperCase() || "CORE"}
                           </Badge>
                           <div className="flex items-center gap-4">
                             {msg.confidence !== undefined && (
                                <div className="flex items-center gap-2">
                                   <ShieldCheck className={cn("h-3.5 w-3.5", msg.confidence > 70 ? "text-emerald-500" : "text-amber-500")} />
                                   <span className="text-[10px] font-black text-muted-foreground uppercase">{msg.confidence}% MATCH</span>
                                </div>
                             )}
                             <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                               <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-muted-foreground hover:text-primary transition-colors" onClick={() => {
                                 navigator.clipboard.writeText(msg.content);
                                 toast({ title: "Copied", description: "Response secure link captured to clipboard.", duration: 2000 });
                               }}>
                                 <Copy className="h-3.5 w-3.5" />
                               </Button>
                               <Button variant="ghost" size="icon" className={cn("h-7 w-7 rounded-lg", feedbackMap[msg.id!] === "helpful" ? "text-emerald-500 bg-emerald-500/10" : "text-muted-foreground")} onClick={() => handleFeedback(msg.id!, "helpful")}>
                                 <ThumbsUp className="h-3.5 w-3.5" />
                               </Button>
                               <Button variant="ghost" size="icon" className={cn("h-7 w-7 rounded-lg", feedbackMap[msg.id!] === "not_helpful" ? "text-rose-500 bg-rose-500/10" : "text-muted-foreground")} onClick={() => handleFeedback(msg.id!, "not_helpful")}>
                                 <ThumbsDown className="h-3.5 w-3.5" />
                               </Button>
                             </div>
                           </div>
                        </div>
                        <div className="prose prose-sm dark:prose-invert max-w-none text-sm font-medium leading-relaxed">
                          <ReactMarkdown>{msg.content}</ReactMarkdown>
                        </div>
                        
                        {msg.followUps && msg.followUps.length > 0 && !isStreaming && (
                          <div className="mt-6 flex flex-wrap gap-2 animate-in slide-in-from-bottom-2 duration-500">
                             {msg.followUps.map((fu, fuIdx) => (
                               <Button key={fuIdx} variant="outline" size="sm" onClick={() => handleSend(fu)} className="h-8 rounded-xl px-4 text-[10px] font-black uppercase tracking-widest border-indigo-500/20 bg-indigo-500/5 text-indigo-500 hover:bg-indigo-500/10 gap-2 group">
                                  <ArrowRight className="h-3 w-3 group-hover:translate-x-1 transition-transform" />
                                  {fu}
                               </Button>
                             ))}
                          </div>
                        )}
                        {msg.sources && msg.sources.length > 0 && (
                          <div className="mt-6 pt-4 border-t border-border/40">
                             <div className="flex items-center justify-between mb-3">
                               <div className="flex items-center gap-2">
                                 <Hash className="h-3 w-3 text-indigo-500" />
                                 <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Grounding Citations</span>
                               </div>
                               <Button variant="ghost" size="sm" className="h-6 px-2 text-[8px] font-black uppercase tracking-tighter" onClick={() => setExpandedDiagnostics(prev => ({...prev, [msg.id!]: !prev[msg.id!]}))}>
                                 {expandedDiagnostics[msg.id!] ? "Hide Analytics" : "View Analytics"}
                               </Button>
                             </div>
                             <div className="flex flex-wrap gap-2">
                               {msg.sources.map((src, sIdx) => (
                                 <TooltipProvider key={sIdx}>
                                   <Tooltip>
                                     <TooltipTrigger>
                                       <Badge variant="secondary" className="bg-muted/40 hover:bg-muted/80 transition-colors text-[9px] font-bold py-1 border-0">
                                         {src.filename} ({(src.similarity * 100).toFixed(0)}%)
                                       </Badge>
                                     </TooltipTrigger>
                                     <TooltipContent className="max-w-xs p-4 bg-popover/90 backdrop-blur-xl border-border/50">
                                       <p className="text-[10px] font-black uppercase mb-2 text-primary tracking-widest">Source Context Extraction</p>
                                       <p className="text-[10px] italic leading-relaxed text-muted-foreground">"{src.chunk_text}..."</p>
                                     </TooltipContent>
                                   </Tooltip>
                                 </TooltipProvider>
                               ))}
                             </div>
                             
                             <AnimatePresence>
                               {expandedDiagnostics[msg.id!] && msg.diagnostics && (
                                 <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mt-4 pt-4 border-t border-dashed border-border/40 overflow-hidden">
                                   <div className="grid grid-cols-2 gap-4 text-[9px] font-mono">
                                      <div className="space-y-1">
                                         <p className="font-black text-muted-foreground uppercase tracking-widest">Retrieval Latency</p>
                                         <p className="text-foreground">{msg.diagnostics.retrieval_latency_ms}ms</p>
                                      </div>
                                      <div className="space-y-1">
                                         <p className="font-black text-muted-foreground uppercase tracking-widest">Total Cluster Time</p>
                                         <p className="text-foreground">{msg.diagnostics.total_latency_before_stream_ms}ms</p>
                                      </div>
                                      <div className="col-span-2 space-y-1">
                                         <p className="font-black text-muted-foreground uppercase tracking-widest">Expanded Search Vector</p>
                                         <p className="text-foreground italic">"{msg.diagnostics.expanded_query || msg.diagnostics.search_query}"</p>
                                      </div>
                                   </div>
                                 </motion.div>
                               )}
                             </AnimatePresence>
                          </div>
                        )}
                      </div>
                    )}
                  </motion.div>
                ))
              )}
              {isStreaming && (
                <div className="w-full max-w-[90%] space-y-4 animate-in fade-in duration-500">
                  <div className="flex items-center gap-3 mb-2">
                    <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground animate-pulse">Augmenting Context Matrix...</span>
                  </div>
                  <div className="space-y-2 bg-card border border-border/20 p-6 rounded-2xl rounded-tl-none">
                    <Skeleton className="h-4 w-[90%] bg-primary/5" />
                    <Skeleton className="h-4 w-[95%] bg-primary/5" />
                    <Skeleton className="h-4 w-[85%] bg-primary/5" />
                    <Skeleton className="h-4 w-[40%] bg-primary/5" />
                  </div>
                </div>
              )}
              <div ref={scrollRef} />
            </div>
          </ScrollArea>

          <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-background via-background/95 to-transparent">
             <div className="max-w-4xl mx-auto">
                <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="relative group">
                  <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 rounded-[2rem] blur-xl opacity-0 group-focus-within:opacity-100 transition-opacity duration-700" />
                  <div className="relative flex items-end">
                    <Textarea 
                      ref={inputRef as any} 
                      value={input} 
                      onChange={(e) => setInput(e.target.value)} 
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey && (e.metaKey || e.ctrlKey)) {
                          e.preventDefault();
                          handleSend();
                        }
                      }}
                      placeholder={docCount > 0 ? "Ask a secure query..." : "Please index documents to begin..."} 
                      disabled={isStreaming || docCount === 0} 
                      className="min-h-[64px] max-h-[200px] pl-6 pr-24 py-5 rounded-[1.8rem] bg-card/80 backdrop-blur-3xl border-border/50 focus:border-primary/50 shadow-2xl transition-all text-sm font-medium resize-none custom-scrollbar" 
                    />
                    <div className="absolute right-3 bottom-2.5 flex items-center gap-3">
                       <span className="text-[10px] font-black text-muted-foreground uppercase opacity-30 hidden lg:block">⌘+Enter</span>
                       <Button type="submit" disabled={isStreaming || !input.trim() || docCount === 0} size="icon" className="h-11 w-11 rounded-2xl bg-primary hover:bg-primary/90 shadow-xl shadow-primary/20">
                         {isStreaming ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                       </Button>
                    </div>
                  </div>
                </form>

                <div className="mt-4 flex items-center justify-between px-2">
                   <div className="flex items-center gap-3">
                      {/* Model Selector & Health Dashboard */}
                      <div className="flex items-center gap-1 p-1 bg-muted/30 rounded-xl border border-border/50">
                         {models.map(m => (
                           <TooltipProvider key={m.id}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button 
                                    variant={selectedModel === m.id ? "secondary" : "ghost"} 
                                    size="sm" 
                                    onClick={() => setSelectedModel(m.id)}
                                    className={cn("h-7 px-2.5 gap-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all", selectedModel === m.id ? "bg-background shadow-sm text-primary" : "text-muted-foreground")}
                                  >
                                    <div className={cn("h-1.5 w-1.5 rounded-full ring-2 ring-background", 
                                      m.health === "green" ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : 
                                      m.health === "yellow" ? "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]" : "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]") 
                                    } />
                                    {m.name.replace("Gemini ", "")}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="bg-popover/95 backdrop-blur-md border-border/50 p-3 max-w-[200px]">
                                   <div className="space-y-1.5">
                                      <div className="flex justify-between items-center">
                                         <p className="font-black text-[10px] uppercase tracking-widest">{m.name}</p>
                                         <Badge variant="outline" className={cn("text-[8px] h-4", m.health === 'green' ? "text-emerald-500 border-emerald-500/20 bg-emerald-500/5" : "text-amber-500 border-amber-500/20 bg-amber-500/5")}>{m.health === 'green' ? "OPTIMAL" : "DEGRADED"}</Badge>
                                      </div>
                                      <p className="text-[9px] text-muted-foreground leading-tight">{m.description}</p>
                                   </div>
                                </TooltipContent>
                              </Tooltip>
                           </TooltipProvider>
                         ))}
                      </div>

                      <Dialog>
                         <DialogTrigger asChild>
                           <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl bg-card/50 border-border/50 hover:bg-muted/50 transition-colors">
                             <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
                           </Button>
                         </DialogTrigger>
                         <DialogContent className="max-w-xs bg-background/95 backdrop-blur-2xl border-border/50 shadow-2xl">
                            <DialogHeader>
                              <DialogTitle className="text-sm font-black uppercase tracking-widest italic flex items-center gap-2">
                                <Sparkles className="h-4 w-4 text-primary" />
                                {selectedModel === "gemini-flash" ? "Flash" : selectedModel === "gemini-pro" ? "Pro" : "Lite"} Engine Tuning
                              </DialogTitle>
                              <DialogDescription className="text-[10px] font-medium">Fine-tune generative parameters for the active model.</DialogDescription>
                            </DialogHeader>
                            <div className="space-y-6 pt-4">
                               <div className="space-y-4">
                                  <div className="flex justify-between items-center">
                                     <Label className="text-[10px] font-black uppercase tracking-widest opacity-70">Temperature</Label>
                                     <span className="text-[10px] font-mono text-primary font-bold bg-primary/10 px-1.5 py-0.5 rounded">{perModelSettings[selectedModel].temperature}</span>
                                  </div>
                                  <input 
                                    type="range" min="0" max="1" step="0.1" 
                                    value={perModelSettings[selectedModel].temperature} 
                                    onChange={(e) => setPerModelSettings(prev => ({
                                      ...prev, 
                                      [selectedModel]: { ...prev[selectedModel], temperature: parseFloat(e.target.value) }
                                    }))}
                                    className="w-full accent-primary bg-muted rounded-lg h-1.5 appearance-none cursor-pointer"
                                  />
                               </div>
                               <div className="space-y-4">
                                  <div className="flex justify-between items-center">
                                     <Label className="text-[10px] font-black uppercase tracking-widest opacity-70">Max Tokens</Label>
                                     <span className="text-[10px] font-mono text-primary font-bold bg-primary/10 px-1.5 py-0.5 rounded">{perModelSettings[selectedModel].max_tokens}</span>
                                  </div>
                                  <input 
                                    type="range" min="256" max="8192" step="256" 
                                    value={perModelSettings[selectedModel].max_tokens} 
                                    onChange={(e) => setPerModelSettings(prev => ({
                                      ...prev, 
                                      [selectedModel]: { ...prev[selectedModel], max_tokens: parseInt(e.target.value) }
                                    }))}
                                    className="w-full accent-primary bg-muted rounded-lg h-1.5 appearance-none cursor-pointer"
                                  />
                               </div>
                               <div className="space-y-4">
                                  <div className="flex justify-between items-center">
                                     <Label className="text-[10px] font-black uppercase tracking-widest opacity-70">Top P</Label>
                                     <span className="text-[10px] font-mono text-primary font-bold bg-primary/10 px-1.5 py-0.5 rounded">{perModelSettings[selectedModel].top_p}</span>
                                  </div>
                                  <input 
                                    type="range" min="0" max="1" step="0.05" 
                                    value={perModelSettings[selectedModel].top_p} 
                                    onChange={(e) => setPerModelSettings(prev => ({
                                      ...prev, 
                                      [selectedModel]: { ...prev[selectedModel], top_p: parseFloat(e.target.value) }
                                    }))}
                                    className="w-full accent-primary bg-muted rounded-lg h-1.5 appearance-none cursor-pointer"
                                  />
                               </div>
                            </div>
                         </DialogContent>
                      </Dialog>

                      {fetchError && (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => {
                            const nextIndex = (models.findIndex(m => m.id === selectedModel) + 1) % models.length;
                            setSelectedModel(models[nextIndex].id);
                            handleSend();
                          }}
                          className="h-9 gap-2 px-3 rounded-xl font-black text-[9px] uppercase tracking-wider border-rose-500/20 bg-rose-500/5 text-rose-500 hover:bg-rose-500/10 transition-all"
                        >
                          <RefreshCw className="h-3 w-3" /> Retry with {models[(models.findIndex(m => m.id === selectedModel) + 1) % models.length].name}
                        </Button>
                      )}
                   </div>
                </div>

                <div className="mt-4 flex items-center justify-between px-2">
                   <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                         <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                         <span className="text-[9px] font-black text-muted-foreground uppercase tracking-[0.12em]">Isolated Tenant Logic Active</span>
                      </div>
                   </div>
                   <p className="text-[9px] text-muted-foreground/50 font-mono tracking-tighter">SID: {session?.user.id.substring(0,8)} | CID: {activeConversation?.substring(0,6) || "NEW_SESSION"}</p>
                </div>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Chat;
