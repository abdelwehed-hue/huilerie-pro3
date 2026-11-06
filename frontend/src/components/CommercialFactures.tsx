import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { useMe } from "@/lib/useMe";
import { BookOpenCheck, FileSpreadsheet, FileText, Printer, Search, Pencil, Save, X } from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";
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
  const isAdmin = useMe().data?.role === "admin";
  const [mode, setMode] = useState<Mode>("invoices");
  const [buyerId, setBuyerId] = useState("");
  const [search, setSearch] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const [editingInvoiceId, setEditingInvoiceId] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Tunis" }));
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "BANK_TRANSFER" | "CHEQUE">("CASH");
  const [paymentReference, setPaymentReference] = useState("");
  const qc = useQueryClient();
  const labels = ar ? {
    title: "فواتير التسيير التجاري", subtitle: "فواتير وحسابات عملاء GS مستقلة عن التطبيق العادي",
    invoices: "الفواتير", statement: "كشف حساب العملاء", global: "الفواتير الإجمالية للعملاء",
    buyer: "العميل", choose: "اختر العميل", search: "ابحث برقم الفاتورة أو العميل أو كود التتبع",
    number: "رقم الفاتورة", date: "التاريخ", code: "كود التتبع", quantity: "الكمية (لتر)", unit: "السعر للوحدة/لتر", total: "الإجمالي", paid: "المدفوع", credited: "التخفيضات/الإشعارات الدائنة", balance: "المتبقي", status: "حالة الدفع",
    from: "من", to: "إلى", print: "طباعة / PDF", actions: "الإجراءات", editInvoice: "تعديل الفاتورة", newPayment: "مبلغ الدفعة الجديدة", paymentDate: "تاريخ الدفع", paymentMethod: "طريقة الدفع", reference: "المرجع", save: "حفظ الدفعة", cancel: "إلغاء", opening: "الرصيد الافتتاحي", debit: "مدين", credit: "دائن", operation: "العملية", final: "الرصيد النهائي", payment: "دفعة", reversal: "عكس دفعة", creditNote: "إشعار دائن", creditApply: "تخصيص رصيد دائن (للعلم فقط)", noRows: "لا توجد بيانات", noBuyer: "اختر عميلاً لعرض حسابه", loading: "جار تحميل البيانات…", gross: "إجمالي الفواتير", outstanding: "إجمالي الديون", count: "عدد الفواتير", note: "كشف الحساب يحسب الإشعارات الدائنة مرة واحدة فقط؛ تخصيص الرصيد الدائن لا يُحتسب كدفعة ثانية.", all: "كل العملاء"
  } : {
    title: "Factures — Gestion Commerciale", subtitle: "Factures et comptes clients GS, séparés de l’application Oro Verde",
    invoices: "Factures", statement: "Relevé de compte clients", global: "Factures globales clients",
    buyer: "Client", choose: "Choisir un client", search: "Rechercher facture, client ou code de traçabilité",
    number: "N° facture", date: "Date", code: "Code de traçabilité", quantity: "Quantité (L)", unit: "Prix unitaire/L", total: "Total", paid: "Payé", credited: "Avoirs", balance: "Reste dû", status: "Paiement",
    from: "Du", to: "Au", print: "Imprimer / PDF", actions: "Actions", editInvoice: "Modifier la facture", newPayment: "Nouvelle somme payée", paymentDate: "Date du paiement", paymentMethod: "Mode de paiement", reference: "Référence", save: "Enregistrer le paiement", cancel: "Annuler", opening: "Solde initial", debit: "Débit", credit: "Crédit", operation: "Opération", final: "Solde final", payment: "Paiement", reversal: "Annulation paiement", creditNote: "Avoir", creditApply: "Affectation d’avoir (informatif)", noRows: "Aucune donnée", noBuyer: "Choisissez un client pour afficher son compte", loading: "Chargement…", gross: "Total facturé", outstanding: "Total restant dû", count: "Nombre de factures", note: "Les avoirs sont comptés une seule fois ; leur affectation n’est pas comptée comme un second paiement.", all: "Tous les clients"
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
  const editingInvoice = invoices.find(x => x.id === editingInvoiceId);
  const addPayment = useMutation({
    mutationFn: async () => {
      if (!editingInvoice) throw new Error("Invoice not found");
      const amount = Number(paymentAmount.replace(",", "."));
      if (!Number.isFinite(amount) || amount <= 0) throw new Error(ar ? "أدخل مبلغًا صحيحًا" : "Saisissez un montant valide");
      if (amount > Number(editingInvoice.outstanding_amount_dt ?? 0)) throw new Error(ar ? "المبلغ يتجاوز الرصيد المتبقي" : "Le montant dépasse le reste dû");
      if (paymentMethod !== "CASH" && !paymentReference.trim()) throw new Error(ar ? "المرجع مطلوب" : "La référence est obligatoire");
      return apiPost<Row>(`/commercial/v1/sales-invoices/${encodeURIComponent(editingInvoice.id)}/payments`, {
        payment_date: paymentDate, amount_dt: amount, method: paymentMethod,
        reference: paymentReference.trim() || null, notes: null,
        expected_invoice_version: Number(editingInvoice.version), idempotency_key: crypto.randomUUID(),
      });
    },
    onSuccess: () => {
      toast.success(ar ? "تم تسجيل الدفعة وتحديث الفاتورة" : "Paiement enregistré et facture mise à jour");
      setEditingInvoiceId(""); setPaymentAmount(""); setPaymentReference("");
      qc.invalidateQueries({ queryKey: ["commercial", "factures", "invoices"] });
      qc.invalidateQueries({ queryKey: ["commercial", "factures", "invoice-details"] });
      qc.invalidateQueries({ queryKey: ["commercial", "factures", "ledger"] });
      qc.invalidateQueries({ queryKey: ["commercial", "factures", "summary"] });
    },
    onError: (error: any) => toast.error(error?.message || (ar ? "تعذر تسجيل الدفعة" : "Impossible d’enregistrer le paiement")),
  });
  const selectedInvoiceDetails = useQuery({
    queryKey: ["commercial", "factures", "invoice-details", selectedInvoiceId],
    enabled: Boolean(selectedInvoiceId) && mode !== "statement",
    queryFn: async () => {
      const inv = invoices.find(x => x.id === selectedInvoiceId);
      if (!inv) return { payments: [], reversals: [], applications: [], returns: [], notes: [] };
      const base = "/commercial/v1/sales-invoices/" + encodeURIComponent(inv.id);
      const [payments, reversals, applications, returns, allNotes] = await Promise.all([
        page<Row>(base + "/payments?limit=500"),
        page<Row>(base + "/payment-reversals?limit=500"),
        page<Row>(base + "/credit-applications?limit=500"),
        page<Row>("/commercial/v1/sale-returns?sale_id=" + encodeURIComponent(inv.sale_id) + "&limit=500"),
        page<Row>("/commercial/v1/credit-notes?limit=500"),
      ]);
      return { payments, reversals, applications, returns, notes: allNotes.filter(n => n.invoice_id === inv.id) };
    }
  });
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
  const ledgerData = useMemo<{ opening: number; rows: Row[]; final: number }>(() => {
    const allRows = ledgerQuery.data ?? [];
    const beforePeriod = allRows.filter(row => start && String(row.date ?? "").slice(0,10) < start);
    const opening = Math.round(beforePeriod.reduce((sum, row) => sum + Number(row.debit ?? 0) - Number(row.credit ?? 0), 0) * 1000) / 1000;
    let balance = opening;
    const rows: Row[] = allRows.filter((row: Row) => {
      const d = String(row.date ?? "").slice(0,10);
      return (!start || d >= start) && (!end || d <= end);
    }).map((row: Row): Row => {
      balance = Math.round((balance + Number(row.debit ?? 0) - Number(row.credit ?? 0)) * 1000) / 1000;
      return { ...row, running: balance } as Row;
    });
    return { opening, rows, final: balance };
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
      <Card><CardHeader className="pb-2"><CardDescription>{labels.gross}</CardDescription><CardTitle>{money(totalGross)}</CardTitle></CardHeader></Card>
      <Card><CardHeader className="pb-2"><CardDescription>{labels.paid}</CardDescription><CardTitle>{money(totalPaid)}</CardTitle></CardHeader></Card><Card><CardHeader className="pb-2"><CardDescription>{labels.outstanding}</CardDescription><CardTitle>{money(totalOutstanding)}</CardTitle></CardHeader></Card>
    </div>}
    {mode === "statement" && !buyerId && <p className="rounded-xl border p-6 text-center text-muted-foreground">{labels.noBuyer}</p>}
    {mode === "statement" && buyerId && <Card>
      <CardHeader><CardTitle>{labels.statement} — {selectedBuyer?.name}</CardTitle><CardDescription>{labels.note}</CardDescription></CardHeader>
      <CardContent>
        {buyerSummary.data && <div className="mb-4 grid gap-3 sm:grid-cols-3"><div className="rounded-lg bg-muted p-3"><div className="text-xs text-muted-foreground">{labels.gross}</div><strong>{money(buyerSummary.data.summary?.gross_invoiced_amount_dt)}</strong></div><div className="rounded-lg bg-muted p-3"><div className="text-xs text-muted-foreground">{labels.paid}</div><strong>{money(buyerSummary.data.summary?.settled_amount_dt)}</strong></div><div className="rounded-lg bg-muted p-3"><div className="text-xs text-muted-foreground">{labels.outstanding}</div><strong>{money(buyerSummary.data.summary?.outstanding_amount_dt)}</strong></div></div>}
        {ledgerQuery.isLoading ? <p className="py-5 text-center">{labels.loading}</p> : <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>{labels.date}</TableHead><TableHead>{labels.operation}</TableHead><TableHead>{labels.number}</TableHead><TableHead>{labels.debit}</TableHead><TableHead>{labels.credit}</TableHead><TableHead>{labels.balance}</TableHead></TableRow></TableHeader><TableBody>
          <TableRow><TableCell>—</TableCell><TableCell>{labels.opening}</TableCell><TableCell>—</TableCell><TableCell>—</TableCell><TableCell>—</TableCell><TableCell>{money(ledgerData.opening)}</TableCell></TableRow>
          {ledgerData.rows.map(row=><TableRow key={row.id}><TableCell>{dateText(row.date)}</TableCell><TableCell>{row.label}{row.detail ? <div className="text-xs text-muted-foreground">{row.detail}</div> : null}</TableCell><TableCell className="font-mono text-xs">{row.invoice ?? "—"}</TableCell><TableCell>{row.debit ? money(row.debit) : "—"}</TableCell><TableCell>{row.credit ? money(row.credit) : "—"}</TableCell><TableCell className="font-semibold">{money(row.running)}</TableCell></TableRow>)}
          {!ledgerData.rows.length && <TableRow><TableCell colSpan={6} className="text-center">{labels.noRows}</TableCell></TableRow>}\n          <TableRow className="font-bold"><TableCell>—</TableCell><TableCell>{labels.final}</TableCell><TableCell>—</TableCell><TableCell>—</TableCell><TableCell>—</TableCell><TableCell>{money(ledgerData.final)}</TableCell></TableRow>
        </TableBody></Table></div>}
      </CardContent>
    </Card>}
    {mode !== "statement" && <Card>
      <CardHeader><CardTitle>{mode === "global" ? labels.global : labels.invoices}{buyerId ? " — " + selectedBuyer?.name : ""}</CardTitle><CardDescription>{mode === "global" ? (ar ? "مجموع الفواتير خلال الفترة المحددة للعميل المختار" : "Regroupement des factures du client sur la période sélectionnée") : labels.subtitle}</CardDescription></CardHeader>
      <CardContent><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>{labels.number}</TableHead><TableHead>{labels.date}</TableHead><TableHead>{labels.buyer}</TableHead><TableHead>{labels.code}</TableHead><TableHead>{labels.quantity}</TableHead><TableHead>{labels.unit}</TableHead><TableHead>{labels.total}</TableHead><TableHead>{labels.paid}</TableHead><TableHead>{labels.credited}</TableHead><TableHead>{labels.balance}</TableHead><TableHead>{labels.status}</TableHead><TableHead>{labels.actions}</TableHead></TableRow></TableHeader><TableBody>
        {filtered.map(x=>{const b=buyers.find(y=>y.id===x.buyer_id);return <TableRow key={x.id} className={selectedInvoiceId===x.id?"bg-muted":""} onClick={()=>setSelectedInvoiceId(x.id)}><TableCell className="font-mono font-semibold">{x.document_number}</TableCell><TableCell>{dateText(x.sale_date ?? x.created_at)}</TableCell><TableCell>{b?.name ?? "—"}</TableCell><TableCell className="font-mono">{x.batch_code ?? "—"}</TableCell><TableCell>{money(x.quantity_kg)}</TableCell><TableCell>{money(x.unit_price_dt)}</TableCell><TableCell className="font-semibold">{money(x.total_amount_dt)}</TableCell><TableCell>{money(x.paid_amount_dt)}</TableCell><TableCell>{money(x.credited_amount_dt)}</TableCell><TableCell>{money(x.outstanding_amount_dt)}</TableCell><TableCell>{statusText(x)}</TableCell><TableCell><div className="flex items-center gap-1"><Button size="icon" variant="outline" title={labels.print} aria-label={labels.print} onClick={()=>{setSelectedInvoiceId(x.id);window.setTimeout(()=>window.print(),150);}}><Printer className="size-4"/></Button>{isAdmin && <Button size="icon" variant="outline" title={labels.editInvoice} aria-label={labels.editInvoice} disabled={Number(x.outstanding_amount_dt ?? 0) <= 0} onClick={()=>{setEditingInvoiceId(x.id);setPaymentAmount("");setPaymentDate(new Date().toLocaleDateString("en-CA",{timeZone:"Africa/Tunis"}));setPaymentMethod("CASH");setPaymentReference("");}}><Pencil className="size-4"/></Button>}</div></TableCell></TableRow>})}
        {!filtered.length && <TableRow><TableCell colSpan={12} className="text-center">{labels.noRows}</TableCell></TableRow>}
      </TableBody></Table></div>
      {selectedInvoiceId && selectedInvoice && <div className="gs-invoice-detail-print mt-4 rounded-xl border bg-muted/30 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{ar ? "تفاصيل الفاتورة" : "Détail de la facture"} · {selectedInvoice.document_number}</h3><Button size="sm" variant="outline" onClick={print}><Printer className="mr-2 size-4"/>{labels.print}</Button></div>
        <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div><span className="text-muted-foreground">{labels.buyer}</span><p className="font-semibold">{buyers.find(b=>b.id===selectedInvoice.buyer_id)?.name ?? "—"}</p></div>
          <div><span className="text-muted-foreground">{labels.date}</span><p className="font-semibold">{dateText(selectedInvoice.sale_date ?? selectedInvoice.created_at)}</p></div>
          <div><span className="text-muted-foreground">{labels.code}</span><p className="font-mono font-semibold">{selectedInvoice.batch_code ?? "—"}</p></div>
          <div><span className="text-muted-foreground">{labels.status}</span><p className="font-semibold">{statusText(selectedInvoice)}</p></div>
          <div><span className="text-muted-foreground">{labels.quantity}</span><p className="font-semibold">{money(selectedInvoice.quantity_kg)}</p></div>
          <div><span className="text-muted-foreground">{labels.unit}</span><p className="font-semibold">{money(selectedInvoice.unit_price_dt)}</p></div>
          <div><span className="text-muted-foreground">{labels.total}</span><p className="font-semibold">{money(selectedInvoice.total_amount_dt)}</p></div>
          <div><span className="text-muted-foreground">{labels.balance}</span><p className="font-semibold">{money(selectedInvoice.outstanding_amount_dt)}</p></div>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div><h4 className="mb-2 font-semibold">{ar ? "الدفعات" : "Paiements"}</h4><Table><TableHeader><TableRow><TableHead>{labels.date}</TableHead><TableHead>{ar ? "المرجع" : "Référence"}</TableHead><TableHead>{labels.total}</TableHead><TableHead>{ar ? "الطريقة" : "Méthode"}</TableHead></TableRow></TableHeader><TableBody>{(selectedInvoiceDetails.data?.payments ?? []).map(p=><TableRow key={p.id}><TableCell>{dateText(p.payment_date ?? p.created_at)}</TableCell><TableCell>{p.document_number ?? "—"}</TableCell><TableCell>{money(p.amount_dt)}</TableCell><TableCell>{p.method ?? "—"}</TableCell></TableRow>)}{!selectedInvoiceDetails.data?.payments?.length && <TableRow><TableCell colSpan={4}>{labels.noRows}</TableCell></TableRow>}</TableBody></Table></div>
          <div><h4 className="mb-2 font-semibold">{ar ? "الإشعارات الدائنة وعكس الدفعات" : "Avoirs et annulations de paiement"}</h4><Table><TableHeader><TableRow><TableHead>{labels.date}</TableHead><TableHead>{ar ? "الوثيقة" : "Document"}</TableHead><TableHead>{labels.total}</TableHead><TableHead>{ar ? "البيان" : "Motif"}</TableHead></TableRow></TableHeader><TableBody>{(selectedInvoiceDetails.data?.notes ?? []).map(n=><TableRow key={n.id}><TableCell>{dateText(n.created_at)}</TableCell><TableCell>{n.document_number}</TableCell><TableCell>{money(n.amount_dt)}</TableCell><TableCell>{ar ? "إشعار دائن" : "Avoir"}</TableCell></TableRow>)}{(selectedInvoiceDetails.data?.reversals ?? []).map(v=><TableRow key={v.id}><TableCell>{dateText(v.created_at)}</TableCell><TableCell>{v.document_number}</TableCell><TableCell>{money(v.amount_dt)}</TableCell><TableCell>{v.reason ?? "—"}</TableCell></TableRow>)}{!selectedInvoiceDetails.data?.notes?.length && !selectedInvoiceDetails.data?.reversals?.length && <TableRow><TableCell colSpan={4}>{labels.noRows}</TableCell></TableRow>}</TableBody></Table></div>
        </div>
        <div className="mt-4"><h4 className="mb-2 font-semibold">{ar ? "التسويات والمرتجعات" : "Affectations et retours"}</h4><Table><TableHeader><TableRow><TableHead>{labels.date}</TableHead><TableHead>{ar ? "الوثيقة" : "Document"}</TableHead><TableHead>{labels.operation}</TableHead><TableHead>{labels.status}</TableHead></TableRow></TableHeader><TableBody>{(selectedInvoiceDetails.data?.applications ?? []).map(a=><TableRow key={a.id}><TableCell>{dateText(a.created_at)}</TableCell><TableCell>{a.document_number}</TableCell><TableCell>{labels.creditApply}</TableCell><TableCell>{a.status}</TableCell></TableRow>)}{(selectedInvoiceDetails.data?.returns ?? []).map(r=><TableRow key={r.id}><TableCell>{dateText(r.received_at ?? r.created_at)}</TableCell><TableCell>{r.document_number}</TableCell><TableCell>{ar ? "مرتجع" : "Retour physique"}</TableCell><TableCell>{r.commercial_acceptance_status ?? r.status}</TableCell></TableRow>)}{!selectedInvoiceDetails.data?.applications?.length && !selectedInvoiceDetails.data?.returns?.length && <TableRow><TableCell colSpan={4}>{labels.noRows}</TableCell></TableRow>}</TableBody></Table></div>
      </div>}
      </CardContent>
    </Card>}
    {editingInvoice && <div className="no-print fixed inset-0 z-[60] grid place-items-center bg-black/50 p-4"><div className="flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-background p-4 shadow-2xl">
      <div className="mb-3 flex items-center justify-between gap-3"><h2 className="text-lg font-bold">{labels.editInvoice} · {editingInvoice.document_number}</h2><Button size="icon" variant="ghost" onClick={()=>setEditingInvoiceId("")}><X className="size-4"/></Button></div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
        <div className="grid grid-cols-2 gap-3 rounded-xl bg-muted p-3 text-sm">
          <div><span className="text-muted-foreground">{labels.buyer}</span><p className="font-semibold">{buyers.find(b=>b.id===editingInvoice.buyer_id)?.name ?? "—"}</p></div>
          <div><span className="text-muted-foreground">{labels.date}</span><p className="font-semibold">{dateText(editingInvoice.sale_date ?? editingInvoice.created_at)}</p></div>
          <div><span className="text-muted-foreground">{labels.total}</span><p className="font-semibold">{money(editingInvoice.total_amount_dt)}</p></div>
          <div><span className="text-muted-foreground">{labels.paid}</span><p className="font-semibold text-emerald-700">{money(editingInvoice.paid_amount_dt)}</p></div>
          <div><span className="text-muted-foreground">{labels.credited}</span><p className="font-semibold">{money(editingInvoice.credited_amount_dt)}</p></div>
          <div><span className="text-muted-foreground">{labels.balance}</span><p className="font-semibold text-rose-700">{money(editingInvoice.outstanding_amount_dt)}</p></div>
        </div>
        <p className="text-sm text-muted-foreground">{ar ? "أدخل الدفعة الجديدة فقط، ولا تدخل مجموع الدفعات السابقة. سيتم تحديث المدفوع والمتبقي تلقائيًا مع تسجيل العملية في سجل التدقيق." : "Saisissez uniquement le nouveau paiement à ajouter, pas le cumul déjà payé. Le payé et le reste dû seront recalculés automatiquement et l’opération sera auditée."}</p>
        <label className="grid gap-1 text-sm font-medium">{labels.newPayment}<Input inputMode="decimal" value={paymentAmount} onChange={e=>setPaymentAmount(e.target.value)} placeholder="0,000"/></label>
        <label className="grid gap-1 text-sm font-medium">{labels.paymentDate}<Input type="date" value={paymentDate} onChange={e=>setPaymentDate(e.target.value)}/></label>
        <label className="grid gap-1 text-sm font-medium">{labels.paymentMethod}<select className="h-10 rounded-md border bg-background px-3" value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value as "CASH" | "BANK_TRANSFER" | "CHEQUE")}><option value="CASH">{ar ? "نقدًا" : "Espèces"}</option><option value="BANK_TRANSFER">{ar ? "تحويل بنكي" : "Virement bancaire"}</option><option value="CHEQUE">{ar ? "صك" : "Chèque"}</option></select></label>
        {paymentMethod !== "CASH" && <label className="grid gap-1 text-sm font-medium">{labels.reference}<Input value={paymentReference} onChange={e=>setPaymentReference(e.target.value)} placeholder={labels.reference}/></label>}
        {editingInvoice.version == null && <p className="text-sm text-destructive">{ar ? "تعذر تعديل الفاتورة: إصدار السجل غير متوفر." : "Modification impossible : version de facture indisponible."}</p>}
      </div>
      <div className="mt-4 flex justify-end gap-2 border-t pt-3"><Button variant="outline" onClick={()=>setEditingInvoiceId("")}>{labels.cancel}</Button><Button disabled={addPayment.isPending || !paymentAmount.trim() || !paymentDate || editingInvoice.version == null} onClick={()=>addPayment.mutate()}><Save className="mr-2 size-4"/>{addPayment.isPending ? (ar ? "جار الحفظ…" : "Enregistrement…") : labels.save}</Button></div>
    </div></div>}
    <style>{`@media print { body * { visibility: hidden !important; } .gs-invoice-detail-print, .gs-invoice-detail-print * { visibility: visible !important; } .gs-invoice-detail-print { position: absolute !important; inset: 0 !important; width: 100% !important; padding: 12mm !important; background: white !important; border: 0 !important; } .gs-invoice-detail-print button { display: none !important; } }`}</style>
  </div>;
}
