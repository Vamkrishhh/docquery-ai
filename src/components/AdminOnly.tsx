import React from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Lock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface AdminOnlyProps {
  children: React.ReactNode;
  fallback?: "nothing" | "placeholder";
  className?: string;
}

const AdminOnly: React.FC<AdminOnlyProps> = ({ 
  children, 
  fallback = "placeholder",
  className 
}) => {
  const { role } = useAuth();

  if (role === "admin") {
    return <>{children}</>;
  }

  if (fallback === "nothing") {
    return null;
  }

  return (
    <Card className={cn("relative overflow-hidden border-dashed border-2 border-border/50 bg-muted/5 min-h-[200px] flex items-center justify-center", className)}>
      <div className="absolute inset-0 backdrop-blur-[2px] z-0" />
      <CardContent className="relative z-10 flex flex-col items-center gap-3 text-center p-8">
        <div className="p-3 rounded-full bg-primary/10 border border-primary/20">
          <Lock className="h-6 w-6 text-primary animate-pulse" />
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-black uppercase tracking-widest text-foreground">Administrative Access Restricted</h3>
          <p className="text-xs text-muted-foreground max-w-[250px] mx-auto">
            This module contains enterprise analytics and sensitive configuration restricted to administrator roles.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default AdminOnly;
