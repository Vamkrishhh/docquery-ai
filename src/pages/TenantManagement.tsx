import React, { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import TenantBadge from "@/components/TenantBadge";
import {
  Building2, Copy, Plus, Users, HardDrive,
  FileText, Trash2, Shield as ShieldIcon, Activity
} from "lucide-react";

interface TenantInfo {
  id: string;
  name: string;
  storage_limit_mb: number;
  query_limit_monthly: number;
  status: string;
  created_at: string;
}

interface MemberInfo {
  id: string;
  user_id: string;
  display_name: string | null;
  email: string | null;
  role: string;
}

const TenantManagement = () => {
  const { profile, tenantName, user } = useAuth();
  const { toast } = useToast();
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [members, setMembers] = useState<MemberInfo[]>([]);
  const [memberCount, setMemberCount] = useState(0);
  const [docCount, setDocCount] = useState(0);
  const [chunkCount, setChunkCount] = useState(0);
  const [queryCount, setQueryCount] = useState(0);
  const [storageBytes, setStorageBytes] = useState(0);
  const [tenantDocs, setTenantDocs] = useState<any[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailTab, setDetailTab] = useState("members");
  const [newTenantName, setNewTenantName] = useState("");
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [newStorageLimit, setNewStorageLimit] = useState(100);
  const [newQueryLimit, setNewQueryLimit] = useState(1000);
  const [creating, setCreating] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<MemberInfo | null>(null);

  const tenantId = profile?.tenant_id;

  const fetchTenantData = async () => {
    if (!tenantId) return;

    const [tenantRes, membersRes, docsRes, chunksRes, queriesRes] = await Promise.all([
      supabase.from("tenants").select("*").eq("id", tenantId).single(),
      supabase.from("profiles").select("id, user_id, display_name, email").eq("tenant_id", tenantId),
      supabase.from("documents").select("id, filename, file_size, status, created_at").eq("tenant_id", tenantId),
      supabase.from("document_chunks").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
      supabase.from("query_logs").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    ]);

    if (tenantRes.data) {
      setTenant(tenantRes.data as unknown as TenantInfo);
    }

    if (membersRes.data) {
      // Fetch roles for each member
      const memberIds = membersRes.data.map((m) => m.user_id);
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", memberIds);

      const roleMap = new Map<string, string>();
      roles?.forEach((r) => roleMap.set(r.user_id, r.role));

      setMembers(
        membersRes.data.map((m) => ({
          ...m,
          role: roleMap.get(m.user_id) || "member",
        }))
      );
      setMemberCount(membersRes.data.length);
    }

    if (docsRes.data) {
      setTenantDocs(docsRes.data);
      setDocCount(docsRes.data.length);
      setStorageBytes(docsRes.data.reduce((sum, d) => sum + (d.file_size || 0), 0));
    }

    setChunkCount(chunksRes.count || 0);
    setQueryCount(queriesRes.count || 0);
  };

  useEffect(() => {
    fetchTenantData();
  }, [tenantId]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied", description: "Tenant ID copied to clipboard" });
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const handleCreateTenant = async () => {
    if (!newTenantName.trim()) return;
    setCreating(true);
    try {
      const { error } = await supabase.from("tenants").insert({
        name: newTenantName,
        storage_limit_mb: newStorageLimit,
        query_limit_monthly: newQueryLimit,
      });
      if (error) throw error;
      toast({ title: "Tenant created", description: `Organization "${newTenantName}" has been created.` });
      setCreateOpen(false);
      setNewTenantName("");
      setNewAdminEmail("");
      fetchTenantData();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const handleRemoveMember = async () => {
    if (!memberToRemove || memberToRemove.user_id === user?.id) {
      toast({ title: "Cannot remove yourself", variant: "destructive" });
      setMemberToRemove(null);
      return;
    }
    // Only delete the profile (RLS enforced) — this effectively removes from tenant
    const { error } = await supabase.from("profiles").delete().eq("id", memberToRemove.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Member removed" });
      fetchTenantData();
    }
    setMemberToRemove(null);
  };

  const storageMb = storageBytes / (1024 * 1024);
  const storageLimit = tenant?.storage_limit_mb || 100;
  const storagePercent = Math.min((storageMb / storageLimit) * 100, 100);
  const queryLimit = tenant?.query_limit_monthly || 1000;
  const queryPercent = Math.min((queryCount / queryLimit) * 100, 100);

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-foreground">Tenant Management</h1>
            <TenantBadge />
          </div>
          <p className="text-sm text-muted-foreground">
            Manage organizations with <strong>full data isolation</strong> — each tenant's documents, conversations, and query logs are RLS-scoped and never shared.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Create New Tenant
        </Button>
      </div>

      {/* Current Tenant Card */}
      <Card className="border-primary/20">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Current Organization</CardTitle>
          </div>
          <CardDescription>{tenantName || "Loading..."}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {/* Tenant ID */}
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium">Tenant ID</p>
              <div className="flex items-center gap-1">
                <code className="text-xs font-mono text-foreground">
                  {tenantId?.substring(0, 12)}…
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => tenantId && copyToClipboard(tenantId)}
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            </div>

            {/* Members */}
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium">Members</p>
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                <span className="text-lg font-semibold">{memberCount}</span>
              </div>
            </div>

            {/* Storage */}
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium">Storage Used</p>
              <div className="flex items-center gap-2">
                <HardDrive className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">
                  {formatBytes(storageBytes)} / {storageLimit} MB
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${storagePercent}%` }}
                />
              </div>
            </div>

            {/* Queries */}
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium">Queries This Month</p>
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                <span className="text-lg font-semibold">{queryCount}</span>
                <span className="text-xs text-muted-foreground">/ {queryLimit}</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${queryPercent}%` }}
                />
              </div>
            </div>

            {/* Documents */}
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium">Documents</p>
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                <span className="text-lg font-semibold">{docCount}</span>
              </div>
              <p className="text-xs text-muted-foreground">{chunkCount} chunks indexed</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detail Tabs */}
      <Tabs value={detailTab} onValueChange={setDetailTab}>
        <TabsList>
          <TabsTrigger value="members" className="gap-1.5">
            <Users className="h-3.5 w-3.5" /> Members
          </TabsTrigger>
          <TabsTrigger value="documents" className="gap-1.5">
            <FileText className="h-3.5 w-3.5" /> Documents
          </TabsTrigger>
        </TabsList>

        {/* Members Tab */}
        <TabsContent value="members" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Organization Members</CardTitle>
                <Badge variant="secondary">{memberCount} members</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">
                        {m.display_name || "—"}
                        {m.user_id === user?.id && (
                          <Badge variant="outline" className="ml-2 text-xs">You</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{m.email}</TableCell>
                      <TableCell>
                        <Badge variant={m.role === "admin" ? "default" : "secondary"} className="gap-1">
                          {m.role === "admin" && <ShieldIcon className="h-3 w-3" />}
                          {m.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {m.user_id !== user?.id && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive"
                            onClick={() => setMemberToRemove(m)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {members.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                        No members found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Documents Tab */}
        <TabsContent value="documents" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Tenant Documents</CardTitle>
                <Badge variant="secondary">{docCount} documents</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Filename</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Uploaded</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tenantDocs.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="font-medium">{d.filename}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {d.file_size ? formatBytes(d.file_size) : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={d.status === "ready" ? "default" : d.status === "error" ? "destructive" : "secondary"}
                        >
                          {d.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {new Date(d.created_at).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                  {tenantDocs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                        No documents uploaded yet
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create Tenant Modal */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Tenant</DialogTitle>
            <DialogDescription>
              Set up a new organization with its own isolated workspace.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="org-name">Organization Name *</Label>
              <Input
                id="org-name"
                value={newTenantName}
                onChange={(e) => setNewTenantName(e.target.value)}
                placeholder="Acme Corp"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-email">Admin Email *</Label>
              <Input
                id="admin-email"
                type="email"
                value={newAdminEmail}
                onChange={(e) => setNewAdminEmail(e.target.value)}
                placeholder="admin@acme.com"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="storage-limit">Storage Limit (MB)</Label>
                <Input
                  id="storage-limit"
                  type="number"
                  value={newStorageLimit}
                  onChange={(e) => setNewStorageLimit(Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="query-limit">Query Limit / Month</Label>
                <Input
                  id="query-limit"
                  type="number"
                  value={newQueryLimit}
                  onChange={(e) => setNewQueryLimit(Number(e.target.value))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateTenant} disabled={creating || !newTenantName.trim()}>
              {creating ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Member Confirmation */}
      <AlertDialog open={!!memberToRemove} onOpenChange={() => setMemberToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove {memberToRemove?.display_name || memberToRemove?.email} from this organization?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemoveMember}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default TenantManagement;
