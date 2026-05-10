import React from "react";
import { 
  Globe, 
  Layers, 
  Database as DatabaseIcon, 
  ShieldCheck, 
  Workflow, 
  Server, 
  Cpu, 
  Lock, 
  Share2,
  ChevronRight,
  Braces,
  Cloud,
  Network,
  GitBranch,
  Terminal,
  Zap,
  Box,
  Layout,
  HardDrive,
  Activity
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Mermaid from "@/components/Mermaid";
import { motion } from "framer-motion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const Architecture: React.FC = () => {
  const systemDiagram = `
    graph TD
      subgraph Frontend_Layer [Client Application - Vite + React]
        APP[DocQuery AI App]
        AUTH_CTX[Auth Context]
        UI_KIT[ShadcnUI + Tailwind]
        STREAM[Streaming Client]
      end

      subgraph API_Layer [Supabase Edge Functions]
        RAG_FN[RAG Query Engine]
        AUTH_FN[MFA & Security Handler]
        DATA_FN[Document Parser]
        ANALYTICS_FN[Analytics Aggregator]
      end

      subgraph Security_Layer [Tenant Isolation & RLS]
        TENANT_ID[(Tenant ID Scoping)]
        RLS[Row Level Security Policies]
        JWT[JWT Authentication]
      end

      subgraph Storage_Layer [Data & Persistence]
        DB[(PostgreSQL - Metadata)]
        VEC_DB[(Pinecone - Vector Embeddings)]
        STORAGE[Supabase Storage - Raw Files]
      end

      subgraph AI_Provider [LLM Integration]
        GEMINI[Google Gemini Pro/Flash]
      end

      APP --> AUTH_CTX
      AUTH_CTX --> AUTH_FN
      APP --> RAG_FN
      RAG_FN --> VEC_DB
      RAG_FN --> DB
      RAG_FN --> GEMINI
      APP --> DATA_FN
      DATA_FN --> STORAGE
      DATA_FN --> VEC_DB
      
      DB --- RLS
      RLS --- TENANT_ID
      TENANT_ID --- JWT
  `;

  const dataFlowDiagram = `
    sequenceDiagram
      participant User
      participant Frontend
      participant EdgeFunction
      participant Pinecone
      participant Postgres
      participant Gemini

      User->>Frontend: Submit Query
      Frontend->>EdgeFunction: Secure Request (with JWT)
      EdgeFunction->>Pinecone: Semantic Search (Query Vector)
      Pinecone-->>EdgeFunction: Contextual Chunks
      EdgeFunction->>Postgres: Fetch Metadata & Audit Log
      EdgeFunction->>Gemini: Context + Query
      Gemini-->>EdgeFunction: AI Response
      EdgeFunction-->>Frontend: Streamed Response
      Frontend->>User: Display Answer + Sources
  `;

  const deploymentDiagram = `
    graph LR
      GH[GitHub Repo]
      GA[GitHub Actions]
      SB[Supabase Platform]
      PC[Pinecone Cloud]
      GC[Google AI Studio]

      GH --> GA
      GA -->|Deploy Functions| SB
      GA -->|Apply Migrations| SB
      SB -->|Vector Upsert| PC
      SB -->|Inference| GC
  `;

  const techStack = [
    { name: "Frontend", items: ["React 18", "TypeScript", "Vite", "TailwindCSS", "Framer Motion", "Recharts"], icon: Globe, color: "text-blue-500", bg: "bg-blue-500/10" },
    { name: "Backend", items: ["Supabase", "Edge Functions", "Deno Runtime", "Postgres (pgvector)"], icon: Server, color: "text-green-500", bg: "bg-green-500/10" },
    { name: "AI & Vector", items: ["Google Gemini 1.5", "Pinecone Vector DB", "RAG Pipeline", "MTEB Embeddings"], icon: Cpu, color: "text-purple-500", bg: "bg-purple-500/10" },
    { name: "Security", items: ["Supabase Auth", "RLS Policies", "Tenant Isolation", "Secret Management"], icon: Lock, color: "text-red-500", bg: "bg-red-500/10" },
  ];

  const components = [
    { title: "RAG Engine", desc: "Handles semantic retrieval, context window management, and LLM orchestration via Edge Functions.", icon: Zap },
    { title: "Tenant Isolated DB", desc: "PostgreSQL schema with strict RLS ensuring no cross-tenant data leakage.", icon: HardDrive },
    { title: "Vector Storage", desc: "Pinecone index with metadata filtering ensuring queries remain within tenant boundaries.", icon: Box },
    { title: "Streaming Client", desc: "Custom React hooks for SSE providing real-time UI updates during generation.", icon: Activity },
  ];

  return (
    <div className="h-full overflow-y-auto bg-background/50 p-6 md:p-8 lg:p-12 space-y-12 animate-in fade-in duration-700">
      <div className="max-w-4xl space-y-4">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
          <Badge variant="outline" className="text-primary border-primary/20 uppercase tracking-widest text-[10px] font-bold mb-4 px-3 py-1">Infrastructure Blueprint</Badge>
          <div className="flex items-center gap-4 mb-2">
            <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center shadow-lg shadow-primary/5">
              <Network className="h-7 w-7 text-primary" />
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl">System Architecture</h1>
          </div>
          <p className="text-muted-foreground text-xl leading-relaxed">
            The platform utilizes a serverless, horizontally scalable architecture designed for high-security multi-tenant document intelligence.
          </p>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {techStack.map((stack, idx) => (
          <motion.div
            key={stack.name}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
          >
            <Card className="h-full bg-card/40 backdrop-blur-md border-border/50 hover:border-primary/30 transition-all group shadow-sm">
              <CardHeader className="pb-4">
                <div className={`h-12 w-12 rounded-xl ${stack.bg} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                  <stack.icon className={`h-6 w-6 ${stack.color}`} />
                </div>
                <CardTitle className="text-xl font-bold">{stack.name}</CardTitle>
                <CardDescription className="text-xs font-bold uppercase text-muted-foreground">Core Ecosystem</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {stack.items.map(item => (
                    <Badge key={item} variant="secondary" className="bg-muted/50 border border-border/50 font-medium hover:bg-primary/10 transition-colors">
                      {item}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="space-y-8">
        <div className="flex items-center justify-between border-b border-border/50 pb-4">
          <div className="flex items-center gap-3">
            <Share2 className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-bold uppercase tracking-tight">Technical Models</h2>
          </div>
          <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground font-mono">
            <Terminal className="h-3 w-3" /> Mermaid Engine Active
          </div>
        </div>

        <Tabs defaultValue="system" className="w-full">
          <TabsList className="bg-muted/40 border border-border/50 p-1 mb-8 rounded-xl h-11">
            <TabsTrigger value="system" className="text-xs font-black uppercase gap-2 px-6"><Layers className="h-3.5 w-3.5" /> High-Level Topology</TabsTrigger>
            <TabsTrigger value="data" className="text-xs font-black uppercase gap-2 px-6"><Workflow className="h-3.5 w-3.5" /> Data Interaction</TabsTrigger>
            <TabsTrigger value="deploy" className="text-xs font-black uppercase gap-2 px-6"><GitBranch className="h-3.5 w-3.5" /> CI/CD Pipeline</TabsTrigger>
          </TabsList>
          
          <div className="mt-0">
            <TabsContent value="system" className="mt-0 focus-visible:ring-0">
              <Card className="bg-card/40 border-border/50 overflow-hidden shadow-2xl backdrop-blur-sm rounded-2xl">
                <CardContent className="p-10 flex justify-center items-center bg-[radial-gradient(circle_at_50%_50%,rgba(139,92,246,0.05),transparent_70%)]">
                  <Mermaid chart={systemDiagram} />
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="data" className="mt-0 focus-visible:ring-0">
              <Card className="bg-card/40 border-border/50 overflow-hidden shadow-2xl backdrop-blur-sm rounded-2xl">
                <CardContent className="p-10 flex justify-center items-center">
                  <Mermaid chart={dataFlowDiagram} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="deploy" className="mt-0 focus-visible:ring-0">
              <Card className="bg-card/40 border-border/50 overflow-hidden shadow-2xl backdrop-blur-sm rounded-2xl">
                <CardContent className="p-10 flex justify-center items-center">
                  <Mermaid chart={deploymentDiagram} />
                </CardContent>
              </Card>
            </TabsContent>
          </div>
        </Tabs>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <Layout className="h-6 w-6 text-indigo-500" />
            <h2 className="text-2xl font-bold uppercase tracking-tight">Component Architecture</h2>
          </div>
          <div className="grid gap-4">
            {components.map((c, i) => (
              <motion.div key={i} whileHover={{ x: 5 }} className="group">
                <Card className="bg-card/40 border-border/50 group-hover:border-primary/40 transition-all rounded-2xl backdrop-blur-sm shadow-sm hover:shadow-md">
                  <CardContent className="p-5 flex items-center gap-5">
                    <div className="h-12 w-12 rounded-xl bg-muted/50 border border-border/40 flex items-center justify-center shrink-0 shadow-inner group-hover:bg-primary/10 transition-colors">
                      <c.icon className="h-6 w-6 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                    <div>
                      <h3 className="font-bold text-foreground text-lg mb-1">{c.title}</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">{c.desc}</p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-6 w-6 text-emerald-500" />
            <h2 className="text-2xl font-bold uppercase tracking-tight">Trust & Security</h2>
          </div>
          <div className="space-y-6">
            <p className="text-muted-foreground leading-relaxed">
              Security is baked into every layer of our multi-tenant architecture. Our shared responsibility model ensures your organization's data remains truly private and isolated.
            </p>
            <div className="space-y-4">
              {[
                { title: "Point-in-Time Recovery", val: "Continuous daily backups with 30-day retention." },
                { title: "AES-256 Storage", val: "All files encrypted at rest in global storage buckets." },
                { title: "Zero-Trust Edge", val: "Requests are verified at the edge before hitting core DB." },
                { title: "Audit Trail", val: "Every administrative and user action is logged via system_logs." }
              ].map((s, i) => (
                <div key={i} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className="h-2.5 w-2.5 rounded-full bg-primary" />
                    {i !== 3 && <div className="w-[1px] flex-1 bg-border/50" />}
                  </div>
                  <div className="pb-4">
                    <h4 className="text-sm font-black text-foreground uppercase tracking-widest">{s.title}</h4>
                    <p className="text-xs text-muted-foreground mt-1 font-medium">{s.val}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-6 rounded-2xl bg-gradient-to-br from-indigo-500/10 to-emerald-500/10 border border-indigo-500/20 shadow-lg shadow-indigo-500/5">
              <div className="flex items-center gap-3 mb-3">
                 <ShieldCheck className="h-5 w-5 text-emerald-500" />
                 <span className="text-xs font-black uppercase text-emerald-500 tracking-wider">Enterprise Compliance</span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed font-medium">
                Conforms to modern data handling standards. Tenant data is never used to train global AI models, ensuring intellectual property protection.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Architecture;