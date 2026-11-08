import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { useMe } from "@/lib/useMe";
import { BookOpenCheck, FileSpreadsheet, FileText, Printer, Search, Pencil, Save, X } from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";
import { millimesInputNumber, millimesInputToDinars } from "@/lib/commercial-money";
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
const formatPrintDate = (value: unknown, ar: boolean) => {
  const date = new Date(String(value ?? ""));
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(ar ? "ar-TN" : "fr-TN", {
    day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Africa/Tunis",
  }).format(date);
};
const printNumber = (value: unknown, ar: boolean, digits = 3) =>
  new Intl.NumberFormat(ar ? "ar-TN" : "fr-TN", {
    minimumFractionDigits: digits, maximumFractionDigits: digits,
  }).format(Number(value ?? 0));
const quantityNumber = (value: unknown, ar: boolean) =>
  new Intl.NumberFormat(ar ? "ar-TN" : "fr-TN", {
    minimumFractionDigits: 0, maximumFractionDigits: 3,
  }).format(Number(value ?? 0));
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
function amountInWords(amount: number, ar: boolean): string {
  const millimes = Math.max(0, Math.round((Number(amount) || 0) * 1000));
  const dinars = Math.floor(millimes / 1000), rest = millimes % 1000;
  if (ar) {
    const main = dinars === 0 ? "صفر دينار" : arWords(dinars) + (dinars === 1 ? " دينار" : dinars === 2 ? " ديناران" : " دينارًا");
    return main + (rest ? " و" + arWords(rest) + " مليم" : "");
  }
  return frWords(dinars) + (dinars > 1 ? " dinars" : " dinar")
    + (rest ? " et " + frWords(rest) + " millime" + (rest > 1 ? "s" : "") : "");
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
    from: "من", to: "إلى", print: "طباعة / PDF", actions: "الإجراءات", editInvoice: "تعديل الفاتورة", newPayment: "مبلغ الدفعة الجديدة (مليم)", paymentDate: "تاريخ الدفع", paymentMethod: "طريقة الدفع", reference: "المرجع", save: "حفظ الدفعة", cancel: "إلغاء", opening: "الرصيد الافتتاحي", debit: "مدين", credit: "دائن", operation: "العملية", final: "الرصيد النهائي", payment: "دفعة", reversal: "عكس دفعة", creditNote: "إشعار دائن", creditApply: "تخصيص رصيد دائن (للعلم فقط)", noRows: "لا توجد بيانات", noBuyer: "اختر عميلاً لعرض حسابه", loading: "جار تحميل البيانات…", gross: "إجمالي الفواتير", outstanding: "إجمالي الديون", count: "عدد الفواتير", note: "كشف الحساب يحسب الإشعارات الدائنة مرة واحدة فقط؛ تخصيص الرصيد الدائن لا يُحتسب كدفعة ثانية.", all: "كل العملاء"
  } : {
    title: "Factures — Gestion Commerciale", subtitle: "Factures et comptes clients GS, séparés de l’application Oro Verde",
    invoices: "Factures", statement: "Relevé de compte clients", global: "Factures globales clients",
    buyer: "Client", choose: "Choisir un client", search: "Rechercher facture, client ou code de traçabilité",
    number: "N° facture", date: "Date", code: "Code de traçabilité", quantity: "Quantité (L)", unit: "Prix unitaire/L", total: "Total", paid: "Payé", credited: "Avoirs", balance: "Reste dû", status: "Paiement",
    from: "Du", to: "Au", print: "Imprimer / PDF", actions: "Actions", editInvoice: "Modifier la facture", newPayment: "Nouvelle somme payée (millimes)", paymentDate: "Date du paiement", paymentMethod: "Mode de paiement", reference: "Référence", save: "Enregistrer le paiement", cancel: "Annuler", opening: "Solde initial", debit: "Débit", credit: "Crédit", operation: "Opération", final: "Solde final", payment: "Paiement", reversal: "Annulation paiement", creditNote: "Avoir", creditApply: "Affectation d’avoir (informatif)", noRows: "Aucune donnée", noBuyer: "Choisissez un client pour afficher son compte", loading: "Chargement…", gross: "Total facturé", outstanding: "Total restant dû", count: "Nombre de factures", note: "Les avoirs sont comptés une seule fois ; leur affectation n’est pas comptée comme un second paiement.", all: "Tous les clients"
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
      const millimes = millimesInputNumber(paymentAmount);
      if (!Number.isSafeInteger(millimes) || millimes <= 0) throw new Error(ar ? "أدخل مبلغًا صحيحًا بالمليم" : "Saisissez un montant entier en millimes");
      const amount = millimesInputToDinars(paymentAmount);
      if (Number(amount) > Number(editingInvoice.outstanding_amount_dt ?? 0)) throw new Error(ar ? "المبلغ يتجاوز الرصيد المتبقي" : "Le montant dépasse le reste dû");
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
  const mill = invoices.find(x => x.mill_name || x.mill_logo || x.mill_address || x.mill_phone) ?? invoices[0];
  const printBuyerName = selectedBuyer?.name ?? (ar ? "جميع العملاء" : "Tous les clients");
  const printPeriod = start || end
    ? `${start ? formatPrintDate(start, ar) : "—"} — ${end ? formatPrintDate(end, ar) : "—"}`
    : (ar ? "كل الفترات" : "Toutes les périodes");
  const statementDebit = ledgerData.rows.reduce((sum, row) => sum + Number(row.debit ?? 0), 0);
  const statementCredit = ledgerData.rows.reduce((sum, row) => sum + Number(row.credit ?? 0), 0);

  return <div className="commercial-factures-print space-y-4 rounded-2xl bg-blue-50 p-2 pb-24 sm:p-4" dir={ar ? "rtl" : "ltr"}>
    <Card className="commercial-card border-blue-200 bg-blue-100 shadow-sm">
      <CardHeader className="border-b border-slate-100">
        <CardTitle className="text-slate-900">{labels.title}</CardTitle>
        <CardDescription className="text-slate-600">{labels.subtitle}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 pt-4 md:grid-cols-3">
        {(["invoices","statement","global"] as Mode[]).map((m) => {
          const palette = m === "invoices"
            ? {active:"border-blue-500 bg-blue-50 text-blue-950 shadow-sm",idle:"border-blue-100 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50/60",icon:"bg-blue-100 text-blue-700"}
            : m === "statement"
            ? {active:"border-emerald-500 bg-emerald-50 text-emerald-950 shadow-sm",idle:"border-emerald-100 bg-white text-slate-700 hover:border-emerald-300 hover:bg-emerald-50/60",icon:"bg-emerald-100 text-emerald-700"}
            : {active:"border-violet-500 bg-violet-50 text-violet-950 shadow-sm",idle:"border-violet-100 bg-white text-slate-700 hover:border-violet-300 hover:bg-violet-50/60",icon:"bg-violet-100 text-violet-700"};
          return <button key={m} type="button" onClick={() => setMode(m)} className={`flex items-center gap-3 rounded-xl border p-3 text-start transition-colors ${mode === m ? palette.active : palette.idle}`}>
            <span className={`rounded-lg p-2.5 ${palette.icon}`}>{m === "invoices" ? <FileText className="size-5"/> : m === "statement" ? <BookOpenCheck className="size-5"/> : <FileSpreadsheet className="size-5"/>}</span>
            <span className="font-semibold">{labels[m]}</span>
          </button>;
        })}
      </CardContent>
    </Card>
    <Card className="border-slate-300 bg-slate-100 shadow-sm">
      <CardContent className="grid gap-3 pt-5 md:grid-cols-4">
        <label className="grid gap-1 text-sm">{labels.buyer}<select className="h-10 rounded-lg border bg-background px-3" value={buyerId} onChange={e=>setBuyerId(e.target.value)}><option value="">{labels.all}</option>{buyers.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
        <label className="grid gap-1 text-sm">{labels.from}<Input type="date" value={start} onChange={e=>setStart(e.target.value)}/></label>
        <label className="grid gap-1 text-sm">{labels.to}<Input type="date" value={end} onChange={e=>setEnd(e.target.value)}/></label>
        <label className="grid gap-1 text-sm">{labels.search}<Input value={search} onChange={e=>setSearch(e.target.value)} placeholder={labels.search}/></label>
        <div className="md:col-span-4 flex justify-end"><Button variant="outline" onClick={print}><Printer className="mr-2 size-4"/>{labels.print}</Button></div>
      </CardContent>
    </Card>
    {mode !== "statement" && <div className="grid gap-3 sm:grid-cols-4">
      <Card className="border-2 border-sky-400 bg-sky-200 shadow-md"><CardHeader className="pb-2"><div className="flex items-center justify-between"><CardDescription className="font-semibold text-sky-800">{labels.count}</CardDescription><FileText className="size-5 text-sky-600"/></div><CardTitle className="text-2xl font-bold text-sky-950">{filtered.length}</CardTitle></CardHeader></Card>
      <Card className="border-2 border-indigo-400 bg-indigo-200 shadow-md"><CardHeader className="pb-2"><div className="flex items-center justify-between"><CardDescription className="font-semibold text-indigo-800">{labels.gross}</CardDescription><FileSpreadsheet className="size-5 text-indigo-600"/></div><CardTitle className="text-xl font-bold text-indigo-950">{money(totalGross)}</CardTitle></CardHeader></Card>
      <Card className="border-2 border-emerald-400 bg-emerald-200 shadow-md"><CardHeader className="pb-2"><div className="flex items-center justify-between"><CardDescription className="font-semibold text-emerald-800">{labels.paid}</CardDescription><BookOpenCheck className="size-5 text-emerald-600"/></div><CardTitle className="text-xl font-bold text-emerald-950">{money(totalPaid)}</CardTitle></CardHeader></Card>
      <Card className="border-2 border-rose-400 bg-rose-200 shadow-md"><CardHeader className="pb-2"><div className="flex items-center justify-between"><CardDescription className="font-semibold text-rose-800">{labels.outstanding}</CardDescription><FileText className="size-5 text-rose-600"/></div><CardTitle className="text-xl font-bold text-rose-950">{money(totalOutstanding)}</CardTitle></CardHeader></Card>
    </div>}
    {mode === "statement" && !buyerId && <p className="rounded-xl border p-6 text-center text-muted-foreground">{labels.noBuyer}</p>}
    {mode === "statement" && buyerId && <Card className="border-emerald-300 bg-emerald-50 shadow-sm">
      <CardHeader className="border-b border-emerald-100 bg-emerald-50/60"><CardTitle className="text-emerald-950">{labels.statement} — {selectedBuyer?.name}</CardTitle><CardDescription>{labels.note}</CardDescription></CardHeader>
      <CardContent>
        {buyerSummary.data && <div className="mb-4 grid gap-3 sm:grid-cols-3"><div className="rounded-lg border border-indigo-300 bg-indigo-100 p-3"><div className="text-xs font-semibold text-indigo-800">{labels.gross}</div><strong className="text-lg text-indigo-950">{money(buyerSummary.data.summary?.gross_invoiced_amount_dt)}</strong></div><div className="rounded-lg border border-emerald-300 bg-emerald-100 p-3"><div className="text-xs font-semibold text-emerald-800">{labels.paid}</div><strong className="text-lg text-emerald-950">{money(buyerSummary.data.summary?.settled_amount_dt)}</strong></div><div className="rounded-lg border border-rose-300 bg-rose-100 p-3"><div className="text-xs font-semibold text-rose-800">{labels.outstanding}</div><strong className="text-lg text-rose-950">{money(buyerSummary.data.summary?.outstanding_amount_dt)}</strong></div></div>}
        {ledgerQuery.isLoading ? <p className="py-5 text-center">{labels.loading}</p> : <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>{labels.date}</TableHead><TableHead>{labels.operation}</TableHead><TableHead>{labels.number}</TableHead><TableHead>{labels.debit}</TableHead><TableHead>{labels.credit}</TableHead><TableHead>{labels.balance}</TableHead></TableRow></TableHeader><TableBody>
          <TableRow><TableCell>—</TableCell><TableCell>{labels.opening}</TableCell><TableCell>—</TableCell><TableCell>—</TableCell><TableCell>—</TableCell><TableCell>{money(ledgerData.opening)}</TableCell></TableRow>
          {ledgerData.rows.map(row=><TableRow key={row.id}><TableCell>{dateText(row.date)}</TableCell><TableCell>{row.label}{row.detail ? <div className="text-xs text-muted-foreground">{row.detail}</div> : null}</TableCell><TableCell className="font-mono text-xs">{row.invoice ?? "—"}</TableCell><TableCell>{row.debit ? money(row.debit) : "—"}</TableCell><TableCell>{row.credit ? money(row.credit) : "—"}</TableCell><TableCell className="font-semibold">{money(row.running)}</TableCell></TableRow>)}
          {!ledgerData.rows.length && <TableRow><TableCell colSpan={6} className="text-center">{labels.noRows}</TableCell></TableRow>}\n          <TableRow className="font-bold"><TableCell>—</TableCell><TableCell>{labels.final}</TableCell><TableCell>—</TableCell><TableCell>—</TableCell><TableCell>—</TableCell><TableCell>{money(ledgerData.final)}</TableCell></TableRow>
        </TableBody></Table></div>}
      </CardContent>
    </Card>}
    {mode !== "statement" && <Card className="border-blue-300 bg-blue-100 shadow-sm">
      <CardHeader className="border-b border-blue-200 bg-blue-200"><CardTitle className="text-slate-900">{mode === "global" ? labels.global : labels.invoices}{buyerId ? " — " + selectedBuyer?.name : ""}</CardTitle><CardDescription>{mode === "global" ? (ar ? "مجموع الفواتير خلال الفترة المحددة للعميل المختار" : "Regroupement des factures du client sur la période sélectionnée") : labels.subtitle}</CardDescription></CardHeader>
      <CardContent><div className="overflow-x-auto"><Table><TableHeader><TableRow className="bg-blue-200 text-blue-950"><TableHead>{labels.number}</TableHead><TableHead>{labels.date}</TableHead><TableHead>{labels.buyer}</TableHead><TableHead>{labels.code}</TableHead><TableHead>{labels.quantity}</TableHead><TableHead>{labels.unit}</TableHead><TableHead>{labels.total}</TableHead><TableHead>{labels.paid}</TableHead><TableHead>{labels.credited}</TableHead><TableHead>{labels.balance}</TableHead><TableHead>{labels.status}</TableHead><TableHead>{labels.actions}</TableHead></TableRow></TableHeader><TableBody>
        {filtered.map(x=>{const b=buyers.find(y=>y.id===x.buyer_id);return <TableRow key={x.id} className={selectedInvoiceId===x.id?"bg-blue-200":"bg-blue-50 hover:bg-blue-100"} onClick={()=>setSelectedInvoiceId(x.id)}><TableCell className="font-mono font-semibold">{x.document_number}</TableCell><TableCell>{dateText(x.sale_date ?? x.created_at)}</TableCell><TableCell>{b?.name ?? "—"}</TableCell><TableCell className="font-mono">{x.batch_code ?? "—"}</TableCell><TableCell>{quantityNumber(x.quantity_kg, ar)}</TableCell><TableCell>{money(x.unit_price_dt)}</TableCell><TableCell className="font-semibold">{money(x.total_amount_dt)}</TableCell><TableCell>{money(x.paid_amount_dt)}</TableCell><TableCell>{money(x.credited_amount_dt)}</TableCell><TableCell>{money(x.outstanding_amount_dt)}</TableCell><TableCell>{statusText(x)}</TableCell><TableCell><div className="flex items-center gap-1"><Button size="icon" variant="outline" title={labels.print} aria-label={labels.print} onClick={()=>{setSelectedInvoiceId(x.id);window.setTimeout(()=>window.print(),150);}}><Printer className="size-4"/></Button>{isAdmin && <Button size="icon" variant="outline" title={labels.editInvoice} aria-label={labels.editInvoice} disabled={Number(x.outstanding_amount_dt ?? 0) <= 0} onClick={()=>{setEditingInvoiceId(x.id);setPaymentAmount("");setPaymentDate(new Date().toLocaleDateString("en-CA",{timeZone:"Africa/Tunis"}));setPaymentMethod("CASH");setPaymentReference("");}}><Pencil className="size-4"/></Button>}</div></TableCell></TableRow>})}
        {!filtered.length && <TableRow><TableCell colSpan={12} className="text-center">{labels.noRows}</TableCell></TableRow>}
      </TableBody></Table></div>
      {selectedInvoiceId && selectedInvoice && <div className="gs-invoice-detail-print mt-4 rounded-xl border border-rose-200 bg-rose-100 p-4 text-rose-950">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{ar ? "تفاصيل الفاتورة" : "Détail de la facture"} · {selectedInvoice.document_number}</h3><Button size="sm" variant="outline" onClick={print}><Printer className="mr-2 size-4"/>{labels.print}</Button></div>
        <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div><span className="text-muted-foreground">{labels.buyer}</span><p className="font-semibold">{buyers.find(b=>b.id===selectedInvoice.buyer_id)?.name ?? "—"}</p></div>
          <div><span className="text-muted-foreground">{labels.date}</span><p className="font-semibold">{dateText(selectedInvoice.sale_date ?? selectedInvoice.created_at)}</p></div>
          <div><span className="text-muted-foreground">{labels.code}</span><p className="font-mono font-semibold">{selectedInvoice.batch_code ?? "—"}</p></div>
          <div><span className="text-muted-foreground">{labels.status}</span><p className="font-semibold">{statusText(selectedInvoice)}</p></div>
          <div><span className="text-muted-foreground">{labels.quantity}</span><p className="font-semibold">{quantityNumber(selectedInvoice.quantity_kg, ar)}</p></div>
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
        {selectedInvoice && selectedInvoiceId && <article dir={ar ? "rtl" : "ltr"} className="gs-invoice-print hidden mx-auto max-w-3xl border border-stone-200 p-8 print:border-0">
          <header dir="ltr" className="flex items-start justify-between gap-5 border-b pb-5">
            <div className="flex shrink-0 items-start">{selectedInvoice.mill_logo ? <img src={selectedInvoice.mill_logo} alt="Logo" className="max-h-20 max-w-28 object-contain"/> : null}</div>
            <div dir={ar ? "rtl" : "ltr"} className={ar ? "text-right" : "text-left"}>
              <h1 className="text-2xl font-bold">{selectedInvoice.mill_name || "Huilerie Oro Verde"}</h1>
              <p>{selectedInvoice.mill_address || ""}</p><p>{selectedInvoice.mill_phone || ""}</p>
            </div>
            <div className="ml-auto shrink-0 text-right"><p className="text-sm text-stone-500">{labels.date}</p><strong>{formatPrintDate(selectedInvoice.sale_date ?? selectedInvoice.created_at, ar)}</strong></div>
          </header>
          <section dir="ltr" className="my-5 mb-6 flex items-start justify-between gap-6">
            <div dir={ar ? "rtl" : "ltr"} className={ar ? "min-w-0 flex-1 text-right" : "min-w-0 flex-1 text-left"}>
              <h2 className="text-3xl font-bold tracking-wide">{ar ? "فاتورة" : "FACTURE"}</h2>
              <p className="mt-2"><strong>{selectedInvoice.document_number}</strong></p>
            </div>
            <div dir={ar ? "rtl" : "ltr"} className="min-w-0 flex-1 rounded-lg bg-stone-50 p-4 text-right print:bg-white">
              <p className="text-sm text-stone-500">{ar ? "الحريف" : "Facturé à"}</p>
              <h3 className="text-lg font-bold">{buyers.find(b => b.id === selectedInvoice.buyer_id)?.name ?? "—"}</h3>
              <p>{buyers.find(b => b.id === selectedInvoice.buyer_id)?.phone ?? ""}</p>
              <p>{buyers.find(b => b.id === selectedInvoice.buyer_id)?.address ?? ""}</p>
            </div>
          </section>
          <table dir={ar ? "rtl" : "ltr"} className="w-full border-collapse bg-blue-50 text-sm print-color-adjust-exact">
            <thead><tr className="border-y border-blue-300 bg-blue-100 text-blue-950">
              <th className="p-3 text-left">{ar ? "المنتج" : "Désignation"}</th>
              <th className="p-3 text-right">{ar ? "الكمية" : "Quantité"}</th>
              <th className="p-3 text-right">{ar ? "السعر للوحدة / لتر" : "Prix unitaire / L"}</th>
              <th className="p-3 text-right">{ar ? "المجموع" : "Total"}</th>
            </tr></thead>
            <tbody><tr className="border-b">
              <td className="p-3">{ar ? "زيت زيتون" : "Huile d’olive"}</td>
              <td className="p-3 text-right">{quantityNumber(selectedInvoice.quantity_kg, ar)} L</td>
              <td className="p-3 text-right">{printNumber(selectedInvoice.unit_price_dt, ar, 3)}</td>
              <td className="p-3 text-right">{printNumber(selectedInvoice.total_amount_dt, ar, 3)}</td>
            </tr></tbody>
          </table>
          <div dir="ltr" className="mt-8 w-full space-y-3 rounded-xl border border-rose-200 bg-rose-100 p-4 text-left text-rose-950 print-color-adjust-exact">
            <div className="flex w-full items-center justify-between gap-4"><strong>{ar ? "المجموع" : "Total"}</strong><strong>{printNumber(selectedInvoice.total_amount_dt, ar)}</strong></div>
            <div className="flex w-full items-center justify-between gap-4"><strong>{ar ? "المدفوع" : "Payé"}</strong><strong>{printNumber(selectedInvoice.paid_amount_dt, ar)}</strong></div>
            {Number(selectedInvoice.credited_amount_dt ?? 0) > 0 && <div className="flex w-full items-center justify-between gap-4"><strong>{ar ? "الإشعارات الدائنة" : "Avoirs"}</strong><strong>{printNumber(selectedInvoice.credited_amount_dt, ar)}</strong></div>}
            <div className="flex w-full items-center justify-between gap-4 border-t pt-3 text-lg"><strong>{ar ? "الرصيد المتبقي" : "Reste dû"}</strong><strong>{printNumber(selectedInvoice.outstanding_amount_dt, ar)}</strong></div>
            <p dir="ltr" className="text-right text-sm italic text-stone-600">{amountInWords(Number(selectedInvoice.outstanding_amount_dt ?? 0), ar)}</p>
          </div>
          <footer className="mt-16 border-t pt-4 text-center text-xs text-stone-500">{ar ? "شكراً على ثقتكم." : "Merci pour votre confiance."}</footer>
        </article>}
      </CardContent>
    </Card>}
    {mode !== "invoices" && <article dir={ar ? "rtl" : "ltr"} className={`gs-account-print hidden mx-auto max-w-5xl border border-stone-200 bg-white p-8 text-stone-900 ${mode === "statement" ? "gs-account-print-statement" : "gs-account-print-global"}`}>
      <header dir="ltr" className="mb-6 flex items-start justify-between gap-5 border-b border-stone-300 pb-5">
        <div className="flex min-w-0 items-start gap-3">
          {mill?.mill_logo ? <img src={mill.mill_logo} alt="Logo" className="max-h-20 max-w-28 object-contain"/> : null}
          <div dir={ar ? "rtl" : "ltr"} className={ar ? "text-right" : "text-left"}>
            <h1 className="text-2xl font-bold">{mill?.mill_name || "Huilerie Oro Verde"}</h1>
            {mill?.mill_address ? <p className="text-sm text-stone-600">{mill.mill_address}</p> : null}
            {mill?.mill_phone ? <p className="text-sm text-stone-600">{mill.mill_phone}</p> : null}
          </div>
        </div>
        <div dir={ar ? "rtl" : "ltr"} className="shrink-0 text-right">
          <h2 className="text-xl font-bold">{mode === "statement" ? labels.statement : labels.global}</h2>
          <p className="mt-1 font-semibold">{printBuyerName}</p>
          {selectedBuyer?.phone ? <p className="text-sm text-stone-600">{selectedBuyer.phone}</p> : null}
          {selectedBuyer?.address ? <p className="text-sm text-stone-600">{selectedBuyer.address}</p> : null}
          <p className="mt-2 text-xs text-stone-500">{ar ? "تاريخ الطباعة" : "Date d’impression"} : {formatPrintDate(new Date().toISOString(), ar)}</p>
          <p className="text-xs text-stone-500">{printPeriod}</p>
        </div>
      </header>
      {mode === "global" ? <>
        <div className="mb-5 grid grid-cols-4 gap-3">
          <div className="rounded-lg border border-stone-200 p-3"><p className="text-xs text-stone-500">{labels.count}</p><strong>{filtered.length}</strong></div>
          <div className="rounded-lg border border-stone-200 p-3"><p className="text-xs text-stone-500">{labels.gross}</p><strong>{money(totalGross)}</strong></div>
          <div className="rounded-lg border border-stone-200 p-3"><p className="text-xs text-stone-500">{labels.paid}</p><strong>{money(totalPaid)}</strong></div>
          <div className="rounded-lg border border-stone-200 p-3"><p className="text-xs text-stone-500">{labels.outstanding}</p><strong>{money(totalOutstanding)}</strong></div>
        </div>
        <table className="w-full table-fixed border-collapse text-[9pt]">
          <colgroup><col style={{width:"12%"}}/><col style={{width:"15%"}}/><col style={{width:"16%"}}/><col style={{width:"10%"}}/><col style={{width:"12%"}}/><col style={{width:"12%"}}/><col style={{width:"11%"}}/><col style={{width:"12%"}}/></colgroup>
          <thead><tr className="bg-stone-100">{[labels.date,labels.number,labels.code,labels.quantity,labels.total,labels.paid,labels.credited,labels.balance].map(label=><th key={label} className="border border-stone-300 p-2 text-start">{label}</th>)}</tr></thead>
          <tbody>
            {filtered.map(x=><tr key={x.id} className="gs-print-row">
              <td className="border-b border-stone-200 p-2">{dateText(x.sale_date ?? x.created_at)}</td>
              <td className="border-b border-stone-200 p-2 font-semibold">{x.document_number}</td>
              <td className="border-b border-stone-200 p-2 font-mono">{x.batch_code ?? "—"}</td>
              <td className="border-b border-stone-200 p-2">{quantityNumber(x.quantity_kg, ar)} L</td>
              <td className="border-b border-stone-200 p-2">{money(x.total_amount_dt)}</td>
              <td className="border-b border-stone-200 p-2">{money(x.paid_amount_dt)}</td>
              <td className="border-b border-stone-200 p-2">{money(x.credited_amount_dt)}</td>
              <td className="border-b border-stone-200 p-2 font-semibold">{money(x.outstanding_amount_dt)}</td>
            </tr>)}
            {!filtered.length && <tr><td colSpan={8} className="p-5 text-center">{labels.noRows}</td></tr>}
            <tr className="border-t-2 border-stone-400 bg-stone-50 font-bold">
              <td colSpan={4} className="p-2">{ar ? "المجموع النهائي" : "Total final"}</td>
              <td className="p-2">{money(totalGross)}</td><td className="p-2">{money(totalPaid)}</td><td className="p-2">{money(filtered.reduce((sum,x)=>sum+Number(x.credited_amount_dt ?? 0),0))}</td><td className="p-2">{money(totalOutstanding)}</td>
            </tr>
          </tbody>
        </table>
      </> : <>
        <div className="mb-5 grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-stone-200 p-3"><p className="text-xs text-stone-500">{labels.opening}</p><strong>{money(ledgerData.opening)}</strong></div>
          <div className="rounded-lg border border-stone-200 p-3"><p className="text-xs text-stone-500">{labels.debit}</p><strong>{money(statementDebit)}</strong></div>
          <div className="rounded-lg border border-stone-200 p-3"><p className="text-xs text-stone-500">{labels.credit}</p><strong>{money(statementCredit)}</strong></div>
        </div>
        <table className="w-full table-fixed border-collapse text-[9pt]">
          <colgroup><col style={{width:"12%"}}/><col style={{width:"28%"}}/><col style={{width:"16%"}}/><col style={{width:"14%"}}/><col style={{width:"14%"}}/><col style={{width:"16%"}}/></colgroup>
          <thead><tr className="bg-stone-100">{[labels.date,labels.operation,labels.number,labels.debit,labels.credit,labels.balance].map(label=><th key={label} className="border border-stone-300 p-2 text-start">{label}</th>)}</tr></thead>
          <tbody>
            <tr><td className="border-b border-stone-200 p-2">—</td><td className="border-b border-stone-200 p-2">{labels.opening}</td><td className="border-b border-stone-200 p-2">—</td><td className="border-b border-stone-200 p-2">—</td><td className="border-b border-stone-200 p-2">—</td><td className="border-b border-stone-200 p-2 font-semibold">{money(ledgerData.opening)}</td></tr>
            {ledgerData.rows.map(row=><tr key={row.id} className="gs-print-row">
              <td className="border-b border-stone-200 p-2">{dateText(row.date)}</td>
              <td className="border-b border-stone-200 p-2">{row.label}{row.detail ? <small className="block text-stone-500">{row.detail}</small> : null}</td>
              <td className="border-b border-stone-200 p-2 font-mono">{row.invoice ?? "—"}</td>
              <td className="border-b border-stone-200 p-2">{Number(row.debit) ? money(row.debit) : "—"}</td>
              <td className="border-b border-stone-200 p-2">{Number(row.credit) ? money(row.credit) : "—"}</td>
              <td className="border-b border-stone-200 p-2 font-semibold">{row.informational ? "—" : money(row.running)}</td>
            </tr>)}
            {!ledgerData.rows.length && <tr><td colSpan={6} className="p-5 text-center">{labels.noRows}</td></tr>}
            <tr className="border-t-2 border-stone-400 bg-stone-50 font-bold">
              <td colSpan={3} className="p-2">{labels.final}</td><td className="p-2">{money(statementDebit)}</td><td className="p-2">{money(statementCredit)}</td><td className="p-2">{money(ledgerData.final)}</td>
            </tr>
          </tbody>
        </table>
        <p className="mt-3 text-xs text-stone-500">{labels.note}</p>
      </>}
      <footer className="mt-12 border-t border-stone-300 pt-4 text-center text-xs text-stone-500">{ar ? "مع الشكر على ثقتكم." : "Merci pour votre confiance."}</footer>
    </article>}
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
        <p className="text-sm text-muted-foreground">{ar ? "أدخل المبلغ بالمليم: 1500 تعني 1,500 دينار. أدخل الدفعة الجديدة فقط؛ سيتم تحديث المدفوع والمتبقي تلقائيًا." : "Saisissez le montant en millimes : 1500 = 1,500 TND. Saisissez uniquement le nouveau paiement ; le payé et le reste dû seront recalculés automatiquement."}</p>
        <label className="grid gap-1 text-sm font-medium">{labels.newPayment}<Input type="number" min="1" step="1" max={Math.round(Number(editingInvoice.outstanding_amount_dt ?? 0) * 1000)} inputMode="numeric" value={paymentAmount} onChange={e=>setPaymentAmount(e.target.value)} placeholder="1500"/></label>
        <label className="grid gap-1 text-sm font-medium">{labels.paymentDate}<Input type="date" value={paymentDate} onChange={e=>setPaymentDate(e.target.value)}/></label>
        <label className="grid gap-1 text-sm font-medium">{labels.paymentMethod}<select className="h-10 rounded-md border bg-background px-3" value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value as "CASH" | "BANK_TRANSFER" | "CHEQUE")}><option value="CASH">{ar ? "نقدًا" : "Espèces"}</option><option value="BANK_TRANSFER">{ar ? "تحويل بنكي" : "Virement bancaire"}</option><option value="CHEQUE">{ar ? "صك" : "Chèque"}</option></select></label>
        {paymentMethod !== "CASH" && <label className="grid gap-1 text-sm font-medium">{labels.reference}<Input value={paymentReference} onChange={e=>setPaymentReference(e.target.value)} placeholder={labels.reference}/></label>}
        {editingInvoice.version == null && <p className="text-sm text-destructive">{ar ? "تعذر تعديل الفاتورة: إصدار السجل غير متوفر." : "Modification impossible : version de facture indisponible."}</p>}
      </div>
      <div className="mt-4 flex justify-end gap-2 border-t pt-3"><Button variant="outline" onClick={()=>setEditingInvoiceId("")}>{labels.cancel}</Button><Button disabled={addPayment.isPending || !paymentAmount.trim() || !paymentDate || editingInvoice.version == null} onClick={()=>addPayment.mutate()}><Save className="mr-2 size-4"/>{addPayment.isPending ? (ar ? "جار الحفظ…" : "Enregistrement…") : labels.save}</Button></div>
    </div></div>}
    <style>{`@page { margin: 5mm !important; } @media print { body * { visibility: hidden !important; } ${mode === "invoices" ? ".gs-invoice-print, .gs-invoice-print * { visibility: visible !important; } .gs-invoice-print { display: block !important; position: absolute !important; inset: 0 !important; width: 100% !important; max-width: none !important; margin: 0 !important; padding: 4mm !important; background: white !important; border: 0 !important; }" : ".gs-account-print, .gs-account-print * { visibility: visible !important; } .gs-account-print { display: block !important; position: absolute !important; inset: 0 !important; width: 100% !important; max-width: none !important; margin: 0 !important; padding: 4mm !important; background: white !important; border: 0 !important; }"} .gs-print-row { break-inside: avoid !important; page-break-inside: avoid !important; } .gs-account-print table { width: 100% !important; } .gs-account-print th, .gs-account-print td { overflow-wrap: anywhere !important; padding: 4px 5px !important; } .gs-account-print thead { display: table-header-group !important; } .gs-account-print tfoot { display: table-footer-group !important; } }`}</style>
  </div>;
}
