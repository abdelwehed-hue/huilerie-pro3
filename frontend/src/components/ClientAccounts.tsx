import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpenCheck, FileSpreadsheet, Printer, X } from "lucide-react";
import { apiGet } from "@/lib/api";
import { fmtDate, fmtMoney, fmtNum, useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ClientHit = { phone: string; client_name: string; codes: string[] };
type LoadRow = {
  day: string; code: string; client_name: string; olive_kg: number; oil_kg: number; variety?: string | null;
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

const cash = (n: number) => fmtMoney(n);
const fmtDateOnly = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { timeZone: "Africa/Tunis", day: "2-digit", month: "2-digit", year: "numeric" });

export default function ClientAccounts() {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const [mode, setMode] = useState<"global" | "statement" | null>(null);
  const [client, setClient] = useState<ClientHit | null>(null);
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState("");
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
    date: "التاريخ", receipt: "رقم الوصل", olives: "الزيتون (كغ)", varieties: "الأصناف", oil: "الزيت (كغ)",
    invoice: "رقم الفاتورة", total: "الإجمالي", paid: "المدفوع", remaining: "المتبقي",
    cancelled: "ملغاة", noInvoice: "لا توجد فاتورة", cancelledNote: "الإلغاء بحد ذاته لا ينشئ حركة مالية",
    opening: "الرصيد الافتتاحي", debits: "مجموع المدين", credits: "مجموع الدائن",
    balance: "الرصيد النهائي", operation: "العملية", debit: "مدين", credit: "دائن", documentDate: "التاريخ",
    noRows: "لا توجد بيانات في الفترة المحددة", legacy: "دفعة قديمة (إجمالي محفوظ دون تفاصيل)",
    cancellation: "إلغاء حمولة", customHint: "اختر تاريخ البداية والنهاية",
  } : {
    global: "Facture globale client", statement: "Relevé de compte client",
    globalSub: "Regrouper les factures et chargements dans un seul document", statementSub: "Toutes les opérations financières par date",
    search: "Rechercher par nom, téléphone ou code reçu", select: "Sélectionner le client",
    season: "Saison", all: "Toutes les saisons", custom: "Période personnalisée", from: "Du", to: "Au",
    print: "Imprimer / PDF", close: "Fermer", noClient: "Aucun client trouvé",
    date: "Date", receipt: "N° reçu", olives: "Olives (kg)", varieties: "Variétés", oil: "Huile (Li)",
    invoice: "N° facture", total: "Total", paid: "Payé", remaining: "Reste",
    cancelled: "Annulée", noInvoice: "Sans facture", cancelledNote: "L’annulation seule ne crée pas d’écriture financière",
    opening: "Solde initial", debits: "Total débit", credits: "Total crédit",
    balance: "Solde final", operation: "Opération", debit: "Débit", credit: "Crédit", documentDate: "Date",
    noRows: "Aucune donnée pour cette période", legacy: "Paiement historique (montant global sans détail)",
    cancellation: "Annulation chargement", customHint: "Choisissez les dates de début et de fin",
  };
  const searchQuery = useQuery({
    queryKey: ["client-account-search"],
    queryFn: () => apiGet<ClientHit[]>("/client-accounts/search"),
    enabled: Boolean(mode),
  });
  const clientList = searchQuery.data ?? [];
  const normalizeClientSearch = (value: string) => value.normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toLocaleLowerCase().trim();
  const normalizedClientSearch = normalizeClientSearch(clientSearch);
  const filteredClients = clientList.filter((hit) => {
    if (!normalizedClientSearch) return true;
    return [hit.client_name, hit.phone, ...hit.codes]
      .some((value) => normalizeClientSearch(value ?? "").includes(normalizedClientSearch));
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
    setMode(next); setClient(null); setSeason("all"); setCustom(false); setStart(""); setEnd("");
  };
  const clear = () => { setMode(null); setClient(null); };
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
        <div>
          <div className="relative" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setClientDropdownOpen(false); }}>
            <button
              type="button"
              aria-haspopup="listbox"
              aria-expanded={clientDropdownOpen}
              aria-label={labels.select}
              onClick={() => { setClientDropdownOpen((open) => !open); setClientSearch(""); }}
              className="flex h-11 w-full items-center justify-between gap-2 rounded-xl border border-stone-200 bg-white px-3 text-left text-sm shadow-xs outline-none focus-visible:border-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-200"
              data-testid="client-account-client-select"
            >
              <span className={client ? "truncate text-stone-900" : "truncate text-stone-400"}>
                {client ? `${client.client_name} · ${client.phone}` : labels.select}
              </span>
              <span className="text-stone-400" aria-hidden="true">▾</span>
            </button>
            {clientDropdownOpen && (
              <div className="absolute inset-x-0 top-full z-50 mt-1">
                <div role="listbox" aria-label={labels.select} className="max-h-80 overflow-y-auto rounded-xl border border-stone-200 bg-white p-1 shadow-xl">
                  <div className="sticky top-0 z-10 border-b border-stone-100 bg-white p-2">
                    <Input
                      autoFocus
                      value={clientSearch}
                      onChange={(e) => setClientSearch(e.target.value)}
                      onKeyDown={(e) => e.stopPropagation()}
                      placeholder={ar ? "ابحث بالاسم أو الهاتف أو رقم الوصل..." : "Rechercher par nom, téléphone ou code reçu..."}
                      aria-label={ar ? "البحث بالاسم أو الهاتف أو رقم الوصل" : "Rechercher par nom, téléphone ou code reçu"}
                      data-testid="client-account-client-search-input"
                      className="h-9 rounded-lg"
                    />
                  </div>
                  {searchQuery.isFetching && <div className="p-3 text-sm text-stone-500">{ar ? "جارٍ تحميل الحرفاء…" : "Chargement des clients…"}</div>}
                  {filteredClients.length > 0 ? filteredClients.map((hit) => (
                    <button
                      type="button"
                      role="option"
                      aria-selected={client?.phone === hit.phone}
                      key={hit.phone}
                      onPointerDown={(e) => {
                        // Select on pointer-down so mobile blur cannot close the list first.
                        e.preventDefault();
                        setClient(hit);
                        setSeason("all");
                        setCustom(false);
                        setStart("");
                        setEnd("");
                        setClientDropdownOpen(false);
                        setClientSearch("");
                      }}
                      onClick={() => {
                        // Keep click support for keyboard and assistive-technology activation.
                        setClient(hit);
                        setSeason("all");
                        setCustom(false);
                        setStart("");
                        setEnd("");
                        setClientDropdownOpen(false);
                        setClientSearch("");
                      }}
                      data-testid={`client-account-client-option-${hit.phone}`}
                      className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-emerald-50 focus:bg-emerald-50 focus:outline-none"
                    >
                      <span className="min-w-0 truncate font-medium text-stone-900">{hit.client_name || "—"}</span>
                      <span className="shrink-0 text-xs text-stone-400" dir="ltr">{hit.phone}</span>
                    </button>
                  )) : (
                    !searchQuery.isFetching && <p className="px-3 py-4 text-center text-sm text-stone-500">{labels.noClient}</p>
                  )}
                </div>
              </div>
            )}
          </div>
          {searchQuery.isError && <p className="mt-1 text-xs text-rose-600">{ar ? "تعذر تحميل قائمة الحرفاء." : "Impossible de charger la liste des clients."}</p>}
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
        <header className="border-b pb-4 text-left">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              {data.mill.mill_logo && <img src={data.mill.mill_logo} alt="Logo" className="max-h-16 max-w-24 object-contain"/>}
              <div className="text-left">
                <h2 className="print-mill-name text-xl font-bold">{data.mill.mill_name || "Huilerie Oro Verde"}</h2>
                <p className="text-sm text-stone-500">{data.mill.mill_address}</p>
                <p className="text-sm text-stone-500">{data.mill.mill_phone}</p>
              </div>
            </div>
            <div className="shrink-0 text-right text-sm">
              <h3 className="text-lg font-bold">{mode === "global" ? labels.global : labels.statement}</h3>
              <p className="print-client-name font-semibold">{data.client.client_name} · {data.client.phone}</p>
              <p className="text-xs text-stone-500">{labels.documentDate}: {new Date().toLocaleDateString("fr-FR", { timeZone: "Africa/Tunis", day: "2-digit", month: "2-digit", year: "numeric" })}</p>
              <p className="text-xs text-stone-500">{custom ? `${start} — ${end}` : season === "all" ? labels.all : season}</p>
            </div>
          </div>
        </header>
        {mode === "global" ? <>
          <div className="overflow-x-auto"><table className="global-invoice-table w-full min-w-[720px] border-collapse text-sm"><colgroup>{Array.from({length:8},(_,i)=><col key={i}/>)}</colgroup>
            <thead><tr className="bg-stone-100">{[labels.date,labels.receipt,labels.olives,labels.oil,labels.invoice,labels.total,labels.paid,labels.remaining].map((x,i)=><th key={x} className={`border p-2 text-start ${i === 4 ? "global-invoice-hide-on-print" : ""}`}>{i === 1 ? <><span className="global-invoice-screen-only">{x}</span><span className="global-invoice-print-only">{labels.invoice}</span></> : i === 2 ? <><span className="global-invoice-screen-only">{x}</span><span className="global-invoice-print-only">{labels.varieties}</span></> : x}</th>)}</tr></thead>
            <tbody>{data.global_invoice.loads.map((row)=> <tr key={row.code} className="border-b">
              <td className="whitespace-nowrap p-2">{row.day}</td><td className="p-2 font-semibold"><span className="global-invoice-screen-only">{row.code}</span><span className="global-invoice-print-only">{row.invoice_number || labels.noInvoice}{row.cancelled ? <small className="block text-rose-600">{labels.cancelled}</small> : null}</span></td><td className="p-2"><span className="global-invoice-screen-only">{fmtNum(row.olive_kg)}</span><span className="global-invoice-print-only">{row.variety || "—"}</span></td><td className="p-2">{fmtNum(row.oil_kg)}</td>
              <td className="p-2 global-invoice-hide-on-print">{row.invoice_number || labels.noInvoice}{row.cancelled ? <small className="block text-rose-600">{labels.cancelled}</small> : null}</td>
              <td className="p-2">{cash(row.total)}</td><td className="p-2">{cash(row.paid)}</td><td className="p-2">{cash(row.balance)}</td>
            </tr>)}
              <tr className="border-t-2 bg-stone-50 font-bold">
                <td className="whitespace-nowrap p-2">{ar ? "المجموع النهائي" : "Total Final"}</td>
                <td className="p-2"></td>
                <td className="p-2"></td>
                <td className="p-2"></td>
                <td className="p-2 global-invoice-hide-on-print"></td>
                <td className="whitespace-nowrap p-2">{cash(data.global_invoice.total)}</td>
                <td className="whitespace-nowrap p-2">{cash(data.global_invoice.paid)}</td>
                <td className="whitespace-nowrap p-2">{cash(data.global_invoice.balance)}</td>
              </tr>
            </tbody>
          </table></div>
          {!data.global_invoice.loads.length && <p className="py-6 text-center text-stone-500">{labels.noRows}</p>}
          <p className="text-xs text-stone-500">{labels.cancelledNote}</p>
        </> : <>
          <div className="overflow-x-auto print:overflow-visible"><table className="w-full min-w-0 table-fixed border-collapse text-sm print:text-[8.5pt]">
            <colgroup><col style={{width:"15%"}}/><col style={{width:"33%"}}/><col style={{width:"17%"}}/><col style={{width:"17%"}}/><col style={{width:"18%"}}/></colgroup>
            <thead><tr className="bg-stone-100 print:bg-stone-100">{[labels.date,labels.operation,labels.debit,labels.credit,labels.balance].map(x=><th key={x} className="border p-2 text-start print:p-1">{x}</th>)}</tr></thead>
            <tbody>
              {balanceRows.map((row)=><tr key={row.id} className="border-b">
                <td className="break-words p-2 print:p-1">{fmtDateOnly(row.date)}</td><td className="break-words p-2 print:p-1">{row.label}{row.legacy_aggregate ? <small className="block text-amber-700">{labels.legacy}</small> : null}{row.informational && row.reason ? <small className="block">{row.reason}</small> : null}</td>
                <td className="whitespace-nowrap p-2 print:p-1">{row.debit ? cash(row.debit) : "—"}</td><td className="whitespace-nowrap p-2 print:p-1">{row.credit ? cash(row.credit) : "—"}</td><td className="whitespace-nowrap p-2 font-semibold print:p-1">{row.informational ? "—" : cash(row.running)}</td>
              </tr>)}
              <tr className="border-t-2 bg-stone-50 font-bold">
                <td className="whitespace-nowrap p-2 print:p-1">Total Final</td>
                <td className="p-2 print:p-1"></td>
                <td className="whitespace-nowrap p-2 print:p-1">{cash(data.statement.debit_total)}</td>
                <td className="whitespace-nowrap p-2 print:p-1">{cash(data.statement.credit_total)}</td>
                <td className="whitespace-nowrap p-2 print:p-1">{cash(data.statement.final_balance)}</td>
              </tr>
            </tbody>
          </table></div>
          {!balanceRows.length && <p className="py-6 text-center text-stone-500">{labels.noRows}</p>}
        </>}
      </div>}
    </div>}
    <style>{`.global-invoice-print-only { display: none; }
    @media print {
      body * { visibility: hidden !important; }
      .client-account-print, .client-account-print * { visibility: visible !important; }
      .client-account-print { position: absolute !important; inset: 0 !important; width: 100% !important; margin: 0 !important; padding: 0 !important; background: white !important; }
      .client-account-no-print { display: none !important; }
      .client-account-print table { width: 100% !important; min-width: 0 !important; table-layout: fixed !important; font-size: 7.5pt !important; } .client-account-print th, .client-account-print td { font-size: 7.5pt !important; }
      .client-account-print th, .client-account-print td { overflow-wrap: anywhere !important; padding: 3px 4px !important; }
      .global-invoice-print-only { display: inline !important; }
      .global-invoice-hide-on-print { display: none !important; }
      .global-invoice-screen-only { display: none !important; }
      .client-account-print .global-invoice-table { min-width: 0 !important; }
      .client-account-print .global-invoice-table col:nth-child(1) { width: 15% !important; }
      .client-account-print .global-invoice-table col:nth-child(2) { width: 14% !important; }
      .client-account-print .global-invoice-table col:nth-child(3) { width: 12% !important; }
      .client-account-print .global-invoice-table col:nth-child(4) { width: 12% !important; }
      .client-account-print .global-invoice-table col:nth-child(5) { display: none !important; width: 0 !important; }
      .client-account-print .global-invoice-table col:nth-child(6) { width: 15% !important; }
      .client-account-print .global-invoice-table col:nth-child(7) { width: 16% !important; }
      .client-account-print .global-invoice-table col:nth-child(8) { width: 16% !important; }
      .client-account-print tr { break-inside: avoid; }
      .client-account-print .print-mill-name { font-size: 9.5pt !important; line-height: 1.2 !important; }
      .client-account-print .print-client-name { font-size: 8pt !important; line-height: 1.2 !important; }
    }`}</style>
  </section>;
}
