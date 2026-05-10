import React, { createContext, useContext, useEffect, useState } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface Profile {
  id: string;
  user_id: string;
  tenant_id: string;
  display_name: string | null;
  email: string | null;
  role?: string;
  created_at?: string;
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  tenantName: string | null;
  loading: boolean;
  mfaStatus: "loading" | "disabled" | "unverified" | "verified";
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  verifyMfa: () => void;
  role: "admin" | "user";
  setRole: (role: "admin" | "user") => void;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tenantName, setTenantName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mfaStatus, setMfaStatus] = useState<AuthContextType["mfaStatus"]>("loading");
  const [role, setRole] = useState<"admin" | "user">("admin");

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", userId)
      .single();
    setProfile(data);
    if (data?.tenant_id) {
      const { data: tenant } = await supabase
        .from("tenants")
        .select("name")
        .eq("id", data.tenant_id)
        .single();
      setTenantName(tenant?.name ?? null);
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          setTimeout(() => fetchProfile(session.user.id), 0);
          checkMfa(session.user.id);
        } else {
          setProfile(null);
          setTenantName(null);
          setMfaStatus("loading");
          setLoading(false);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
        checkMfa(session.user.id);
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkMfa = async (userId: string) => {
    // Check if user has 2FA enabled in DB
    const { data } = await supabase.from("user_2fa").select("id").eq("user_id", userId).maybeSingle();
    
    // Check if device is remembered
    const rememberedToken = localStorage.getItem("docquery_2fa_device");
    let isRemembered = false;
    
    if (rememberedToken) {
      const { data: dev } = await supabase.from("user_2fa_devices").select("id").eq("device_token", rememberedToken).gt("expires_at", new Date().toISOString()).maybeSingle();
      if (dev) isRemembered = true;
    }

    if (data && !isRemembered) {
      setMfaStatus("unverified");
    } else {
      setMfaStatus(data ? "verified" : "disabled");
    }
    setLoading(false);
  };

  const signUp = async (email: string, password: string, displayName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName },
        emailRedirectTo: window.location.origin,
      },
    });
    if (error) throw error;
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  const verifyMfa = () => {
    setMfaStatus("verified");
  };

  return (
    <AuthContext.Provider value={{ 
      session, user, profile, tenantName, loading, mfaStatus, 
      signUp, signIn, signOut, verifyMfa, role, setRole 
    }}>
      {children}
    </AuthContext.Provider>
  );
};
