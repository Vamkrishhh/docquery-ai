import React, { useState, useEffect } from "react";
import AdminOnly from "@/components/AdminOnly";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { 
  Shield as ShieldIcon, Key, Download, CheckCircle2, Lock, Smartphone, RefreshCw, X,
  User, Mail, Building, AtSign, Camera, Bell, Settings2, CreditCard,
  Database as DatabaseIcon, Activity, Search, Globe, Moon, Sun, Monitor, Trash2, 
  ExternalLink, LogIn, HardDrive, FileJson, FileSpreadsheet, Upload,
  Cpu, Languages, Sliders, ChevronRight, FileText, MessageSquare
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator } from "@/components/ui/input-otp";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import * as OTPAuth from "otpauth";
import { QRCodeSVG } from "qrcode.react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { cn } from "@/lib/utils";

interface TFAData {
  secret: string;
  uri: string;
  backupCodes: string[];
}

const Settings = () => {
  const { user, profile, tenantName, role, setRole } = useAuth();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [is2FAEnabled, setIs2FAEnabled] = useState(false);
  
  // Setup Modal states
  const [setupModalOpen, setSetupModalOpen] = useState(false);
  const [setupStep, setSetupStep] = useState<"qr" | "backup">("qr");
  const [tfaData, setTfaData] = useState<TFAData | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  
  // Profile states
  const [displayName, setDisplayName] = useState("");
  const [updatingProfile, setUpdatingProfile] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  // Security states
  const [loginHistory, setLoginHistory] = useState<any[]>([]);
  const [apiKeys, setApiKeys] = useState<{id: string, name: string, created_at: string}[]>([
    { id: "1", name: "Production API Key", created_at: "2026-03-15T10:00:00Z" }
  ]);

  // Billing/Usage states
  const [usageStats, setUsageStats] = useState({
    storage: { used: 450 * 1024 * 1024, limit: 1024 * 1024 * 1024 }, // 450MB / 1GB
    queries: { used: 1240, limit: 5000 },
    documents: { count: 124 }
  });
  const [usageTrend, setUsageTrend] = useState([
    { date: '04-01', queries: 45 },
    { date: '04-02', queries: 52 },
    { date: '04-03', queries: 38 },
    { date: '04-04', queries: 65 },
    { date: '04-05', queries: 48 },
    { date: '04-06', queries: 72 },
  ]);

  useEffect(() => {
    if (!user) return;
    
    const loadSettings = async () => {
      try {
        // Check 2FA
        try {
          const { data: tfa, error: tfaError } = await supabase
            .from("user_2fa")
            .select("id")
            .eq("user_id", user.id)
            .maybeSingle();
          if (tfaError) {
            console.warn("user_2fa table might be missing:", tfaError.message);
            setIs2FAEnabled(false);
          } else {
            setIs2FAEnabled(!!tfa);
          }
        } catch (e) {
          setIs2FAEnabled(false);
        }

        // Load Login History
        const { data: logs } = await supabase
          .from("system_logs" as any)
          .select("*")
          .eq("user_id", user.id)
          .eq("event_type", "login")
          .order("created_at", { ascending: false })
          .limit(5);
        if (logs) setLoginHistory(logs);

      } catch (error) {
        console.error("Error loading settings:", error);
      } finally {
        setLoading(false);
      }
    };
    
    if (profile?.display_name) {
      setDisplayName(profile.display_name);
    }
    
    loadSettings();
  }, [user, profile]);

  const handleUpdateProfile = async () => {
    if (!user || !displayName.trim()) return;
    setUpdatingProfile(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ display_name: displayName.trim() })
        .eq("user_id", user.id);
      
      if (error) throw error;
      toast({ title: "Profile Updated", description: "Your profile information has been saved." });
    } catch (error: any) {
      toast({ title: "Update Failed", description: error.message, variant: "destructive" });
    } finally {
      setUpdatingProfile(false);
    }
  };

  const handleToggle2FA = async () => {
    if (!user) return;
    if (is2FAEnabled) {
      if (!window.confirm("Are you sure you want to disable Two-Factor Authentication?")) return;
      try {
        setLoading(true);
        const { error } = await supabase.from("user_2fa").delete().eq("user_id", user.id);
        if (error) throw error;
        setIs2FAEnabled(false);
        toast({ title: "2FA Disabled" });
      } catch (error: any) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } finally {
        setLoading(false);
      }
    } else {
      const secret = new OTPAuth.Secret({ size: 20 });
      const totp = new OTPAuth.TOTP({
        issuer: "DocQuery AI",
        label: profile?.email || user.email || "User",
        secret: secret,
      });
      setTfaData({ secret: secret.base32, uri: totp.toString(), backupCodes: Array.from({ length: 10 }, () => Math.random().toString(36).substring(2, 12)) });
      setVerifyCode("");
      setSetupStep("qr");
      setSetupModalOpen(true);
    }
  };

  const verifySetupCode = async () => {
    if (!tfaData || !user) return;
    const totp = new OTPAuth.TOTP({
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(tfaData.secret),
    });
    let delta = totp.validate({ token: verifyCode, window: 1 });
    if (delta !== null) {
      setSetupStep("backup");
    } else {
      toast({ title: "Invalid Code", description: "The verification code is incorrect.", variant: "destructive" });
    }
  };

  const finalizeSetup = async () => {
    if (!tfaData || !user) return;
    setVerifying(true);
    try {
      const { error } = await supabase.from("user_2fa").insert({
        user_id: user.id,
        secret_key: tfaData.secret,
        backup_codes: tfaData.backupCodes,
      });
      if (error) throw error;
      setIs2FAEnabled(true);
      setSetupModalOpen(false);
      toast({ title: "2FA Enabled" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setVerifying(false);
    }
  };

  const exportData = (type: string) => {
    toast({ title: "Export Started", description: `Exporting your ${type} data. You will receive a link shortly.` });
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024, sizes = ['B', 'KB', 'MB', 'GB', 'TB'], i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="flex-1 space-y-6 p-8 overflow-y-auto w-full max-w-6xl mx-auto pb-20">
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-black tracking-tighter uppercase italic">System Configuration</h1>
        <p className="text-muted-foreground text-sm font-medium">Global control center for organization {tenantName || "Instance"}.</p>
      </div>

      <Tabs defaultValue="profile" className="w-full space-y-8">
        <div className="bg-card/40 p-1.5 rounded-2xl border border-border/50 sticky top-0 z-10 backdrop-blur-xl">
          <TabsList className="bg-transparent border-none w-full grid grid-cols-3 md:grid-cols-6 gap-1 h-auto">
            <TabsTrigger value="profile" className="gap-2 rounded-xl py-3 data-[state=active]:bg-background data-[state=active]:shadow-lg text-xs font-black uppercase tracking-widest"><User className="h-4 w-4" /> Profile</TabsTrigger>
            <TabsTrigger value="security" className="gap-2 rounded-xl py-3 data-[state=active]:bg-background data-[state=active]:shadow-lg text-xs font-black uppercase tracking-widest"><ShieldIcon className="h-4 w-4" /> Security</TabsTrigger>
            <TabsTrigger value="notifications" className="gap-2 rounded-xl py-3 data-[state=active]:bg-background data-[state=active]:shadow-lg text-xs font-black uppercase tracking-widest"><Bell className="h-4 w-4" /> Notifications</TabsTrigger>
            <TabsTrigger value="preferences" className="gap-2 rounded-xl py-3 data-[state=active]:bg-background data-[state=active]:shadow-lg text-xs font-black uppercase tracking-widest"><Settings2 className="h-4 w-4" /> Preferences</TabsTrigger>
            <TabsTrigger value="billing" className="gap-2 rounded-xl py-3 data-[state=active]:bg-background data-[state=active]:shadow-lg text-xs font-black uppercase tracking-widest"><CreditCard className="h-4 w-4" /> Usage</TabsTrigger>
            <TabsTrigger value="data" className="gap-2 rounded-xl py-3 data-[state=active]:bg-background data-[state=active]:shadow-lg text-xs font-black uppercase tracking-widest"><DatabaseIcon className="h-4 w-4" /> Portability</TabsTrigger>
          </TabsList>
        </div>

        {/* PROFILE TAB */}
        <TabsContent value="profile" className="animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="grid gap-6 md:grid-cols-5">
            <Card className="md:col-span-3 border-border/50 bg-card/60 backdrop-blur-xl">
              <CardHeader>
                <CardTitle className="text-lg font-black uppercase tracking-widest flex items-center gap-2 italic"><User className="h-5 w-5 text-primary" /> Identity Matrix</CardTitle>
                <CardDescription>Configure your cognitive identity across the platform.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center gap-6 p-4 rounded-2xl bg-primary/5 border border-primary/20">
                  <Avatar className="h-24 w-24 border-4 border-background shadow-2xl ring-2 ring-primary/20 cursor-pointer hover:scale-105 transition-transform">
                    <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${profile?.email}`} />
                    <AvatarFallback className="bg-primary/10 text-primary text-2xl font-black">{(profile?.display_name || "U")[0]}</AvatarFallback>
                  </Avatar>
                  <div className="space-y-2">
                    <Button variant="outline" size="sm" className="h-9 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest gap-2 bg-background/50"><Camera className="h-4 w-4" /> Update Avatar</Button>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase opacity-60">Identity seed: {profile?.email}</p>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-1">Universal Name</Label>
                    <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="h-12 rounded-xl bg-background/50 border-border/50" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-1">Email (Immutable)</Label>
                    <Input value={profile?.email || ""} readOnly className="h-12 rounded-xl bg-muted/20 border-border/50 opacity-60 font-mono" />
                  </div>
                </div>
              </CardContent>
              <CardFooter className="bg-muted/5 p-6 border-t border-border/50">
                <Button onClick={handleUpdateProfile} disabled={updatingProfile} className="w-full h-12 rounded-xl font-black uppercase tracking-widest shadow-lg shadow-primary/20 transition-all hover:scale-[1.01]">
                  {updatingProfile && <RefreshCw className="h-4 w-4 animate-spin mr-2" />} Synchronize Profile
                </Button>
              </CardFooter>
            </Card>

            <AdminOnly fallback="placeholder" className="md:col-span-2 border-none bg-transparent">
              <Card className="border-destructive/20 bg-destructive/5 relative overflow-hidden group h-full">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity"><Trash2 className="h-24 w-24 text-destructive" /></div>
                <CardHeader>
                  <CardTitle className="text-lg font-black uppercase tracking-widest text-destructive italic">Danger Zone</CardTitle>
                  <CardDescription>Irreversible account destruction protocols.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-xs font-medium text-destructive/80 leading-relaxed italic">"Deactivation will permanently purge your documents, conversations, and benchmarks from the encrypted vault."</p>
                  <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                    <DialogTrigger asChild>
                      <Button variant="destructive" className="w-full h-12 rounded-xl font-black uppercase tracking-widest mt-4">Purge Account</Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-md bg-card/95 backdrop-blur-2xl border-destructive/30">
                      <DialogHeader>
                        <DialogTitle className="text-2xl font-black uppercase tracking-tighter text-destructive">Verify Atomic Purge</DialogTitle>
                        <DialogDescription className="text-sm font-medium mt-2">This will permanently delete all data associated with {profile?.email}. This cannot be undone.</DialogDescription>
                      </DialogHeader>
                      <div className="py-4"><Input placeholder="Type 'PERMANENT DELETE' to confirm" className="h-12 rounded-xl border-destructive/30" /></div>
                      <DialogFooter><Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)} className="rounded-xl font-black uppercase">Cancel</Button><Button variant="destructive" className="rounded-xl font-black uppercase">Destroy</Button></DialogFooter>
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>
            </AdminOnly>
          </div>
        </TabsContent>

        {/* SECURITY TAB */}
        <TabsContent value="security" className="animate-in fade-in slide-in-from-bottom-2 duration-300">
           <div className="grid gap-6 md:grid-cols-2">
              <Card className="border-border/50 bg-card/60">
                <CardHeader>
                  <CardTitle className="text-lg font-black uppercase tracking-widest flex items-center gap-2 italic"><ShieldIcon className="h-5 w-5 text-primary" /> Access Control</CardTitle>
                  <CardDescription>Manage multi-factor authentication and passwords.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="p-5 rounded-2xl bg-secondary/10 border border-border/50 flex items-center justify-between">
                       <div className="space-y-1">
                         <Label className="text-sm font-black uppercase tracking-widest">2FA Matrix</Label>
                         <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-tight">Authenticator App (TOTP)</p>
                       </div>
                       <div className="flex items-center gap-3">
                          {is2FAEnabled && <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px] h-5 rounded-sm">ACTIVE</Badge>}
                         <Switch checked={is2FAEnabled} onCheckedChange={handleToggle2FA} />
                       </div>
                    </div>

                    <div className="p-5 rounded-2xl bg-primary/5 border border-primary/20 flex flex-col gap-4">
                       <div className="flex items-center justify-between">
                         <div className="space-y-1">
                           <Label className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                             <User className="h-4 w-4 text-primary" /> Current Persona
                           </Label>
                           <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-tight">Identity Role (In-Memory Demo)</p>
                         </div>
                         <Select value={role} onValueChange={(v: any) => setRole(v)}>
                            <SelectTrigger className="h-9 w-[120px] rounded-lg bg-background/50 border-border/50 text-[10px] font-black uppercase tracking-widest">
                               <SelectValue placeholder="Select role" />
                            </SelectTrigger>
                            <SelectContent>
                               <SelectItem value="admin" className="text-[10px] font-black uppercase tracking-widest">Administrator</SelectItem>
                               <SelectItem value="user" className="text-[10px] font-black uppercase tracking-widest">Standard User</SelectItem>
                            </SelectContent>
                         </Select>
                       </div>
                       {role === "user" && (
                         <div className="flex items-start gap-3 p-3 rounded-xl bg-destructive/5 border border-destructive/10">
                            <Lock className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                            <p className="text-[10px] font-semibold text-destructive/80 leading-relaxed uppercase italic">
                              Administrative dashboards and system metrics are currently masked from this persona.
                            </p>
                         </div>
                       )}
                    </div>

                    <div className="p-5 rounded-2xl bg-muted/10 border border-border/50 flex items-center justify-between opacity-50">
                       <div className="space-y-1">
                         <Label className="text-sm font-black uppercase tracking-widest">Cognitive Passphrase</Label>
                         <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-tight">Last changed 4 months ago</p>
                       </div>
                       <Button variant="outline" size="sm" className="h-8 rounded-lg text-[10px] font-black uppercase tracking-widest" disabled>Change</Button>
                    </div>
                </CardContent>
              </Card>

              <Card className="border-border/50 bg-card/60">
                <CardHeader>
                  <CardTitle className="text-lg font-black uppercase tracking-widest flex items-center gap-2 italic"><Activity className="h-5 w-5 text-primary" /> Session Audit</CardTitle>
                  <CardDescription>Recent login events across all devices.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                   {loginHistory.length > 0 ? loginHistory.map((log, i) => (
                      <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-secondary/20 border border-border/30">
                        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><LogIn className="h-4 w-4 text-primary" /></div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold truncate">Login from Lovable Interface</p>
                          <p className="text-[10px] text-muted-foreground font-medium">{new Date(log.created_at).toLocaleString()} • Successful</p>
                        </div>
                        <Badge variant="outline" className="text-[9px] font-black border-primary/20 text-primary">SECURE</Badge>
                      </div>
                   )) : (
                     <div className="py-8 text-center"><p className="text-xs text-muted-foreground italic">No recent sessions found.</p></div>
                   )}
                </CardContent>
              </Card>

              <Card className="md:col-span-2 border-border/50 bg-card/60 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-5"><Key className="h-32 w-32" /></div>
                <CardHeader>
                  <CardTitle className="text-lg font-black uppercase tracking-widest flex items-center gap-2 italic"><Key className="h-5 w-5 text-primary" /> Developer Matrix (API Keys)</CardTitle>
                  <CardDescription>Manage keys for automated system integration.</CardDescription>
                </CardHeader>
                <CardContent>
                   <div className="space-y-4">
                      {apiKeys.map(key => (
                        <div key={key.id} className="p-4 rounded-xl bg-background/40 border border-border/50 group flex items-center justify-between">
                           <div className="space-y-1">
                             <div className="flex items-center gap-2">
                               <p className="text-sm font-black uppercase tracking-widest">{key.name}</p>
                               <Badge className="bg-primary/10 text-primary border-primary/20 text-[9px] h-4">READ-WRITE</Badge>
                             </div>
                             <p className="text-[10px] text-muted-foreground font-mono">sk_live_************************</p>
                           </div>
                           <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button variant="ghost" size="icon" className="h-8 w-8"><RefreshCw className="h-3.5 w-3.5" /></Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
                           </div>
                        </div>
                      ))}
                      <Button variant="outline" className="w-full h-12 rounded-xl border-dashed border-2 hover:bg-primary/5 transition-colors font-black uppercase tracking-widest text-[11px] gap-2">
                        Generate New API Vector
                      </Button>
                   </div>
                </CardContent>
              </Card>
           </div>
        </TabsContent>

        {/* NOTIFICATIONS TAB */}
        <TabsContent value="notifications" className="animate-in fade-in slide-in-from-bottom-2 duration-300">
          <Card className="border-border/50 bg-card/60">
            <CardHeader>
              <CardTitle className="text-lg font-black uppercase tracking-widest flex items-center gap-2 italic"><Bell className="h-5 w-5 text-primary" /> Cognitive Alerts</CardTitle>
              <CardDescription>Configure how and when the system communicates events.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-8">
               <div className="space-y-4">
                  <h3 className="text-xs font-black uppercase tracking-[0.2em] text-primary underline underline-offset-8 decoration-primary/30">Email Signals</h3>
                  <div className="grid gap-4">
                     {[
                       { title: "Ingestion Completion", sub: "Alert when document processing completes successfully.", icon: CheckCircle2 },
                       { title: "Benchmark Finalization", sub: "Notification when evaluation runs are ready for audit.", icon: Activity },
                       { title: "Critical System Alerts", sub: "Warnings regarding storage limits or isolation failures.", icon: ShieldIcon },
                     ].map((item, i) => (
                        <div key={i} className="flex items-center justify-between p-4 rounded-xl bg-secondary/10 border border-border/30">
                           <div className="flex items-center gap-4">
                              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center"><item.icon className="h-4 w-4 text-primary" /></div>
                              <div><p className="text-sm font-bold">{item.title}</p><p className="text-[10px] text-muted-foreground font-medium">{item.sub}</p></div>
                           </div>
                           <Switch defaultChecked />
                        </div>
                     ))}
                  </div>
               </div>

               <div className="space-y-4">
                  <h3 className="text-xs font-black uppercase tracking-[0.2em] text-accent underline underline-offset-8 decoration-accent/30">Interface Feedback</h3>
                  <div className="grid gap-4">
                     <div className="flex items-center justify-between p-4 rounded-xl bg-secondary/10 border border-border/30">
                        <div className="flex items-center gap-4">
                           <div className="h-9 w-9 rounded-lg bg-accent/10 flex items-center justify-center"><Smartphone className="h-4 w-4 text-accent" /></div>
                           <div><p className="text-sm font-bold">In-App Toast Events</p><p className="text-[10px] text-muted-foreground font-medium">Real-time overlays for minor system actions.</p></div>
                        </div>
                        <Switch defaultChecked />
                     </div>
                  </div>
               </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* PREFERENCES TAB */}
        <TabsContent value="preferences" className="animate-in fade-in slide-in-from-bottom-2 duration-300">
           <div className="grid gap-6 md:grid-cols-2">
              <Card className="border-border/50 bg-card/60">
                <CardHeader>
                  <CardTitle className="text-lg font-black uppercase tracking-widest flex items-center gap-2 italic"><Sliders className="h-5 w-5 text-primary" /> Experience Schema</CardTitle>
                  <CardDescription>Customize your interaction layer and AI behavior.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                   <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Neural Architecture (Default Model)</Label>
                      <Select defaultValue="gemini-3">
                         <SelectTrigger className="h-12 rounded-xl bg-background/50 border-border/50">
                           <SelectValue placeholder="Select logic engine" />
                         </SelectTrigger>
                         <SelectContent>
                           <SelectItem value="gemini-3" className="gap-2 font-bold uppercase text-[10px]"><div className="flex items-center gap-2"><Cpu className="h-3 w-3 text-primary" /> Gemini 3 Flash</div></SelectItem>
                           <SelectItem value="gpt-4" className="gap-2 font-bold uppercase text-[10px]"><div className="flex items-center gap-2"><Cpu className="h-3 w-3 text-accent" /> GPT-4 Turbo</div></SelectItem>
                         </SelectContent>
                      </Select>
                   </div>

                   <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Visual Theme</Label>
                        <div className="flex p-1 rounded-xl bg-secondary/20 border border-border/50 gap-1">
                           <Button 
                             variant="ghost" 
                             size="sm" 
                             className={cn("flex-1 h-9 rounded-lg transition-all", theme === "light" ? "bg-background shadow-sm" : "")}
                             onClick={() => setTheme("light")}
                           >
                             <Sun className="h-3 w-3 mr-2" /> 
                             <span className="text-[9px] font-black uppercase">Light</span>
                           </Button>
                           <Button 
                             variant="ghost" 
                             size="sm" 
                             className={cn("flex-1 h-9 rounded-lg transition-all", theme === "dark" ? "bg-background shadow-sm" : "")}
                             onClick={() => setTheme("dark")}
                           >
                             <Moon className="h-3 w-3 mr-2" />
                             <span className="text-[9px] font-black uppercase">Dark</span>
                           </Button>
                           <Button 
                             variant="ghost" 
                             size="sm" 
                             className={cn("flex-1 h-9 rounded-lg transition-all", theme === "system" ? "bg-background shadow-sm" : "")}
                             onClick={() => setTheme("system")}
                           >
                             <Monitor className="h-3 w-3 mr-2" />
                             <span className="text-[9px] font-black uppercase">System</span>
                           </Button>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Language Hub</Label>
                        <Select defaultValue="en">
                           <SelectTrigger className="h-11 rounded-xl bg-background/50 border-border/50">
                             <SelectValue />
                           </SelectTrigger>
                           <SelectContent>
                             <SelectItem value="en" className="text-xs">English (US)</SelectItem>
                             <SelectItem value="de" className="text-xs">Deutsch</SelectItem>
                             <SelectItem value="ja" className="text-xs">日本語</SelectItem>
                           </SelectContent>
                        </Select>
                      </div>
                   </div>
                </CardContent>
              </Card>

              <Card className="border-border/50 bg-card/60">
                <CardHeader>
                  <CardTitle className="text-lg font-black uppercase tracking-widest flex items-center gap-2 italic"><HardDrive className="h-5 w-5 text-primary" /> Retrieval Constraints</CardTitle>
                  <CardDescription>Fine-tune the RAG chain extraction parameters.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                   <div className="space-y-2">
                      <div className="flex justify-between items-center px-1">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Chunk Token Flux (Size)</Label>
                        <Badge variant="outline" className="text-[10px] font-black bg-primary/5 border-primary/20 text-primary">512 TOKENS</Badge>
                      </div>
                      <Progress value={45} className="h-2.5 rounded-full" />
                      <p className="text-[9px] text-muted-foreground italic text-right uppercase font-bold mt-1">Balanced extraction vs context window</p>
                   </div>
                   <div className="space-y-2 pt-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">Max Evidence Limit (K-Results)</Label>
                      <Select defaultValue="5">
                         <SelectTrigger className="h-11 rounded-xl bg-background/50 border-border/50">
                           <SelectValue />
                         </SelectTrigger>
                         <SelectContent>
                           <SelectItem value="3" className="font-mono text-xs font-bold">TOP 3 (Precision)</SelectItem>
                           <SelectItem value="5" className="font-mono text-xs font-bold">TOP 5 (Balanced)</SelectItem>
                           <SelectItem value="10" className="font-mono text-xs font-bold">TOP 10 (Breadth)</SelectItem>
                         </SelectContent>
                      </Select>
                   </div>
                </CardContent>
              </Card>
           </div>
        </TabsContent>

        {/* BILLING/USAGE TAB */}
        <TabsContent value="billing" className="animate-in fade-in slide-in-from-bottom-2 duration-300">
           <div className="grid gap-6">
              <div className="grid md:grid-cols-3 gap-6">
                 {[
                   { label: "Data Footprint", value: formatBytes(usageStats.storage.used), pct: (usageStats.storage.used / usageStats.storage.limit) * 100, limit: formatBytes(usageStats.storage.limit), icon: HardDrive, color: "text-blue-500", bg: "bg-blue-500/10" },
                   { label: "Query Execution", value: usageStats.queries.used, pct: (usageStats.queries.used / usageStats.queries.limit) * 100, limit: usageStats.queries.limit, icon: Activity, color: "text-primary", bg: "bg-primary/10" },
                   { label: "Index Library", value: usageStats.documents.count, pct: 62, limit: 200, icon: FileText, color: "text-accent", bg: "bg-accent/10" },
                 ].map((stat, i) => (
                   <Card key={i} className="border-border/50 bg-card/60">
                      <CardContent className="p-6 space-y-4">
                         <div className="flex items-center justify-between">
                            <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0 border border-border/50", stat.bg)}>
                               <stat.icon className={cn("h-5 w-5", stat.color)} />
                            </div>
                            <div className="text-right">
                               <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{stat.label}</p>
                               <div className="flex items-center gap-1.5 justify-end">
                                  <span className="text-xl font-black">{stat.value}</span>
                                  <span className="text-[10px] font-bold text-muted-foreground lowercase">/ {stat.limit}</span>
                               </div>
                            </div>
                         </div>
                         <Progress value={stat.pct} className="h-1.5 rounded-full" />
                         <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-tighter italic">
                            <span className="text-muted-foreground">Allocation utilized</span>
                            <span className={stat.color}>{stat.pct.toFixed(1)}%</span>
                         </div>
                      </CardContent>
                   </Card>
                 ))}
              </div>

              <Card className="border-border/50 bg-card/60">
                 <CardHeader>
                    <div className="flex items-center justify-between gap-4">
                       <div>
                          <CardTitle className="text-lg font-black uppercase tracking-widest italic flex items-center gap-2"><CreditCard className="h-5 w-5 text-primary" /> Consumption Trend</CardTitle>
                          <CardDescription>Daily RAG execution metrics across the enterprise.</CardDescription>
                       </div>
                       <Button variant="outline" size="sm" className="h-9 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest gap-2 bg-background/50"><ChevronRight className="h-4 w-4" /> Usage Explorer</Button>
                    </div>
                 </CardHeader>
                 <CardContent>
                    <div className="h-[240px] w-full pt-4">
                       <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={usageTrend}>
                             <defs>
                                <linearGradient id="usageGrad" x1="0" y1="0" x2="0" y2="1">
                                   <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                                   <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                                </linearGradient>
                             </defs>
                             <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.1} />
                             <XAxis dataKey="date" 
                                axisLine={false} 
                                tickLine={false} 
                                tick={{fontSize: 9, fill: 'hsl(var(--muted-foreground))', fontWeight: 900}} 
                             />
                             <YAxis 
                                hide 
                             />
                             <Tooltip 
                                contentStyle={{backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '12px', fontSize: '10px'}}
                             />
                             <Area type="monotone" dataKey="queries" stroke="hsl(var(--primary))" strokeWidth={3} fillOpacity={1} fill="url(#usageGrad)" animationDuration={1500} />
                          </AreaChart>
                       </ResponsiveContainer>
                    </div>
                 </CardContent>
              </Card>
           </div>
        </TabsContent>

        {/* DATA PORTABILITY TAB */}
        <TabsContent value="data" className="animate-in fade-in slide-in-from-bottom-2 duration-300">
           <div className="grid gap-6 md:grid-cols-2">
              <Card className="border-border/50 bg-card/60">
                <CardHeader>
                  <CardTitle className="text-lg font-black uppercase tracking-widest flex items-center gap-2 italic"><Download className="h-5 w-5 text-primary" /> Extraction Matrix</CardTitle>
                  <CardDescription>Export your organizational intelligence in portable formats.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                   <div className="grid gap-3">
                      <Button variant="outline" className="h-16 rounded-2xl border-border/50 bg-secondary/10 justify-between px-6 hover:bg-primary/5 group" onClick={() => exportData("Documents")}>
                         <div className="flex items-center gap-4 text-left">
                           <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0"><HardDrive className="h-5 w-5 text-blue-500" /></div>
                           <div><p className="text-sm font-bold uppercase tracking-widest">Master Library</p><p className="text-[10px] text-muted-foreground font-medium uppercase tracking-tight">Full Archive + Metadata (ZIP)</p></div>
                         </div>
                         <Download className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                      </Button>
                      <Button variant="outline" className="h-16 rounded-2xl border-border/50 bg-secondary/10 justify-between px-6 hover:bg-violet-500/5 group" onClick={() => exportData("Conversations")}>
                         <div className="flex items-center gap-4 text-left">
                           <div className="h-10 w-10 rounded-xl bg-violet-500/10 flex items-center justify-center shrink-0"><MessageSquare className="h-5 w-5 text-violet-500" /></div>
                           <div><p className="text-sm font-bold uppercase tracking-widest">Cognitive Trails</p><p className="text-[10px] text-muted-foreground font-medium uppercase tracking-tight">Chat Histories (JSON/PDF)</p></div>
                         </div>
                         <FileJson className="h-4 w-4 text-muted-foreground group-hover:text-violet-500 transition-colors" />
                      </Button>
                      <Button variant="outline" className="h-16 rounded-2xl border-border/50 bg-secondary/10 justify-between px-6 hover:bg-emerald-500/5 group" onClick={() => exportData("Evaluations")}>
                         <div className="flex items-center gap-4 text-left">
                           <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0"><Activity className="h-5 w-5 text-emerald-500" /></div>
                           <div><p className="text-sm font-bold uppercase tracking-widest">Benchmark Audits</p><p className="text-[10px] text-muted-foreground font-medium uppercase tracking-tight">Accuracy Reports (CSV)</p></div>
                         </div>
                         <FileSpreadsheet className="h-4 w-4 text-muted-foreground group-hover:text-emerald-500 transition-colors" />
                      </Button>
                   </div>
                </CardContent>
              </Card>

              <Card className="border-primary/20 bg-primary/5">
                <CardHeader>
                  <CardTitle className="text-lg font-black uppercase tracking-widest flex items-center gap-2 italic text-primary"><Upload className="h-5 w-5" /> Intelligence Ingestion</CardTitle>
                  <CardDescription>Rapidly import cognitive assets into the vector vault.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col items-center justify-center py-12 border-2 border-dashed border-primary/20 rounded-2xl m-6 bg-card/50">
                   <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-6 ring-8 ring-primary/5">
                      <Upload className="h-8 w-8 text-primary" />
                   </div>
                   <h3 className="text-sm font-black uppercase tracking-widest mb-2">Initialize Batch Import</h3>
                   <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-tight text-center max-w-[200px] mb-6">PDF, TXT, DOCX files only. Handled securely with RLS isolation.</p>
                   <Button size="sm" className="rounded-xl px-8 font-black uppercase tracking-widest shadow-lg shadow-primary/20">Select Matrix Files</Button>
                </CardContent>
              </Card>
           </div>
        </TabsContent>
      </Tabs>

      {/* 2FA Setup Modal (Unchanged in logic) */}
      <Dialog open={setupModalOpen} onOpenChange={setSetupModalOpen}>
        <DialogContent className="sm:max-w-md bg-card/95 backdrop-blur-3xl border-border/50 rounded-3xl">
          {setupStep === "qr" && tfaData && (
            <>
              <DialogHeader>
                <DialogTitle className="text-2xl font-black uppercase tracking-tighter italic">Secure Vector Initialization (2FA)</DialogTitle>
                <DialogDescription className="text-xs font-medium uppercase tracking-widest opacity-60">Synchronize your biometrics/token app with our security cluster.</DialogDescription>
              </DialogHeader>
              <div className="flex flex-col items-center space-y-6 py-6">
                <div className="bg-white p-4 rounded-3xl shadow-2xl ring-4 ring-primary/10">
                  <QRCodeSVG value={tfaData.uri} size={180} />
                </div>
                <div className="space-y-2 text-center w-full px-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Manual Encryption Key</p>
                  <code className="block bg-secondary p-3 rounded-xl text-[10px] font-mono tracking-widest break-all border border-border/50">
                    {tfaData.secret}
                  </code>
                </div>
                
                <div className="w-full space-y-3 pt-6 border-t border-border/50 px-4">
                  <Label className="text-center w-full block text-[10px] font-black uppercase tracking-widest">Verify Temporal Flux (OTP)</Label>
                  <div className="flex justify-center">
                    <InputOTP maxLength={6} value={verifyCode} onChange={(value) => setVerifyCode(value)}>
                      <InputOTPGroup><InputOTPSlot index={0} className="w-10 h-12 rounded-l-xl" /><InputOTPSlot index={1} className="w-10 h-12" /><InputOTPSlot index={2} className="w-10 h-12 rounded-r-xl" /></InputOTPGroup>
                      <InputOTPSeparator className="mx-2" />
                      <InputOTPGroup><InputOTPSlot index={3} className="w-10 h-12 rounded-l-xl" /><InputOTPSlot index={4} className="w-10 h-12" /><InputOTPSlot index={5} className="w-10 h-12 rounded-r-xl" /></InputOTPGroup>
                    </InputOTP>
                  </div>
                </div>
              </div>
              <DialogFooter className="px-4 pb-4">
                <Button variant="outline" onClick={() => setSetupModalOpen(false)} className="rounded-xl flex-1 font-black uppercase text-[10px]">Abort</Button>
                <Button onClick={verifySetupCode} disabled={verifyCode.length !== 6} className="rounded-xl flex-1 font-black uppercase text-[10px] shadow-lg shadow-primary/20">Authorize</Button>
              </DialogFooter>
            </>
          )}

          {setupStep === "backup" && tfaData && (
            <>
              <DialogHeader>
                <DialogTitle className="text-2xl font-black uppercase tracking-tighter text-destructive italic">Atomic Recovery Codes</DialogTitle>
                <DialogDescription className="text-xs font-black uppercase tracking-widest text-destructive">CRITICAL: Loss of these keys results in total vault separation.</DialogDescription>
              </DialogHeader>
              <div className="py-6 space-y-4">
                <div className="grid grid-cols-2 gap-3 bg-secondary/30 p-5 rounded-2xl font-mono text-[11px] border border-border/50 shadow-inner">
                  {tfaData.backupCodes.map((code, index) => (
                    <div key={index} className="tracking-wider opacity-80">{code}</div>
                  ))}
                </div>
                <Button variant="outline" className="w-full h-12 rounded-xl border-dashed font-black uppercase text-[10px] gap-2" onClick={() => {
                  const content = `DocQuery AI Recovery Codes\n${tfaData.backupCodes.join('\n')}`;
                  const blob = new Blob([content], { type: 'text/plain' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a'); a.href = url; a.download = 'docquery-ai-backup.txt'; a.click();
                }}>
                  <Download className="h-4 w-4" /> Download Recovery Ledger
                </Button>
              </div>
              <DialogFooter className="px-6 pb-6">
                <Button onClick={finalizeSetup} disabled={verifying} className="w-full h-12 rounded-xl font-black uppercase tracking-widest shadow-xl shadow-primary/30">
                  {verifying ? "Initializing..." : "Ledger Secured & Saved"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Settings;
