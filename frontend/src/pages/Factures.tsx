import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileText, Printer, Search, Pencil, Plus, Trash2, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import { useI18n, fmtMoney, fmtNum, fmtDate } from "@/lib/i18n";
import { useMe } from "@/lib/useMe";
import { PageHeader } from "@/components/shared";
import ClientAccounts from "@/components/ClientAccounts";

function formatTariffPrice(value: string | number): string {
  const normalized = String(value).trim().replace(/[\s\u00A0\u202F]/g, "").replace(",", ".");
  if (!normalized) return "";
  const number = Number(normalized);
  return Number.isFinite(number) ? new Intl.NumberFormat("fr-TN", { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(number) : String(value);
}
function parseTariffPrice(value: string): number {
  const normalized = value.trim().replace(/[\s\u00A0\u202F]/g, "").replace(",", ".");
  return normalized === "" ? Number.NaN : Number(normalized);
}

type Invoice = {
  id: string; number: string; load_id: string; load_code: string; client_name: string; phone: string; variety?: string | null;
  olive_kg: number; oil_kg: number; price_per_kg: number; total: number; paid_amount: number; balance: number;
  day: string; created_at: string; mill_name: string; mill_address: string; mill_phone: string;
  mill_logo: string; history?: Array<{at: string; by: string; action: string; before?: unknown; after?: unknown}>; payments?: Array<{at: string; by: string; amount: number}>;
};
type EligibleLoad = {id: string; code: string; client_name: string; phone: string; olive_kg: number; oil_kg: number; day: string};

const frSmall = ["zéro","un","deux","trois","quatre","cinq","six","sept","huit","neuf","dix","onze","douze","treize","quatorze","quinze","seize"];
function frWordsUnder100(n: number): string {
  if (n <= 16) return frSmall[n];
  if (n < 20) return "dix-" + frSmall[n - 10];
  if (n < 70) {
    const tens = ["","","vingt","trente","quarante","cinquante","soixante"][Math.floor(n / 10)];
    const unit = n % 10;
    return tens + (unit === 0 ? "" : unit === 1 ? " et un" : "-" + frSmall[unit]);
  }
  if (n < 80) return "soixante-" + frWordsUnder100(n - 60);
  return "quatre-vingt" + (n === 80 ? "s" : "-" + frWordsUnder100(n - 80));
}
function frWords(n: number): string {
  if (n < 100) return frWordsUnder100(n);
  if (n < 1000) {
    const h = Math.floor(n / 100), r = n % 100;
    return (h === 1 ? "cent" : frSmall[h] + " cent" + (r === 0 ? "s" : "")) + (r ? " " + frWords(r) : "");
  }
  if (n < 1_000_000) {
    const k = Math.floor(n / 1000), r = n % 1000;
    return (k === 1 ? "mille" : frWords(k) + " mille") + (r ? " " + frWords(r) : "");
  }
  const m = Math.floor(n / 1_000_000), r = n % 1_000_000;
  return frWords(m) + " million" + (m > 1 ? "s" : "") + (r ? " " + frWords(r) : "");
}
const arSmall = ["صفر","واحد","اثنان","ثلاثة","أربعة","خمسة","ستة","سبعة","ثمانية","تسعة","عشرة","أحد عشر","اثنا عشر","ثلاثة عشر","أربعة عشر","خمسة عشر","ستة عشر","سبعة عشر","ثمانية عشر","تسعة عشر"];
function arWords(n: number): string {
  if (n < 20) return arSmall[n];
  if (n < 100) {
    const tens = ["","","عشرون","ثلاثون","أربعون","خمسون","ستون","سبعون","ثمانون","تسعون"][Math.floor(n / 10)];
    return n % 10 ? arSmall[n % 10] + " و" + tens : tens;
  }
  if (n < 1000) {
    const hundreds = ["","مائة","مائتان","ثلاثمائة","أربعمائة","خمسمائة","ستمائة","سبعمائة","ثمانمائة","تسعمائة"];
    return hundreds[Math.floor(n / 100)] + (n % 100 ? " و" + arWords(n % 100) : "");
  }
  if (n < 1_000_000) {
    const k = Math.floor(n / 1000), r = n % 1000;
    const part = k === 1 ? "ألف" : k === 2 ? "ألفان" : arWords(k) + " آلاف";
    return part + (r ? " و" + arWords(r) : "");
  }
  const m = Math.floor(n / 1_000_000), r = n % 1_000_000;
  const part = m === 1 ? "مليون" : m === 2 ? "مليونان" : arWords(m) + " ملايين";
  return part + (r ? " و" + arWords(r) : "");
}
function amountInWords(amount: number, lang: "fr" | "ar"): string {
  const totalMillimes = Math.max(0, Math.round((Number(amount) || 0) * 1000));
  const dinars = Math.floor(totalMillimes / 1000), millimes = totalMillimes % 1000;
  if (lang === "ar") {
    const main = dinars === 0 ? "صفر دينار" : arWords(dinars) + (dinars === 1 ? " دينار" : dinars === 2 ? " ديناران" : " دينارًا");
    return main + (millimes ? " و" + arWords(millimes) + " مليم" : "");
  }
  const main = frWords(dinars) + (dinars > 1 ? " dinars" : " dinar");
  return main + (millimes ? " et " + frWords(millimes) + " millime" + (millimes > 1 ? "s" : "") : "");
}

export default function Factures() {
  const { errMsg, t, lang } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedInvoiceId = searchParams.get("invoice_id");
  const admin = useMe().data?.role === "admin";
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loadId, setLoadId] = useState("");
  const [paid, setPaid] = useState("0,000");
  const [editing, setEditing] = useState<Invoice | null>(null);
  const [editPrice, setEditPrice] = useState("");
  const [editPaid, setEditPaid] = useState("");
  const [selected, setSelected] = useState<Invoice | null>(null);
  const invoices = useQuery({queryKey:["invoices", q], queryFn:()=>apiGet<Invoice[]>(`/invoices?q=${encodeURIComponent(q)}`)});
  const eligible = useQuery({queryKey:["invoice-eligible-loads"], queryFn:()=>apiGet<EligibleLoad[]>("/invoices/eligible-loads"), enabled:admin});
  const rows = invoices.data ?? [];
  useEffect(() => {
    if (!requestedInvoiceId || !rows.length) return;
    const target = rows.find((invoice) => invoice.id === requestedInvoiceId);
    if (target && selected?.id !== target.id) setSelected(target);
  }, [requestedInvoiceId, rows, selected?.id]);
  const filteredRows = rows.filter(i => {
    const status = i.balance <= 0.005 ? "paid" : i.paid_amount > 0 ? "partial" : "pending";
    return statusFilter === "all" || status === statusFilter;
  });
  const loads = eligible.data ?? [];
  const create = useMutation({
    mutationFn:()=>apiPost<Invoice>("/invoices",{load_id:loadId,paid_amount:parseTariffPrice(paid)}),
    onSuccess:(invoice)=>{toast.success(t("invoice_created"));setLoadId("");setPaid("0,000");qc.invalidateQueries({queryKey:["invoices"]});qc.invalidateQueries({queryKey:["invoice-eligible-loads"]});setSelected(invoice);},
    onError:(e)=>toast.error(errMsg(e)),
  });
  const update = useMutation({
    mutationFn:()=>apiPatch<Invoice>(`/invoices/${editing!.id}`,{price_per_kg:parseTariffPrice(editPrice),payment_amount:parseTariffPrice(editPaid)}),
    onSuccess:(invoice)=>{toast.success(t("invoice_updated"));setEditing(null);qc.invalidateQueries({queryKey:["invoices"]});setSelected(invoice);},
    onError:(e)=>toast.error(errMsg(e)),
  });
  const remove = useMutation({
    mutationFn:(invoiceId:string)=>apiDelete<{ok:boolean}>(`/invoices/${invoiceId}`),
    onSuccess:(_,invoiceId)=>{toast.success(t("invoice_deleted"));qc.invalidateQueries({queryKey:["invoices"]});qc.invalidateQueries({queryKey:["invoice-eligible-loads"]});setSelected(current=>current?.id===invoiceId?null:current);},
    onError:(e)=>toast.error(errMsg(e)),
  });
  const validAmount = (value: string) => value.trim() !== "" && Number.isFinite(parseTariffPrice(value)) && parseTariffPrice(value) >= 0;
  const currentLoad = loads.find(l=>l.id===loadId);
  const money = (n:number)=>`${fmtMoney(n)} DT`;
  const print = (invoice:Invoice)=>{setSelected(invoice);window.setTimeout(()=>window.print(),100);};
  return <div>
    <div className="no-print"><PageHeader title={t("factures")} sub={t("invoice_sub")} accent="bg-emerald-600"/></div>
    {admin && <ClientAccounts />}
    <div className="no-print mb-5 flex justify-start rounded-2xl border bg-white p-4">
      <div className="w-full max-w-sm space-y-2">
        <Label>{t("invoice_status")}</Label>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("all")}</SelectItem>
            <SelectItem value="pending">{t("invoice_status_pending")}</SelectItem>
            <SelectItem value="partial">{t("invoice_status_partial")}</SelectItem>
            <SelectItem value="paid">{t("invoice_status_paid")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
    <div className="no-print mb-4 flex gap-2"><div className="relative w-full max-w-2xl flex-1 rounded-2xl bg-white shadow-md ring-1 ring-stone-200 transition-shadow focus-within:shadow-lg focus-within:ring-2 focus-within:ring-emerald-400"><Search className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-stone-500"/><Input className="h-14 rounded-2xl border-0 bg-transparent pl-12 pr-4 text-base shadow-none placeholder:text-stone-400 focus-visible:ring-0 focus-visible:ring-offset-0" placeholder={t("invoice_search_placeholder")} value={q} onChange={e=>setQ(e.target.value)}/></div></div>
    <div className="no-print overflow-x-auto rounded-2xl border bg-white">
      <table className="w-full text-sm"><thead className="bg-stone-50"><tr>{[t("invoice_number"),t("invoice_date"),t("invoice_client"),t("invoice_load_code"),t("invoice_total"),t("invoice_paid"),t("invoice_balance"),t("invoice_status"),t("invoice_actions")].map(x=><th key={x} className="p-3 text-left">{x}</th>)}</tr></thead>
      <tbody>{filteredRows.map(i=><tr key={i.id} className="border-t"><td className="p-3 font-semibold">{i.number}</td><td className="p-3">{fmtDate(i.created_at)}</td><td className="p-3">{i.client_name}<div className="text-xs text-stone-500">{i.phone}</div></td><td className="p-3">{i.load_code}</td><td className="p-3">{money(i.total)}</td><td className="p-3">{money(i.paid_amount)}</td><td className="p-3">{money(i.balance)}</td><td className="p-3"><span className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold shadow-sm ring-1 ring-inset ${i.balance <= 0.005 ? "bg-emerald-100 text-emerald-800 ring-emerald-200" : i.paid_amount > 0 ? "bg-amber-100 text-amber-800 ring-amber-200" : "bg-sky-100 text-sky-800 ring-sky-200"}`}><span className={`size-2.5 rounded-full ${i.balance <= 0.005 ? "bg-emerald-500" : i.paid_amount > 0 ? "bg-amber-500" : "bg-sky-500"}`} />{i.balance <= 0.005 ? t("invoice_status_paid") : i.paid_amount > 0 ? t("invoice_status_partial") : t("invoice_status_pending")}</span></td><td className="p-3"><div className="flex items-center gap-2"><Button size="icon" className="h-10 w-10 rounded-xl border-0 bg-sky-500 text-white shadow-sm transition-transform hover:scale-105 hover:bg-sky-600" title={t("invoice_view")} aria-label={t("invoice_view")} onClick={()=>setSelected(i)}><FileText className="size-5"/></Button>{admin && <Button size="icon" className="h-10 w-10 rounded-xl border-0 bg-emerald-500 text-white shadow-sm transition-transform hover:scale-105 hover:bg-emerald-600" title={t("invoice_edit_title")} aria-label={t("invoice_edit_title")} onClick={()=>{setEditing(i);setEditPrice(formatTariffPrice(i.price_per_kg));setEditPaid("0,000");}}><Pencil className="size-5"/></Button>}<Button size="icon" className="h-10 w-10 rounded-xl border-0 bg-violet-600 text-white shadow-sm transition-transform hover:scale-105 hover:bg-violet-700" title={t("invoice_print")} aria-label={t("invoice_print")} onClick={()=>print(i)}><Printer className="size-5"/></Button>{admin && <Button size="icon" className="h-10 w-10 rounded-xl border-0 bg-rose-500 text-white shadow-sm transition-transform hover:scale-105 hover:bg-rose-600" title={t("invoice_delete")} aria-label={t("invoice_delete")} disabled={remove.isPending} onClick={()=>{if(window.confirm(t("invoice_delete_confirm").replace("{number}",i.number)))remove.mutate(i.id);}}><Trash2 className="size-5"/></Button>}</div></td></tr>)}</tbody></table>
      {!filteredRows.length&&<div className="p-8 text-center text-stone-500">{t("invoice_none")}</div>}
    </div>
    {editing&&<div className="no-print fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"><div className="flex max-h-[78vh] w-full max-w-xl flex-col space-y-3 overflow-hidden rounded-2xl bg-white p-3 shadow-xl sm:p-4"><h2 className="text-lg font-bold">{t("invoice_edit_title")} {editing.number}</h2><div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1"><section className="grid grid-cols-1 gap-2 rounded-xl border border-stone-200 bg-stone-50 p-3 sm:grid-cols-2"><div><p className="text-xs font-medium text-stone-500">{t("invoice_number")}</p><p className="font-semibold">{editing.number}</p></div><div><p className="text-xs font-medium text-stone-500">{t("invoice_date")}</p><p className="font-semibold">{fmtDate(editing.created_at)}</p></div><div><p className="text-xs font-medium text-stone-500">{t("invoice_client")}</p><p className="font-semibold break-words">{editing.client_name}</p></div><div><p className="text-xs font-medium text-stone-500">Téléphone</p><p className="font-semibold">{editing.phone || "—"}</p></div><div><p className="text-xs font-medium text-stone-500">{t("invoice_load_code")}</p><p className="font-semibold">{editing.load_code}</p></div><div><p className="text-xs font-medium text-stone-500">{t("invoice_quantity")}</p><p className="font-semibold">{fmtNum(editing.oil_kg)} kg</p></div><div><p className="text-xs font-medium text-stone-500">{t("invoice_total")}</p><p className="font-semibold">{money(editing.total)}</p></div><div><p className="text-xs font-medium text-stone-500">{t("invoice_paid_amount")}</p><p className="font-semibold text-emerald-700">{money(editing.paid_amount)}</p></div><div><p className="text-xs font-medium text-stone-500">{t("invoice_balance")}</p><p className="font-semibold text-rose-700">{money(editing.balance)}</p></div></section><div className="space-y-2"><Label>{t("invoice_price")}</Label><Input type="text" inputMode="decimal" value={editPrice} onChange={e=>setEditPrice(e.target.value)} onBlur={()=>setEditPrice(formatTariffPrice(editPrice))}/></div><div className="space-y-2"><Label>Nouvelle somme payée (DT)</Label><Input type="text" inputMode="decimal" value={editPaid} onChange={e=>setEditPaid(e.target.value)} onBlur={()=>setEditPaid(formatTariffPrice(editPaid))}/><p className="text-xs text-stone-500">Déjà payé : {money(editing.paid_amount)}. Saisissez uniquement le nouveau paiement à ajouter, pas le total cumulé.</p></div>{editing.payments?.length ? <div className="rounded-xl border p-3"><h3 className="mb-2 font-semibold">Historique des paiements</h3><div className="space-y-2 text-sm">{editing.payments.map((p,n)=><div key={n} className="flex justify-between gap-3 border-t pt-2"><span>{fmtDate(p.at)} — {p.by || "—"}</span><strong>{money(p.amount)}</strong></div>)}</div></div> : null}<p className="text-xs text-stone-500">{t("invoice_recalculation_hint")}</p>{editing.history?.length ? <div className="max-h-32 overflow-auto rounded-lg border p-2 text-xs"><strong>{t("invoice_history")}</strong>{editing.history.map((h,n)=><div key={n} className="border-t py-2"><div>{fmtDate(h.at)} — {h.by} — {h.action}</div>{h.before && h.after ? <div className="mt-1 grid grid-cols-2 gap-2 text-stone-600"><div><span className="font-semibold">{t("invoice_before")}: </span>{t("invoice_price")} {money(Number((h.before as Record<string, unknown>).price_per_kg ?? 0))}; {t("invoice_paid_amount")} {money(Number((h.before as Record<string, unknown>).paid_amount ?? 0))}; {t("invoice_total")} {money(Number((h.before as Record<string, unknown>).total ?? 0))}; {t("invoice_balance")} {money(Number((h.before as Record<string, unknown>).balance ?? 0))}</div><div><span className="font-semibold">{t("invoice_after")}: </span>{t("invoice_price")} {money(Number((h.after as Record<string, unknown>).price_per_kg ?? 0))}; {t("invoice_paid_amount")} {money(Number((h.after as Record<string, unknown>).paid_amount ?? 0))}; {t("invoice_total")} {money(Number((h.after as Record<string, unknown>).total ?? 0))}; {t("invoice_balance")} {money(Number((h.after as Record<string, unknown>).balance ?? 0))}</div></div> : null}</div>)}</div> : null}</div><div className="flex shrink-0 justify-end gap-2 border-t bg-white pt-3"><Button variant="outline" onClick={()=>setEditing(null)}><X className="mr-2 size-4"/>{t("cancel")}</Button><Button disabled={!validAmount(editPrice)||!validAmount(editPaid)||update.isPending} onClick={()=>update.mutate()}><Save className="mr-2 size-4"/>{update.isPending ? "Enregistrement..." : t("save")}</Button></div></div></div>}
    {selected&&<div className="invoice-print fixed inset-0 z-40 overflow-auto bg-white p-6 md:p-10">
      <div className="no-print mb-4 flex justify-end gap-2"><Button variant="outline" onClick={()=>{setSelected(null);setSearchParams({}, {replace:true});}}>{t("invoice_close")}</Button><Button onClick={()=>window.print()}><Printer className="mr-2 size-4"/>{t("invoice_print_pdf")}</Button></div>
      <article className="mx-auto max-w-3xl border border-stone-200 p-8 print:border-0">
        <header className="flex items-start justify-between gap-5 border-b pb-5"><div className="flex shrink-0 items-start">{selected.mill_logo?<img src={selected.mill_logo} alt="Logo" className="max-h-20 max-w-28 object-contain"/>:null}</div><div className="text-left"><h1 className="text-2xl font-bold">{selected.mill_name||"Huilerie Oro Verde"}</h1><p>{selected.mill_address}</p><p>{selected.mill_phone}</p></div><div className="ml-auto shrink-0 text-right"><p className="text-sm text-stone-500">{t("invoice_date")}</p><strong>{fmtDate(selected.created_at)}</strong></div></header>
        <section className="my-5 mb-6 flex items-start justify-between gap-6">
          <div className="min-w-0 flex-1 text-left">
            <h2 className="text-3xl font-bold tracking-wide">{t("invoice_title")}</h2>
            <p className="mt-2"><strong>{selected.number}</strong></p>
          </div>
          <div className="min-w-0 flex-1 rounded-lg bg-stone-50 p-4 text-right print:bg-white">
            <p className="text-sm text-stone-500">{t("invoice_bill_to")}</p>
            <h3 className="text-lg font-bold">{selected.client_name}</h3>
            <p>{selected.phone}</p>
            <p>{t("invoice_load_label")} : {selected.load_code}</p>
          </div>
        </section>
        <table className="w-full border-collapse text-sm"><thead><tr className="border-y"><th className="p-3 text-left">Variétés d'olives</th><th className="p-3 text-right">Quantité</th><th className="p-3 text-right">Prix/kg</th><th className="p-3 text-right">Total</th></tr></thead><tbody><tr className="border-b"><td className="p-3">{selected.variety || "—"}</td><td className="p-3 text-right">{fmtNum(selected.oil_kg)} kg</td><td className="p-3 text-right">{money(selected.price_per_kg)}</td><td className="p-3 text-right">{money(selected.total)}</td></tr></tbody></table>
        <div className="ml-auto mt-8 max-w-xs space-y-3"><div className="flex justify-between gap-4"><strong>Total de la Facture</strong><strong>{money(selected.total)}</strong></div><div className="flex justify-between gap-4"><strong>Montant payé (DT)</strong><strong>{money(selected.paid_amount)}</strong></div><div className="flex justify-between gap-4 border-t pt-3 text-lg"><strong>Solde restant</strong><strong>{money(selected.balance)}</strong></div><p className="text-right text-sm italic text-stone-600" dir={lang === "ar" ? "rtl" : "ltr"}>{amountInWords(selected.balance, lang)}</p></div>
        <footer className="mt-16 border-t pt-4 text-center text-xs text-stone-500">{t("invoice_thanks")}</footer>
      </article>
    </div>}
    <style>{`@media print { body * { visibility: hidden !important; } .invoice-print, .invoice-print * { visibility: visible !important; } .client-account-print, .client-account-print * { visibility: visible !important; } .invoice-print { position: absolute !important; inset: 0 !important; overflow: visible !important; padding: 0 !important; } .invoice-print article { max-width: none !important; width: 100% !important; margin: 0 !important; padding: 12mm !important; } .no-print { display: none !important; } }`}</style>
  </div>;
}
