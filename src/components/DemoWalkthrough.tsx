import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { X, ChevronRight, ChevronLeft, FileText, MessageSquare, Sparkles, Search, Shield as ShieldIcon, Database as DatabaseIcon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface DemoStep {
  title: string;
  description: string;
  icon: React.ElementType;
  route: string;
  highlight?: string;
  position: "center" | "top" | "bottom";
}

const DEMO_STEPS: DemoStep[] = [
  {
    title: "1. Upload a Document",
    description:
      "Start by uploading PDF, DOCX, or TXT files on the Documents page. The system automatically extracts text, splits it into overlapping chunks (~1 400 chars, 120 overlap), and indexes them with a tsvector full-text-search column. Processing diagnostics are recorded for every document.",
    icon: FileText,
    route: "/documents",
    highlight: "upload",
    position: "center",
  },
  {
    title: "2. Ask a Question in Chat",
    description:
      "Navigate to the Chat page and ask a natural-language question about your uploaded documents. The RAG engine retrieves the most relevant chunks via full-text search, constructs a context-enriched prompt, and streams an AI-generated answer in real time.",
    icon: MessageSquare,
    route: "/chat",
    highlight: "chat-input",
    position: "bottom",
  },
  {
    title: "3. View AI Response with Citations",
    description:
      "Every AI response includes inline citations referencing specific document chunks (e.g. [Source: filename, Chunk 3]). A confidence indicator shows retrieval quality. Expand the sources panel to see exactly which chunks informed the answer — full transparency and explainability.",
    icon: Search,
    route: "/chat",
    highlight: "citations",
    position: "center",
  },
  {
    title: "4. Open AI Workspace",
    description:
      "Open any processed document in the AI Workspace for document-scoped Q&A. The system generates an automatic summary, restricts retrieval to that document's chunks only, and lets you click citations to scroll directly to the relevant chunk in the side panel.",
    icon: Sparkles,
    route: "/documents",
    highlight: "workspace",
    position: "center",
  },
  {
    title: "5. Explore the Dataset Explorer",
    description:
      "Open the Dataset Explorer to inspect every indexed chunk across your documents. Browse chunks by document, view chunk text and metadata, and verify that the ingestion pipeline correctly split and indexed your content for retrieval.",
    icon: DatabaseIcon,
    route: "/dataset",
    highlight: "dataset",
    position: "center",
  },
  {
    title: "6. Verify System Reliability",
    description:
      "The System Status page runs live checks against every subsystem: authentication, tenant isolation (RLS on all tables), document ingestion, FTS retrieval, chat, evaluation framework, monitoring, and all edge functions. Run pipeline tests and export a full verification report.",
    icon: ShieldIcon,
    route: "/system-status",
    highlight: "status",
    position: "top",
  },
];

interface DemoWalkthroughProps {
  active: boolean;
  onClose: () => void;
}

const DemoWalkthrough: React.FC<DemoWalkthroughProps> = ({ active, onClose }) => {
  const [step, setStep] = useState(0);
  const navigate = useNavigate();
  const location = useLocation();

  const currentStep = DEMO_STEPS[step];

  useEffect(() => {
    if (active && currentStep && location.pathname !== currentStep.route) {
      navigate(currentStep.route);
    }
  }, [step, active]);

  const handleNext = useCallback(() => {
    if (step < DEMO_STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      onClose();
      navigate("/dashboard");
    }
  }, [step, onClose, navigate]);

  const handlePrev = useCallback(() => {
    if (step > 0) setStep((s) => s - 1);
  }, [step]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!active) return;
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" || e.key === "Enter") handleNext();
      if (e.key === "ArrowLeft") handlePrev();
    },
    [active, handleNext, handlePrev, onClose]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  if (!active) return null;

  const isLast = step === DEMO_STEPS.length - 1;
  const StepIcon = currentStep.icon;

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center"
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

          {/* Card */}
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="relative z-10 w-full max-w-lg mx-4"
          >
            <div className="rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
              {/* Progress bar */}
              <div className="h-1 bg-muted">
                <motion.div
                  className="h-full bg-primary"
                  initial={{ width: 0 }}
                  animate={{ width: `${((step + 1) / DEMO_STEPS.length) * 100}%` }}
                  transition={{ duration: 0.4 }}
                />
              </div>

              {/* Header */}
              <div className="flex items-center justify-between px-6 pt-5 pb-2">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                    <StepIcon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-foreground">{currentStep.title}</h2>
                    <p className="text-[11px] text-muted-foreground">
                      Step {step + 1} of {DEMO_STEPS.length}
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Body */}
              <div className="px-6 py-4">
                <p className="text-sm text-muted-foreground leading-relaxed">{currentStep.description}</p>
              </div>

              {/* Step dots */}
              <div className="flex items-center justify-center gap-1.5 pb-3">
                {DEMO_STEPS.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setStep(i)}
                    className={cn(
                      "h-2 rounded-full transition-all duration-300",
                      i === step ? "w-6 bg-primary" : "w-2 bg-muted-foreground/30 hover:bg-muted-foreground/50"
                    )}
                  />
                ))}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between border-t border-border px-6 py-3 bg-muted/30">
                <Button variant="ghost" size="sm" onClick={handlePrev} disabled={step === 0} className="gap-1 text-xs">
                  <ChevronLeft className="h-3.5 w-3.5" /> Back
                </Button>
                <p className="text-[10px] text-muted-foreground">Press ← → to navigate, Esc to close</p>
                <Button size="sm" onClick={handleNext} className="gap-1 text-xs">
                  {isLast ? "Finish" : "Next"} <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default DemoWalkthrough;