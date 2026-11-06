import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { History, Printer, Plus, Sprout, UserPlus, Truck, UserRound } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiGet, apiPost } from "@/lib/api";
import type { ClientCreate, ClientHistory, ClientSummary, Load, LoadCreate, MillInfo, SmsStatus, Varieties } from "@/lib/types";
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
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState("");
  const allClients = useQuery({ queryKey: ["clients", "__all"], queryFn: () => apiGet<ClientSummary[]>("/clients") });
  const clientList = allClients.isError ? [] : [...(allClients.data ?? [])].sort((a, b) => a.client_name.localeCompare(b.client_name));
  const normalizeClientSearch = (value: string) => value.trim().toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const searchTerm = normalizeClientSearch(clientSearch);
  const filteredClients = clientList.filter((c) =>
    normalizeClientSearch(c.client_name).includes(searchTerm) ||
    normalizeClientSearch(c.phone).includes(searchTerm)
  );
  const vq = useQuery({ queryKey: ["varieties"], queryFn: () => apiGet<Varieties>("/varieties") });
  const varietyList = vq.isError ? [] : (vq.data?.varieties ?? []);
  const sms = useQuery({ queryKey: ["sms-status"], queryFn: () => apiGet<SmsStatus>("/sms/status") });
  const millQuery = useQuery({ queryKey: ["mill"], queryFn: () => apiGet<MillInfo>("/mill") });
  const millInfo = millQuery.isError ? undefined : millQuery.data;
  const smsNote = sms.data && !sms.isError && sms.data.enabled ? (sms.data.mode === "live" ? t("sms_sent_live_toast") : t("sms_sent_toast")) : undefined;
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [kg, setKg] = useState("");
  const [created, setCreated] = useState<Load | null>(null);
  const [receptionType, setReceptionType] = useState<"client" | "supplier">("client");
  const [supplierId, setSupplierId] = useState("");
  const [supplierDropdownOpen, setSupplierDropdownOpen] = useState(false);
  const [supplierSearch, setSupplierSearch] = useState("");
  const [newSupplier, setNewSupplier] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState("");
  const [newSupplierPhone, setNewSupplierPhone] = useState("");
  const [newSupplierTaxId, setNewSupplierTaxId] = useState("");
  const [supplierDate, setSupplierDate] = useState(new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10));
  const [supplierVariety, setSupplierVariety] = useState("");
  const [supplierKg, setSupplierKg] = useState("");
  const [supplierPrice, setSupplierPrice] = useState("");
  const [supplierLocationId, setSupplierLocationId] = useState("");
  const [supplierNotes, setSupplierNotes] = useState("");
  const [supplierReceipt, setSupplierReceipt] = useState<any | null>(null);
  const [supplierRequestKey, setSupplierRequestKey] = useState("");
  const suppliersQuery = useQuery({ queryKey: ["commercial", "suppliers"], queryFn: () => apiGet<any[]>("/commercial/v1/suppliers"), enabled: receptionType === "supplier" });
  const locationsQuery = useQuery({ queryKey: ["commercial", "locations"], queryFn: () => apiGet<any[]>("/commercial/v1/locations"), enabled: receptionType === "supplier" });
  const commercialSuppliers = suppliersQuery.data ?? [];
  const normalizeSupplierSearch = (value: string) => value.trim().toLocaleLowerCase().normalize("NFD").replace(/[\\u0300-\\u036f]/g, "");
  const supplierSearchTerm = normalizeSupplierSearch(supplierSearch);
  const filteredSuppliers = commercialSuppliers.filter((supplier) =>
    normalizeSupplierSearch(supplier.name ?? "").includes(supplierSearchTerm) ||
    normalizeSupplierSearch(supplier.phone ?? "").includes(supplierSearchTerm) ||
    normalizeSupplierSearch(supplier.tax_id ?? "").includes(supplierSearchTerm)
  );
  const supplierPurchasesQuery = useQuery({ queryKey: ["commercial", "supplier-history", supplierId], queryFn: () => apiGet<any[]>("/commercial/v1/olive-purchases"), enabled: receptionType === "supplier" && !!supplierId });
  const supplierPurchases = (supplierPurchasesQuery.data ?? []).filter((purchase) => purchase.supplier_id === supplierId);
  const oliveLocations = locationsQuery.data ?? [];
  const chosenLocationId = supplierLocationId || oliveLocations.find((location) => /réception|reception|receiving/i.test((location.name || "") + " " + (location.code || "")))?.id || "";
  const supplierKgValue = Number(supplierKg.replace(",", "."));
  const supplierPriceValue = Number(supplierPrice.replace(",", "."));
  const supplierTotal = supplierKgValue * supplierPriceValue;
  const supplierMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPost<any>("/commercial/v1/olive-receptions", body),
    onSuccess: (result) => {
      setSupplierReceipt(result);
      setSupplierKg(""); setSupplierPrice(""); setSupplierNotes("");
      setNewSupplier(false); setNewSupplierName(""); setNewSupplierPhone(""); setNewSupplierTaxId("");
      setSupplierId(result.supplier?.id ?? "");
      setSupplierRequestKey("");
      toast.success("Réception fournisseur enregistrée et achat créé dans GS");
      qc.invalidateQueries({ queryKey: ["commercial"] });
      qc.invalidateQueries({ queryKey: ["commercial", "supplier-history", result.supplier?.id ?? supplierId] });
    },
    onError: (error) => toast.error(errMsg(error)),
  });


  const pick = (c: ClientSummary) => {
    setName(c.client_name);
    setPhone(c.phone);
    setPicked(c.phone);
    setClientDropdownOpen(false);
    setClientSearch("");
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
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 rounded-2xl border border-stone-200 bg-white p-2">
          <button type="button" onClick={() => setReceptionType("client")} className={receptionType === "client" ? "flex items-center justify-center gap-2 rounded-xl bg-lime-700 px-3 py-3 text-sm font-semibold text-white" : "flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-semibold text-stone-600 hover:bg-stone-50"}><UserRound className="size-4" /> Client · Oro Verde</button>
          <button type="button" onClick={() => setReceptionType("supplier")} className={receptionType === "supplier" ? "flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-3 py-3 text-sm font-semibold text-white" : "flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-semibold text-stone-600 hover:bg-stone-50"}><Truck className="size-4" /> Fournisseur · GS</button>
        </div>
      {receptionType === "client" ? <form
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
            <div className="relative min-w-0 flex-1" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setClientDropdownOpen(false); }}>
              <button
                type="button"
                aria-haspopup="listbox"
                aria-expanded={clientDropdownOpen}
                onClick={() => { setClientDropdownOpen((open) => !open); setClientSearch(""); }}
                className="flex h-11 w-full items-center justify-between gap-2 rounded-xl border border-input bg-white px-3 text-sm text-left shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                data-testid="intake-client-select"
              >
                <span className={picked && clientList.some((c) => c.phone === picked) ? "truncate text-stone-900" : "truncate text-stone-400"}>
                  {picked ? (clientList.find((c) => c.phone === picked)?.client_name ?? t("choose_client")) : t("choose_client")}
                </span>
                <span className="text-stone-400" aria-hidden="true">▾</span>
              </button>
              {clientDropdownOpen && (
                <div className="absolute inset-x-0 top-full z-50 mt-1 flex flex-col gap-1">
                  <div role="listbox" aria-label={t("client")} className="max-h-72 overflow-y-auto rounded-xl border border-lime-200 bg-white p-1 shadow-xl shadow-lime-900/10">
                    <div className="sticky top-0 z-10 border-b border-lime-100 bg-white p-2">
                      <Input autoFocus value={clientSearch} onChange={(e) => setClientSearch(e.target.value)} onKeyDown={(e) => e.stopPropagation()} placeholder="Rechercher par nom ou téléphone..." aria-label="Rechercher un client par nom ou téléphone" data-testid="intake-client-search-input" className="h-10 rounded-lg" />
                    </div>
                    {filteredClients.length > 0 ? filteredClients.map((c) => (
                      <button
                        type="button"
                        role="option"
                        aria-selected={picked === c.phone}
                        key={c.phone}
                        onPointerDown={(e) => {
                          // Commit the selection before mobile blur closes the dropdown.
                          e.preventDefault();
                          pick(c);
                        }}
                        onClick={() => pick(c)}
                        data-testid={`intake-client-option-${c.phone}`}
                        className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-lime-50 focus:bg-lime-50 focus:outline-none"
                      >
                        <span className="min-w-0 truncate font-medium text-stone-900">{c.client_name}</span>
                        <span className="shrink-0 text-xs text-stone-400" dir="ltr">{c.phone}</span>
                      </button>
                    )) : (
                      <p className="px-3 py-4 text-center text-sm text-stone-500">Aucun client trouvé</p>
                    )}
                  </div>
                </div>
              )}
            </div>
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
            onChange={(e) => setName(e.target.value)}
            className="h-11 rounded-xl bg-white"
          />

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

      </form> : <form onSubmit={(e) => {
        e.preventDefault();
        if (!chosenLocationId || !(supplierKgValue > 0) || supplierPrice.trim() === "" || !(supplierPriceValue >= 0) || (!newSupplier && !supplierId) || (newSupplier && newSupplierName.trim().length < 2)) return;
        const requestKey = supplierRequestKey || crypto.randomUUID();
        setSupplierRequestKey(requestKey);
        supplierMutation.mutate({
          supplier_id: newSupplier ? null : supplierId,
          new_supplier_name: newSupplier ? newSupplierName.trim() : null,
          new_supplier_phone: newSupplier ? (newSupplierPhone.trim() || null) : null,
          new_supplier_tax_identifier: newSupplier ? (newSupplierTaxId.trim() || null) : null,
          purchase_date: supplierDate,
          lines: [{ variety_id: supplierVariety || varietyList[0] || "Olives", quantity_kg: supplierKgValue, unit_price_dt: supplierPriceValue }],
          receiving_location_id: chosenLocationId,
          notes: supplierNotes.trim() || null,
          idempotency_key: requestKey,
        });
      }} className="space-y-5 rounded-2xl border border-blue-200 bg-[#F0F6FC] p-6 shadow-sm" data-testid="supplier-intake-form">
        <div className="flex items-center gap-3 text-blue-950"><div className="grid size-10 place-items-center rounded-xl bg-blue-700 text-white"><Truck className="size-5" /></div><div><h2 className="font-heading text-xl font-bold">Réception fournisseur</h2><p className="text-xs text-blue-800">Création automatique de l’achat et entrée en stock GS</p></div></div>
        <div className="space-y-2">
          <Label>Fournisseur</Label>
          <div className="flex gap-2">
            {!newSupplier ? <div className="relative min-w-0 flex-1" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setSupplierDropdownOpen(false); }}>
              <button type="button" aria-haspopup="listbox" aria-expanded={supplierDropdownOpen}
                onClick={() => { setSupplierDropdownOpen((open) => !open); setSupplierSearch(""); }}
                className="flex h-11 w-full items-center justify-between gap-2 rounded-xl border border-input bg-white px-3 text-left text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                data-testid="intake-supplier-select">
                <span className={supplierId && commercialSuppliers.some((x) => x.id === supplierId) ? "truncate text-stone-900" : "truncate text-stone-400"}>
                  {supplierId ? (commercialSuppliers.find((x) => x.id === supplierId)?.name ?? "Choisir un fournisseur") : "Choisir un fournisseur"}
                </span><span className="text-stone-400" aria-hidden="true">▾</span>
              </button>
              {supplierDropdownOpen && <div className="absolute inset-x-0 top-full z-50 mt-1">
                <div role="listbox" aria-label="Fournisseurs" className="max-h-72 overflow-y-auto rounded-xl border border-blue-200 bg-white p-1 shadow-xl shadow-blue-900/10">
                  <div className="sticky top-0 z-10 border-b border-blue-100 bg-white p-2">
                    <Input autoFocus value={supplierSearch} onChange={(e) => setSupplierSearch(e.target.value)} onKeyDown={(e) => e.stopPropagation()} placeholder="Rechercher par nom, téléphone ou identifiant..." aria-label="Rechercher un fournisseur" data-testid="intake-supplier-search-input" className="h-10 rounded-lg" />
                  </div>
                  {filteredSuppliers.length ? filteredSuppliers.map((supplier) => <button type="button" role="option" aria-selected={supplierId === supplier.id} key={supplier.id}
                    onPointerDown={(e) => { e.preventDefault(); setSupplierId(supplier.id); setSupplierDropdownOpen(false); setSupplierSearch(""); }}
                    onClick={() => { setSupplierId(supplier.id); setSupplierDropdownOpen(false); setSupplierSearch(""); }}
                    data-testid={`intake-supplier-option-${supplier.id}`}
                    className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-blue-50 focus:bg-blue-50 focus:outline-none">
                    <span className="min-w-0 truncate font-medium text-stone-900">{supplier.name}</span><span className="shrink-0 text-xs text-stone-400" dir="ltr">{supplier.phone || supplier.tax_id || ""}</span>
                  </button>) : <p className="px-3 py-4 text-center text-sm text-stone-500">Aucun fournisseur trouvé</p>}
                </div>
              </div>}
            </div> : <div className="flex h-11 min-w-0 flex-1 items-center rounded-xl border border-blue-200 bg-blue-50 px-3 text-sm font-medium text-blue-900">Nouveau fournisseur</div>}
            <Button type="button" onClick={() => { setNewSupplier((value) => !value); setSupplierDropdownOpen(false); if (newSupplier) { setNewSupplierName(""); setNewSupplierPhone(""); setNewSupplierTaxId(""); } else setSupplierId(""); }}
              data-testid="intake-new-supplier-button" className="h-11 shrink-0 rounded-xl bg-teal-600 hover:bg-teal-700">
              <UserPlus className="size-4"/> {newSupplier ? "Choisir un fournisseur" : "Nouveau fournisseur"}
            </Button>
          </div>
          {newSupplier && <div className="grid gap-3 rounded-xl border border-blue-200 bg-white p-3 md:grid-cols-2">
            <div className="space-y-1"><Label>Nom du fournisseur *</Label><Input value={newSupplierName} onChange={(e) => setNewSupplierName(e.target.value)} className="h-11 rounded-xl bg-white" /></div>
            <div className="space-y-1"><Label>Téléphone</Label><Input dir="ltr" value={newSupplierPhone} onChange={(e) => setNewSupplierPhone(e.target.value)} className="h-11 rounded-xl bg-white" /></div>
            <div className="space-y-1 md:col-span-2"><Label>Identifiant fiscal</Label><Input value={newSupplierTaxId} onChange={(e) => setNewSupplierTaxId(e.target.value)} className="h-11 rounded-xl bg-white" /></div>
          </div>}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1"><Label>Date d’achat / réception *</Label><Input type="date" value={supplierDate} onChange={(e) => setSupplierDate(e.target.value)} className="h-11 rounded-xl bg-white" /></div>
          <div className="space-y-1"><Label>Emplacement de réception *</Label><Select value={chosenLocationId || null} onValueChange={(v) => setSupplierLocationId(String(v ?? ""))}><SelectTrigger className="h-11 rounded-xl bg-white"><SelectValue>{(v) => v ? (oliveLocations.find((x) => x.id === v)?.name ?? "Emplacement sélectionné") : <span className="text-stone-400">Choisir l’emplacement</span>}</SelectValue></SelectTrigger><SelectContent>{oliveLocations.map((location) => <SelectItem key={location.id} value={location.id}>{location.name} · {location.code}</SelectItem>)}</SelectContent></Select>{oliveLocations.length === 0 && <p className="text-xs text-red-700">Aucun emplacement actif. Configurez un emplacement de réception dans GS &gt; Paramètres &gt; Cuves.</p>}</div>
          <div className="space-y-1"><Label>Variété *</Label><Select value={supplierVariety || varietyList[0] || null} onValueChange={(v) => setSupplierVariety(String(v ?? ""))}><SelectTrigger className="h-11 rounded-xl bg-white"><SelectValue>{(v) => v ? String(v) : <span className="text-stone-400">Choisir la variété</span>}</SelectValue></SelectTrigger><SelectContent>{varietyList.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1"><Label>Quantité d’olives (kg) *</Label><Input inputMode="decimal" value={supplierKg} onChange={(e) => setSupplierKg(e.target.value)} className="h-11 rounded-xl bg-white" /></div>
          <div className="space-y-1"><Label>Prix d’achat / kg (TND) *</Label><Input inputMode="decimal" value={supplierPrice} onChange={(e) => setSupplierPrice(e.target.value)} className="h-11 rounded-xl bg-white" /></div>
          <div className="rounded-xl border border-blue-200 bg-white p-3"><div className="text-xs text-stone-500">Montant total calculé</div><div className="text-xl font-bold text-blue-900">{Number.isFinite(supplierTotal) ? supplierTotal.toLocaleString("fr-FR", { minimumFractionDigits: 3, maximumFractionDigits: 3 }) : "—"} TND</div></div>
        </div>
        <div className="space-y-1"><Label>Observations</Label><Textarea value={supplierNotes} onChange={(e) => setSupplierNotes(e.target.value)} maxLength={1000} className="min-h-20 rounded-xl bg-white" /></div>
        <div className="rounded-xl border border-blue-200 bg-white p-3 text-sm text-blue-950">La validation crée dans une seule transaction : le fournisseur (si nouveau), l’achat, le code de traçabilité unique, le lot et le mouvement d’entrée en stock. Le paiement pourra être enregistré séparément.</div>
        <Button type="submit" disabled={supplierMutation.isPending || !chosenLocationId || !(supplierKgValue > 0) || supplierPrice.trim() === "" || !(supplierPriceValue >= 0) || (!newSupplier && !supplierId) || (newSupplier && newSupplierName.trim().length < 2)} className="h-12 w-full rounded-xl bg-blue-700 text-base hover:bg-blue-800"><Plus className="size-5"/> Valider la réception et créer l’achat</Button>
      </form>}
      </div>
      <NewClientDialog open={newOpen} onClose={() => setNewOpen(false)} onCreated={(c) => pick(c)} />

      <div className="space-y-6">
        {receptionType === "client" && histPhone && h && (
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
                    <span className="text-amber-700">{l.oil_kg != null ? `${fmtNum(l.oil_kg)} Li` : "—"}</span>
                    <span className="text-sky-700" dir="ltr">{l.yield_pct != null ? `${fmtNum(l.yield_pct, 2)}%` : "—"}</span>
                    <StatusPill status={l.status} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {receptionType === "supplier" && supplierId && !newSupplier && (
          <div className="rounded-xl border border-blue-200 bg-white p-4" data-testid="intake-supplier-history">
            <div className="mb-3 flex items-center gap-2 font-semibold text-blue-950"><History className="size-4 text-blue-700" /> Historique du fournisseur</div>
            <div className="mb-3 grid grid-cols-2 gap-2 text-center text-xs">
              <div className="rounded-lg bg-blue-50 p-2"><div className="text-stone-500">Achats enregistrés</div><div className="text-base font-bold text-blue-900">{supplierPurchases.length}</div></div>
              <div className="rounded-lg bg-sky-50 p-2"><div className="text-stone-500">Quantité totale</div><div className="text-base font-bold text-sky-900">{fmtNum(supplierPurchases.reduce((sum, purchase) => sum + Number(purchase.total_quantity_kg ?? 0), 0))} kg</div></div>
            </div>
            <div className="mb-1 text-xs font-semibold text-stone-500">Achats précédents</div>
            {supplierPurchasesQuery.isLoading ? <p className="text-sm text-stone-500">Chargement de l’historique…</p> :
              supplierPurchases.length === 0 ? <p className="text-sm text-stone-500">Aucun achat précédent pour ce fournisseur.</p> :
              <ul className="max-h-56 divide-y divide-stone-100 overflow-auto text-sm">
                {supplierPurchases.slice(0, 10).map((purchase) => <li key={purchase.id} className="flex flex-wrap items-center justify-between gap-2 py-2" data-testid={`intake-supplier-history-${purchase.id}`}>
                  <span className="min-w-0"><span className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-stone-400">Code d’achat</span><span className="font-mono text-xs font-semibold text-blue-900" dir="ltr">{purchase.batch_code ?? purchase.batch_codes?.[0] ?? "—"}</span></span>
                  <span className="text-stone-600">{purchase.purchase_date ?? "—"}</span>
                  <span className="font-medium text-blue-800">{fmtNum(Number(purchase.total_quantity_kg ?? 0))} kg</span>
                  <span className="text-teal-800">{fmtNum(Number(purchase.total_amount_dt ?? 0), 3)} TND</span>
                  <span className="text-xs text-stone-500">{purchase.status ?? "—"}</span>
                </li>)}
              </ul>}
          </div>
        )}
        {supplierReceipt && receptionType === "supplier" && (
          <div className="print-area code-reveal rounded-2xl border-2 border-dashed border-amber-300 bg-white p-8 shadow-sm" data-testid="supplier-reception-ticket">
            <div className="flex items-start justify-between gap-4 border-b border-stone-200 pb-4">
              <div>
                <div className="font-heading text-lg font-bold text-stone-900">{millInfo?.mill_name || "Oro Verde"}</div>
                {millInfo?.mill_address && <div className="text-xs text-stone-500">{millInfo.mill_address}</div>}
                {millInfo?.mill_phone && <div className="text-xs text-stone-500" dir="ltr">{millInfo.mill_phone}</div>}
              </div>
              <div className="text-end">
                <div className="text-xs font-semibold uppercase tracking-wider text-amber-700">Bon de réception fournisseur</div>
                <div className="mt-1 text-xs text-stone-500" dir="ltr">{supplierReceipt.purchase?.purchase_date || supplierDate}</div>
              </div>
            </div>
            <div className="my-6 flex flex-wrap items-center justify-center gap-8 text-center">
              <div>
                <div className="mb-2 text-xs text-stone-500">Code unique de traçabilité</div>
                <div className="inline-flex rounded-lg bg-amber-50 px-4 py-2 font-mono text-2xl font-bold text-amber-900" dir="ltr">{supplierReceipt.batch_code}</div>
                <div className="mt-3 text-sm text-stone-500">Code GS à conserver pour le suivi du lot</div>
              </div>
              <div data-testid="supplier-ticket-qr" className="flex flex-col items-center gap-1">
                <QRCodeSVG value={window.location.origin + "/commercial?purchase=" + encodeURIComponent(supplierReceipt.purchase?.id ?? "") + "&batch=" + encodeURIComponent(supplierReceipt.batch_code ?? "")} size={112} level="M" marginSize={1} />
                <span className="text-[10px] text-stone-500">Scanner pour ouvrir le lot dans GS</span>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-4 border-t border-stone-200 pt-6 text-sm">
              <div><dt className="text-stone-500">Fournisseur</dt><dd className="font-semibold text-stone-900">{supplierReceipt.supplier?.name || "—"}</dd></div>
              <div><dt className="text-stone-500">Téléphone</dt><dd className="font-semibold text-stone-900" dir="ltr">{supplierReceipt.supplier?.phone || "—"}</dd></div>
              <div><dt className="text-stone-500">Code d’achat</dt><dd className="font-mono font-semibold text-stone-900" dir="ltr">{supplierReceipt.purchase?.batch_code || supplierReceipt.batch_code || "—"}</dd></div>
              <div><dt className="text-stone-500">Date d’achat</dt><dd className="font-semibold text-stone-900">{supplierReceipt.purchase?.purchase_date || supplierDate}</dd></div>
              <div><dt className="text-stone-500">Quantité d’olives</dt><dd className="font-heading text-2xl font-bold text-lime-800">{fmtNum(Number(supplierReceipt.purchase?.total_quantity_kg))} kg</dd></div>
              <div><dt className="text-stone-500">Montant total</dt><dd className="font-heading text-xl font-bold text-stone-900">{fmtNum(Number(supplierReceipt.purchase?.total_amount_dt), 3)} TND</dd></div>
              <div><dt className="text-stone-500">Statut</dt><dd className="font-semibold text-stone-900">Réception enregistrée</dd></div>
            </dl>
            <div className="no-print mt-8 flex flex-wrap gap-3 border-t border-stone-200 pt-4">
              <Button onClick={() => window.print()} variant="outline" className="rounded-xl"><Printer className="size-4"/> Imprimer le reçu</Button>
              <Button onClick={() => setSupplierReceipt(null)} variant="ghost" className="rounded-xl">Nouvelle réception</Button>
            </div>
          </div>
        )}
        {created && receptionType === "client" && (
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
        )}
      </div>
    </div>
  );
}
