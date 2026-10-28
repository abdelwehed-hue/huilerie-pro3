import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileText, Printer, Search, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import { useI18n, fmtNum, fmtDate } from "@/lib/i18n";
import { useMe } from "@/lib/useMe";
import { PageHeader } from "@/components/shared";

type Invoice = {
  id: string; number: string; load_id: string; load_code: string; client_name: string; phone: string;
  olive_kg: number; price_per_kg: number; total: number; paid_amount: number; balance: number;
  day: string; created_at: string; mill_name: string; mill_address: string; mill_phone: string;
  mill_logo: string; history?: Array<{at: string; by: string; action: string; before?: unknown; after?: unknown}>;
};
type EligibleLoad = {id: string; code: string; client_name: string; phone: string; olive_kg: number; day: string};

export default function Factures() {
  const { errMsg, t } = useI18n();
  const admin = useMe().data?.role === "admin";
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [loadId, setLoadId] = useState("");
  const [paid, setPaid] = useState("0");
  const [editing, setEditing] = useState<Invoice | null>(null);
  const [editPrice, setEditPrice] = useState("");
  const [editPaid, setEditPaid] = useState("");
  const [selected, setSelected] = useState<Invoice | null>(null);
  const invoices = useQuery({queryKey:["invoices", q], queryFn:()=>apiGet<Invoice[]>(`/invoices?q=${encodeURIComponent(q)}`), enabled:admin});
  const eligible = useQuery({queryKey:["invoice-eligible-loads"], queryFn:()=>apiGet<EligibleLoad[]>("/invoices/eligible-loads"), enabled:admin});
  const rows = invoices.data ?? [];
  const loads = eligible.data ?? [];
  const create = useMutation({
    mutationFn:()=>apiPost<Invoice>("/invoices",{load_id:loadId,paid_amount:Number(paid)}),
    onSuccess:(invoice)=>{toast.success(t("invoice_created"));setLoadId("");setPaid("0");qc.invalidateQueries({queryKey:["invoices"]});qc.invalidateQueries({queryKey:["invoice-eligible-loads"]});setSelected(invoice);},
    onError:(e)=>toast.error(errMsg(e)),
  });
  const update = useMutation({
    mutationFn:()=>apiPatch<Invoice>(`/invoices/${editing!.id}`,{price_per_kg:Number(editPrice),paid_amount:Number(editPaid)}),
    onSuccess:(invoice)=>{toast.success(t("invoice_updated"));setEditing(null);qc.invalidateQueries({queryKey:["invoices"]});setSelected(invoice);},
    onError:(e)=>toast.error(errMsg(e)),
  });
  const remove = useMutation({
    mutationFn:(invoiceId:string)=>apiDelete<{ok:boolean}>(`/invoices/${invoiceId}`),
    onSuccess:(_,invoiceId)=>{toast.success(t("invoice_deleted"));qc.invalidateQueries({queryKey:["invoices"]});qc.invalidateQueries({queryKey:["invoice-eligible-loads"]});setSelected(current=>current?.id===invoiceId?null:current);},
    onError:(e)=>toast.error(errMsg(e)),
  });
  const validAmount = (value: string) => value.trim() !== "" && Number.isFinite(Number(value)) && Number(value) >= 0;
  const currentLoad = loads.find(l=>l.id===loadId);
  const money = (n:number)=>`${fmtNum(n,3)} DT`;
  const print = (invoice:Invoice)=>{setSelected(invoice);window.setTimeout(()=>window.print(),100);};
  if (!admin) return <div className="rounded-xl border p-6">{t("admin_only")}</div>;
  return <div>
    <div className="no-print"><PageHeader title={t("factures")} sub={t("invoice_sub")} accent="bg-emerald-600"/></div>
    <div className="no-print mb-5 grid gap-4 rounded-2xl border bg-white p-4 md:grid-cols-[2fr_1fr_1fr_auto]">
      <div className="space-y-2"><Label>{t("invoice_load")}</Label>
        <Select value={loadId} onValueChange={setLoadId}>
          <SelectTrigger><SelectValue placeholder={t("invoice_choose_load")}>{(v)=>{const l=loads.find(x=>x.id===v);return l? `${l.code} — ${l.client_name} (${fmtNum(l.olive_kg)} kg)`:String(v??t("invoice_choose_load"));}}</SelectValue></SelectTrigger>
          <SelectContent>{loads.map(l=><SelectItem key={l.id} value={l.id}>{l.code} — {l.client_name} ({fmtNum(l.olive_kg)} kg)</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-2"><Label>{t("invoice_paid_amount")}</Label><Input type="number" min="0" step="0.001" value={paid} onChange={e=>setPaid(e.target.value)}/></div>
      <div className="space-y-2"><Label>{t("invoice_client")}</Label><div className="rounded-lg border bg-stone-50 p-2 text-sm">{currentLoad?.client_name || "—"}</div></div>
      <div className="flex items-end"><Button disabled={!loadId||!validAmount(paid)||create.isPending} onClick={()=>create.mutate()}><Plus className="mr-2 size-4"/>{t("invoice_create")}</Button></div>
      {currentLoad && <div className="text-sm text-stone-600 md:col-span-4">{t("invoice_weight")} : {fmtNum(currentLoad.olive_kg)} kg. {t("invoice_price_snapshot")}</div>}
    </div>
    <div className="no-print mb-4 flex gap-2"><div className="relative max-w-md flex-1"><Search className="absolute left-3 top-3 size-4 text-stone-400"/><Input className="pl-9" placeholder={t("invoice_search_placeholder")} value={q} onChange={e=>setQ(e.target.value)}/></div></div>
    <div className="no-print overflow-x-auto rounded-2xl border bg-white">
      <table className="w-full text-sm"><thead className="bg-stone-50"><tr>{[t("invoice_number"),t("invoice_date"),t("invoice_client"),t("invoice_load_code"),t("invoice_total"),t("invoice_paid"),t("invoice_balance"),t("invoice_actions")].map(x=><th key={x} className="p-3 text-left">{x}</th>)}</tr></thead>
      <tbody>{rows.map(i=><tr key={i.id} className="border-t"><td className="p-3 font-semibold">{i.number}</td><td className="p-3">{fmtDate(i.created_at)}</td><td className="p-3">{i.client_name}<div className="text-xs text-stone-500">{i.phone}</div></td><td className="p-3">{i.load_code}</td><td className="p-3">{money(i.total)}</td><td className="p-3">{money(i.paid_amount)}</td><td className="p-3">{money(i.balance)}</td><td className="p-3"><div className="flex items-center gap-2"><Button size="icon" className="h-10 w-10 rounded-xl border-0 bg-sky-500 text-white shadow-sm transition-transform hover:scale-105 hover:bg-sky-600" title={t("invoice_view")} aria-label={t("invoice_view")} onClick={()=>setSelected(i)}><FileText className="size-5"/></Button><Button size="icon" className="h-10 w-10 rounded-xl border-0 bg-emerald-500 text-white shadow-sm transition-transform hover:scale-105 hover:bg-emerald-600" title={t("invoice_edit_title")} aria-label={t("invoice_edit_title")} onClick={()=>{setEditing(i);setEditPrice(String(i.price_per_kg));setEditPaid(String(i.paid_amount));}}><Pencil className="size-5"/></Button><Button size="icon" className="h-10 w-10 rounded-xl border-0 bg-violet-600 text-white shadow-sm transition-transform hover:scale-105 hover:bg-violet-700" title={t("invoice_print")} aria-label={t("invoice_print")} onClick={()=>print(i)}><Printer className="size-5"/></Button><Button size="icon" className="h-10 w-10 rounded-xl border-0 bg-rose-500 text-white shadow-sm transition-transform hover:scale-105 hover:bg-rose-600" title={t("invoice_delete")} aria-label={t("invoice_delete")} disabled={remove.isPending} onClick={()=>{if(window.confirm(t("invoice_delete_confirm").replace("{number}",i.number)))remove.mutate(i.id);}}><Trash2 className="size-5"/></Button></div></td></tr>)}</tbody></table>
      {!rows.length&&<div className="p-8 text-center text-stone-500">{t("invoice_none")}</div>}
    </div>
    {editing&&<div className="no-print fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"><div className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-xl"><h2 className="text-lg font-bold">{t("invoice_edit_title")} {editing.number}</h2><div className="space-y-2"><Label>{t("invoice_price")}</Label><Input type="number" min="0" step="0.001" value={editPrice} onChange={e=>setEditPrice(e.target.value)}/></div><div className="space-y-2"><Label>{t("invoice_edit_paid_label")}</Label><Input type="number" min="0" step="0.001" value={editPaid} onChange={e=>setEditPaid(e.target.value)}/></div><p className="text-xs text-stone-500">{t("invoice_recalculation_hint")}</p>{editing.history?.length ? <div className="max-h-32 overflow-auto rounded-lg border p-2 text-xs"><strong>{t("invoice_history")}</strong>{editing.history.map((h,n)=><div key={n} className="border-t py-2"><div>{fmtDate(h.at)} — {h.by} — {h.action}</div>{h.before && h.after ? <div className="mt-1 grid grid-cols-2 gap-2 text-stone-600"><div><span className="font-semibold">{t("invoice_before")}: </span>{t("invoice_price")} {money(Number((h.before as Record<string, unknown>).price_per_kg ?? 0))}; {t("invoice_paid_amount")} {money(Number((h.before as Record<string, unknown>).paid_amount ?? 0))}; {t("invoice_total")} {money(Number((h.before as Record<string, unknown>).total ?? 0))}; {t("invoice_balance")} {money(Number((h.before as Record<string, unknown>).balance ?? 0))}</div><div><span className="font-semibold">{t("invoice_after")}: </span>{t("invoice_price")} {money(Number((h.after as Record<string, unknown>).price_per_kg ?? 0))}; {t("invoice_paid_amount")} {money(Number((h.after as Record<string, unknown>).paid_amount ?? 0))}; {t("invoice_total")} {money(Number((h.after as Record<string, unknown>).total ?? 0))}; {t("invoice_balance")} {money(Number((h.after as Record<string, unknown>).balance ?? 0))}</div></div> : null}</div>)}</div> : null}<div className="flex justify-end gap-2"><Button variant="outline" onClick={()=>setEditing(null)}>{t("cancel")}</Button><Button disabled={!validAmount(editPrice)||!validAmount(editPaid)||update.isPending} onClick={()=>update.mutate()}>{t("save")}</Button></div></div></div>}
    {selected&&<div className="invoice-print fixed inset-0 z-40 overflow-auto bg-white p-6 md:p-10">
      <div className="no-print mb-4 flex justify-end gap-2"><Button variant="outline" onClick={()=>setSelected(null)}>{t("invoice_close")}</Button><Button onClick={()=>window.print()}><Printer className="mr-2 size-4"/>{t("invoice_print_pdf")}</Button></div>
      <article className="mx-auto max-w-3xl border border-stone-200 p-8 print:border-0">
        <header className="flex items-start justify-between gap-4 border-b pb-5">{selected.mill_logo?<img src={selected.mill_logo} alt="Logo" className="max-h-20 max-w-28 object-contain"/>:<div/>}<div className="text-right"><h1 className="text-2xl font-bold">{selected.mill_name||"Huilerie Oro Verde"}</h1><p>{selected.mill_address}</p><p>{selected.mill_phone}</p></div></header>
        <h2 className="my-8 text-center text-3xl font-bold tracking-wide">{t("invoice_title")}</h2>
        <div className="mb-6 grid grid-cols-2 gap-4"><div><p className="text-sm text-stone-500">{t("invoice_number")}</p><strong>{selected.number}</strong></div><div className="text-right"><p className="text-sm text-stone-500">{t("invoice_date")}</p><strong>{fmtDate(selected.created_at)}</strong></div></div>
        <section className="mb-6 rounded-lg bg-stone-50 p-4 print:bg-white"><p className="text-sm text-stone-500">{t("invoice_bill_to")}</p><h3 className="text-lg font-bold">{selected.client_name}</h3><p>{selected.phone}</p><p>{t("invoice_load_label")} : {selected.load_code}</p></section>
        <table className="w-full border-collapse text-sm"><thead><tr className="border-y"><th className="p-3 text-left">{t("invoice_service")}</th><th className="p-3 text-right">{t("invoice_quantity")}</th><th className="p-3 text-right">{t("invoice_price_per_kg")}</th><th className="p-3 text-right">{t("invoice_total")}</th></tr></thead><tbody><tr className="border-b"><td className="p-3">{t("invoice_service")}</td><td className="p-3 text-right">{fmtNum(selected.olive_kg)} kg</td><td className="p-3 text-right">{money(selected.price_per_kg)}</td><td className="p-3 text-right">{money(selected.total)}</td></tr></tbody></table>
        <div className="ml-auto mt-8 max-w-xs space-y-3"><div className="flex justify-between"><span>{t("invoice_total")}</span><strong>{money(selected.total)}</strong></div><div className="flex justify-between"><span>{t("invoice_paid_amount")}</span><strong>{money(selected.paid_amount)}</strong></div><div className="flex justify-between border-t pt-3 text-lg"><span>{t("invoice_remaining_balance")}</span><strong>{money(selected.balance)}</strong></div></div>
        <footer className="mt-16 border-t pt-4 text-center text-xs text-stone-500">{t("invoice_thanks")}</footer>
      </article>
    </div>}
    <style>{`@media print { body * { visibility: hidden !important; } .invoice-print, .invoice-print * { visibility: visible !important; } .invoice-print { position: absolute !important; inset: 0 !important; overflow: visible !important; padding: 0 !important; } .invoice-print article { max-width: none !important; width: 100% !important; margin: 0 !important; padding: 12mm !important; } .no-print { display: none !important; } }`}</style>
  </div>;
}
