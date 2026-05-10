import { useAuth } from "@/contexts/AuthContext";
import { Navigate, useLocation } from "react-router-dom";

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, loading, mfaStatus } = useAuth();
  const location = useLocation();

  if (loading || mfaStatus === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/auth" replace />;
  }

  if (mfaStatus === "unverified" && location.pathname !== "/auth") {
    return <Navigate to="/auth?view=2fa" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
