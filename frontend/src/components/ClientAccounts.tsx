import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpenCheck, FileSpreadsheet, Printer, Search, X } from "lucide-react";
import { apiGet } from "@/lib/api";
import { fmtDate, fmtMoney, fmtNum, useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ClientHit = { phone: string; client_name: string; codes: string[] };
type LoadRow = {
  day: string; code: string; client_name: string; olive_kg: number; oil_kg: number;
  invoice_number: string | null; total: number; paid: number; balance: number;
  cancelled: boolean; cancel_reason: string; cancelled_at: string | null; has_invoice: boolean;
};
type LedgerRow = {
  id: string; date: string; kind: "invoice" | "payment" | "cancellation"; label: string;
  debit: number; credit: number; load_code: string; season: string;
  informational: boolean; legacy_aggregate?: boolean; reason?: string;
};
type AccountData = {
  client: { phone: string; client_name: string };
  period: { season: string; start: string; end: string };
  seasons: string[];
  global_invoice: { loads: LoadRow[]; total: number; paid: number; balance: number };
  statement: { opening_balance: number; debit_total: number; credit_total: number; final_balance: number; transactions: LedgerRow[] };
  mill: { mill_name?: string; mill_address?: string; mill_phone?: string; mill_logo?: string };
};

const cash = (n: number) => `${fmtMoney(n)} DT`;

export default function ClientAccounts() {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const [mode, setMode] = useState<"global" | "statement" | null>(null);
  const [query, setQuery] = useState("");
  const [client, setClient] = useState<ClientHit | null>(null);
  const [season, setSeason] = useState("all");
  const [custom, setCustom] = useState(false);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const labels = ar ? {
    global: "فاتورة مجمّعة للعميل", statement: "كشف حساب العميل",
    globalSub: "جمع فواتير وحمولات العميل في مستند واحد", statementSub: "كل الحركات المالية مرتبة حسب التاريخ",
    search: "ابحث باسم العميل أو الهاتف أو رقم الوصل", select: "اختر العميل",
    season: "الموسم", all: "كل المواسم", custom: "فترة مخصصة", from: "من", to: "إلى",
    print: "طباعة / PDF", close: "إغلاق", noClient: "لم يتم العثور على عميل",
    date: "التاريخ", receipt: "رقم الوصل", olives: "الزيتون (كغ)", oil: "الزيت (كغ)",
    invoice: "رقم الفاتورة", total: "الإجمالي", paid: "المدفوع", remaining: "المتبقي",
    cancelled: "ملغاة", noInvoice: "لا توجد فاتورة", cancelledNote: "حمولة ملغاة — ليست حركة مالية",
    opening: "الرصيد الافتتاحي", debits: "مجموع المدين", credits: "مجموع الدائن",
    balance: "الرصيد النهائي", operation: "العملية", debit: "مدين", credit: "دائن",
    noRows: "لا توجد بيانات في الفترة المحددة", legacy: "دفعة قديمة (إجمالي محفوظ دون تفاصيل)",
    cancellation: "إلغاء حمولة", customHint: "اختر تاريخ البداية والنهاية",
  } : {
    global: "Facture globale client", statement: "Relevé de compte client",
    globalSub: "Regrouper les factures et chargements dans un seul document", statementSub: "Toutes les opérations financières par date",
    search: "Rechercher par nom, téléphone ou code reçu", select: "Sélectionner le client",
    season: "Saison", all: "Toutes les saisons", custom: "Période personnalisée", from: "Du", to: "Au",
    print: "Imprimer / PDF", close: "Fermer", noClient: "Aucun client trouvé",
    date: "Date", receipt: "N° reçu", olives: "Olives (kg)", oil: "Huile (kg)",
    invoice: "N° facture", total: "Total", paid: "Payé", remaining: "Reste",
    cancelled: "Annulée", noInvoice: "Sans facture", cancelledNote: "Chargement annulé — aucune écriture financière",
    opening: "Solde initial", debits: "Total débit", credits: "Total crédit",
    balance: "Solde final", operation: "Opération", debit: "Débit", credit: "Crédit",
    noRows: "Aucune donnée pour cette période", legacy: "Paiement historique (montant global sans détail)",
    cancellation: "Annulation chargement", customHint: "Choisissez les dates de début et de fin",
  };
  const searchQuery = useQuery({
    queryKey: ["client-account-search", query],
    queryFn: () => apiGet<ClientHit[]>(`/client-accounts/search?q=${encodeURIComponent(query.trim())}`),
    enabled: query.trim().length >= 2,
  });
  const accountUrl = useMemo(() => {
    if (!client) return "";
    const params = new URLSearchParams();
    params.set("season", custom ? "all" : season);
    if (custom && start && end) { params.set("start", start); params.set("end", end); }
    return `/client-accounts/${encodeURIComponent(client.phone)}?${params.toString()}`;
  }, [client, season, custom, start, end]);
  const account = useQuery({
    queryKey: ["client-account", accountUrl],
    queryFn: () => apiGet<AccountData>(accountUrl),
    enabled: Boolean(client && accountUrl && (!custom || (start && end))),
  });
  const data = account.data;
  const balanceRows = useMemo(() => {
    let running = data?.statement.opening_balance ?? 0;
    return (data?.statement.transactions ?? []).map((row) => {
      running = Math.round((running + row.credit - row.debit) * 1000) / 1000;
      return { ...row, running };
    });
  }, [data]);
  const chooseMode = (next: "global" | "statement") => {
    setMode(next); setClient(null); setQuery(""); setSeason("all"); setCustom(false); setStart(""); setEnd("");
  };
  const clear = () => { setMode(null); setClient(null); setQuery(""); };
  const canPrint = Boolean(data && (!custom || (start && end)));
  return <section className="mb-6 space-y-4">
    <div className="grid gap-3 sm:grid-cols-2">
      <button type="button" onClick={() => chooseMode("global")} className={`flex items-center gap-4 rounded-2xl border p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${mode === "global" ? "border-emerald-500 bg-emerald-50" : "border-stone-200 bg-white"}`}>
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-800"><FileSpreadsheet className="size-6"/></span>
        <span><strong className="block text-base">{labels.global}</strong><small className="text-stone-500">{labels.globalSub}</small></span>
      </button>
      <button type="button" onClick={() => chooseMode("statement")} className={`flex items-center gap-4 rounded-2xl border p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${mode === "statement" ? "border-sky-500 bg-sky-50" : "border-stone-200 bg-white"}`}>
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-sky-100 text-sky-800"><BookOpenCheck className="size-6"/></span>
        <span><strong className="block text-base">{labels.statement}</strong><small className="text-stone-500">{labels.statementSub}</small></span>
      </button>
    </div>
    {mode && <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
      <div className="client-account-no-print mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold">{mode === "global" ? labels.global : labels.statement}</h2>
        <Button variant="outline" size="sm" onClick={clear}><X className="mr-1 size-4"/>{labels.close}</Button>
      </div>
      <div className="client-account-no-print grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400"/>
          <Input value={query} onChange={(e) => {setQuery(e.target.value);setClient(null);}} placeholder={labels.search} className="pl-10"/>
          {query.trim().length >= 2 && !client && <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-xl border bg-white shadow-lg">
            {searchQuery.isFetching ? <p className="p-3 text-sm text-stone-500">…</p> :
              (searchQuery.data ?? []).map((hit) => <button key={hit.phone} type="button" onClick={() => {setClient(hit);setQuery(`${hit.client_name} — ${hit.phone}`);}} className="block w-full border-b px-3 py-3 text-left hover:bg-emerald-50">
                <strong className="block">{hit.client_name || "—"}</strong><span className="text-sm text-stone-500">{hit.phone}{hit.codes.length ? ` · ${hit.codes.slice(0,3).join(", ")}` : ""}</span>
              </button>)}
            {!searchQuery.isFetching && !searchQuery.data?.length && <p className="p-3 text-sm text-stone-500">{labels.noClient}</p>}
          </div>}
        </div>
        <div className="flex gap-2">
          <select aria-label={labels.season} value={custom ? "__custom" : season} onChange={(e) => {setCustom(e.target.value === "__custom");if(e.target.value !== "__custom")setSeason(e.target.value);}} className="h-10 min-w-0 flex-1 rounded-md border border-stone-200 bg-white px-3 text-sm">
            <option value="all">{labels.all}</option>
            {(data?.seasons ?? []).map((s) => <option key={s} value={s}>{s}</option>)}
            <option value="__custom">{labels.custom}</option>
          </select>
        </div>
      </div>
      {custom && <div className="client-account-no-print mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-sm text-stone-600">{labels.from}<Input type="date" value={start} onChange={(e)=>setStart(e.target.value)} className="mt-1"/></label>
        <label className="text-sm text-stone-600">{labels.to}<Input type="date" value={end} onChange={(e)=>setEnd(e.target.value)} className="mt-1"/></label>
        <p className="text-xs text-stone-500 sm:col-span-2">{labels.customHint}</p>
      </div>}
      {client && <div className="client-account-no-print mt-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-lg bg-stone-100 px-3 py-2 font-semibold">{client.client_name} · {client.phone}</span>
        <Button size="sm" variant="outline" disabled={!canPrint} onClick={()=>window.print()}><Printer className="mr-2 size-4"/>{labels.print}</Button>
      </div>}
      {account.isFetching && client && <p className="py-5 text-center text-sm text-stone-500">{ar ? "جارٍ تحميل البيانات…" : "Chargement des données…"}</p>}
      {account.isError && client && <p className="py-5 text-center text-sm text-rose-600">{ar ? "تعذر تحميل كشف العميل." : "Impossible de charger le compte client."}</p>}
      {data && <div className="client-account-print mt-5 space-y-4" dir={ar ? "rtl" : "ltr"}>
        <header className="border-b pb-4 text-center">
          {data.mill.mill_logo && <img src={data.mill.mill_logo} alt="Logo" className="mx-auto mb-2 max-h-16 max-w-28 object-contain"/>}
          <h2 className="text-xl font-bold">{data.mill.mill_name || "Huilerie Oro Verde"}</h2>
          <p className="text-sm text-stone-500">{data.mill.mill_address} {data.mill.mill_phone}</p>
          <h3 className="mt-3 text-xl font-bold">{mode === "global" ? labels.global : labels.statement}</h3>
          <p className="font-semibold">{data.client.client_name} · {data.client.phone}</p>
          <p className="text-xs text-stone-500">{custom ? `${start} — ${end}` : season === "all" ? labels.all : season}</p>
        </header>
        {mode === "global" ? <>
          <div className="overflow-x-auto"><table className="w-full min-w-[720px] border-collapse text-sm">
            <thead><tr className="bg-stone-100">{[labels.date,labels.receipt,labels.olives,labels.oil,labels.invoice,labels.total,labels.paid,labels.remaining].map(x=><th key={x} className="border p-2 text-start">{x}</th>)}</tr></thead>
            <tbody>{data.global_invoice.loads.map((row)=> <tr key={row.code} className="border-b">
              <td className="p-2">{row.day}</td><td className="p-2 font-semibold">{row.code}</td><td className="p-2">{fmtNum(row.olive_kg)} </td><td className="p-2">{fmtNum(row.oil_kg)}</td>
              <td className="p-2">{row.invoice_number || labels.noInvoice}{row.cancelled ? <small className="block text-rose-600">{labels.cancelled}</small> : null}</td>
              <td className="p-2">{cash(row.total)}</td><td className="p-2">{cash(row.paid)}</td><td className="p-2">{cash(row.balance)}</td>
            </tr>)}</tbody>
          </table></div>
          {!data.global_invoice.loads.length && <p className="py-6 text-center text-stone-500">{labels.noRows}</p>}
          <div className="ml-auto grid max-w-md grid-cols-2 gap-x-4 gap-y-2 rounded-xl bg-stone-50 p-4 text-sm">
            <span>{labels.total}</span><strong className="text-right">{cash(data.global_invoice.total)}</strong>
            <span>{labels.paid}</span><strong className="text-right text-emerald-700">{cash(data.global_invoice.paid)}</strong>
            <span>{labels.remaining}</span><strong className="text-right text-rose-700">{cash(data.global_invoice.balance)}</strong>
          </div>
          <p className="text-xs text-stone-500">{labels.cancelledNote}</p>
        </> : <>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {[[labels.opening,data.statement.opening_balance],[labels.debits,data.statement.debit_total],[labels.credits,data.statement.credit_total],[labels.balance,data.statement.final_balance]].map(([label,value])=><div key={String(label)} className="rounded-xl border bg-stone-50 p-3"><p className="text-xs text-stone-500">{label}</p><strong className="text-base">{cash(Number(value))}</strong></div>)}
          </div>
          <div className="overflow-x-auto"><table className="w-full min-w-[650px] border-collapse text-sm">
            <thead><tr className="bg-stone-100">{[labels.date,labels.operation,labels.debit,labels.credit,labels.balance].map(x=><th key={x} className="border p-2 text-start">{x}</th>)}</tr></thead>
            <tbody>
              <tr className="border-b bg-stone-50"><td className="p-2">—</td><td className="p-2 font-semibold">{labels.opening}</td><td className="p-2">—</td><td className="p-2">—</td><td className="p-2 font-semibold">{cash(data.statement.opening_balance)}</td></tr>
              {balanceRows.map((row)=><tr key={row.id} className={`border-b ${row.informational ? "text-stone-400" : ""}`}>
                <td className="p-2">{fmtDate(row.date)}</td><td className="p-2">{row.label}{row.legacy_aggregate ? <small className="block text-amber-700">{labels.legacy}</small> : null}{row.informational && row.reason ? <small className="block">{row.reason}</small> : null}</td>
                <td className="p-2">{row.debit ? cash(row.debit) : "—"}</td><td className="p-2">{row.credit ? cash(row.credit) : "—"}</td><td className="p-2 font-semibold">{row.informational ? "—" : cash(row.running)}</td>
              </tr>)}
            </tbody>
          </table></div>
          {!balanceRows.length && <p className="py-6 text-center text-stone-500">{labels.noRows}</p>}
        </>}
        <footer className="border-t pt-3 text-center text-xs text-stone-500">{data.mill.mill_name || "Huilerie Oro Verde"}</footer>
      </div>}
    </div>}
    <style>{`@media print {
      body * { visibility: hidden !important; }
      .client-account-print, .client-account-print * { visibility: visible !important; }
      .client-account-print { position: absolute !important; inset: 0 !important; width: 100% !important; margin: 0 !important; padding: 10mm !important; background: white !important; }
      .client-account-no-print { display: none !important; }
      .client-account-print table { font-size: 9pt !important; }
      .client-account-print tr { break-inside: avoid; }
    }`}</style>
  </section>;
}
