import React, { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  fallbackMessage?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[400px] flex-col items-center justify-center p-6 text-center space-y-6 bg-card/50 rounded-2xl border border-border/50 backdrop-blur-sm m-4">
          <div className="h-16 w-16 rounded-2xl bg-destructive/10 flex items-center justify-center ring-1 ring-destructive/20 animate-pulse">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>
          <div className="space-y-2 max-w-md">
            <h2 className="text-xl font-bold text-foreground">
              {this.props.fallbackTitle || "Something went wrong"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {this.props.fallbackMessage || 
                "An unexpected error occurred while rendering this page. Our security systems have logged the event."}
            </p>
            {this.state.error && (
              <pre className="mt-4 p-3 rounded-lg bg-black/20 text-[10px] text-left overflow-auto max-h-32 text-muted-foreground font-mono">
                {this.state.error.message}
              </pre>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={this.handleRetry} variant="default" className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Retry Component
            </Button>
            <Button onClick={() => window.location.href = "/"} variant="outline" className="gap-2">
              <Home className="h-4 w-4" />
              Back Home
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
