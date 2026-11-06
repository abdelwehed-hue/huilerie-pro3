import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpenCheck, FileSpreadsheet, FileText, Printer, Search } from "lucide-react";
import { apiGet } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Row = Record<string, any>;
type Mode = "invoices" | "statement" | "global";
const money = (v: unknown) => new Intl.NumberFormat("fr-TN", { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(Number(v ?? 0));
const dateText = (v: unknown) => {
  if (!v) return "—";
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? String(v) : new Intl.DateTimeFormat("fr-TN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Africa/Tunis" }).format(d);
};
const page = async <T,>(url: string): Promise<T[]> => {
  const result = await apiGet<T[]>(url);
  return Array.isArray(result) ? result : [];
};

export default function CommercialFactures() {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const [mode, setMode] = useState<Mode>("invoices");
  const [buyerId, setBuyerId] = useState("");
  const [search, setSearch] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const labels = ar ? {
    title: "فواتير التسيير التجاري", subtitle: "فواتير وحسابات عملاء GS مستقلة عن التطبيق العادي",
    invoices: "الفواتير", statement: "كشف حساب العملاء", global: "الفواتير الإجمالية للعملاء",
    buyer: "العميل", choose: "اختر العميل", search: "ابحث برقم الفاتورة أو العميل أو كود التتبع",
    number: "رقم الفاتورة", date: "التاريخ", code: "كود التتبع", quantity: "الكمية (كغ)", unit: "السعر للوحدة", total: "الإجمالي", paid: "المدفوع", credited: "التخفيضات/الإشعارات الدائنة", balance: "المتبقي", status: "حالة الدفع",
    from: "من", to: "إلى", print: "طباعة / PDF", opening: "الرصيد الافتتاحي", debit: "مدين", credit: "دائن", operation: "العملية", final: "الرصيد النهائي", payment: "دفعة", reversal: "عكس دفعة", creditNote: "إشعار دائن", creditApply: "تخصيص رصيد دائن (للعلم فقط)", noRows: "لا توجد بيانات", noBuyer: "اختر عميلاً لعرض حسابه", loading: "جار تحميل البيانات…", gross: "إجمالي الفواتير", outstanding: "إجمالي الديون", count: "عدد الفواتير", note: "كشف الحساب يحسب الإشعارات الدائنة مرة واحدة فقط؛ تخصيص الرصيد الدائن لا يُحتسب كدفعة ثانية.", all: "كل العملاء"
  } : {
    title: "Factures — Gestion Commerciale", subtitle: "Factures et comptes clients GS, séparés de l’application Oro Verde",
    invoices: "Factures", statement: "Relevé de compte clients", global: "Factures globales clients",
    buyer: "Client", choose: "Choisir un client", search: "Rechercher facture, client ou code de traçabilité",
    number: "N° facture", date: "Date", code: "Code de traçabilité", quantity: "Quantité (kg)", unit: "Prix unitaire", total: "Total", paid: "Payé", credited: "Avoirs", balance: "Reste dû", status: "Paiement",
    from: "Du", to: "Au", print: "Imprimer / PDF", opening: "Solde initial", debit: "Débit", credit: "Crédit", operation: "Opération", final: "Solde final", payment: "Paiement", reversal: "Annulation paiement", creditNote: "Avoir", creditApply: "Affectation d’avoir (informatif)", noRows: "Aucune donnée", noBuyer: "Choisissez un client pour afficher son compte", loading: "Chargement…", gross: "Total facturé", outstanding: "Total restant dû", count: "Nombre de factures", note: "Les avoirs sont comptés une seule fois ; leur affectation n’est pas comptée comme un second paiement.", all: "Tous les clients"
  };
  const buyersQuery = useQuery({ queryKey: ["commercial", "factures", "buyers"], queryFn: () => page<Row>("/commercial/v1/buyers?limit=500") });
  const invoicesQuery = useQuery({ queryKey: ["commercial", "factures", "invoices"], queryFn: () => page<Row>("/commercial/v1/sales-invoices?limit=500") });
  const notesQuery = useQuery({ queryKey: ["commercial", "factures", "credit-notes"], queryFn: () => page<Row>("/commercial/v1/credit-notes?limit=500"), enabled: mode !== "invoices" });
  const buyers = buyersQuery.data ?? [];
  const invoices = invoicesQuery.data ?? [];
  const buyerInvoices = useMemo(() => invoices.filter(x => !buyerId || x.buyer_id === buyerId), [invoices, buyerId]);
  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase();
    return buyerInvoices.filter(x => {
      const buyer = buyers.find(b => b.id === x.buyer_id);
      const text = [x.document_number, x.batch_code, buyer?.name, x.sale_id].join(" ").toLocaleLowerCase();
      const d = String(x.sale_date ?? x.created_at ?? "").slice(0, 10);
      return (!q || text.includes(q)) && (!start || d >= start) && (!end || d <= end);
    });
  }, [buyerInvoices, buyers, search, start, end]);
  const selectedBuyer = buyers.find(x => x.id === buyerId);
  const selectedInvoice = invoices.find(x => x.id === selectedInvoiceId);
  const buyerSummary = useQuery({
    queryKey: ["commercial", "factures", "summary", buyerId],
    queryFn: () => apiGet<Row>(`/commercial/v1/buyers/${encodeURIComponent(buyerId)}/account-summary`),
    enabled: Boolean(buyerId) && mode !== "invoices",
  });
  const ledgerQuery = useQuery({
    queryKey: ["commercial", "factures", "ledger", buyerId, buyerInvoices.map(x => x.id).join("|")],
    enabled: Boolean(buyerId) && mode === "statement" && buyerInvoices.length > 0 && notesQuery.isSuccess,
    queryFn: async () => {
      const details = await Promise.all(buyerInvoices.map(async invoice => {
        const base = `/commercial/v1/sales-invoices/${encodeURIComponent(invoice.id)}`;
        const [payments, reversals, applications, returns] = await Promise.all([
          page<Row>(base + "/payments?limit=500"),
          page<Row>(base + "/payment-reversals?limit=500"),
          page<Row>(base + "/credit-applications?limit=500"),
          page<Row>(`/commercial/v1/sale-returns?sale_id=${encodeURIComponent(invoice.sale_id)}&limit=500`),
        ]);
        return { invoice, payments, reversals, applications, returns };
      }));
      const buyerNotes = (notesQuery.data ?? []).filter(n => n.buyer_id === buyerId && n.status === "ISSUED");
      const events: Row[] = [];
      for (const item of details) {
        const inv = item.invoice;
        events.push({ id: "INV:" + inv.id, date: inv.sale_date ?? inv.created_at, label: labels.number + " " + inv.document_number, debit: Number(inv.total_amount_dt ?? 0), credit: 0, invoice: inv.document_number });
        for (const p of item.payments) events.push({ id: "PAY:" + p.id, date: p.payment_date ?? p.created_at, label: labels.payment + " " + (p.document_number ?? ""), debit: 0, credit: Number(p.amount_dt ?? 0), invoice: inv.document_number, detail: p.method });
        for (const rev of item.reversals) events.push({ id: "REV:" + rev.id, date: rev.created_at, label: labels.reversal + " " + (rev.document_number ?? ""), debit: Number(rev.amount_dt ?? 0), credit: 0, invoice: inv.document_number, detail: rev.reason });
        for (const note of buyerNotes.filter(n => n.invoice_id === inv.id)) events.push({ id: "AVO:" + note.id, date: note.created_at, label: labels.creditNote + " " + (note.document_number ?? ""), debit: 0, credit: Number(note.amount_dt ?? 0), invoice: inv.document_number });
        for (const app of item.applications) events.push({ id: "CAP:" + app.id, date: app.created_at, label: labels.creditApply + " " + (app.document_number ?? ""), debit: 0, credit: 0, invoice: inv.document_number, detail: app.reason });
        for (const ret of item.returns) events.push({ id: "RET:" + ret.id, date: ret.received_at ?? ret.created_at, label: (ar ? "إرجاع بضاعة" : "Retour physique") + " " + (ret.document_number ?? ""), debit: 0, credit: 0, invoice: inv.document_number, detail: ret.commercial_acceptance_status });
      }
      return events.sort((a,b) => String(a.date ?? "").localeCompare(String(b.date ?? "")));
    }
  });
  const ledger = useMemo<Row[]>(() => {
    let balance = 0;
    return (ledgerQuery.data ?? []).filter(row => {
      const d = String(row.date ?? "").slice(0,10);
      return (!start || d >= start) && (!end || d <= end);
    }).map(row => {
      balance = Math.round((balance + Number(row.debit ?? 0) - Number(row.credit ?? 0)) * 1000) / 1000;
      return { ...row, running: balance };
    });
  }, [ledgerQuery.data, start, end]);
  const print = () => window.print();
  const totalGross = filtered.reduce((sum, x) => sum + Number(x.total_amount_dt ?? 0), 0);
  const totalPaid = filtered.reduce((sum, x) => sum + Number(x.paid_amount_dt ?? 0) + Number(x.applied_credit_amount_dt ?? 0), 0);
  const totalOutstanding = filtered.reduce((sum, x) => sum + Number(x.outstanding_amount_dt ?? 0), 0);
  const statusText = (x: Row) => x.payment_status === "PAID" ? (ar ? "مدفوعة" : "Payée") : x.payment_status === "PARTIALLY_PAID" ? (ar ? "مدفوعة جزئياً" : "Partielle") : x.payment_status === "CREDITED" ? (ar ? "مغطاة بإشعار دائن" : "Créditée") : (ar ? "غير مدفوعة" : "Impayée");
  return <div className="commercial-factures-print space-y-4 pb-24" dir={ar ? "rtl" : "ltr"}>
    <Card className="commercial-card commercial-card--violet">
      <CardHeader><CardTitle>{labels.title}</CardTitle><CardDescription>{labels.subtitle}</CardDescription></CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-3">
        {(["invoices","statement","global"] as Mode[]).map((m) => <button key={m} type="button" onClick={() => setMode(m)} className={`flex items-center gap-3 rounded-xl border p-3 text-start transition ${mode === m ? "border-emerald-500 bg-emerald-50 text-emerald-950" : "border-border bg-card hover:bg-muted"}`}>
          <span className="rounded-lg bg-emerald-100 p-2 text-emerald-800">{m === "invoices" ? <FileText/> : m === "statement" ? <BookOpenCheck/> : <FileSpreadsheet/>}</span>
          <span className="font-semibold">{labels[m]}</span>
        </button>)}
      </CardContent>
    </Card>
    <Card>
      <CardContent className="grid gap-3 pt-5 md:grid-cols-4">
        <label className="grid gap-1 text-sm">{labels.buyer}<select className="h-10 rounded-lg border bg-background px-3" value={buyerId} onChange={e=>setBuyerId(e.target.value)}><option value="">{labels.all}</option>{buyers.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
        <label className="grid gap-1 text-sm">{labels.from}<Input type="date" value={start} onChange={e=>setStart(e.target.value)}/></label>
        <label className="grid gap-1 text-sm">{labels.to}<Input type="date" value={end} onChange={e=>setEnd(e.target.value)}/></label>
        <label className="grid gap-1 text-sm">{labels.search}<Input value={search} onChange={e=>setSearch(e.target.value)} placeholder={labels.search}/></label>
        <div className="md:col-span-4 flex justify-end"><Button variant="outline" onClick={print}><Printer className="mr-2 size-4"/>{labels.print}</Button></div>
      </CardContent>
    </Card>
    {mode !== "statement" && <div className="grid gap-3 sm:grid-cols-4">
      <Card><CardHeader className="pb-2"><CardDescription>{labels.count}</CardDescription><CardTitle>{filtered.length}</CardTitle></CardHeader></Card>
      <Card><CardHeader className="pb-2"><CardDescription>{labels.gross}</CardDescription><CardTitle>{money(totalGross)} TND</CardTitle></CardHeader></Card>
      <Card><CardHeader className="pb-2"><CardDescription>{labels.paid}</CardDescription><CardTitle>{money(totalPaid)} TND</CardTitle></CardHeader></Card><Card><CardHeader className="pb-2"><CardDescription>{labels.outstanding}</CardDescription><CardTitle>{money(totalOutstanding)} TND</CardTitle></CardHeader></Card>
    </div>}
    {mode === "statement" && !buyerId && <p className="rounded-xl border p-6 text-center text-muted-foreground">{labels.noBuyer}</p>}
    {mode === "statement" && buyerId && <Card>
      <CardHeader><CardTitle>{labels.statement} — {selectedBuyer?.name}</CardTitle><CardDescription>{labels.note}</CardDescription></CardHeader>
      <CardContent>
        {buyerSummary.data && <div className="mb-4 grid gap-3 sm:grid-cols-3"><div className="rounded-lg bg-muted p-3"><div className="text-xs text-muted-foreground">{labels.gross}</div><strong>{money(buyerSummary.data.summary?.gross_invoiced_amount_dt)} TND</strong></div><div className="rounded-lg bg-muted p-3"><div className="text-xs text-muted-foreground">{labels.paid}</div><strong>{money(buyerSummary.data.summary?.settled_amount_dt)} TND</strong></div><div className="rounded-lg bg-muted p-3"><div className="text-xs text-muted-foreground">{labels.outstanding}</div><strong>{money(buyerSummary.data.summary?.outstanding_amount_dt)} TND</strong></div></div>}
        {ledgerQuery.isLoading ? <p className="py-5 text-center">{labels.loading}</p> : <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>{labels.date}</TableHead><TableHead>{labels.operation}</TableHead><TableHead>{labels.number}</TableHead><TableHead>{labels.debit}</TableHead><TableHead>{labels.credit}</TableHead><TableHead>{labels.balance}</TableHead></TableRow></TableHeader><TableBody>
          <TableRow><TableCell>—</TableCell><TableCell>{labels.opening}</TableCell><TableCell>—</TableCell><TableCell>—</TableCell><TableCell>—</TableCell><TableCell>{money(0)}</TableCell></TableRow>
          {ledger.map(row=><TableRow key={row.id}><TableCell>{dateText(row.date)}</TableCell><TableCell>{row.label}{row.detail ? <div className="text-xs text-muted-foreground">{row.detail}</div> : null}</TableCell><TableCell className="font-mono text-xs">{row.invoice ?? "—"}</TableCell><TableCell>{row.debit ? money(row.debit) : "—"}</TableCell><TableCell>{row.credit ? money(row.credit) : "—"}</TableCell><TableCell className="font-semibold">{money(row.running)}</TableCell></TableRow>)}
          {!ledger.length && <TableRow><TableCell colSpan={6} className="text-center">{labels.noRows}</TableCell></TableRow>}
        </TableBody></Table></div>}
      </CardContent>
    </Card>}
    {mode !== "statement" && <Card>
      <CardHeader><CardTitle>{mode === "global" ? labels.global : labels.invoices}{buyerId ? " — " + selectedBuyer?.name : ""}</CardTitle><CardDescription>{mode === "global" ? (ar ? "مجموع الفواتير خلال الفترة المحددة للعميل المختار" : "Regroupement des factures du client sur la période sélectionnée") : labels.subtitle}</CardDescription></CardHeader>
      <CardContent><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>{labels.number}</TableHead><TableHead>{labels.date}</TableHead><TableHead>{labels.buyer}</TableHead><TableHead>{labels.code}</TableHead><TableHead>{labels.quantity}</TableHead><TableHead>{labels.unit}</TableHead><TableHead>{labels.total}</TableHead><TableHead>{labels.paid}</TableHead><TableHead>{labels.credited}</TableHead><TableHead>{labels.balance}</TableHead><TableHead>{labels.status}</TableHead></TableRow></TableHeader><TableBody>
        {filtered.map(x=>{const b=buyers.find(y=>y.id===x.buyer_id);return <TableRow key={x.id} className={selectedInvoiceId===x.id?"bg-muted":""} onClick={()=>setSelectedInvoiceId(x.id)}><TableCell className="font-mono font-semibold">{x.document_number}</TableCell><TableCell>{dateText(x.sale_date ?? x.created_at)}</TableCell><TableCell>{b?.name ?? "—"}</TableCell><TableCell className="font-mono">{x.batch_code ?? "—"}</TableCell><TableCell>{money(x.quantity_kg)}</TableCell><TableCell>{money(x.unit_price_dt)} TND</TableCell><TableCell className="font-semibold">{money(x.total_amount_dt)} TND</TableCell><TableCell>{money(x.paid_amount_dt)} TND</TableCell><TableCell>{money(x.credited_amount_dt)} TND</TableCell><TableCell>{money(x.outstanding_amount_dt)} TND</TableCell><TableCell>{statusText(x)}</TableCell></TableRow>})}
        {!filtered.length && <TableRow><TableCell colSpan={11} className="text-center">{labels.noRows}</TableCell></TableRow>}
      </TableBody></Table></div>
      {selectedInvoiceId && mode === "invoices" && selectedInvoice && <div className="mt-4 rounded-xl border bg-muted/30 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{ar ? "تفاصيل الفاتورة" : "Détail de la facture"} · {selectedInvoice.document_number}</h3><Button size="sm" variant="outline" onClick={print}><Printer className="mr-2 size-4"/>{labels.print}</Button></div>
        <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div><span className="text-muted-foreground">{labels.buyer}</span><p className="font-semibold">{buyers.find(b=>b.id===selectedInvoice.buyer_id)?.name ?? "—"}</p></div>
          <div><span className="text-muted-foreground">{labels.date}</span><p className="font-semibold">{dateText(selectedInvoice.sale_date ?? selectedInvoice.created_at)}</p></div>
          <div><span className="text-muted-foreground">{labels.code}</span><p className="font-mono font-semibold">{selectedInvoice.batch_code ?? "—"}</p></div>
          <div><span className="text-muted-foreground">{labels.status}</span><p className="font-semibold">{statusText(selectedInvoice)}</p></div>
          <div><span className="text-muted-foreground">{labels.quantity}</span><p className="font-semibold">{money(selectedInvoice.quantity_kg)}</p></div>
          <div><span className="text-muted-foreground">{labels.unit}</span><p className="font-semibold">{money(selectedInvoice.unit_price_dt)} TND</p></div>
          <div><span className="text-muted-foreground">{labels.total}</span><p className="font-semibold">{money(selectedInvoice.total_amount_dt)} TND</p></div>
          <div><span className="text-muted-foreground">{labels.balance}</span><p className="font-semibold">{money(selectedInvoice.outstanding_amount_dt)} TND</p></div>
        </div>
      </div>}
      </CardContent>
    </Card>}
    <style>{`@media print { body * { visibility: hidden !important; } .commercial-factures-print, .commercial-factures-print * { visibility: visible !important; } .commercial-factures-print { position: absolute !important; inset: 0 !important; width: 100% !important; padding: 0 !important; background: white !important; } .commercial-factures-print button, .commercial-factures-print input, .commercial-factures-print select { display: none !important; } }`}</style>
  </div>;
}
