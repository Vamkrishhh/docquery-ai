import React from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Shield } from "lucide-react";

const TenantBadge: React.FC<{ className?: string }> = ({ className }) => {
  const { tenantName, profile } = useAuth();
  if (!tenantName) return null;

  return (
    <div className={className}>
      <div className="inline-flex items-center gap-1.5 rounded-md border border-primary/20 bg-primary/5 px-2.5 py-1 text-xs">
        <Shield className="h-3 w-3 text-primary" />
        <span className="text-muted-foreground">Tenant-isolated:</span>
        <span className="font-medium text-foreground">{tenantName}</span>
      </div>
    </div>
  );
};

export default TenantBadge;
