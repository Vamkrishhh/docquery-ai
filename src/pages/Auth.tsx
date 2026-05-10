import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Brain, Lock, Mail, User, Shield as ShieldIcon, Users, FileText, HelpCircle, MessageSquare } from "lucide-react";
import { motion } from "framer-motion";

import { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator } from "@/components/ui/input-otp";
import * as OTPAuth from "otpauth";

type View = "login" | "signup" | "forgot" | "reset" | "2fa";

function getPasswordStrength(pw: string): { score: number; label: string; color: string } {
  let score = 0;
  if (pw.length >= 6) score++;
  if (pw.length >= 10) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return { score: 20, label: "Weak", color: "bg-destructive" };
  if (score <= 2) return { score: 40, label: "Fair", color: "bg-[hsl(40,90%,50%)]" };
  if (score <= 3) return { score: 60, label: "Good", color: "bg-[hsl(40,90%,50%)]" };
  if (score <= 4) return { score: 80, label: "Strong", color: "bg-success" };
  return { score: 100, label: "Very Strong", color: "bg-success" };
}

const demoMessages = [
  { role: "user" as const, content: "What are the Sustainable Development Goals?" },
  {
    role: "assistant" as const,
    content:
      "The Sustainable Development Goals (SDGs) are a collection of 17 interlinked global goals designed to be a shared blueprint for peace and prosperity for people and the planet. They were adopted by the United Nations in 2015 as part of the 2030 Agenda for Sustainable Development.\n\nKey goals include:\n• No Poverty\n• Zero Hunger\n• Quality Education\n• Clean Energy\n• Climate Action",
    sources: ["un-sdg-report.pdf — chunk 2", "sustainability-overview.pdf — chunk 5"],
    confidence: 91,
  },
];

const Auth = () => {
  const [view, setView] = useState<View>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [tosAccepted, setTosAccepted] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  
  // 2FA states
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [rememberDevice, setRememberDevice] = useState(false);

  const { signIn, signUp, mfaStatus, user, verifyMfa } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const pwStrength = useMemo(() => getPasswordStrength(password), [password]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (view === "login") {
        await signIn(email, password);
      } else if (view === "signup") {
        try {
          await signUp(email, password, displayName);
          toast({ title: "Account created", description: "Check your email for a confirmation link, or sign in if auto-confirm is enabled." });
        } catch (error: any) {
          if (error.message?.includes("already registered")) {
            toast({ 
              title: "Account exists", 
              description: "This email is already registered. Trying to sign it in instead...", 
              variant: "default" 
            });
            setView("login");
            await signIn(email, password);
          } else {
            throw error;
          }
        }
      } else if (view === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth?view=reset`,
        });
        if (error) throw error;
        toast({ title: "Reset email sent", description: "Check your inbox for a password reset link." });
        setView("login");
      }
    } catch (error: any) {
      toast({ title: "Auth Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleVerify2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);

    try {
      // 1. Fetch user's 2FA secret from user_2fa
      const { data: mfaRecord, error } = await supabase
        .from("user_2fa")
        .select("secret_key, backup_codes")
        .eq("user_id", user.id)
        .single();
        
      if (error || !mfaRecord) throw new Error("2FA not configured properly");

      // 2. Validate TOTP or Backup code
      let isValid = false;
      
      if (twoFactorCode.length === 6) {
        // Validate TOTP
        let totp = new OTPAuth.TOTP({
          algorithm: "SHA1",
          digits: 6,
          period: 30,
          secret: OTPAuth.Secret.fromBase32(mfaRecord.secret_key),
        });
        
        let delta = totp.validate({ token: twoFactorCode, window: 1 });
        isValid = delta !== null;
      } else if (mfaRecord.backup_codes.includes(twoFactorCode)) {
        isValid = true;
        // In production, we should remove the used backup code
      }

      if (isValid) {
        // If "remember device" is checked, create a device token
        if (rememberDevice) {
          const deviceToken = OTPAuth.Secret.fromBase32(crypto.randomUUID().replace(/-/g,'')).base32;
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + 30);
          
          await supabase.from("user_2fa_devices").insert({
            user_id: user.id,
            device_token: deviceToken,
            device_name: navigator.userAgent,
            expires_at: expiresAt.toISOString()
          });
          
          localStorage.setItem("docquery_2fa_device", deviceToken);
        }
        
        verifyMfa();
        toast({ title: "Verified", description: "Two-factor authentication successful." });
        navigate("/chat");
      } else {
        toast({ title: "Verification Failed", description: "Invalid code. Please try again.", variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast({ title: "Password updated", description: "You can now sign in with your new password." });
      setView("login");
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("view") === "reset") setView("reset");
    if (params.get("view") === "2fa") setView("2fa");
    if (params.get("mode") === "signup") setView("signup");
  }, []);

  React.useEffect(() => {
    // If we have a verified session, redirect away from Auth
    if (user && (mfaStatus === "verified" || mfaStatus === "disabled")) {
      navigate("/chat");
    } else if (mfaStatus === "unverified") {
      setView("2fa");
    }
  }, [user, mfaStatus, navigate]);

  const signupDisabled = view === "signup" && !tosAccepted;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <Brain className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            DocQuery <span className="text-primary">AI</span>
          </h1>
          <p className="mt-2 text-sm text-muted-foreground max-w-sm mx-auto">
            Secure Multi-Tenant RAG — Intelligent Document Query System
          </p>
        </div>

        <Card className="border-border/50 shadow-xl">
          <CardHeader className="space-y-1">
            <CardTitle className="text-xl">
              {view === "login" && "Sign in"}
              {view === "signup" && "Create account"}
              {view === "forgot" && "Reset password"}
              {view === "reset" && "New password"}
            </CardTitle>
            <CardDescription>
              {view === "login" && "Enter your credentials to access your workspace"}
              {view === "signup" && "Set up your organization and start uploading documents"}
              {view === "forgot" && "We'll send you a link to reset your password"}
              {view === "reset" && "Enter your new password below"}
              {view === "2fa" && "Enter the verification code from your authenticator app"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {view === "2fa" ? (
              <form onSubmit={handleVerify2FA} className="space-y-4">
                <div className="space-y-4 flex flex-col items-center">
                  <div className="bg-primary/10 p-3 rounded-full mb-2">
                    <ShieldIcon className="h-6 w-6 text-primary" />
                  </div>
                  <Label htmlFor="2fa-code" className="text-center w-full">Authentication Code</Label>
                  <InputOTP
                    id="2fa-code"
                    maxLength={6}
                    value={twoFactorCode}
                    onChange={(value) => setTwoFactorCode(value)}
                  >
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                    </InputOTPGroup>
                    <InputOTPSeparator />
                    <InputOTPGroup>
                      <InputOTPSlot index={3} />
                      <InputOTPSlot index={4} />
                      <InputOTPSlot index={5} />
                    </InputOTPGroup>
                  </InputOTP>
                  
                  {twoFactorCode.length > 0 && twoFactorCode.length !== 6 && (
                    <p className="text-xs text-muted-foreground w-full text-center">
                      Alternatively, enter a backup code.
                    </p>
                  )}
                  {twoFactorCode.length > 6 && (
                    <p className="text-xs text-muted-foreground w-full text-center">
                      Ready to use backup code.
                    </p>
                  )}
                  {twoFactorCode.length !== 6 && (
                     <Input 
                       className="text-center mt-2" 
                       placeholder="Backup code" 
                       value={twoFactorCode} 
                       onChange={(e) => setTwoFactorCode(e.target.value)} 
                       style={{ display: twoFactorCode.length === 6 && view === '2fa' ? 'none' : 'block' }}
                     />
                  )}
                </div>
                
                <div className="flex items-start gap-2 pt-2 pb-2">
                  <Checkbox
                    id="rememberDevice"
                    checked={rememberDevice}
                    onCheckedChange={(c) => setRememberDevice(c === true)}
                    className="mt-0.5"
                  />
                  <Label htmlFor="rememberDevice" className="text-xs text-muted-foreground leading-relaxed cursor-pointer inline-block">
                    Remember this device for 30 days
                  </Label>
                </div>
                
                <Button type="submit" className="w-full" disabled={loading || (twoFactorCode.length < 6)}>
                  {loading ? "Verifying..." : "Verify Identity"}
                </Button>
                
                <div className="text-center">
                  <button type="button" onClick={() => {
                    supabase.auth.signOut();
                    setView("login");
                  }} className="text-xs text-muted-foreground hover:text-foreground">
                    Sign in with a different account
                  </button>
                </div>
              </form>
            ) : view === "reset" ? (
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="new-password">New Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input id="new-password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} className="pl-9" required minLength={6} />
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Updating..." : "Update Password"}
                </Button>
              </form>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {view === "signup" && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-1">
                      <Label htmlFor="name">Display Name</Label>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs">This will be your organization admin name</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <div className="relative">
                      <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input id="name" placeholder="Your name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="pl-9" required />
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input id="email" type="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-9" required />
                  </div>
                </div>
                {view !== "forgot" && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password">Password</Label>
                      {view === "login" && (
                        <button type="button" onClick={() => setView("forgot")} className="text-xs text-primary hover:underline">
                          Forgot password?
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} className="pl-9" required minLength={6} />
                    </div>
                    {view === "signup" && password.length > 0 && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Password strength</span>
                          <span className="text-muted-foreground">{pwStrength.label}</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${pwStrength.color}`}
                            style={{ width: `${pwStrength.score}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {view === "signup" && (
                  <div className="flex items-start gap-2">
                    <Checkbox
                      id="tos"
                      checked={tosAccepted}
                      onCheckedChange={(c) => setTosAccepted(c === true)}
                      className="mt-0.5"
                    />
                    <Label htmlFor="tos" className="text-xs text-muted-foreground leading-relaxed cursor-pointer">
                      I agree to the Terms of Service and Privacy Policy
                    </Label>
                  </div>
                )}
                <Button type="submit" className="w-full" disabled={loading || signupDisabled}>
                  {loading ? "Loading..." : view === "login" ? "Sign In" : view === "signup" ? "Create Account" : "Send Reset Link"}
                </Button>
              </form>
            )}

            {/* Demo link */}
            {(view === "login" || view === "signup") && (
              <button
                type="button"
                onClick={() => setDemoOpen(true)}
                className="mt-3 flex w-full items-center justify-center gap-1.5 text-xs text-primary hover:underline"
              >
                <MessageSquare className="h-3 w-3" />
                See Live Demo
              </button>
            )}

            <div className="mt-4 text-center text-sm space-y-1">
              {view === "login" && (
                <button type="button" onClick={() => setView("signup")} className="text-primary hover:underline">
                  Don't have an account? Sign up
                </button>
              )}
              {view === "signup" && (
                <button type="button" onClick={() => setView("login")} className="text-primary hover:underline">
                  Already have an account? Sign in
                </button>
              )}
              {(view === "forgot" || view === "reset") && (
                <button type="button" onClick={() => setView("login")} className="text-primary hover:underline">
                  Back to sign in
                </button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Feature highlights */}
        <div className="mt-6 flex items-center justify-center gap-4 flex-wrap">
          {[
            { icon: ShieldIcon, label: "Row-Level Security" },
            { icon: Users, label: "Multi-Tenant Isolation" },
            { icon: FileText, label: "Source-Cited Answers" },
          ].map((f) => (
            <div key={f.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <f.icon className="h-3.5 w-3.5 text-primary" />
              <span>{f.label}</span>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Demo Chat Modal */}
      <Dialog open={demoOpen} onOpenChange={setDemoOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Live Demo — RAG Chat Preview</DialogTitle>
            <DialogDescription>Read-only preview of the AI-powered document query system.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2 max-h-[60vh] overflow-y-auto">
            {demoMessages.map((m, i) => (
              <div key={i} className={`rounded-lg p-3 text-sm ${m.role === "user" ? "bg-primary/10 ml-8" : "bg-muted/50 mr-4"}`}>
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  {m.role === "user" ? "You" : "AI Assistant"}
                </p>
                <p className="whitespace-pre-line text-foreground">{m.content}</p>
                {m.role === "assistant" && "sources" in m && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(m as any).sources.map((s: string) => (
                      <Badge key={s} variant="secondary" className="text-xs">📄 {s}</Badge>
                    ))}
                    <Badge variant="outline" className="text-xs">Confidence: {(m as any).confidence}%</Badge>
                  </div>
                )}
              </div>
            ))}
          </div>
          <Button asChild className="w-full">
            <a href="/auth">Sign In to Try It Live</a>
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Auth;
