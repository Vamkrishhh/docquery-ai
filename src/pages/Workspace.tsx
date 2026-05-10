import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { streamRagQuery, StreamSource, calculateConfidence } from "@/lib/streaming";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, BookOpen, ChevronDown, ChevronUp, Copy, Check, FileText, Hash,
  Layers, Loader2, Send, ShieldCheck, Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";

interface DocInfo {
  id: string;
  filename: string;
  file_type: string;
  file_size: number | null;
  chunk_count: number | null;
  created_at: string;
}

interface ChunkInfo {
  id: string;
  chunk_index: number;
  chunk_text: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: StreamSource[];
  confidence?: number;
}

const getConfidenceInfo = (score: number) => {
  if (score >= 70) return { label: "High", color: "text-green-500", bg: "bg-green-500/10", barColor: "bg-green-500" };
  if (score >= 40) return { label: "Medium", color: "text-yellow-500", bg: "bg-yellow-500/10", barColor: "bg-yellow-500" };
  return { label: "Low", color: "text-red-500", bg: "bg-red-500/10", barColor: "bg-red-500" };
};

const Workspace = () => {
  const { documentId } = useParams<{ documentId: string }>();
  const navigate = useNavigate();
  const { session, profile } = useAuth();
  const { toast } = useToast();

  const [doc, setDoc] = useState<DocInfo | null>(null);
  const [chunks, setChunks] = useState<ChunkInfo[]>([]);
  const [summary, setSummary] = useState("");
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [expandedSources, setExpandedSources] = useState<Record<number, boolean>>({});
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [highlightedChunk, setHighlightedChunk] = useState<number | null>(null);
  const [showChunks, setShowChunks] = useState(false);
  const [summaryExpanded, setSummaryExpanded] = useState(true);

  const scrollRef = useRef<HTMLDivElement>(null);
  const chunkRefs = useRef<Record<number, HTMLDivElement | null>>({});

  useEffect(() => {
    if (documentId && profile) loadDocument();
  }, [documentId, profile?.tenant_id]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadDocument = async () => {
    if (!documentId) return;
    const { data } = await supabase
      .from("documents")
      .select("id, filename, file_type, file_size, chunk_count, created_at")
      .eq("id", documentId)
      .single();
    if (data) {
      setDoc(data);
      loadChunks(data.id);
      generateSummary(data.id);
    }
  };

  const loadChunks = async (docId: string) => {
    const { data } = await supabase
      .from("document_chunks")
      .select("id, chunk_index, chunk_text")
      .eq("document_id", docId)
      .order("chunk_index", { ascending: true })
      .limit(100);
    if (data) setChunks(data);
  };

  const generateSummary = async (docId: string) => {
    if (!profile || !session) return;
    setSummaryLoading(true);
    let summaryText = "";
    await streamRagQuery({
      question: "Provide a comprehensive summary of this document. Include key topics, main points, and important details.",
      tenantId: profile.tenant_id,
      accessToken: session.access_token,
      mode: "summarize",
      documentId: docId,
      onDelta: (text) => {
        summaryText += text;
        setSummary(summaryText);
      },
      onSources: () => {},
      onDone: () => setSummaryLoading(false),
      onError: (err) => {
        setSummaryLoading(false);
        setSummary("Could not generate summary.");
      },
    });
  };

  const handleSend = async () => {
    const question = input.trim();
    if (!question || !profile || !session || !documentId) return;
    setInput("");

    const userMsg: Message = { role: "user", content: question };
    setMessages((prev) => [...prev, userMsg]);
    setIsStreaming(true);

    let assistantContent = "";
    let sources: StreamSource[] = [];

    await streamRagQuery({
      question,
      tenantId: profile.tenant_id,
      accessToken: session.access_token,
      documentId,
      onDelta: (chunk) => {
        assistantContent += chunk;
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant" && !last.confidence) {
            return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantContent } : m));
          }
          return [...prev, { role: "assistant", content: assistantContent }];
        });
      },
      onSources: (s) => {
        sources = s;
        const confidence = calculateConfidence(s);
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === "assistant") {
            last.sources = s;
            last.confidence = confidence;
          }
          return [...updated];
        });
      },
      onDone: () => setIsStreaming(false),
      onError: (err) => {
        setIsStreaming(false);
        toast({ title: "Error", description: err, variant: "destructive" });
      },
    });
  };

  const scrollToChunk = (chunkIndex: number) => {
    setShowChunks(true);
    setHighlightedChunk(chunkIndex);
    setTimeout(() => {
      chunkRefs.current[chunkIndex]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 200);
  };

  const formatSize = (bytes: number | null) => {
    if (!bytes) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  if (!doc) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Main panel */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="border-b border-border px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/documents")} className="shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 shrink-0">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-sm font-bold text-foreground truncate">AI Workspace — {doc.filename}</h1>
            <p className="text-xs text-muted-foreground">Chat with this document only</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="gap-1 text-xs">
              <Layers className="h-3 w-3" />{doc.chunk_count || 0} chunks
            </Badge>
            <Badge variant="secondary" className="gap-1 text-xs">
              <Hash className="h-3 w-3" />{formatSize(doc.file_size)}
            </Badge>
            <Button
              variant={showChunks ? "default" : "outline"}
              size="sm"
              className="gap-1 text-xs"
              onClick={() => setShowChunks(!showChunks)}
            >
              <BookOpen className="h-3.5 w-3.5" />
              {showChunks ? "Hide Chunks" : "View Chunks"}
            </Button>
          </div>
        </div>

        {/* Collapsible Summary */}
        <div className="border-b border-border">
          <button
            onClick={() => setSummaryExpanded(!summaryExpanded)}
            className="w-full flex items-center gap-2 px-6 py-3 hover:bg-muted/30 transition-colors"
          >
            <Sparkles className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Document Summary</h2>
            {summaryLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            {summaryExpanded ? <ChevronUp className="h-4 w-4 ml-auto text-muted-foreground" /> : <ChevronDown className="h-4 w-4 ml-auto text-muted-foreground" />}
          </button>
          <AnimatePresence>
            {summaryExpanded && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="px-6 pb-4 max-h-48 overflow-y-auto">
                  <div className="prose prose-sm dark:prose-invert max-w-none text-sm text-muted-foreground">
                    {summary ? <ReactMarkdown>{summary}</ReactMarkdown> : (
                      <p className="text-muted-foreground/60 italic">Generating summary...</p>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Context indicator */}
        <div className="px-6 py-2 bg-primary/5 border-b border-primary/10">
          <div className="flex items-center gap-2 text-xs text-primary">
            <FileText className="h-3.5 w-3.5" />
            <span className="font-medium">Context: {doc.filename} only</span>
          </div>
        </div>

        {/* Chat messages */}
        <ScrollArea className="flex-1">
          <div className="max-w-3xl mx-auto p-4 space-y-4">
            {messages.length === 0 && (
              <div className="text-center py-12">
                <p className="text-sm text-muted-foreground">Ask a question about <strong>{doc.filename}</strong></p>
                <div className="flex flex-wrap justify-center gap-2 mt-4">
                  {["What is this document about?", "List the key topics", "What are the main findings?"].map((q, i) => (
                    <Button key={i} variant="outline" size="sm" className="text-xs" onClick={() => { setInput(q); }}>
                      {q}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            <AnimatePresence mode="popLayout">
              {messages.map((msg, i) => (
                <motion.div
                  key={`msg-${i}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn("flex gap-3", msg.role === "user" ? "justify-end" : "justify-start")}
                >
                  <div className={cn("max-w-[85%] rounded-2xl px-4 py-3", msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-card border border-border")}>
                    {msg.role === "assistant" ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none text-sm [&_p]:mb-2 [&_p:last-child]:mb-0">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    )}

                    {/* Confidence */}
                    {msg.role === "assistant" && msg.confidence != null && msg.confidence > 0 && (() => {
                      const ci = getConfidenceInfo(msg.confidence);
                      return (
                        <div className={cn("mt-2 flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs border-t border-border/30 pt-2", ci.bg)}>
                          <ShieldCheck className={cn("h-3.5 w-3.5", ci.color)} />
                          <span className={cn("font-semibold", ci.color)}>Confidence: {msg.confidence}%</span>
                          <div className="flex-1 h-1.5 rounded-full bg-muted ml-1">
                            <div className={cn("h-full rounded-full transition-all", ci.barColor)} style={{ width: `${msg.confidence}%` }} />
                          </div>
                          <span className={cn("font-medium", ci.color)}>{ci.label}</span>
                        </div>
                      );
                    })()}

                    {/* Sources with chunk navigation */}
                    {msg.sources && msg.sources.length > 0 && (
                      <div className="mt-2 border-t border-border/30 pt-2">
                        <button
                          onClick={() => setExpandedSources(prev => ({ ...prev, [i]: !prev[i] }))}
                          className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors w-full"
                        >
                          <FileText className="h-3 w-3" />
                          <span>{msg.sources.length} source{msg.sources.length !== 1 ? "s" : ""}</span>
                          {expandedSources[i] ? <ChevronUp className="h-3 w-3 ml-auto" /> : <ChevronDown className="h-3 w-3 ml-auto" />}
                        </button>
                        <AnimatePresence>
                          {expandedSources[i] && (
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                              <div className="mt-1.5 space-y-1">
                                {msg.sources.map((s, j) => (
                                  <button
                                    key={j}
                                    onClick={() => scrollToChunk(s.chunk_index)}
                                    className="flex items-start gap-1.5 text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1.5 w-full text-left hover:bg-muted transition-colors"
                                  >
                                    <FileText className="h-3 w-3 shrink-0 mt-0.5" />
                                    <div className="min-w-0">
                                      <span className="font-medium text-foreground">Chunk {s.chunk_index}</span>
                                      {s.similarity > 0 && <span className="ml-1 opacity-60">· {(s.similarity * 100).toFixed(0)}% match</span>}
                                      <p className="text-muted-foreground/80 line-clamp-2 mt-0.5">{s.chunk_text?.substring(0, 120)}...</p>
                                    </div>
                                  </button>
                                ))}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {isStreaming && messages[messages.length - 1]?.role !== "assistant" && (
              <div className="flex items-center gap-3 px-4">
                <div className="flex items-center gap-1.5 bg-card border border-border rounded-2xl px-4 py-3">
                  <span className="flex gap-1">
                    <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "300ms" }} />
                  </span>
                  <span className="text-xs text-muted-foreground ml-2">Searching document...</span>
                </div>
              </div>
            )}
            <div ref={scrollRef} />
          </div>
        </ScrollArea>

        {/* Input */}
        <div className="border-t border-border p-4">
          <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="max-w-3xl mx-auto flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={`Ask about ${doc.filename}...`}
              disabled={isStreaming}
              className="flex-1"
              maxLength={2000}
            />
            <Button type="submit" disabled={isStreaming || !input.trim()} size="icon">
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </div>

      {/* Chunk panel */}
      <AnimatePresence>
        {showChunks && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 360, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            className="border-l border-border bg-card/50 flex flex-col overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Document Chunks</h3>
              <Badge variant="secondary" className="text-xs">{chunks.length}</Badge>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-3 space-y-2">
                {chunks.map((chunk) => (
                  <div
                    key={chunk.id}
                    ref={(el) => { chunkRefs.current[chunk.chunk_index] = el; }}
                    className={cn(
                      "rounded-lg border p-3 transition-all duration-300",
                      highlightedChunk === chunk.chunk_index
                        ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                        : "border-border"
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <Badge variant="outline" className="text-xs">Chunk {chunk.chunk_index}</Badge>
                      <span className="text-[10px] text-muted-foreground">{chunk.chunk_text.length} chars</span>
                    </div>
                    <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed line-clamp-6">
                      {chunk.chunk_text}
                    </p>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Workspace;
