import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { KeyRound, Plus, ShieldAlert, UserPlus, Coins, Building2, MessageSquareText, Pencil, Trash2, CalendarRange } from "lucide-react";
import SmsSettings from "@/components/SmsSettings";
import TwilioSettings from "@/components/TwilioSettings";
import CampaignSettings from "@/components/CampaignSettings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "@/lib/api";
import type { AppSettings, Role, User, UserCreate, UserUpdate } from "@/lib/types";
import { fmtDate, useI18n } from "@/lib/i18n";
import { useMe } from "@/lib/useMe";
import { PageHeader } from "@/components/shared";
import { cn } from "@/lib/utils";

function PriceForm() {
  const { t, errMsg } = useI18n();
  const qc = useQueryClient();
  const s = useQuery({ queryKey: ["settings"], queryFn: () => apiGet<AppSettings>("/settings") });
  const [edit, setEdit] = useState<Partial<Record<keyof AppSettings, string>>>({});
  const val = (k: keyof AppSettings) => edit[k] ?? (s.data ? String(s.data[k] ?? "") : "");
  const m = useMutation({
    mutationFn: (b: AppSettings) => apiPut<AppSettings>("/settings", b),
    onSuccess: () => {
      toast.success(t("saved"));
      setEdit({});
      qc.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const v = parseFloat(val("price_per_kg").replace(",", "."));
  const field = (k: keyof AppSettings, label: string, testId: string, extra = "") => (
    <div className="space-y-2">
      <Label htmlFor={k}>{label}</Label>
      <Input id={k} data-testid={testId} value={val(k)} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} className={cn("h-11 rounded-xl bg-white", extra)} />
    </div>
  );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!isNaN(v) && v >= 0)
          m.mutate({ ...s.data!, price_per_kg: v, mill_name: val("mill_name"), mill_address: val("mill_address"), mill_phone: val("mill_phone") });
      }}
      className="grid max-w-4xl gap-6 md:grid-cols-2"
    >
      <div className="space-y-4 rounded-2xl border border-violet-200 bg-[#FAF5FF] p-6">
        <div className="flex items-center gap-3 text-violet-900">
          <div className="grid size-10 place-items-center rounded-xl bg-violet-600 text-white"><Coins className="size-5" /></div>
          <h2 className="font-heading text-xl font-bold">{t("tariff")}</h2>
        </div>
        {field("price_per_kg", t("price_per_kg"), "admin-price-per-kg-input", "text-lg font-semibold")}
      </div>
      <div className="space-y-4 rounded-2xl border border-teal-200 bg-teal-50/60 p-6">
        <div className="flex items-center gap-3 text-teal-900">
          <div className="grid size-10 place-items-center rounded-xl bg-teal-600 text-white"><Building2 className="size-5" /></div>
          <h2 className="font-heading text-xl font-bold">{t("mill_info")}</h2>
        </div>
        {field("mill_name", t("mill_name"), "admin-mill-name-input")}
        {field("mill_address", t("mill_address"), "admin-mill-address-input")}
        {field("mill_phone", t("mill_phone"), "admin-mill-phone-input")}
      </div>
      <div>
        <Button type="submit" disabled={isNaN(v) || m.isPending} data-testid="admin-price-save-button" className="h-11 rounded-xl bg-violet-700 px-8 hover:bg-violet-800">
          {t("save")}
        </Button>
      </div>
    </form>
  );
}

function UserDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, errMsg } = useI18n();
  const qc = useQueryClient();
  const [f, setF] = useState<UserCreate>({ username: "", full_name: "", password: "", role: "worker" });
  const m = useMutation({
    mutationFn: (b: UserCreate) => apiPost<User>("/users", b),
    onSuccess: () => {
      toast.success(t("created"));
      qc.invalidateQueries({ queryKey: ["users"] });
      setF({ username: "", full_name: "", password: "", role: "worker" });
      onClose();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const ROLE: Record<string, string> = { worker: t("worker"), admin: t("admin") };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="user-create-dialog">
        <DialogHeader><DialogTitle>{t("new_user")}</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); m.mutate(f); }} className="space-y-4">
          <div className="space-y-2">
            <Label>{t("full_name")}</Label>
            <Input data-testid="user-fullname-input" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>{t("username")}</Label>
            <Input dir="ltr" data-testid="user-username-input" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>{t("password")}</Label>
            <Input type="text" dir="ltr" data-testid="user-password-input" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>{t("role")}</Label>
            <Select value={f.role} onValueChange={(v: string) => setF({ ...f, role: v as Role })}>
              <SelectTrigger className="w-full" data-testid="user-role-select">
                <SelectValue>{(v) => ROLE[v as string]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="worker">{t("worker")}</SelectItem>
                <SelectItem value="admin">{t("admin")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>{t("cancel")}</Button>
            <Button type="submit" data-testid="user-create-submit" disabled={m.isPending || f.username.length < 2 || f.password.length < 4 || !f.full_name} className="bg-lime-700 hover:bg-lime-800">
              {t("create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PasswordDialog({ user, onClose }: { user: User | null; onClose: () => void }) {
  const { t, errMsg } = useI18n();
  const [pw, setPw] = useState("");
  const m = useMutation({
    mutationFn: (p: string) => apiPatch<User>(`/users/${user!.id}`, { password: p } satisfies UserUpdate),
    onSuccess: () => {
      toast.success(t("saved"));
      setPw("");
      onClose();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="password-dialog">
        <DialogHeader><DialogTitle>{t("change_password")} — {user?.full_name}</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); if (pw.length >= 4) m.mutate(pw); }} className="space-y-4">
          <div className="space-y-2">
            <Label>{t("new_password")}</Label>
            <Input dir="ltr" data-testid="new-password-input" value={pw} onChange={(e) => setPw(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>{t("cancel")}</Button>
            <Button type="submit" disabled={pw.length < 4 || m.isPending} data-testid="new-password-submit" className="bg-amber-600 hover:bg-amber-700">{t("save")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditUserDialog({ user, onClose }: { user: User | null; onClose: () => void }) {
  const { t, errMsg } = useI18n();
  const qc = useQueryClient();
  const [f, setF] = useState<{ username: string; full_name: string; role: Role }>({ username: "", full_name: "", role: "worker" });
  const [lastId, setLastId] = useState<string | null>(null);
  if (user && user.id !== lastId) {
    setLastId(user.id);
    setF({ username: user.username, full_name: user.full_name, role: user.role });
  }
  const self = useMe().data?.id === user?.id;
  const m = useMutation({
    mutationFn: (b: UserUpdate) => apiPatch<User>(`/users/${user!.id}`, b),
    onSuccess: () => {
      toast.success(t("user_updated"));
      qc.invalidateQueries({ queryKey: ["users"] });
      onClose();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const ROLE: Record<string, string> = { worker: t("worker"), admin: t("admin") };
  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="user-edit-dialog">
        <DialogHeader><DialogTitle>{t("edit_user")}</DialogTitle></DialogHeader>
        <form id="user-edit-form" onSubmit={(e) => { e.preventDefault(); m.mutate(self ? { username: f.username, full_name: f.full_name } : f); }} className="space-y-4">
          <div className="space-y-2"><Label>{t("full_name")}</Label><Input data-testid="user-edit-fullname-input" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></div>
          <div className="space-y-2"><Label>{t("username")}</Label><Input dir="ltr" data-testid="user-edit-username-input" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} /></div>
          <div className="space-y-2">
            <Label>{t("role")}</Label>
            <Select value={f.role} disabled={self} onValueChange={(v) => setF({ ...f, role: v as Role })}>
              <SelectTrigger className="w-full" data-testid="user-edit-role-select"><SelectValue>{(v) => ROLE[v as string]}</SelectValue></SelectTrigger>
              <SelectContent>
                <SelectItem value="worker">{t("worker")}</SelectItem>
                <SelectItem value="admin">{t("admin")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </form>
        <DialogFooter>
          <Button type="submit" form="user-edit-form" disabled={m.isPending || !f.full_name.trim() || f.username.trim().length < 3} data-testid="user-edit-save-button" className="rounded-xl bg-lime-700 hover:bg-lime-800">{t("save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UsersPanel() {
  const { t, errMsg } = useI18n();
  const me = useMe().data;
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [pwUser, setPwUser] = useState<User | null>(null);
  const [editUser, setEditUser] = useState<User | null>(null);
  const del = useMutation({
    mutationFn: (id: string) => apiDelete<{ ok: boolean }>(`/users/${id}`),
    onSuccess: () => { toast.success(t("user_deleted")); qc.invalidateQueries({ queryKey: ["users"] }); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const users = useQuery({ queryKey: ["users"], queryFn: () => apiGet<User[]>("/users") });
  const rows = users.isError ? [] : (users.data ?? []);
  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: UserUpdate }) => apiPatch<User>(`/users/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
    onError: (e) => toast.error(errMsg(e)),
  });

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setCreating(true)} data-testid="admin-user-create-button" className="rounded-xl bg-lime-700 hover:bg-lime-800">
          <UserPlus className="size-4" /> {t("new_user")}
        </Button>
      </div>
      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
        <Table data-testid="users-table">
          <TableHeader className="bg-stone-50">
            <TableRow>
              <TableHead className="text-start">{t("full_name")}</TableHead>
              <TableHead className="text-start">{t("username")}</TableHead>
              <TableHead className="text-start">{t("role")}</TableHead>
              <TableHead className="text-start">{t("status")}</TableHead>
              <TableHead className="text-start">{t("date")}</TableHead>
              <TableHead className="text-end">{t("actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((u) => {
              const self = u.id === me?.id;
              return (
                <TableRow key={u.id} data-testid={`user-row-${u.username}`}>
                  <TableCell className="font-medium">{u.full_name}</TableCell>
                  <TableCell dir="ltr" className="text-start font-mono text-sm">{u.username}</TableCell>
                  <TableCell>
                    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", u.role === "admin" ? "bg-violet-100 text-violet-800" : "bg-emerald-100 text-emerald-800")}>
                      {u.role === "admin" ? t("admin") : t("worker")}
                    </span>
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      disabled={self || patch.isPending}
                      onClick={() => patch.mutate({ id: u.id, body: { active: !u.active } })}
                      data-testid={`admin-user-toggle-status-${u.username}`}
                      className="inline-flex items-center gap-2 disabled:opacity-50"
                      title={u.active ? t("deactivate") : t("activate")}
                    >
                      <span className={cn("relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200", u.active ? "bg-green-500" : "bg-stone-300")}>
                        <span className={cn("inline-block size-5 rounded-full bg-white shadow transition-transform duration-200", u.active ? "translate-x-5 rtl:-translate-x-5" : "translate-x-0.5 rtl:-translate-x-0.5")} />
                      </span>
                      <span className={cn("text-xs font-semibold", u.active ? "text-green-700" : "text-stone-500")} data-testid={`user-status-${u.username}`}>
                        {u.active ? t("active") : t("inactive")}
                      </span>
                    </button>
                  </TableCell>
                  <TableCell className="text-xs text-stone-500" dir="ltr">{fmtDate(u.created_at)}</TableCell>
                  <TableCell className="text-end">
                    <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEditUser(u)} data-testid={`admin-user-edit-${u.username}`} className="rounded-lg">
                      <Pencil className="size-4" /> {t("edit_user")}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setPwUser(u)} data-testid={`admin-user-password-${u.username}`} className="rounded-lg">
                      <KeyRound className="size-4" /> {t("change_password")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={self || del.isPending}
                      onClick={() => { if (window.confirm(t("confirm_delete_user"))) del.mutate(u.id); }}
                      data-testid={`admin-user-delete-${u.username}`}
                      className="rounded-lg border-red-200 text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="size-4" /> {t("delete_user")}
                    </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <UserDialog open={creating} onClose={() => setCreating(false)} />
      <PasswordDialog user={pwUser} onClose={() => setPwUser(null)} />
      <EditUserDialog user={editUser} onClose={() => setEditUser(null)} />
    </div>
  );
}

export default function SettingsPage() {
  const { t } = useI18n();
  const me = useMe();
  if (me.data && me.data.role !== "admin") {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-6 text-red-800" data-testid="admin-only-notice">
        <ShieldAlert /> {t("admin_only")}
      </div>
    );
  }
  return (
    <div>
      <PageHeader title={t("settings")} accent="bg-violet-500" />
      <Tabs defaultValue="users">
        <TabsList className="mb-6">
          <TabsTrigger value="users" data-testid="settings-tab-users"><Plus className="size-4" />{t("users")}</TabsTrigger>
          <TabsTrigger value="tariff" data-testid="settings-tab-tariff"><Coins className="size-4" />{t("tariff")}</TabsTrigger>
          <TabsTrigger value="sms" data-testid="settings-tab-sms"><MessageSquareText className="size-4" />{t("sms_settings")}</TabsTrigger>
          <TabsTrigger value="campaign" data-testid="settings-tab-campaign"><CalendarRange className="size-4" />{t("campaign")}</TabsTrigger>
        </TabsList>
        <TabsContent value="users"><UsersPanel /></TabsContent>
        <TabsContent value="tariff"><PriceForm /></TabsContent>
        <TabsContent value="sms"><div className="space-y-6"><TwilioSettings /><SmsSettings /></div></TabsContent>
        <TabsContent value="campaign"><CampaignSettings /></TabsContent>
      </Tabs>
    </div>
  );
}
