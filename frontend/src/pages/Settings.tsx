import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { KeyRound, ShieldAlert, UserPlus, Users, Coins, MessageSquareText, Pencil, Trash2, CalendarRange, LogIn, ClipboardList, Warehouse, Fuel } from "lucide-react";
import SmsSettings from "@/components/SmsSettings";
import LoginImageSettings from "@/components/LoginImageSettings";
import TwilioSettings from "@/components/TwilioSettings";
import TunisieSmsSettings from "@/components/TunisieSmsSettings";
import CampaignSettings from "@/components/CampaignSettings";
import VarietiesSettings from "@/components/VarietiesSettings";
import CommercialTanksSettings from "@/components/CommercialTanksSettings";
import PumpSettings from "@/components/PumpSettings";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { ShieldCheck } from "lucide-react";
import Audit from "@/pages/Audit";


function EmployeePermissionsPanel() {
  const { lang, errMsg } = useI18n();
  const queryClient = useQueryClient();
  const [selectedWorkerId, setSelectedWorkerId] = useState("");
  const [assignedPermissions, setAssignedPermissions] = useState<string[]>([]);
  const workers = useQuery({ queryKey: ["commercial", "workers"], queryFn: () => apiGet<Record<string, any>[]>("/users") });
  const targetPermissions = useQuery({
    queryKey: ["commercial", "worker-permissions", selectedWorkerId],
    queryFn: () => apiGet<{ permissions: string[] }>(`/commercial/v1/users/${encodeURIComponent(selectedWorkerId)}/commercial-permissions`),
    enabled: !!selectedWorkerId,
  });
  useEffect(() => {
    setAssignedPermissions(targetPermissions.data?.permissions.filter((permission) => permission !== "commercial.read") ?? []);
  }, [targetPermissions.data, selectedWorkerId]);
  const save = useMutation({
    mutationFn: () => apiPost<Record<string, any>>(`/commercial/v1/users/${encodeURIComponent(selectedWorkerId)}/commercial-permissions`, {
      permissions: ["commercial.read", ...assignedPermissions],
    }),
    onSuccess: async () => {
      toast.success(lang === "ar" ? "تم تحديث الصلاحيات" : "Autorisations mises à jour");
      await queryClient.invalidateQueries({ queryKey: ["commercial", "worker-permissions", selectedWorkerId] });
    },
    onError: (error) => toast.error(errMsg(error)),
  });
  const permissions = [
    ["commercial.edit_records", lang === "ar" ? "تعديل السجلات التجارية" : "Modification des dossiers commerciaux"],
    ["commercial.delete_records", lang === "ar" ? "حذف / إلغاء السجلات التجارية" : "Suppression / annulation des dossiers commerciaux"],
    ["commercial.lab_record", lang === "ar" ? "تسجيل التحاليل المخبرية" : "Saisie des analyses laboratoire"],
    ["commercial.manage_preproduction_samples", lang === "ar" ? "إجراء تجارب العصر قبل الإنتاج" : "Gérer les essais de trituration préproduction"],
    ["commercial.quality_release", lang === "ar" ? "المراجعة المستقلة للجودة" : "Validation indépendante de la qualité"],
    ["commercial.view_audit", lang === "ar" ? "الاطلاع على سجل التدقيق" : "Consultation du journal d’audit"],
  ];
  const activeWorkers = (workers.data ?? []).filter((worker) => worker.role === "worker" && worker.active);
  return (
    <div className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-5">
      <div className="mb-4 flex items-center gap-3 text-indigo-950">
        <div className="grid size-10 place-items-center rounded-xl bg-indigo-600 text-white"><ShieldAlert className="size-5" /></div>
        <div><h2 className="text-lg font-bold">{lang === "ar" ? "صلاحيات العمال" : "Droits des employés"}</h2>
        <p className="text-sm text-indigo-800">{lang === "ar" ? "حدد الصلاحيات الممنوحة لكل عامل" : "Définissez les autorisations accordées à chaque employé"}</p></div>
      </div>
      <label className="grid max-w-xl gap-1 text-sm font-medium">{lang === "ar" ? "اختيار العامل" : "Choisir un employé"}
        <select value={selectedWorkerId} onChange={(event) => setSelectedWorkerId(event.target.value)} className="h-10 rounded-lg border border-indigo-200 bg-white px-3 font-normal">
          <option value="">—</option>
          {activeWorkers.map((worker) => <option key={worker.id} value={worker.id}>{worker.full_name} · {worker.username}</option>)}
        </select>
      </label>
      {activeWorkers.length === 0 && <p className="mt-3 text-sm text-muted-foreground">{lang === "ar" ? "لا توجد حسابات عمال نشطة." : "Aucun compte employé actif."}</p>}
      {selectedWorkerId && <div className="mt-4 space-y-3 rounded-xl border border-indigo-200 bg-white p-4">
        {permissions.map(([key, label]) => <label key={key} className="flex items-center gap-3 text-sm">
          <input type="checkbox" checked={assignedPermissions.includes(key)} onChange={(event) => setAssignedPermissions((current) => event.target.checked ? [...current, key] : current.filter((item) => item !== key))} />
          {label}
        </label>)}
        <Button disabled={save.isPending || targetPermissions.isLoading || targetPermissions.isError} onClick={() => save.mutate()} className="bg-indigo-700 hover:bg-indigo-800">
          {lang === "ar" ? "حفظ الصلاحيات" : "Enregistrer les autorisations"}
        </Button>
      </div>}
    </div>
  );
}

function formatTariffPrice(value: string): string {
  const normalized = value.trim().replace(/[\s\u00A0\u202F]/g, "").replace(",", ".");
  if (!normalized) return "";
  const number = Number(normalized);
  return Number.isFinite(number) ? new Intl.NumberFormat("fr-TN", { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(number) : value;
}

function parseTariffPrice(value: string): number {
  const normalized = value.trim().replace(",", ".");
  return normalized === "" ? Number.NaN : Number(normalized);
}

function PriceForm() {
  const { t, errMsg } = useI18n();
  const qc = useQueryClient();
  const s = useQuery({ queryKey: ["settings"], queryFn: () => apiGet<AppSettings>("/settings") });
  const [price, setPrice] = useState<string | null>(null);
  const [isEditingPrice, setIsEditingPrice] = useState(false);
  const rawPrice = price ?? (s.data ? String(s.data.price_per_kg) : "");
  const current = isEditingPrice ? rawPrice : formatTariffPrice(rawPrice);
  const v = parseTariffPrice(current);
  const m = useMutation({
    mutationFn: (price_per_kg: number) => apiPut<AppSettings>("/settings", { ...s.data!, price_per_kg }),
    onSuccess: () => {
      toast.success(t("saved"));
      setPrice(null);
      setIsEditingPrice(false);
      qc.invalidateQueries({ queryKey: ["settings"] });
      qc.invalidateQueries({ queryKey: ["mill"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
      <form onSubmit={(e) => { e.preventDefault(); if (!isNaN(v) && v >= 0 && s.data) m.mutate(v); }} className="w-full">
        <div className="w-full space-y-4 rounded-2xl border border-violet-200 bg-[#FAF5FF] p-6">
          <div className="flex items-center gap-3 text-violet-900">
            <div className="grid size-10 place-items-center rounded-xl bg-violet-600 text-white"><Coins className="size-5" /></div>
            <h2 className="font-heading text-xl font-bold">{t("tariff")}</h2>
          </div>
          <div className="space-y-2">
            <Label htmlFor="price_per_kg">{t("price_per_kg")}</Label>
            <Input
              id="price_per_kg"
              data-testid="admin-price-per-kg-input"
              inputMode="decimal"
              value={current}
              onFocus={() => { setPrice(current); setIsEditingPrice(true); }}
              onChange={(e) => setPrice(e.target.value)}
              onBlur={() => setIsEditingPrice(false)}
              className="h-11 rounded-xl bg-white text-lg font-semibold"
            />
          </div>
          <Button type="submit" disabled={isNaN(v) || v < 0 || m.isPending || !s.data} data-testid="admin-price-save-button" className="h-11 rounded-xl bg-violet-700 px-8 hover:bg-violet-800">
            {t("save")}
          </Button>
        </div>
      </form>
      <VarietiesSettings />
    </div>
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
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
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
  const { t, lang } = useI18n();
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
        <TabsList className="mb-6 grid h-auto w-full grid-cols-2 gap-2 bg-transparent p-0 sm:grid-cols-3 lg:grid-cols-9">
          <TabsTrigger value="users" data-testid="settings-tab-users" className="flex h-auto min-h-10 min-w-0 flex-row gap-2 rounded-2xl border border-stone-200 bg-white px-2 py-1 text-sm font-semibold text-stone-700 shadow-sm transition-all hover:border-sky-300 hover:bg-sky-50 data-[state=active]:border-sky-600 data-[state=active]:bg-sky-200 data-[state=active]:text-sky-950 data-[state=active]:shadow-md">
            <span className="grid size-7 place-items-center rounded-lg bg-sky-100 text-sky-700"><Users className="size-4 stroke-[2.2]" /></span><span>{t("users")}</span>
          </TabsTrigger>
          <TabsTrigger value="tariff" data-testid="settings-tab-tariff" className="flex h-auto min-h-10 min-w-0 flex-row gap-2 rounded-2xl border border-stone-200 bg-white px-2 py-1 text-sm font-semibold text-stone-700 shadow-sm transition-all hover:border-violet-300 hover:bg-violet-50 data-[state=active]:border-violet-600 data-[state=active]:bg-violet-200 data-[state=active]:text-violet-950 data-[state=active]:shadow-md">
            <span className="grid size-7 place-items-center rounded-lg bg-violet-100 text-violet-700"><Coins className="size-4 stroke-[2.2]" /></span><span>{t("tariff")}</span>
          </TabsTrigger>
          <TabsTrigger value="tanks" data-testid="settings-tab-tanks" className="flex h-auto min-h-10 min-w-0 flex-row gap-2 rounded-2xl border border-stone-200 bg-white px-2 py-1 text-sm font-semibold text-stone-700 shadow-sm transition-all hover:border-cyan-300 hover:bg-cyan-50 data-[state=active]:border-cyan-600 data-[state=active]:bg-cyan-200 data-[state=active]:text-cyan-950 data-[state=active]:shadow-md">
            <span className="grid size-7 place-items-center rounded-lg bg-cyan-100 text-cyan-700"><Warehouse className="size-4 stroke-[2.2]" /></span><span>{lang === "ar" ? "الخزانات" : "Cuves"}</span>
          </TabsTrigger>
          <TabsTrigger value="pumps" data-testid="settings-tab-pumps" className="flex h-auto min-h-10 min-w-0 flex-row gap-2 rounded-2xl border border-stone-200 bg-white px-2 py-1 text-sm font-semibold text-stone-700 shadow-sm transition-all hover:border-emerald-300 hover:bg-emerald-50 data-[state=active]:border-emerald-600 data-[state=active]:bg-emerald-200 data-[state=active]:text-emerald-950 data-[state=active]:shadow-md">
            <span className="grid size-7 place-items-center rounded-lg bg-emerald-100 text-emerald-700"><Fuel className="size-4 stroke-[2.2]" /></span><span>{lang === "ar" ? "المضخّات" : "Pompes"}</span>
          </TabsTrigger>
          <TabsTrigger value="sms" data-testid="settings-tab-sms" className="flex h-auto min-h-10 min-w-0 flex-row gap-2 rounded-2xl border border-stone-200 bg-white px-2 py-1 text-sm font-semibold text-stone-700 shadow-sm transition-all hover:border-pink-300 hover:bg-pink-50 data-[state=active]:border-pink-600 data-[state=active]:bg-pink-200 data-[state=active]:text-pink-950 data-[state=active]:shadow-md">
            <span className="grid size-7 place-items-center rounded-lg bg-pink-100 text-pink-700"><MessageSquareText className="size-4 stroke-[2.2]" /></span><span>{t("sms_settings")}</span>
          </TabsTrigger>
          <TabsTrigger value="campaign" data-testid="settings-tab-campaign" className="flex h-auto min-h-10 min-w-0 flex-row gap-2 rounded-2xl border border-stone-200 bg-white px-2 py-1 text-sm font-semibold text-stone-700 shadow-sm transition-all hover:border-amber-300 hover:bg-amber-50 data-[state=active]:border-amber-600 data-[state=active]:bg-amber-200 data-[state=active]:text-amber-950 data-[state=active]:shadow-md">
            <span className="grid size-7 place-items-center rounded-lg bg-amber-100 text-amber-700"><CalendarRange className="size-4 stroke-[2.2]" /></span><span>{t("campaign")}</span>
          </TabsTrigger>
          <TabsTrigger value="employee-permissions" data-testid="settings-tab-employee-permissions" className="flex h-auto min-h-10 min-w-0 flex-row gap-2 rounded-2xl border border-stone-200 bg-white px-2 py-1 text-sm font-semibold text-stone-700 shadow-sm transition-all hover:border-indigo-300 hover:bg-indigo-50 data-[state=active]:border-indigo-600 data-[state=active]:bg-indigo-200 data-[state=active]:text-indigo-950 data-[state=active]:shadow-md">
            <span className="grid size-7 place-items-center rounded-lg bg-indigo-100 text-indigo-700"><ShieldCheck className="size-4 stroke-[2.2]" /></span><span>{lang === "ar" ? "صلاحيات العمال" : "Droits des employés"}</span>
          </TabsTrigger>
          <TabsTrigger value="audit" data-testid="settings-tab-audit" className="flex h-auto min-h-10 min-w-0 flex-row gap-2 rounded-2xl border border-stone-200 bg-white px-2 py-1 text-sm font-semibold text-stone-700 shadow-sm transition-all hover:border-rose-300 hover:bg-rose-50 data-[state=active]:border-rose-600 data-[state=active]:bg-rose-200 data-[state=active]:text-rose-950 data-[state=active]:shadow-md">
            <span className="grid size-7 place-items-center rounded-lg bg-rose-100 text-rose-700"><ClipboardList className="size-4 stroke-[2.2]" /></span><span>{t("audit")}</span>
          </TabsTrigger>
          <TabsTrigger value="login-image" data-testid="settings-tab-login-image" className="flex h-auto min-h-10 min-w-0 flex-row gap-2 rounded-2xl border border-stone-200 bg-white px-2 py-1 text-sm font-semibold text-stone-700 shadow-sm transition-all hover:border-emerald-300 hover:bg-emerald-50 data-[state=active]:border-emerald-600 data-[state=active]:bg-emerald-200 data-[state=active]:text-emerald-950 data-[state=active]:shadow-md">
            <span className="grid size-7 place-items-center rounded-lg bg-emerald-100 text-emerald-700"><LogIn className="size-4 stroke-[2.2]" /></span><span>Page Login</span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="users"><UsersPanel /></TabsContent>
        <TabsContent value="tariff"><PriceForm /></TabsContent>
        <TabsContent value="tanks"><CommercialTanksSettings /></TabsContent>
        <TabsContent value="pumps"><PumpSettings /></TabsContent>
                <TabsContent value="sms"><div className="space-y-6"><div className="grid grid-cols-1 items-start gap-6 sm:grid-cols-2"><div className="min-w-0 sm:col-start-2 sm:row-start-1"><TwilioSettings /></div><div className="min-w-0 sm:col-start-1 sm:row-start-1"><TunisieSmsSettings /></div></div><SmsSettings /></div></TabsContent>
        <TabsContent value="campaign"><CampaignSettings /></TabsContent>
        <TabsContent value="employee-permissions"><EmployeePermissionsPanel /></TabsContent>
        <TabsContent value="audit"><Audit /></TabsContent>
        <TabsContent value="login-image"><LoginImageSettings /></TabsContent>
      </Tabs>
    </div>
  );
}
