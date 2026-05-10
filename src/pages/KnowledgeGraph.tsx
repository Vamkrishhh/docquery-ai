import React, { useState, useEffect, useRef, useCallback } from "react";
import ForceGraph2D from "react-force-graph-2d";
import { useTheme } from "@/contexts/ThemeContext";
import { 
  Network, 
  Search, 
  Filter, 
  Download, 
  Focus, 
  ZoomIn, 
  ZoomOut,
  FileText,
  Hash,
  Database as DatabaseIcon,
  X,
  RefreshCw,
  Sparkles,
  Loader2,
  Info,
  ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// Types
interface GraphNode {
  id: string;
  name: string;
  group: "document" | "topic" | "chunk";
  val: number;
  color?: string;
  metadata?: any;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
}

interface GraphLink {
  source: string;
  target: string;
  value?: number;
}

interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

// Design Tokens for the Knowledge Graph
const COLORS = {
  document: "#a855f7", // Vibrant Purple
  topic: "#10b981",    // Emerald Green
  chunk: "#3b82f6",    // Bright Blue
  background: {
    dark: "#09090b",
    light: "#ffffff"
  },
  text: {
    dark: "#eeeeee",
    light: "#222222"
  }
};

// Robust simple entity/topic extractor from text
const extractTopics = (text: string): string[] => {
  if (!text) return [];
  
  // Expanded stop words for better filtering
  const stopWords = new Set([
    "the", "and", "this", "that", "with", "from", "their", "more", "about", 
    "your", "will", "have", "been", "was", "were", "they", "there", "what",
    "which", "when", "where", "how", "this", "those", "these", "than", "then",
    "once", "here", "there", "some", "such", "only", "well", "very", "also"
  ]);
  
  // 1. Find Title-Cased words (potential names/entities)
  const entityRegex = /\b([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})*)\b/g;
  const entities = text.match(entityRegex) || [];
  
  // 2. Find significant technical terms (all caps, or mixed case with numbers)
  const techRegex = /\b([A-Z]{2,}\d*)\b/g;
  const techTerms = text.match(techRegex) || [];
  
  const counts: Record<string, number> = {};
  [...entities, ...techTerms].forEach(w => {
    const word = w.trim();
    if (word.length < 3 || stopWords.has(word.toLowerCase())) return;
    counts[word] = (counts[word] || 0) + 1;
  });
  
  // Return top 4 unique topics for better graph density
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([word]) => word);
};

const KnowledgeGraph = () => {
  const { theme } = useTheme();
  const { profile } = useAuth();
  const { toast } = useToast();
  const fgRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  const [filteredData, setFilteredData] = useState<GraphData>({ nodes: [], links: [] });
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [searchQuery, setSearchQuery] = useState("");
  
  const [filters, setFilters] = useState({
    documents: true,
    topics: true,
    chunks: true,
  });

  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [hoverNode, setHoverNode] = useState<GraphNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const [highlightNodes, setHighlightNodes] = useState(new Set());
  const [highlightLinks, setHighlightLinks] = useState(new Set());

  const buildGraphDynamically = useCallback(async () => {
    if (!profile?.tenant_id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setGenerating(true);

    try {
      // 1. Fetch actual documents (Current Tenant Only)
      const { data: dbDocs, error: docError } = await supabase
        .from("documents")
        .select("id, filename, file_type, file_size, chunk_count, created_at")
        .eq("tenant_id", profile.tenant_id)
        .order("created_at", { ascending: false })
        .limit(20);

      if (docError) throw docError;

      // 2. Fetch actual chunks for these documents
      const { data: dbChunks, error: chunkError } = await supabase
        .from("document_chunks")
        .select("id, document_id, chunk_index, chunk_text")
        .eq("tenant_id", profile.tenant_id)
        .limit(150);

      if (chunkError) throw chunkError;

      const nodes: GraphNode[] = [];
      const links: GraphLink[] = [];
      const topicMap = new Map<string, { id: string, name: string, docs: Set<string>, chunks: Set<string> }>();

      // Build Document Nodes
      dbDocs?.forEach(doc => {
        nodes.push({
          id: doc.id,
          name: doc.filename,
          group: "document",
          val: 25, // Documents are large focal points
          color: COLORS.document,
          metadata: {
            format: doc.file_type?.toUpperCase(),
            size: doc.file_size ? `${(doc.file_size / 1024).toFixed(1)} KB` : "N/A",
            chunkCount: doc.chunk_count || 0,
            uploaded: new Date(doc.created_at).toLocaleDateString()
          }
        });
      });

      // Build Chunk Nodes & Map Topics
      dbChunks?.forEach(chunk => {
        const chunkId = `chunk_${chunk.id}`;
        nodes.push({
          id: chunkId,
          name: `P${chunk.chunk_index + 1}: ${chunk.chunk_text.substring(0, 20)}...`,
          group: "chunk",
          val: 6, // Chunks are small satellite nodes
          color: COLORS.chunk,
          metadata: {
            text_preview: chunk.chunk_text.substring(0, 150) + "...",
            index: chunk.chunk_index,
            length: chunk.chunk_text.length
          }
        });

        // Link Chunk to its Source Document
        links.push({ source: chunk.document_id, target: chunkId, value: 1 });

        // Extract topics/entities from actual content
        const extracted = extractTopics(chunk.chunk_text);
        extracted.forEach(topicName => {
          const topicKey = topicName.toLowerCase().trim();
          if (!topicMap.has(topicKey)) {
            topicMap.set(topicKey, { 
              id: `topic_${topicKey}`, 
              name: topicName, 
              docs: new Set([chunk.document_id]),
              chunks: new Set([chunkId])
            });
          } else {
            topicMap.get(topicKey)!.docs.add(chunk.document_id);
            topicMap.get(topicKey)!.chunks.add(chunkId);
          }
          
          // Link Chunk to the extracted Topic/Entity
          links.push({ source: chunkId, target: `topic_${topicKey}`, value: 1 });
        });
      });

      // Build Topic Nodes (Aggregated entities)
      topicMap.forEach(topic => {
        nodes.push({
          id: topic.id,
          name: topic.name,
          group: "topic",
          val: 10 + (topic.docs.size * 3), // Scale size based on cross-doc prevalence
          color: COLORS.topic,
          metadata: {
            connections: topic.chunks.size,
            prevalence: topic.docs.size,
            type: "Semantic Node"
          }
        });

        // Link Topic back to Documents to highlight clusters
        topic.docs.forEach(docId => {
          links.push({ source: docId, target: topic.id, value: 2 });
        });
      });

      setGraphData({ nodes, links });
      setFilteredData({ nodes, links });
      
      if (!dbDocs?.length) {
        toast({ title: "Map Empty", description: "Upload documents to dynamically generate your AI knowledge graph.", variant: "default" });
      } else {
        toast({ title: "AI Graph Refreshed", description: `Dynamic mapping complete: ${nodes.length} nodes from ${dbDocs.length} live documents.` });
      }
    } catch (err: any) {
      toast({ title: "Processing Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
      setGenerating(false);
    }
  }, [profile?.tenant_id, toast]);

  useEffect(() => {
    buildGraphDynamically();
  }, [buildGraphDynamically]);

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const { clientWidth, clientHeight } = containerRef.current;
        setDimensions({
          width: clientWidth || window.innerWidth - 300,
          height: clientHeight || window.innerHeight - 100,
        });
      }
    };
    updateDimensions();
    // Add a small delay for DOM stability
    const timer = setTimeout(updateDimensions, 100);
    window.addEventListener("resize", updateDimensions);
    return () => {
      window.removeEventListener("resize", updateDimensions);
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const q = searchQuery.toLowerCase();
    const nodes = graphData.nodes.filter(node => {
      if (node.group === "document" && !filters.documents) return false;
      if (node.group === "topic" && !filters.topics) return false;
      if (node.group === "chunk" && !filters.chunks) return false;
      if (q && !node.name.toLowerCase().includes(q)) return false;
      return true;
    });

    const nodeIds = new Set(nodes.map(n => n.id));
    const links = graphData.links.filter(
      link => nodeIds.has((typeof link.source === 'string' ? link.source : (link.source as any).id)) && 
              nodeIds.has((typeof link.target === 'string' ? link.target : (link.target as any).id))
    );

    setFilteredData({ nodes, links });
  }, [graphData, filters, searchQuery]);

  const handleNodeClick = useCallback((node: GraphNode) => {
    setSelectedNode(node);
    const newHighlightNodes = new Set();
    const newHighlightLinks = new Set();
    newHighlightNodes.add(node.id);
    
    filteredData.links.forEach((link: any) => {
      const sourceId = link.source.id ?? link.source;
      const targetId = link.target.id ?? link.target;
      if (sourceId === node.id || targetId === node.id) {
        newHighlightLinks.add(link);
        newHighlightNodes.add(sourceId);
        newHighlightNodes.add(targetId);
      }
    });

    setHighlightNodes(newHighlightNodes);
    setHighlightLinks(newHighlightLinks);

    if (fgRef.current) {
      fgRef.current.centerAt(node.x, node.y, 1000);
      fgRef.current.zoom(2.5, 1000);
    }
  }, [filteredData]);

  const handleNodeHover = useCallback((node: GraphNode | null) => {
    setHoverNode(node);
    if (selectedNode) return;
    if (!node) {
      setHighlightNodes(new Set());
      setHighlightLinks(new Set());
      return;
    }
    const newHighlightNodes = new Set();
    const newHighlightLinks = new Set();
    newHighlightNodes.add(node.id);
    filteredData.links.forEach((link: any) => {
      const sourceId = link.source.id ?? link.source;
      const targetId = link.target.id ?? link.target;
      if (sourceId === node.id || targetId === node.id) {
        newHighlightLinks.add(link);
        newHighlightNodes.add(sourceId);
        newHighlightNodes.add(targetId);
      }
    });
    setHighlightNodes(newHighlightNodes);
    setHighlightLinks(newHighlightLinks);
  }, [filteredData, selectedNode]);

  const clearSelection = () => {
    setSelectedNode(null);
    setHighlightNodes(new Set());
    setHighlightLinks(new Set());
    fgRef.current?.zoomToFit(1000, 50);
  };

  const paintNode = useCallback((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const isHighlighted = highlightNodes.has(node.id) || hoverNode?.id === node.id;
    const isMuted = highlightNodes.size > 0 && !isHighlighted;
    
    ctx.beginPath();
    ctx.arc(node.x, node.y, node.val, 0, 2 * Math.PI, false);
    ctx.fillStyle = node.color;
    
    if (isMuted) ctx.globalAlpha = 0.15;
    else if (isHighlighted) {
      ctx.shadowBlur = 15;
      ctx.shadowColor = node.color;
    }
    
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    if (globalScale > 1.2 || isHighlighted || node.group === "document") {
      const fontSize = node.group === "document" ? 14/globalScale : 10/globalScale;
      ctx.font = `${node.group === 'document' ? 'bold' : 'normal'} ${fontSize}px Inter, Sans-Serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = isMuted ? (theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)') : (theme === 'dark' ? '#eee' : '#222');
      const label = node.name;
      ctx.fillText(label, node.x, node.y + node.val + (8/globalScale));
    }
  }, [highlightNodes, hoverNode, theme]);

  return (
    <div className="flex h-screen bg-background overflow-hidden relative selection:bg-indigo-500/30">
      
      {/* Primary Graph Canvas */}
      <div className="flex-1 relative" ref={containerRef}>
        {dimensions.width > 0 && (
          <ForceGraph2D
            ref={fgRef}
            width={dimensions.width}
            height={dimensions.height}
            graphData={filteredData}
            nodeLabel="name"
            nodeRelSize={1}
            nodeCanvasObject={paintNode}
            linkColor={(link) => highlightLinks.has(link) ? (theme === 'dark' ? '#fff' : '#000') : (theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)')}
            linkWidth={(link) => highlightLinks.has(link) ? 2 : 1}
            onNodeClick={handleNodeClick}
            onNodeHover={handleNodeHover}
            onBackgroundClick={clearSelection}
            cooldownTicks={120}
            d3AlphaDecay={0.04}
            d3VelocityDecay={0.3}
            backgroundColor={theme === 'dark' ? COLORS.background.dark : COLORS.background.light}
          />
        )}
        
        {/* Persistent Floating Controls Overlay */}
        <div className="absolute top-6 left-6 z-10 w-[350px] space-y-4">
          <div className="flex items-center gap-4 bg-background/40 backdrop-blur-xl p-3 rounded-2xl border border-border/50 shadow-2xl">
            <div className="h-12 w-12 rounded-xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
              <Network className="h-6 w-6 text-indigo-500" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tighter uppercase italic">Semantic Forge</h1>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-none">Intelligence Topology</p>
            </div>
          </div>
          
          <Card className="bg-background/60 backdrop-blur-2xl border-border/40 shadow-2xl overflow-hidden">
            <CardHeader className="p-4 pb-2">
               <CardTitle className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">Contextual Search</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Query knowledge nodes..." 
                  className="pl-10 h-11 bg-muted/40 border-border/40 rounded-xl text-sm"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Filter Perspective</Label>
                  <Filter className="h-3 w-3 text-muted-foreground" />
                </div>
                <div className="grid grid-cols-1 gap-2.5">
                  {[
                    { id: "documents", label: "Documents", color: COLORS.document },
                    { id: "topics", label: "Topics & Entities", color: COLORS.topic },
                    { id: "chunks", label: "Data Chunks", color: COLORS.chunk }
                  ].map((f) => (
                    <div key={f.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/20 border border-border/20 group hover:border-indigo-500/30 transition-all">
                      <div className="flex items-center gap-3">
                        <Checkbox 
                           id={`filter-${f.id}`} 
                           checked={(filters as any)[f.id]} 
                           onCheckedChange={(c) => setFilters(p => ({...p, [f.id]: !!c}))}
                           className="rounded-md border-border/60"
                        />
                        <Label htmlFor={`filter-${f.id}`} className="text-xs font-bold flex items-center gap-2 cursor-pointer">
                           <div className="w-2 h-2 rounded-full" style={{ background: f.color, boxShadow: `0 0 8px ${f.color}66` }} />
                           {f.label}
                        </Label>
                      </div>
                      <span className="text-[10px] font-black text-muted-foreground/40 group-hover:text-indigo-500/60 transition-colors">
                        {graphData.nodes.filter(n => (f.id === 'topics' ? n.group === 'topic' : f.id.startsWith(n.group))).length}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              
              <Button 
                onClick={buildGraphDynamically} 
                disabled={generating} 
                variant="default" 
                className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-500/20 text-xs font-black uppercase tracking-widest rounded-xl"
              >
                {generating ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                {generating ? "Mapping Synapses..." : "Regenerate Graph"}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Action Controls */}
        <div className="absolute bottom-6 right-6 z-10 flex flex-col gap-3">
          <div className="flex flex-col bg-background/60 backdrop-blur-xl border border-border/40 rounded-2xl p-1.5 shadow-2xl">
            <Button variant="ghost" size="icon" onClick={() => fgRef.current?.zoom(fgRef.current.zoom() * 1.5, 400)} className="h-10 w-10 text-muted-foreground hover:text-indigo-500"><ZoomIn className="h-5 w-5" /></Button>
            <Button variant="ghost" size="icon" onClick={() => fgRef.current?.zoom(fgRef.current.zoom() / 1.5, 400)} className="h-10 w-10 text-muted-foreground hover:text-indigo-500"><ZoomOut className="h-5 w-5" /></Button>
            <div className="h-px bg-border/40 mx-2 my-1" />
            <Button variant="ghost" size="icon" onClick={() => fgRef.current?.zoomToFit(800, 50)} className="h-10 w-10 text-muted-foreground hover:text-indigo-500"><Focus className="h-5 w-5" /></Button>
          </div>
          <Button variant="default" size="icon" onClick={() => {
            const canvas = containerRef.current?.querySelector("canvas");
            if (canvas) {
              const link = document.createElement("a");
              link.download = `docquery-mapping-${Date.now()}.png`;
              link.href = canvas.toDataURL("image/png");
              link.click();
            }
          }} className="h-12 w-12 rounded-2xl bg-primary shadow-xl shadow-primary/20">
            <Download className="h-5 w-5" />
          </Button>
        </div>

        {/* Bottom Legend & Status */}
        <div className="absolute bottom-6 left-6 z-10 flex items-center gap-4 bg-background/60 backdrop-blur-2xl border border-border/50 px-5 py-3 rounded-[1.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.2)]">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-purple-500 animate-pulse ring-4 ring-purple-500/10"></div>
              <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Docs</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-4 ring-emerald-500/10"></div>
              <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Entities</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-blue-500 ring-4 ring-blue-500/10"></div>
              <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Seeds</span>
            </div>
          </div>
          <div className="h-5 w-px bg-border/60" />
          <div className="flex items-center gap-2.5">
            <Badge variant="outline" className="bg-muted/40 border-border/40 text-[10px] font-bold px-3 uppercase text-indigo-500">
               {graphData.nodes.length} Elements
            </Badge>
            <Badge variant="outline" className="bg-muted/40 border-border/40 text-[10px] font-bold px-3 uppercase text-emerald-500">
               {graphData.links.length} Relations
            </Badge>
          </div>
        </div>

        {/* Global Loading View */}
        <AnimatePresence>
          {loading && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-md">
              <div className="flex flex-col items-center gap-6">
                <div className="relative h-20 w-20">
                  <Network className="h-full w-full text-indigo-500 opacity-20 animate-pulse" />
                  <Loader2 className="absolute inset-0 h-full w-full text-indigo-600 animate-spin" />
                </div>
                <div className="text-center space-y-1">
                  <h3 className="font-black uppercase tracking-widest text-lg">Forging Knowledge</h3>
                  <p className="text-xs font-bold text-muted-foreground uppercase opacity-60">Executing AI Relationship Scan...</p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Detail Inspector Sidebar */}
      <AnimatePresence>
        {selectedNode && (
          <motion.div 
            initial={{ x: 400, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 400, opacity: 0 }}
            className="w-[380px] bg-background/95 backdrop-blur-3xl border-l border-border/40 h-full flex flex-col z-20 absolute right-0 shadow-[0_0_80px_rgba(0,0,0,0.5)]"
          >
            <div className="p-6 border-b border-border/40 bg-muted/10">
              <div className="flex items-center justify-between mb-6">
                <Badge variant="outline" className="text-indigo-500 border-indigo-500/30 uppercase tracking-[0.2em] text-[10px] font-black px-3 py-1">Node Inspector</Badge>
                <Button variant="ghost" size="icon" onClick={clearSelection} className="h-10 w-10 rounded-xl hover:bg-muted/80"><X className="h-5 w-5" /></Button>
              </div>
              <div className="flex items-start gap-4">
                 <div className="h-14 w-14 shrink-0 rounded-2xl bg-muted border border-border/50 flex items-center justify-center shadow-lg">
                    {selectedNode.group === "document" && <FileText className="h-6 w-6 text-purple-500" />}
                    {selectedNode.group === "topic" && <Hash className="h-6 w-6 text-emerald-500" />}
                    {selectedNode.group === "chunk" && <DatabaseIcon className="h-6 w-6 text-blue-500" />}
                 </div>
                 <div className="min-w-0">
                    <h3 className="font-black text-xl tracking-tight leading-tight break-words">{selectedNode.name}</h3>
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mt-1">{selectedNode.group} Semantic Segment</p>
                 </div>
              </div>
            </div>
            
            <ScrollArea className="flex-1 p-6">
              <div className="space-y-8">
                {selectedNode.metadata && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                       <Info className="h-3.5 w-3.5 text-indigo-500" />
                       <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Detailed Properties</span>
                    </div>
                    <div className="space-y-2">
                      {Object.entries(selectedNode.metadata).map(([key, value]) => (
                        <div key={key} className="flex flex-col p-3 rounded-xl bg-muted/30 border border-border/40">
                          <span className="text-[9px] font-black uppercase text-muted-foreground/60 tracking-tighter mb-1">{key.replace(/_/g, ' ')}</span>
                          <span className="text-sm font-bold truncate group cursor-default">{String(value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                       <Network className="h-3.5 w-3.5 text-indigo-500" />
                       <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Relational Proxies</span>
                    </div>
                    <Badge className="h-5 text-[10px]">{highlightNodes.size - 1}</Badge>
                  </div>
                  <div className="space-y-2">
                    {graphData.links
                      .filter((l: any) => (l.source.id ?? l.source) === selectedNode.id || (l.target.id ?? l.target) === selectedNode.id)
                      .slice(0, 15)
                      .map((link: any, i) => {
                        const isSource = (link.source.id ?? link.source) === selectedNode.id;
                        const related = isSource ? (link.target.id ?? link.target) : (link.source.id ?? link.source);
                        const node = graphData.nodes.find(n => n.id === related);
                        if (!node) return null;
                        return (
                          <div key={i} onClick={() => handleNodeClick(node)} className="flex items-center justify-between p-3 rounded-xl border border-border/40 hover:border-indigo-500/30 hover:bg-muted/50 cursor-pointer transition-all group">
                            <div className="flex items-center gap-3 min-w-0">
                               <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: node.color }} />
                               <div className="min-w-0">
                                 <p className="text-xs font-bold truncate">{node.name}</p>
                                 <p className="text-[9px] uppercase font-black text-muted-foreground/60 tracking-wider">{node.group}</p>
                               </div>
                            </div>
                            <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0" />
                          </div>
                        );
                      })}
                  </div>
                </div>
              </div>
            </ScrollArea>
            
            <div className="p-6 border-t border-border/40 bg-muted/20">
              <Button variant="outline" className="w-full text-[10px] font-black uppercase tracking-widest h-11 rounded-xl" onClick={buildGraphDynamically}>
                <RefreshCw className="mr-2 h-3.5 w-3.5" />
                Trigger AI Rescan
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default KnowledgeGraph;
