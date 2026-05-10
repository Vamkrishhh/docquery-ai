import React, { useState, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { Button } from "@/components/ui/button";
import {
  Brain,
  Building2,
  CheckSquare,
  Database as DatabaseIcon,
  FileText,
  FlaskConical,
  Globe,
  Layers,
  LayoutDashboard,
  LineChart,
  MessageSquare,
  Network,
  ChevronRight,
  User,
  LogOut,
  Moon,
  Sun,
  Settings as SettingsIcon,
  Shield,
  ShieldAlert,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  X,
  ChevronDown,
  UserCircle,
  HelpCircle,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import GlobalSearch from "./GlobalSearch";

const navItems = [
  { to: "/chat", icon: MessageSquare, label: "AI Chat", adminOnly: false },
  { to: "/documents", icon: FileText, label: "Documents", adminOnly: false },
  { to: "/dataset", icon: DatabaseIcon, label: "Knowledge Base", adminOnly: false },
  { to: "/knowledge-graph", icon: Network, label: "Knowledge Graph", adminOnly: false },
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard", adminOnly: true },
  { to: "/tenant-management", icon: Building2, label: "Tenant Management", adminOnly: true },
  { to: "/tenant-analytics", icon: LineChart, label: "Tenant Analytics", adminOnly: true },
  { to: "/validation", icon: FlaskConical, label: "RAG Validation", adminOnly: true },
  { to: "/security-dashboard", icon: ShieldAlert, label: "Security Dashboard", adminOnly: true },
  { to: "/security", icon: Shield, label: "Security & Architecture", adminOnly: true },
  { to: "/architecture", icon: Globe, label: "Architecture", adminOnly: true },
  { to: "/architecture-overview", icon: Brain, label: "Architecture Overview", adminOnly: true },
  { to: "/system-status", icon: Layers, label: "System Status", adminOnly: true },
  { to: "/checklist", icon: CheckSquare, label: "Completion Checklist", adminOnly: true },
  { to: "/settings", icon: SettingsIcon, label: "Settings", adminOnly: false },
];

const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { signOut, profile, tenantName, role } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { toast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const navRef = useRef<HTMLElement>(null);

  const filteredNavItems = navItems.filter(item => !item.adminOnly || role === "admin");

  useEffect(() => {
    const currentItem = navItems.find(item => item.to === location.pathname);
    if (currentItem?.adminOnly && role === "user") {
      navigate("/chat");
      toast({
        title: "Access Restricted",
        description: "This page is restricted to administrators only.",
        variant: "destructive",
      });
    }
  }, [location.pathname, role, navigate, toast]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      
      const elements = navRef.current?.querySelectorAll('a');
      if (!elements) return;

      const currentIndex = Array.from(elements).indexOf(document.activeElement as HTMLAnchorElement);

      if (e.key === "ArrowDown") {
        e.preventDefault();
        const nextIndex = (currentIndex + 1) % elements.length;
        (elements[nextIndex] as HTMLAnchorElement).focus();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prevIndex = (currentIndex - 1 + elements.length) % elements.length;
        (elements[prevIndex] as HTMLAnchorElement).focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="flex h-14 items-center gap-3 border-b border-sidebar-border px-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Brain className="h-4 w-4 text-primary" />
        </div>
        {!collapsed && (
          <span className="text-base font-bold text-sidebar-foreground tracking-tight">
            DocQuery <span className="text-primary">AI</span>
          </span>
        )}
      </div>

      {/* Active Tenant Badge */}
      {!collapsed && tenantName && (
        <div className="mx-3 mt-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-2">
          <div className="flex items-center gap-2">
            <Building2 className="h-3.5 w-3.5 text-primary" />
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Active Tenant</p>
              <p className="text-xs font-medium text-foreground truncate">{tenantName}</p>
            </div>
          </div>
          {profile?.tenant_id && (
            <p className="mt-1 text-[10px] text-muted-foreground font-mono truncate">
              {profile.tenant_id.substring(0, 8)}…
            </p>
          )}
        </div>
      )}
      {collapsed && tenantName && (
        <div className="mx-auto mt-2 flex h-8 w-8 items-center justify-center rounded-md border border-primary/20 bg-primary/5" title={`Tenant: ${tenantName}`}>
          <Building2 className="h-3.5 w-3.5 text-primary" />
        </div>
      )}

      {/* Global Search Component */}
      <div className="mt-4">
        <GlobalSearch collapsed={collapsed} />
      </div>

      {/* Nav */}
      <nav ref={navRef} className="flex-1 space-y-0.5 p-2 overflow-y-auto custom-scrollbar">
        <TooltipProvider delayDuration={0}>
          {filteredNavItems.map(({ to, icon: Icon, label }) => {
            const active = location.pathname === to;
            return (
              <Tooltip key={to} disableHoverableContent={!collapsed}>
                <TooltipTrigger asChild>
                  <Link
                    to={to}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-primary",
                      active
                        ? "bg-sidebar-accent text-sidebar-primary shadow-sm"
                        : "text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                    )}
                  >
                    {/* Active Accent Bar */}
                    {active && (
                      <motion.div
                        layoutId="nav-accent"
                        className="absolute left-0 h-5 w-1 rounded-r-full bg-primary"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.2 }}
                      />
                    )}
                    <Icon className={cn(
                      "h-4 w-4 shrink-0 transition-transform duration-200 group-hover:scale-110",
                      active ? "text-primary" : "text-sidebar-foreground/40"
                    )} />
                    {!collapsed && <span className="truncate">{label}</span>}
                  </Link>
                </TooltipTrigger>
                {collapsed && (
                  <TooltipContent side="right" className="font-bold border-sidebar-border bg-sidebar text-sidebar-foreground">
                    {label}
                  </TooltipContent>
                )}
              </Tooltip>
            );
          })}
        </TooltipProvider>
      </nav>

      {/* Bottom */}
      <div className="border-t border-sidebar-border p-2 space-y-2">
        {!collapsed && profile && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <div className="rounded-lg bg-sidebar-accent/50 p-2.5 border border-sidebar-border/50 cursor-pointer hover:bg-sidebar-accent transition-colors group">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="h-5 w-5 rounded-md bg-primary/10 flex items-center justify-center text-primary">
                      <User className="h-3 w-3" />
                    </div>
                    <p className="text-[11px] font-bold text-sidebar-foreground truncate max-w-[80px]">
                      {profile.display_name || profile.email.split('@')[0]}
                    </p>
                  </div>
                  <Badge variant="outline" className={cn(
                    "h-4 px-1 text-[8px] font-black uppercase tracking-tighter",
                    role === "admin" ? "bg-primary/10 text-primary border-primary/20" : "bg-muted text-muted-foreground"
                  )}>
                    {role}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-[9px] text-muted-foreground truncate opacity-70 italic">{profile.email}</p>
                  <ChevronDown className="h-2.5 w-2.5 text-muted-foreground/40 group-hover:text-primary transition-colors" />
                </div>
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-52 ml-2 bg-sidebar border-sidebar-border text-sidebar-foreground" side="right" align="end">
              <DropdownMenuLabel className="text-[10px] font-black uppercase tracking-widest opacity-50">Identity Matrix</DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-sidebar-border" />
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => navigate("/settings")} className="gap-2 text-xs font-bold py-2 focus:bg-sidebar-accent">
                  <UserCircle className="h-4 w-4 text-primary" />
                  Profile Settings
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/settings?tab=security")} className="gap-2 text-xs font-bold py-2 focus:bg-sidebar-accent">
                  <Shield className="h-4 w-4 text-emerald-500" />
                  Security Protocols
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator className="bg-sidebar-border" />
              <DropdownMenuItem onClick={() => navigate("/checklist")} className="gap-2 text-xs font-bold py-2 focus:bg-sidebar-accent">
                <CheckSquare className="h-4 w-4 text-amber-500" />
                System Status
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-2 text-xs font-bold py-2 focus:bg-sidebar-accent">
                <HelpCircle className="h-4 w-4 text-blue-500" />
                Retrieval Support
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-sidebar-border" />
              <DropdownMenuItem onClick={signOut} className="gap-2 text-xs font-bold py-2 text-destructive focus:bg-destructive/10 focus:text-destructive">
                <LogOut className="h-4 w-4" />
                Terminate Session
                <DropdownMenuShortcut className="text-[10px]">⇧⌘Q</DropdownMenuShortcut>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="h-8 w-8 text-sidebar-foreground/60"
          >
            {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCollapsed(!collapsed)}
            className="h-8 w-8 text-sidebar-foreground/60 hidden md:flex"
          >
            {collapsed ? <PanelLeftOpen className="h-3.5 w-3.5" /> : <PanelLeftClose className="h-3.5 w-3.5" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={signOut}
            className="h-8 w-8 text-sidebar-foreground/60"
          >
            <LogOut className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </>
  );

  return (
    <div className="flex h-screen bg-background">
      {/* Mobile header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 h-12 bg-card border-b border-border flex items-center px-3 gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMobileOpen(true)}>
          <Menu className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-primary" />
          <span className="text-sm font-bold">DocQuery <span className="text-primary">AI</span></span>
        </div>
      </div>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-background/80" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-64 h-full bg-sidebar border-r border-sidebar-border flex flex-col">
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-3 right-3 h-8 w-8 z-10"
              onClick={() => setMobileOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden md:flex flex-col border-r border-border bg-sidebar transition-all duration-200",
          collapsed ? "w-14" : "w-56"
        )}
      >
        {sidebarContent}
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto pt-12 md:pt-0">{children}</main>
    </div>
  );
};

export default AppLayout;
