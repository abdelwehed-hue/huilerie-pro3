import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { History, Printer, Plus, Sprout, UserPlus, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiGet, apiPost } from "@/lib/api";
import type { ClientCreate, ClientHistory, ClientSummary, Load, LoadCreate, SmsStatus, Varieties } from "@/lib/types";
import { fmtNum, useI18n } from "@/lib/i18n";
import { StatusPill } from "@/components/shared";
import ReceptionTicket from "@/components/ReceptionTicket";

function NewClientDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (c: ClientSummary) => void }) {
  const { t, errMsg } = useI18n();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const m = useMutation({
    mutationFn: (b: ClientCreate) => apiPost<ClientSummary>("/clients", b),
    onSuccess: (c) => {
      toast.success(t("client_created"));
      qc.invalidateQueries({ queryKey: ["clients"] });
      setName("");
      setPhone("");
      onCreated(c);
      onClose();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const valid = name.trim().length >= 2 && phone.trim().length >= 4;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="new-client-dialog">
        <DialogHeader><DialogTitle>{t("new_client")}</DialogTitle></DialogHeader>
        <form id="new-client-form" onSubmit={(e) => { e.preventDefault(); if (valid) m.mutate({ client_name: name.trim(), phone: phone.trim() }); }} className="space-y-4">
          <div className="space-y-2"><Label>{t("full_name")}</Label><Input value={name} onChange={(e) => setName(e.target.value)} data-testid="new-client-name-input" className="h-11 rounded-xl" /></div>
          <div className="space-y-2"><Label>{t("phone")}</Label><Input dir="ltr" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} data-testid="new-client-phone-input" className="h-11 rounded-xl text-start" /></div>
        </form>
        <DialogFooter>
          <Button type="submit" form="new-client-form" disabled={!valid || m.isPending} data-testid="new-client-save-button" className="rounded-xl bg-lime-700 hover:bg-lime-800">{t("save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function IntakePanel({ stacked = false }: { stacked?: boolean }) {
  const { t, errMsg } = useI18n();
  const qc = useQueryClient();
  const [bags, setBags] = useState("");
  const [variety, setVariety] = useState("");
  const [notes, setNotes] = useState("");
  const [initStatus, setInitStatus] = useState<"pending" | "pressing">("pending");
  const [newOpen, setNewOpen] = useState(false);
  const allClients = useQuery({ queryKey: ["clients", "__all"], queryFn: () => apiGet<ClientSummary[]>("/clients") });
  const clientList = allClients.isError ? [] : [...(allClients.data ?? [])].sort((a, b) => a.client_name.localeCompare(b.client_name));
  const vq = useQuery({ queryKey: ["varieties"], queryFn: () => apiGet<Varieties>("/varieties") });
  const varietyList = vq.isError ? [] : (vq.data?.varieties ?? []);
  const sms = useQuery({ queryKey: ["sms-status"], queryFn: () => apiGet<SmsStatus>("/sms/status") });
  const smsNote = sms.data && !sms.isError && sms.data.enabled ? (sms.data.mode === "live" ? t("sms_sent_live_toast") : t("sms_sent_toast")) : undefined;
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [kg, setKg] = useState("");
  const [showSug, setShowSug] = useState(false);
  const [created, setCreated] = useState<Load | null>(null);

  const term = name.trim();
  const sug = useQuery({
    queryKey: ["clients", term],
    queryFn: () => apiGet<ClientSummary[]>(`/clients?q=${encodeURIComponent(term)}`),
    enabled: showSug,
  });
  const suggestions = sug.isError ? [] : (sug.data ?? []).slice(0, 8);

  const pick = (c: ClientSummary) => {
    setName(c.client_name);
    setPhone(c.phone);
    setPicked(c.phone);
    setShowSug(false);
  };

  const [picked, setPicked] = useState<string | null>(null);
  const histPhone = picked && picked === phone.trim() ? picked : null;
  const hist = useQuery({
    queryKey: ["client", histPhone],
    queryFn: () => apiGet<ClientHistory>(`/clients/${encodeURIComponent(histPhone!)}`),
    enabled: !!histPhone,
  });
  const h = hist.isError ? undefined : hist.data;

  const m = useMutation({
    mutationFn: (b: LoadCreate) => apiPost<Load>("/loads", b),
    onSuccess: (l) => {
      setCreated(l);
      setName("");
      setPhone("");
      setKg("");
      setBags("");
      setVariety("");
      setNotes("");
      setInitStatus("pending");
      setPicked(null);
      toast.success(`${t("created")} — ${l.code}`, { description: smsNote });
      qc.invalidateQueries({ queryKey: ["sms"] });
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["loads"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const kgVal = parseFloat(kg.replace(",", "."));
  const bagsVal = bags.trim() ? parseInt(bags, 10) : null;
  const bagsOk = bagsVal === null || (Number.isInteger(bagsVal) && bagsVal >= 0 && /^\d+$/.test(bags.trim()));
  const kgBad = kg.trim() !== "" && !(kgVal > 0);
  const valid = name.trim() && phone.trim().length >= 4 && kgVal > 0 && bagsOk;

  return (
    <div className={stacked ? "grid gap-6" : "grid gap-6 xl:grid-cols-[1fr_1fr]"}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) m.mutate({ client_name: name, phone, olive_kg: kgVal, bags: bagsVal, variety: variety || null, notes: notes.trim() || null, initial_status: initStatus });
        }}
        className="space-y-5 rounded-2xl border border-lime-200 bg-[#F2F8EE] p-6 shadow-sm"
        data-testid="intake-form"
      >
        <div className="flex items-center gap-3 text-[#1E3A14]">
          <div className="grid size-10 place-items-center rounded-xl bg-lime-600 text-white"><Sprout className="size-5" /></div>
          <h2 className="font-heading text-xl font-bold">{t("register_arrival")}</h2>
        </div>
        <div className="space-y-2">
          <Label>{t("client")}</Label>
          <div className="flex gap-2">
            <Select
              value={picked && clientList.some((c) => c.phone === picked) ? picked : null}
              onValueChange={(v) => { const c = clientList.find((x) => x.phone === (v as string)); if (c) pick(c); }}
            >
              <SelectTrigger className="h-11 flex-1 rounded-xl bg-white" data-testid="intake-client-select">
                <SelectValue>{(v) => (v ? (clientList.find((c) => c.phone === v)?.client_name ?? String(v)) : <span className="text-stone-400">{t("choose_client")}</span>)}</SelectValue>
              </SelectTrigger>
              <SelectContent className="max-h-80">
                {clientList.map((c) => (
                  <SelectItem key={c.phone} value={c.phone} data-testid={`intake-client-option-${c.phone}`}>
                    {c.client_name} <span className="text-stone-400" dir="ltr">· {c.phone}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" onClick={() => setNewOpen(true)} data-testid="intake-new-client-button" className="h-11 rounded-xl bg-teal-600 hover:bg-teal-700">
              <UserPlus className="size-4" /> {t("new_client")}
            </Button>
          </div>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
        <div className="relative space-y-2">
          <Label htmlFor="n">{t("full_name")}</Label>
          <Input
            id="n"
            autoComplete="off"
            data-testid="intake-client-name-input"
            value={name}
            onChange={(e) => { setName(e.target.value); setShowSug(true); }}
            onFocus={() => setShowSug(true)}
            onBlur={() => setTimeout(() => setShowSug(false), 150)}
            className="h-11 rounded-xl bg-white"
          />
          {showSug && suggestions.length > 0 && (
            <ul
              data-testid="intake-client-suggestions"
              className="absolute inset-x-0 top-full z-40 mt-1 max-h-72 overflow-auto rounded-xl border border-lime-200 bg-white p-1 shadow-xl shadow-lime-900/10"
            >
              {suggestions.map((c) => (
                <li key={c.phone}>
                  <button
                    type="button"
                    data-testid={`intake-client-suggestion-${c.phone}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(c)}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-start transition-colors duration-150 hover:bg-lime-50"
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-teal-100 text-teal-700"><UserRound className="size-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-stone-900">{c.client_name}</span>
                      <span className="block text-xs text-stone-500" dir="ltr">{c.phone}</span>
                    </span>
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">{c.loads_count}×</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="ph">{t("phone")}</Label>
          <Input id="ph" dir="ltr" inputMode="tel" data-testid="intake-client-phone-input" value={phone} onChange={(e) => setPhone(e.target.value)} className="h-11 rounded-xl bg-white text-start" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="kg">{t("olive_kg")} *</Label>
          <Input id="kg" inputMode="decimal" data-testid="intake-olive-kg-input" value={kg} onChange={(e) => setKg(e.target.value)} aria-invalid={kgBad} className="h-11 rounded-xl bg-white text-lg font-semibold" />
          {kgBad && <p className="text-xs text-red-600" data-testid="intake-kg-error">{t("weight_required")}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="bags">{t("bags")}</Label>
          <Input id="bags" inputMode="numeric" data-testid="intake-bags-input" value={bags} onChange={(e) => setBags(e.target.value)} aria-invalid={!bagsOk} className="h-11 rounded-xl bg-white" />
        </div>
        <div className="space-y-2">
          <Label>{t("variety")}</Label>
          <Select value={variety || null} onValueChange={(v) => setVariety((v as string) ?? "")}>
            <SelectTrigger className="h-11 w-full rounded-xl bg-white" data-testid="intake-variety-select"><SelectValue>{(v) => (v ? String(v) : <span className="text-stone-400">{t("choose_variety")}</span>)}</SelectValue></SelectTrigger>
            <SelectContent>
              {varietyList.map((v) => <SelectItem key={v} value={v} data-testid={`intake-variety-option-${v}`}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>{t("status")}</Label>
          <Select value={initStatus} onValueChange={(v) => setInitStatus(v as "pending" | "pressing")}>
            <SelectTrigger className="h-11 w-full rounded-xl bg-white" data-testid="intake-status-select"><SelectValue>{(v) => t(v as "pending" | "pressing")}</SelectValue></SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">{t("pending")}</SelectItem>
              <SelectItem value="pressing">{t("pressing")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="obs">{t("observations")}</Label>
          <Textarea id="obs" data-testid="intake-notes-input" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} className="min-h-20 rounded-xl bg-white" />
        </div>
        <Button type="submit" disabled={!valid || m.isPending} data-testid="intake-submit-button" className="h-12 w-full rounded-xl bg-lime-700 text-base hover:bg-lime-800 active:scale-[0.98] transition-transform">
          <Plus className="size-5" />
          {t("register_arrival")}
        </Button>

        {histPhone && h && (
          <div data-testid="intake-client-history" className="rounded-xl border border-teal-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-semibold text-teal-900"><History className="size-4 text-teal-600" /> {t("client_quick_history")}</div>
              <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-semibold text-sky-800" data-testid="intake-history-avg-yield">
                {t("yield")}: <span dir="ltr">{h.avg_yield != null ? `${fmtNum(h.avg_yield, 2)} %` : "—"}</span>
              </span>
            </div>
            <div className="mb-3 grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-lg bg-amber-50 p-2"><div className="text-stone-500">{t("loads")}</div><div className="text-base font-bold text-amber-800" data-testid="intake-history-count">{h.loads_count}</div></div>
              <div className="rounded-lg bg-lime-50 p-2"><div className="text-stone-500">{t("olives")}</div><div className="text-base font-bold text-lime-800">{fmtNum(h.olive_kg)}</div></div>
              <div className="rounded-lg bg-yellow-50 p-2"><div className="text-stone-500">{t("oil")}</div><div className="text-base font-bold text-yellow-800">{fmtNum(h.oil_kg)}</div></div>
            </div>
            <div className="mb-1 text-xs font-semibold text-stone-500">{t("previous_loads")}</div>
            {h.loads.length === 0 ? (
              <p className="text-sm text-stone-500">{t("no_previous_loads")}</p>
            ) : (
              <ul className="max-h-48 divide-y divide-stone-100 overflow-auto text-sm">
                {h.loads.slice(0, 6).map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-2 py-1.5" data-testid={`intake-history-load-${l.code}`}>
                    <span className="font-mono text-xs text-stone-600" dir="ltr">{l.code}</span>
                    <span className="text-lime-800">{fmtNum(l.olive_kg)} kg</span>
                    <span className="text-amber-700">{l.oil_kg != null ? `${fmtNum(l.oil_kg)} kg` : "—"}</span>
                    <span className="text-sky-700" dir="ltr">{l.yield_pct != null ? `${fmtNum(l.yield_pct, 2)}%` : "—"}</span>
                    <StatusPill status={l.status} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </form>
      <NewClientDialog open={newOpen} onClose={() => setNewOpen(false)} onCreated={(c) => pick(c)} />

      <div>
        {created ? (
          <ReceptionTicket load={created}>
            <div className="no-print mt-8 flex gap-3">
              <Button onClick={() => window.print()} variant="outline" className="rounded-xl" data-testid="intake-print-button">
                <Printer className="size-4" /> {t("print")}
              </Button>
              <Button onClick={() => setCreated(null)} variant="ghost" className="rounded-xl" data-testid="intake-new-button">
                {t("new_arrival")}
              </Button>
            </div>
          </ReceptionTicket>
        ) : (
          <div className="grid h-full min-h-72 place-items-center rounded-2xl border-2 border-dashed border-stone-200 bg-white/60 p-8 text-center">
            <div>
              <div className="font-mono text-4xl font-bold tracking-wider text-stone-300" dir="ltr">YYMMDDHHMM</div>
              <p className="mt-3 text-sm text-stone-500">{t("arrival_sub")}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
