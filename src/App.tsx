import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import AppLayout from "@/components/AppLayout";
import Auth from "@/pages/Auth";
import Chat from "@/pages/Chat";
import Documents from "@/pages/Documents";
import Dashboard from "@/pages/Dashboard";
import Validation from "@/pages/Validation";
import SystemStatus from "@/pages/SystemStatus";
import ErrorBoundary from "@/components/ErrorBoundary";
import DatasetExplorer from "@/pages/DatasetExplorer";
import Workspace from "@/pages/Workspace";
import Architecture from "@/pages/Architecture";
import ArchitectureExtra from "@/pages/ArchitectureExtra";
import Security from "@/pages/Security";
import SecurityDashboard from "@/pages/SecurityDashboard";
import Checklist from "@/pages/Checklist";
import TenantManagement from "@/pages/TenantManagement";
import TenantAnalytics from "@/pages/TenantAnalytics";
import Landing from "@/pages/Landing";
import Settings from "@/pages/Settings";
import KnowledgeGraph from "@/pages/KnowledgeGraph";
import Search from "@/pages/Search";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/auth" element={<Auth />} />
              <Route
                path="/chat"
                element={
                  <ProtectedRoute>
                    <AppLayout>
                      <ErrorBoundary fallbackTitle="Chat unavailable" fallbackMessage="The secure chat interface encountered a connection error. Verify your network or try refreshing.">
                        <Chat />
                      </ErrorBoundary>
                    </AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/documents"
                element={
                  <ProtectedRoute>
                    <AppLayout><Documents /></AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <AppLayout><Dashboard /></AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/search"
                element={
                  <ProtectedRoute>
                    <AppLayout><Search /></AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/tenant-management"
                element={
                  <ProtectedRoute>
                    <AppLayout><TenantManagement /></AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/tenant-analytics"
                element={
                  <ProtectedRoute>
                    <AppLayout><TenantAnalytics /></AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/validation"
                element={
                  <ProtectedRoute>
                    <AppLayout><Validation /></AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/system-status"
                element={
                  <ProtectedRoute>
                    <AppLayout><SystemStatus /></AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/architecture"
                element={
                  <ProtectedRoute>
                    <AppLayout>
                      <ErrorBoundary fallbackTitle="Architecture unavailable" fallbackMessage="The system diagram could not be rendered because of a graphics context error.">
                        <Architecture />
                      </ErrorBoundary>
                    </AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/architecture-overview"
                element={
                  <ProtectedRoute>
                    <AppLayout><ArchitectureExtra /></AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/security-dashboard"
                element={
                  <ProtectedRoute>
                    <AppLayout><SecurityDashboard /></AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/security"
                element={
                  <ProtectedRoute>
                    <AppLayout><Security /></AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/checklist"
                element={
                  <ProtectedRoute>
                    <AppLayout><Checklist /></AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dataset"
                element={
                  <ProtectedRoute>
                    <AppLayout>
                      <ErrorBoundary fallbackTitle="Knowledge Base unavailable" fallbackMessage="Could not retrieve the organization's knowledge base records.">
                        <DatasetExplorer />
                      </ErrorBoundary>
                    </AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/knowledge-graph"
                element={
                  <ProtectedRoute>
                    <AppLayout><KnowledgeGraph /></AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/settings"
                element={
                  <ProtectedRoute>
                    <AppLayout><Settings /></AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/workspace/:documentId"
                element={
                  <ProtectedRoute>
                    <AppLayout><Workspace /></AppLayout>
                  </ProtectedRoute>
                }
              />
              
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
