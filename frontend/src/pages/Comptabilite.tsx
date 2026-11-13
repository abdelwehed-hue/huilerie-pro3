import { useMemo, useState, type ReactNode } from "react";
import SituationJournaliere from "@/components/accounting/SituationJournaliere";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPost } from "@/lib/api";
import { fmtMoney, useI18n } from "@/lib/i18n";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard, type Tone } from "@/components/shared";
import { RefreshCw, TrendingUp, Wallet, Package, AlertTriangle, ReceiptText, Plus, Trash2, type LucideIcon } from "lucide-react";

type Row = Record<string, any>;
type PassiveIncome = { id: string; income_type: string; description: string; income_date: string; amount_tnd: string; payment_method: string; notes?: string };
type PassiveIncomeForm = Omit<PassiveIncome, "id" | "notes"> & { notes: string };
type AccountingExpense = { id:string; expense_type:string; description:string; expense_date:string; amount_tnd:string; payment_method:string; beneficiary?:string; notes?:string };
type ExpenseForm = Omit<AccountingExpense,"id"|"notes"> & {notes:string};
type AccountingInvestment = { id:string; investment_type:string; description:string; investment_date:string; amount_tnd:string; payment_method:string; supplier?:string; notes?:string };
const expenseTypeLabels: Record<string,string> = {ELECTRICITY:"Électricité",WAGES:"Salaires",MAINTENANCE:"Entretien et réparation",FUEL:"Carburant",TRANSPORT:"Transport",SUPPLIES:"Fournitures",RENT:"Loyer",INSURANCE:"Assurance",TAXES:"Taxes et impôts",OTHER:"Autre dépense"};
const passiveTypeLabels: Record<string, string> = { RENT: "Location de local / entrepôt", EQUIPMENT_RENTAL: "Location de matériel", INTEREST: "Intérêts", INVESTMENT: "Investissement", OTHER: "Autre revenu" };
const paymentLabels: Record<string, string> = { CASH: "Espèces", BANK_TRANSFER: "Virement bancaire", CHEQUE: "Chèque", OTHER: "Autre" };
const expenseTypeLabelsAr: Record<string, string> = { ELECTRICITY: "الكهرباء", WAGES: "الأجور", MAINTENANCE: "الصيانة والإصلاح", FUEL: "الوقود", TRANSPORT: "النقل", SUPPLIES: "المستلزمات", RENT: "الكراء", INSURANCE: "التأمين", TAXES: "الضرائب والأداءات", OTHER: "مصاريف أخرى" };
const passiveTypeLabelsAr: Record<string, string> = { RENT: "كراء محل / مستودع", EQUIPMENT_RENTAL: "كراء المعدات", INTEREST: "فوائد", INVESTMENT: "استثمار", OTHER: "مدخول آخر" };
const paymentLabelsAr: Record<string, string> = { CASH: "نقداً", BANK_TRANSFER: "تحويل بنكي", CHEQUE: "شيك", OTHER: "أخرى" };
type Overview = {
  active_season: string;
  season_code: string;
  traditional_invoices: Row[];
  supplier_olive_purchases: Row[];
  supplier_olive_purchase_payments: Row[];
  customer_ownership_transfers: Row[];
  customer_olive_purchases: Row[];
  customer_oil_purchases: Row[];
  customer_olive_purchase_payments: Row[];
  commercial_sales_invoices: Row[];
  commercial_sale_payments: Row[];
  customer_oil_purchase_payments: Row[];
  commercial_credit_notes: Row[];
  suppliers: Row[];
  summary: {
    pressing_revenue_total: number | string;
    pressing_collected_total: number | string;
    gs_sales_revenue_total: number | string;
    gs_sales_collected_total: number | string;
    supplier_olive_purchase_total: number | string;
    supplier_olive_paid_total: number | string;
    supplier_olive_outstanding_total: number | string;
    customer_olive_purchase_total: number | string;
    customer_olive_paid_total: number | string;
    customer_oil_purchase_total: number | string;
    customer_oil_paid_total: number | string;
  };
  recent_limit: number;
};

const n = (v: unknown) => {
  const value = Number(v ?? 0);
  return Number.isFinite(value) ? value : 0;
};
const money = (v: unknown) => {
  // Values already converted to integer millimes (BigInt) must not be scaled a second time.
  const amount = typeof v === "bigint" ? v : mills(v);
  const negative = amount < 0n;
  const absolute = negative ? -amount : amount;
  const whole = absolute / 1000n;
  const fraction = String(absolute % 1000n).padStart(3, "0");
  const formatted = fmtMoney(`${negative ? "-" : ""}${whole}.${fraction}`);
  return formatted;
};
const mills = (value: unknown): bigint => {
  const raw = String(value ?? "0").trim();
  const match = raw.match(/^([+-]?)(\d+)(?:\.(\d+))?$/);
  if (!match) return 0n;
  const sign = match[1] === "-" ? -1n : 1n;
  const fraction = (match[3] || "").padEnd(3, "0").slice(0, 3);
  return sign * (BigInt(match[2]) * 1000n + BigInt(fraction || "0"));
};
const addMoney = (...values: unknown[]) => values.reduce<bigint>((total, value) => total + mills(value), 0n);
const dateOf = (r: Row) => String(r.purchase_date || r.sale_date || r.day || r.created_at || "").slice(0, 10);
const sum = (rows: Row[], field: string) => rows.reduce((total, row) => total + n(row[field]), 0);

function Metric({ title, value, detail, icon: Icon, tone }: {
  title: string; value: string; detail: string; icon: LucideIcon; tone: Tone;
}) {
  return <StatCard
    label={title}
    value={value}
    sub={detail}
    tone={tone}
    icon={<Icon />}
  />;
}

function DataTable({ title, description, rows, columns, empty }: {
  title: string; description: string; rows: Row[];
  columns: Array<{ label: string; render: (row: Row) => ReactNode }>;
  empty: string;
}) {
  return <Card className="border-stone-200 shadow-sm">
    <CardHeader className="pb-3">
      <CardTitle className="text-base">{title}</CardTitle>
      <CardDescription>{description}</CardDescription>
    </CardHeader>
    <CardContent>
      {rows.length === 0 ? <p className="rounded-lg bg-stone-50 p-4 text-sm text-stone-500">{empty}</p> :
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead><tr className="border-b text-left text-xs text-stone-500">
              {columns.map((col) => <th key={col.label} className="px-3 py-2 font-semibold">{col.label}</th>)}
            </tr></thead>
            <tbody>{rows.map((row, index) => <tr key={String(row.id || row.document_number || index)} className="border-b last:border-0 hover:bg-stone-50/70">
              {columns.map((col) => <td key={col.label} className="px-3 py-2.5 align-top text-stone-700">{col.render(row)}</td>)}
            </tr>)}</tbody>
          </table>
        </div>}
    </CardContent>
  </Card>;
}

export default function Comptabilite() {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const query = useQuery({
    queryKey: ["accounting-overview"],
    queryFn: () => apiGet<Overview>("/accounting/overview"),
    staleTime: 30_000,
  });
  const data = query.data;
  const [activeTab, setActiveTab] = useState<"overview" | "daily">("overview");
  const queryClient = useQueryClient();
  const passiveQuery = useQuery({
    queryKey: ["accounting-passive-incomes"],
    queryFn: () => apiGet<PassiveIncome[]>("/accounting/passive-incomes"),
    staleTime: 30_000,
  });
  const [passiveForm, setPassiveForm] = useState<PassiveIncomeForm>({
    income_type: "RENT", description: "", income_date: new Date().toISOString().slice(0, 10),
    amount_tnd: "", payment_method: "CASH", notes: "",
  });
  const createPassiveIncome = useMutation({
    mutationFn: (payload: PassiveIncomeForm) => apiPost<PassiveIncome>("/accounting/passive-incomes", payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["accounting-passive-incomes"] });
      setPassiveForm({ income_type: "RENT", description: "", income_date: new Date().toISOString().slice(0, 10), amount_tnd: "", payment_method: "CASH", notes: "" });
    },
  });
  const deletePassiveIncome = useMutation({
    mutationFn: (id: string) => apiDelete("/accounting/passive-incomes/" + encodeURIComponent(id)),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["accounting-passive-incomes"] }),
  });
  const passiveIncomes = passiveQuery.data ?? [];
  const passiveIncomeTotal = passiveIncomes.reduce((total, item) => total + mills(item.amount_tnd), 0n);
  const expenseQuery = useQuery({queryKey:["accounting-expenses"],queryFn:()=>apiGet<AccountingExpense[]>("/accounting/expenses"),staleTime:30_000});
  const [expenseForm,setExpenseForm]=useState<ExpenseForm>({expense_type:"ELECTRICITY",description:"",expense_date:new Date().toISOString().slice(0,10),amount_tnd:"",payment_method:"CASH",beneficiary:"",notes:""});
  const createExpense=useMutation({mutationFn:(payload:ExpenseForm)=>apiPost<AccountingExpense>("/accounting/expenses",payload),onSuccess:()=>{void queryClient.invalidateQueries({queryKey:["accounting-expenses"]});setExpenseForm({expense_type:"ELECTRICITY",description:"",expense_date:new Date().toISOString().slice(0,10),amount_tnd:"",payment_method:"CASH",beneficiary:"",notes:""});}});
  const deleteExpense=useMutation({mutationFn:(id:string)=>apiDelete("/accounting/expenses/"+encodeURIComponent(id)),onSuccess:()=>void queryClient.invalidateQueries({queryKey:["accounting-expenses"]})});
  const expenses=expenseQuery.data??[];
  const expenseTotal=expenses.reduce((t,x)=>t+mills(x.amount_tnd),0n);
  const outgoingPayments: Row[] = [
    ...(data?.supplier_olive_purchase_payments || []).map(r => ({
      ...r, outflow_date: r.payment_date || r.created_at, outflow_category: "Paiements fournisseurs",
      outflow_party: r.supplier_name || "—", outflow_reference: r.document_number || r.purchase_number || "—",
      outflow_method: r.method, outflow_amount: r.amount_tnd,
    })),
    ...(data?.customer_olive_purchase_payments || []).map(r => ({
      ...r, outflow_date: r.payment_date || r.paid_at || r.created_at || r.day,
      outflow_category: "Paiements achats clients — olives", outflow_party: r.customer_name || r.client_name || "—",
      outflow_reference: r.document_number || r.payment_number || r.id || "—",
      outflow_method: r.payment_method, outflow_amount: r.amount_tnd || r.amount_dt || r.amount,
    })),
    ...(data?.customer_oil_purchase_payments || []).map(r => ({
      ...r, outflow_date: r.payment_date || r.paid_at || r.created_at || r.day,
      outflow_category: "Paiements achats clients — huile", outflow_party: r.customer_name || r.client_name || "—",
      outflow_reference: r.document_number || r.payment_number || r.id || "—",
      outflow_method: r.payment_method, outflow_amount: r.amount_tnd || r.amount_dt || r.amount,
    })),
  ].sort((a,b) => String(b.outflow_date || "").localeCompare(String(a.outflow_date || "")));
  const outgoingPaymentsTotal = outgoingPayments.reduce((total, row) => total + mills(row.outflow_amount), 0n);
 
  const calculated = useMemo(() => {
    const supplierPurchases = (data?.supplier_olive_purchases || []).filter(r => r.status === "APPROVED");
    const customerOlivePurchases = data?.customer_olive_purchases || [];
    const customerOilPurchases = data?.customer_oil_purchases || [];
    const summary = data?.summary;
    return {
      // Cash-basis accounting: only amounts actually collected count as service revenue.
      serviceRevenue: mills(summary?.pressing_collected_total),
      // Cash-basis accounting: only amounts actually collected count as GS sales revenue.
      salesRevenue: mills(summary?.gs_sales_collected_total),
      stockPurchases: mills(summary?.supplier_olive_purchase_total),
      supplierPaid: mills(summary?.supplier_olive_paid_total),
      supplierOutstanding: mills(summary?.supplier_olive_outstanding_total),
      // All accounting card totals use the same decimal-TND -> integer-millimes conversion.
      customerOlivePurchaseTotal: mills(summary?.customer_olive_purchase_total),
      customerOilPurchaseTotal: mills(summary?.customer_oil_purchase_total),
      serviceCollected: mills(summary?.pressing_collected_total),
      gsCollected: mills(summary?.gs_sales_collected_total),
      olivePaid: mills(summary?.customer_olive_paid_total),
      oilPaid: mills(summary?.customer_oil_paid_total),
      supplierPurchases,
      customerOlivePurchases,
      customerOilPurchases,
    };
  }, [data]);

  if (query.isPending) return <div className="mx-auto max-w-7xl p-6 text-stone-600">{ar ? "جارٍ تحميل البيانات المحاسبية…" : "Chargement des données comptables…"}</div>;
  if (query.isError || !data) return <div className="mx-auto max-w-7xl p-6">
    <Card className="border-red-200"><CardContent className="flex items-center gap-3 p-5 text-red-800">
      <AlertTriangle className="size-5" /> {ar ? "تعذّر تحميل البيانات المحاسبية. تحقق من الجلسة ثم أعد المحاولة." : "Impossible de charger les données comptables. Vérifiez la session et réessayez."}
      <button className="ms-auto inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm" onClick={() => void query.refetch()}><RefreshCw className="size-4" /> {ar ? "إعادة المحاولة" : "Réessayer"}</button>
    </CardContent></Card>
  </div>;

  const serviceRows = data.traditional_invoices || [];
  const saleRows = data.commercial_sales_invoices || [];
  const fmt = (value: unknown) => money(value);
  return <div className="mx-auto max-w-7xl space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="flex items-center gap-2"><ReceiptText className="size-6 text-emerald-700" /><h1 className="text-2xl font-bold text-stone-900">{ar ? "المحاسبة" : "Comptabilité"}</h1></div>
        <p className="mt-1 text-sm text-stone-500">{ar ? "عرض موحّد لـ Oro Verde والتسيير التجاري · الموسم الحالي:" : "Vue consolidée Oro Verde et Gestion Commerciale · saison active :"} {data.active_season} · {ar ? "للقراءة فقط" : "lecture seule"}</p>
      </div>
      <button onClick={() => void query.refetch()} className="inline-flex items-center gap-2 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"><RefreshCw className="size-4" /> {ar ? "تحديث" : "Actualiser"}</button>
    </div>

    <div className="flex flex-wrap gap-2 border-b border-stone-200 pb-3 no-print">
      <button type="button" onClick={() => setActiveTab("overview")} className={`rounded-lg px-4 py-2 text-sm font-semibold ${activeTab === "overview" ? "bg-emerald-700 text-white" : "bg-stone-100 text-stone-700 hover:bg-stone-200"}`}>{ar ? "نظرة عامة" : "Vue générale"}</button>
      <button type="button" onClick={() => setActiveTab("daily")} className={`rounded-lg px-4 py-2 text-sm font-semibold ${activeTab === "daily" ? "bg-emerald-700 text-white" : "bg-stone-100 text-stone-700 hover:bg-stone-200"}`}>{ar ? "الوضعية اليومية" : "Situation journalière"}</button>
    </div>

    {activeTab === "overview" && <>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric title={ar ? "مداخيل الخدمات" : "Revenus de prestation"} value={fmt(calculated.serviceRevenue)} detail={ar ? "المبالغ المقبوضة فعلياً مقابل الخدمات · الموسم الحالي" : "Montants réellement encaissés sur les prestations · saison active"} icon={TrendingUp} tone="olive" />
      <Metric title={ar ? "مبيعات الزيت GS" : "Ventes d’huile GS"} value={fmt(calculated.salesRevenue)} detail={ar ? "المبالغ المقبوضة فعلياً من المبيعات · الموسم الحالي" : "Montants réellement encaissés sur les ventes · saison active"} icon={TrendingUp} tone="sky" />
      <Metric title={ar ? "مشتريات الزيتون من المزوّدين" : "Achats d’olives fournisseurs"} value={fmt(calculated.stockPurchases)} detail={ar ? "إجمالي المشتريات المصادق عليها · GS" : "Montant total des achats approuvés · GS"} icon={Package} tone="gold" />
      <Metric title={ar ? "دفعات المزوّدين" : "Paiements fournisseurs"} value={fmt(calculated.supplierPaid)} detail={ar ? "المبالغ المدفوعة فعلياً للمزوّدين" : "Sommes réellement réglées aux fournisseurs"} icon={Wallet} tone="rose" />
      <Metric title={ar ? "ديون المزوّدين" : "Dettes fournisseurs"} value={fmt(calculated.supplierOutstanding)} detail={ar ? "الرصيد المتبقي للدفع للمزوّدين" : "Solde restant à payer aux fournisseurs"} icon={AlertTriangle} tone="orange" />
      <Metric title={ar ? "شراء الزيتون من الحرفاء" : "Achats d’olives aux clients"} value={fmt(calculated.customerOlivePurchaseTotal)} detail={ar ? "سندات BAH · معروضة بشكل منفصل عن مشتريات المزوّدين" : "Bons BAH · présentés séparément des achats fournisseurs"} icon={Package} tone="orange" />
      <Metric title={ar ? "شراء الزيت من الحرفاء" : "Achats d’huile aux clients"} value={fmt(calculated.customerOilPurchaseTotal)} detail={ar ? "سندات BAH · معروضة بشكل منفصل عن مشتريات المزوّدين" : "Bons BAH · présentés séparément des achats fournisseurs"} icon={Package} tone="gold" />
      <Metric title={ar ? "مقبوضات الحرفاء" : "Encaissements clients"} value={fmt(calculated.serviceCollected + calculated.gsCollected)} detail={ar ? "الدفعات المستلمة على الفواتير · الموسم الحالي" : "Règlements cumulés sur factures · saison active"} icon={Wallet} tone="violet" />
      <Metric title={ar ? "دفعات مشتريات الحرفاء" : "Paiements achats clients"} value={fmt(calculated.olivePaid + calculated.oilPaid)} detail={ar ? "دفعات RPA مقابل الزيت والزيتون · الموسم الحالي" : "Paiements RPA pour huile et olives · saison active"} icon={Wallet} tone="rose" />
    </div>

    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="border-emerald-200 bg-emerald-50/40">
        <CardHeader><CardTitle className="flex items-center gap-2 text-emerald-900"><TrendingUp className="size-5" /> {ar ? "المداخيل الفعلية" : "Revenus actifs"}</CardTitle><CardDescription>{ar ? "المبالغ المقبوضة فعلياً من الخدمات ومبيعات GS" : "Encaissements réellement reçus sur les prestations et les ventes GS"}</CardDescription></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between gap-3"><span>{ar ? "خدمات العصر" : "Prestation de trituration"}</span><strong>{fmt(calculated.serviceRevenue)}</strong></div>
          <div className="flex justify-between gap-3"><span>{ar ? "بيع الزيت — GS" : "Vente d’huile — GS"}</span><strong>{fmt(calculated.salesRevenue)}</strong></div>
          <div className="mt-2 flex justify-between border-t border-emerald-200 pt-3 text-base font-bold text-emerald-900"><span>{ar ? "الإجمالي" : "Total"}</span><span>{fmt(calculated.serviceRevenue + calculated.salesRevenue)}</span></div>
        </CardContent>
      </Card>
      <Card className="border-sky-200 bg-sky-50/40">
        <CardHeader><CardTitle className="flex items-center gap-2 text-sky-900"><TrendingUp className="size-5" /> {ar ? "المداخيل الأخرى" : "Revenus passifs"}</CardTitle><CardDescription>{ar ? "تسجيل المداخيل الإضافية للموسم الحالي" : "Enregistrement des revenus complémentaires de la saison active"}</CardDescription></CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1"><span className="font-medium">{ar ? "نوع المدخول" : "Type de revenu"}</span><select className="w-full rounded-lg border bg-white px-3 py-2" value={passiveForm.income_type} onChange={e=>setPassiveForm(v=>({...v,income_type:e.target.value}))}><option value="RENT">{ar ? "كراء محل / مستودع" : "Location de local / entrepôt"}</option><option value="EQUIPMENT_RENTAL">{ar ? "كراء المعدات" : "Location de matériel"}</option><option value="INTEREST">{ar ? "فوائد" : "Intérêts"}</option><option value="INVESTMENT">{ar ? "استثمار" : "Investissement"}</option><option value="OTHER">{ar ? "مدخول آخر" : "Autre revenu"}</option></select></label>
            <label className="space-y-1"><span className="font-medium">{ar ? "التاريخ" : "Date"}</span><input type="date" required className="w-full rounded-lg border bg-white px-3 py-2" value={passiveForm.income_date} onChange={e=>setPassiveForm(v=>({...v,income_date:e.target.value}))}/></label>
            <label className="space-y-1 sm:col-span-2"><span className="font-medium">{ar ? "الوصف" : "Description"}</span><input required minLength={2} maxLength={180} className="w-full rounded-lg border bg-white px-3 py-2" placeholder={ar ? "مثال: كراء المستودع" : "Ex. Location du dépôt"} value={passiveForm.description} onChange={e=>setPassiveForm(v=>({...v,description:e.target.value}))}/></label>
            <label className="space-y-1"><span className="font-medium">{ar ? "المبلغ" : "Montant (TND)"}</span><input type="number" min="0.001" step="0.001" required className="w-full rounded-lg border bg-white px-3 py-2" placeholder="0.000" value={passiveForm.amount_tnd} onChange={e=>setPassiveForm(v=>({...v,amount_tnd:e.target.value}))}/></label>
            <label className="space-y-1"><span className="font-medium">{ar ? "طريقة الدفع" : "Mode de paiement"}</span><select className="w-full rounded-lg border bg-white px-3 py-2" value={passiveForm.payment_method} onChange={e=>setPassiveForm(v=>({...v,payment_method:e.target.value}))}><option value="CASH">{ar ? "نقداً" : "Espèces"}</option><option value="BANK_TRANSFER">{ar ? "تحويل بنكي" : "Virement bancaire"}</option><option value="CHEQUE">{ar ? "شيك" : "Chèque"}</option><option value="OTHER">{ar ? "أخرى" : "Autre"}</option></select></label>
            <label className="space-y-1 sm:col-span-2"><span className="font-medium">{ar ? "ملاحظات (اختياري)" : "Notes (facultatif)"}</span><textarea rows={2} maxLength={500} className="w-full rounded-lg border bg-white px-3 py-2" value={passiveForm.notes} onChange={e=>setPassiveForm(v=>({...v,notes:e.target.value}))}/></label>
          </div>
          <button type="button" disabled={createPassiveIncome.isPending || !passiveForm.description.trim() || !passiveForm.amount_tnd} onClick={()=>createPassiveIncome.mutate(passiveForm)} className="inline-flex items-center gap-2 rounded-lg bg-sky-700 px-4 py-2 font-semibold text-white disabled:opacity-50"><Plus className="size-4"/>{createPassiveIncome.isPending ? (ar ? "جارٍ التسجيل…" : "Enregistrement…") : (ar ? "إضافة مدخول" : "Ajouter le revenu")}</button>
          {createPassiveIncome.isError && <p className="text-red-700">{ar ? "خطأ:" : "Erreur :"} {createPassiveIncome.error.message}</p>}
          {passiveQuery.isError && <p className="text-red-700">{ar ? "تعذّر تحميل المداخيل الأخرى." : "Impossible de charger les revenus passifs."}</p>}
          <div className="overflow-x-auto rounded-lg border border-sky-200 bg-white"><table className="w-full min-w-[620px] text-sm">
            <thead><tr className="border-b bg-sky-50 text-left text-xs"><th className="px-3 py-2">{ar ? "التاريخ" : "Date"}</th><th className="px-3 py-2">{ar ? "النوع / الوصف" : "Type / description"}</th><th className="px-3 py-2">{ar ? "الدفع" : "Paiement"}</th><th className="px-3 py-2 text-right">{ar ? "المبلغ" : "Montant"}</th><th className="px-3 py-2">{ar ? "إجراء" : "Action"}</th></tr></thead>
            <tbody>{passiveIncomes.length===0 ? <tr><td colSpan={5} className="px-3 py-4 text-center text-stone-500">{passiveQuery.isPending ? "Chargement…" : (ar ? "لا توجد مداخيل أخرى مسجلة لهذا الموسم." : "Aucun revenu passif enregistré pour cette saison.")}</td></tr> : passiveIncomes.map(item=><tr key={item.id} className="border-b last:border-0"><td className="px-3 py-2">{item.income_date}</td><td className="px-3 py-2"><div className="font-medium">{(ar ? passiveTypeLabelsAr[item.income_type] : passiveTypeLabels[item.income_type]) || item.income_type}</div><div>{item.description}</div>{item.notes && <div className="text-xs text-stone-500">{item.notes}</div>}</td><td className="px-3 py-2">{(ar ? paymentLabelsAr[item.payment_method] : paymentLabels[item.payment_method]) || item.payment_method}</td><td className="px-3 py-2 text-right font-semibold">{fmt(item.amount_tnd)}</td><td className="px-3 py-2"><button type="button" title={ar ? "حذف" : "Supprimer"} disabled={deletePassiveIncome.isPending} onClick={()=>{if(window.confirm((ar ? "هل تريد حذف هذا المدخول؟" : "Supprimer ce revenu passif ?"))) deletePassiveIncome.mutate(item.id);}} className="rounded-md p-2 text-red-700 hover:bg-red-50"><Trash2 className="size-4"/></button></td></tr>)}</tbody>
          </table></div>
          {deletePassiveIncome.isError && <p className="text-red-700">{ar ? "فشل الحذف:" : "La suppression a échoué :"} {deletePassiveIncome.error.message}</p>}
          <div className="flex justify-between border-t border-sky-200 pt-3 text-base font-bold text-sky-900"><span>{ar ? "إجمالي المداخيل الأخرى" : "Total des revenus passifs"}</span><span>{fmt(passiveIncomeTotal)}</span></div>
        </CardContent>
      </Card>

      <Card className="border-orange-200 bg-orange-50/30">
        <CardHeader><CardTitle className="flex items-center gap-2 text-orange-900"><Wallet className="size-5" /> {ar ? "المصاريف — دفعات المشتريات" : "Dépenses — paiements d’achats"}</CardTitle><CardDescription>{ar ? "الأموال التي خرجت فعلياً من الشركة لتسديد مشتريات المزوّدين والحرفاء. لا تشمل المشتريات غير المدفوعة." : "Argent réellement sorti de l’entreprise pour régler les achats auprès des fournisseurs et des clients. Les achats non encore payés ne sont pas inclus."}</CardDescription></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="overflow-x-auto rounded-lg border border-orange-200 bg-white">
            <table className="w-full min-w-[760px] text-sm">
              <thead><tr className="border-b bg-orange-50 text-left text-xs">
                <th className="px-3 py-2">{ar ? "التاريخ" : "Date"}</th><th className="px-3 py-2">{ar ? "فئة المصروف" : "Catégorie de dépense"}</th><th className="px-3 py-2">{ar ? "المستفيد" : "Bénéficiaire"}</th><th className="px-3 py-2">{ar ? "المرجع" : "Référence"}</th><th className="px-3 py-2">{ar ? "الطريقة" : "Mode"}</th><th className="px-3 py-2 text-right">{ar ? "المبلغ المدفوع" : "Montant payé"}</th>
              </tr></thead>
              <tbody>{outgoingPayments.length===0 ? <tr><td colSpan={6} className="px-3 py-4 text-center text-stone-500">{ar ? "لا توجد دفعات مشتريات مسجلة لهذا الموسم." : "Aucun paiement d’achat enregistré pour cette saison."}</td></tr> : outgoingPayments.map((row,index)=><tr key={String(row.id || row.document_number || index)} className="border-b last:border-0">
                <td className="px-3 py-2">{String(row.outflow_date || "—").slice(0,10)}</td>
                <td className="px-3 py-2 font-medium">{row.outflow_category}</td>
                <td className="px-3 py-2">{row.outflow_party}</td>
                <td className="px-3 py-2">{row.outflow_reference}</td>
                <td className="px-3 py-2">{paymentLabels[row.outflow_method] || row.outflow_method || "—"}</td>
                <td className="px-3 py-2 text-right font-semibold">{fmt(row.outflow_amount)}</td>
              </tr>)}</tbody>
            </table>
          </div>
          <div className="flex justify-between border-t border-orange-200 pt-3 text-base font-bold text-orange-900"><span>{ar ? "إجمالي دفعات المشتريات" : "Total des paiements d’achats"}</span><span>{fmt(outgoingPaymentsTotal)}</span></div>
          <p className="text-xs text-stone-500">{ar ? "يشمل الإجمالي دفعات المزوّدين ودفعات شراء الزيتون والزيت من الحرفاء. ولا يشمل الديون غير المسددة أو المصاريف اليدوية المدرجة أدناه بشكل منفصل." : "Le total comprend les paiements fournisseurs, les paiements d’achats d’olives aux clients et les paiements d’achats d’huile aux clients. Il ne comprend pas les dettes non réglées ni les dépenses manuelles listées séparément ci-dessous."}</p>
        </CardContent>
      </Card>

      <Card className="border-rose-200 bg-rose-50/30">
        <CardHeader><CardTitle className="flex items-center gap-2 text-rose-900"><Wallet className="size-5"/> {ar ? "المصاريف" : "Dépenses"}</CardTitle><CardDescription>{ar ? "مصاريف تشغيل الموسم الحالي" : "Charges de fonctionnement de la saison active"}</CardDescription></CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1"><span className="font-medium">{ar ? "الفئة" : "Catégorie"}</span><select className="w-full rounded-lg border bg-white px-3 py-2" value={expenseForm.expense_type} onChange={e=>setExpenseForm(v=>({...v,expense_type:e.target.value}))}><option value="ELECTRICITY">{ar ? "الكهرباء" : "Électricité"}</option><option value="WAGES">{ar ? "الأجور" : "Salaires"}</option><option value="MAINTENANCE">{ar ? "الصيانة والإصلاح" : "Entretien et réparation"}</option><option value="FUEL">{ar ? "الوقود" : "Carburant"}</option><option value="TRANSPORT">{ar ? "النقل" : "Transport"}</option><option value="SUPPLIES">{ar ? "المستلزمات" : "Fournitures"}</option><option value="RENT">{ar ? "الكراء" : "Loyer"}</option><option value="INSURANCE">{ar ? "التأمين" : "Assurance"}</option><option value="TAXES">{ar ? "الضرائب والأداءات" : "Taxes et impôts"}</option><option value="OTHER">{ar ? "مصاريف أخرى" : "Autre dépense"}</option></select></label>
            <label className="space-y-1"><span className="font-medium">{ar ? "التاريخ" : "Date"}</span><input type="date" className="w-full rounded-lg border bg-white px-3 py-2" value={expenseForm.expense_date} onChange={e=>setExpenseForm(v=>({...v,expense_date:e.target.value}))}/></label>
            <label className="space-y-1 sm:col-span-2"><span className="font-medium">{ar ? "الوصف" : "Description"}</span><input required minLength={2} className="w-full rounded-lg border bg-white px-3 py-2" placeholder={ar ? "مثال: فاتورة الكهرباء لهذا الشهر" : "Ex. Facture STEG du mois"} value={expenseForm.description} onChange={e=>setExpenseForm(v=>({...v,description:e.target.value}))}/></label>
            <label className="space-y-1"><span className="font-medium">Montant (TND)</span><input type="number" min="0.001" step="0.001" className="w-full rounded-lg border bg-white px-3 py-2" placeholder="0.000" value={expenseForm.amount_tnd} onChange={e=>setExpenseForm(v=>({...v,amount_tnd:e.target.value}))}/></label>
            <label className="space-y-1"><span className="font-medium">{ar ? "طريقة الدفع" : "Mode de paiement"}</span><select className="w-full rounded-lg border bg-white px-3 py-2" value={expenseForm.payment_method} onChange={e=>setExpenseForm(v=>({...v,payment_method:e.target.value}))}><option value="CASH">Espèces</option><option value="BANK_TRANSFER">Virement bancaire</option><option value="CHEQUE">Chèque</option><option value="OTHER">Autre</option></select></label>
            <label className="space-y-1 sm:col-span-2"><span className="font-medium">{ar ? "المستفيد / المزوّد" : "Bénéficiaire / fournisseur"}</span><input className="w-full rounded-lg border bg-white px-3 py-2" value={expenseForm.beneficiary} onChange={e=>setExpenseForm(v=>({...v,beneficiary:e.target.value}))}/></label>
            <label className="space-y-1 sm:col-span-2"><span className="font-medium">{ar ? "ملاحظات" : "Notes"}</span><textarea rows={2} className="w-full rounded-lg border bg-white px-3 py-2" value={expenseForm.notes} onChange={e=>setExpenseForm(v=>({...v,notes:e.target.value}))}/></label>
          </div>
          <button disabled={createExpense.isPending||!expenseForm.description.trim()||!expenseForm.amount_tnd} onClick={()=>createExpense.mutate(expenseForm)} className="inline-flex items-center gap-2 rounded-lg bg-rose-700 px-4 py-2 font-semibold text-white disabled:opacity-50"><Plus className="size-4"/>{createExpense.isPending?(ar ? "جارٍ التسجيل…" : "Enregistrement…"):(ar ? "إضافة مصروف" : "Ajouter la dépense")}</button>
          {createExpense.isError&&<p className="text-red-700">{ar ? "خطأ:" : "Erreur :"} {createExpense.error.message}</p>}{expenseQuery.isError&&<p className="text-red-700">{ar ? "تعذّر تحميل المصاريف." : "Impossible de charger les dépenses."}</p>}
          <div className="overflow-x-auto rounded-lg border border-rose-200 bg-white"><table className="w-full min-w-[600px] text-sm"><thead><tr className="border-b bg-rose-50 text-left text-xs"><th className="px-3 py-2">Date</th><th className="px-3 py-2">{ar ? "الفئة / الوصف" : "Catégorie / description"}</th><th className="px-3 py-2">{ar ? "الدفع" : "Paiement"}</th><th className="px-3 py-2 text-right">Montant</th><th className="px-3 py-2">{ar ? "إجراء" : "Action"}</th></tr></thead><tbody>{expenses.length===0?<tr><td colSpan={5} className="px-3 py-4 text-center text-stone-500">{expenseQuery.isPending?"Chargement…":(ar ? "لا توجد مصاريف مسجلة." : "Aucune dépense enregistrée.")}</td></tr>:expenses.map(x=><tr key={x.id} className="border-b"><td className="px-3 py-2">{x.expense_date}</td><td className="px-3 py-2"><b>{(ar ? expenseTypeLabelsAr[x.expense_type] : expenseTypeLabels[x.expense_type])||x.expense_type}</b><div>{x.description}</div>{x.beneficiary&&<small>{x.beneficiary}</small>}{x.notes&&<div className="text-xs text-stone-500">{x.notes}</div>}</td><td className="px-3 py-2">{(ar ? paymentLabelsAr[x.payment_method] : paymentLabels[x.payment_method])||x.payment_method}</td><td className="px-3 py-2 text-right font-semibold">{fmt(x.amount_tnd)}</td><td className="px-3 py-2"><button title={ar ? "حذف" : "Supprimer"} disabled={deleteExpense.isPending} onClick={()=>{if(window.confirm(ar ? "هل تريد حذف هذا المصروف؟" : "Supprimer cette dépense ?"))deleteExpense.mutate(x.id);}} className="rounded-md p-2 text-red-700"><Trash2 className="size-4"/></button></td></tr>)}</tbody></table></div>
          {deleteExpense.isError&&<p className="text-red-700">La suppression a échoué : {deleteExpense.error.message}</p>}
          <div className="flex justify-between border-t border-rose-200 pt-3 text-base font-bold text-rose-900"><span>{ar ? "إجمالي المصاريف" : "Total des dépenses"}</span><span>{fmt(expenseTotal)}</span></div>
        </CardContent>
      </Card>
    </div>

    <DataTable title={ar ? "شراء الزيتون من المزوّدين" : "Achats d’olives auprès des fournisseurs"} description={ar ? "جميع مشتريات الموسم المصادق عليها، مع قيمتها والدفعات المنجزة والرصيد المتبقي." : "Tous les achats approuvés de la saison active, avec leur montant, les règlements déjà effectués et le solde restant dû."} rows={calculated.supplierPurchases} empty={ar ? "لا توجد مشتريات مزوّدين مصادق عليها." : "Aucun achat fournisseur approuvé."} columns={[
      {label: ar ? "التاريخ" : "Date",render:r=>dateOf(r)}, {label: ar ? "السند" : "Bon",render:r=>r.document_number || "—"}, {label: ar ? "المزوّد" : "Fournisseur",render:r=>r.supplier_name || "—"}, {label: ar ? "الكمية (كغ)" : "Quantité (kg)",render:r=>fmt(r.total_quantity_kg)}, {label: ar ? "قيمة الشراء" : "Montant acheté",render:r=>fmt(r.total_amount_dt)}, {label: ar ? "المدفوع" : "Payé",render:r=>fmt(r.paid_amount_dt)}, {label: ar ? "المتبقي" : "Reste dû",render:r=>fmt(r.outstanding_amount_dt ?? r.total_amount_dt)}, {label: ar ? "الحالة" : "Statut",render:r=>r.payment_status === "PAID" ? (ar ? "مدفوع" : "Payé") : r.payment_status === "PARTIALLY_PAID" ? (ar ? "مدفوع جزئياً" : "Partiellement payé") : (ar ? "غير مدفوع" : "Non payé")}
    ]} />

    <DataTable title={ar ? "دفعات المزوّدين" : "Règlements aux fournisseurs"} description={ar ? "كل دفعة مسجلة فعلياً في GS ومرتبطة بسند الشراء المعني. تخفّض هذه الدفعات الدين والخزينة ولا تُحتسب مرة ثانية كمشتريات." : "Chaque paiement réellement enregistré dans GS, relié au bon d’achat correspondant. Ces règlements diminuent la dette et la trésorerie; ils ne sont pas comptés une seconde fois comme achat."} rows={data.supplier_olive_purchase_payments || []} empty={ar ? "لا توجد دفعات للمزوّدين مسجلة لهذا الموسم." : "Aucun règlement fournisseur enregistré pour cette saison."} columns={[
      {label: ar ? "التاريخ" : "Date",render:r=>String(r.payment_date || r.created_at || "—").slice(0,10)}, {label: ar ? "مرجع الدفع" : "Référence paiement",render:r=>r.document_number || "—"}, {label: ar ? "سند الشراء" : "Bon d’achat",render:r=>r.purchase_number || "—"}, {label: ar ? "المزوّد" : "Fournisseur",render:r=>r.supplier_name || "—"}, {label: ar ? "الطريقة" : "Mode",render:r=>(ar ? paymentLabelsAr[r.method] : paymentLabels[r.method]) || r.method || "—"}, {label: ar ? "المرجع البنكي" : "Référence bancaire",render:r=>r.reference || "—"}, {label: ar ? "المبلغ المدفوع" : "Montant payé",render:r=>fmt(r.amount_tnd)}
    ]} />

    <DataTable title={ar ? "شراء الزيتون من الحرفاء" : "Achats d’olives aux clients"} description={ar ? "سندات BAH لنقل الملكية خلال الموسم الحالي. لا تشمل أمانة الحرفاء." : "Bons BAH de transfert de propriété de la saison active. La garde client est exclue."} rows={calculated.customerOlivePurchases} empty={ar ? "لا توجد عمليات شراء زيتون من الحرفاء مسجلة." : "Aucun achat d’olives auprès d’un client enregistré."} columns={[
      {label: ar ? "التاريخ" : "Date",render:r=>dateOf(r)}, {label: ar ? "سند الشراء" : "Bon d’achat",render:r=>r.document_number || "—"}, {label: ar ? "الحريف" : "Client",render:r=>r.customer_name || "—"}, {label: ar ? "التتبع" : "Traçabilité",render:r=>r.traceability_code || "—"}, {label: ar ? "الكمية (كغ)" : "Quantité (kg)",render:r=>n(r.quantity_kg).toLocaleString("fr-TN")}, {label: ar ? "السعر / كغ" : "Prix / kg",render:r=>fmt(r.unit_price_tnd_per_kg)}, {label: ar ? "المبلغ" : "Montant",render:r=>fmt(r.agreed_amount_tnd)}, {label: ar ? "المدفوع" : "Payé",render:r=>fmt(r.paid_amount_tnd)}, {label: ar ? "المتبقي" : "Reste dû",render:r=>fmt(r.outstanding_amount_tnd)}
    ]} />

    <DataTable title={ar ? "شراء الزيت من الحرفاء" : "Achats d’huile auprès des clients"} description={ar ? "سندات BAH للموسم الحالي. تسدد دفعات RPA الدين." : "Bons BAH de la saison active. Les versements RPA règlent la dette."} rows={calculated.customerOilPurchases} empty={ar ? "لا توجد عمليات شراء زيت من الحرفاء." : "Aucun achat d’huile auprès d’un client."} columns={[
      {label: ar ? "التاريخ" : "Date",render:r=>dateOf(r)}, {label: ar ? "سند الشراء" : "Bon d’achat",render:r=>r.document_number || "—"}, {label: ar ? "الحريف" : "Client",render:r=>r.customer_name || "—"}, {label: ar ? "الرمز" : "Code",render:r=>r.traceability_code || "—"}, {label: ar ? "الكمية (لتر)" : "Quantité (L)",render:r=>n(r.quantity_l).toLocaleString("fr-TN")}, {label: ar ? "السعر / لتر" : "Prix / L",render:r=>fmt(r.unit_price_tnd_per_l)}, {label: ar ? "المبلغ" : "Montant",render:r=>fmt(r.agreed_amount_tnd)}, {label: ar ? "المدفوع" : "Payé",render:r=>fmt(r.paid_amount_tnd)}, {label: ar ? "المتبقي" : "Reste dû",render:r=>fmt(r.outstanding_amount_tnd)}
    ]} />

    <DataTable title={ar ? "دفعات الحرفاء" : "Paiements aux clients"} description={ar ? "دفعات RPA التي أنجزتها المعصرة مقابل شراء الزيتون والزيت. تخفّض هذه الدفعات ديون الشراء ولا تُحتسب مرة ثانية كمصاريف." : "Règlements RPA effectués par la huilerie pour les achats d’olives et d’huile. Ces paiements diminuent les dettes d’achat et ne sont pas comptés une seconde fois comme dépenses."} rows={[...(data.customer_olive_purchase_payments || []), ...(data.customer_oil_purchase_payments || [])]} empty={ar ? "لا توجد دفعات RPA مسجلة لهذا الموسم." : "Aucun paiement RPA enregistré pour la saison active."} columns={[
      {label: ar ? "التاريخ" : "Date",render:r=>String(r.payment_date || r.paid_at || r.created_at || r.day || "—").slice(0,10)}, {label: ar ? "المرجع" : "Référence",render:r=>r.document_number || r.payment_number || r.id || "—"}, {label: ar ? "الحريف" : "Client",render:r=>r.customer_name || r.client_name || r.customer_id || "—"}, {label: ar ? "الشراء المرتبط" : "Achat lié",render:r=>r.purchase_document_number || r.purchase_id || r.document_id || "—"}, {label: ar ? "النوع" : "Type",render:r=>r.product_kind === "OLIVE" ? (ar ? "زيتون" : "Olives") : (ar ? "زيت" : "Huile")}, {label: ar ? "الطريقة" : "Mode",render:r=>(ar ? paymentLabelsAr[r.payment_method] : paymentLabels[r.payment_method]) || r.payment_method || "—"}, {label: ar ? "المبلغ المدفوع" : "Montant payé",render:r=>fmt(r.amount_tnd || r.amount_dt || r.amount)}
    ]} />

    <DataTable title={ar ? "مداخيل العصر — Oro Verde" : "Revenus de trituration — Oro Verde"} description={ar ? "فواتير خدمات الموسم الحالي. يُعرض المبلغ المقبوض منفصلاً عن إجمالي الفاتورة والرصيد المتبقي." : "Factures de service de la saison active. Le montant encaissé est distingué du total facturé et du solde à recevoir."} rows={serviceRows} empty={ar ? "لا توجد فواتير خدمات." : "Aucune facture de prestation."} columns={[
      {label: ar ? "التاريخ" : "Date",render:r=>dateOf(r)}, {label: ar ? "الفاتورة" : "Facture",render:r=>r.number || "—"}, {label: ar ? "الحريف" : "Client",render:r=>r.client_name || "—"}, {label: ar ? "الإجمالي" : "Total",render:r=>fmt(r.total)}, {label: ar ? "المقبوض" : "Encaissé",render:r=>fmt(r.paid_amount)}, {label: ar ? "المتبقي للاستخلاص" : "À recevoir",render:r=>fmt(r.balance)}
    ]} />

    <DataTable title={ar ? "مبيعات الزيت — GS" : "Ventes d’huile — GS"} description={ar ? "الفواتير التجارية المصادق عليها للموسم الحالي. يشمل الصافي الإشعارات الدائنة المقبولة، وتُسدد الدفعات مستحقات الحرفاء." : "Factures commerciales validées de la saison active. Le total net intègre déjà les avoirs acceptés; les paiements règlent les créances."} rows={saleRows} empty={ar ? "لا توجد مبيعات تجارية مفوترة." : "Aucune vente commerciale facturée."} columns={[
      {label: ar ? "التاريخ" : "Date",render:r=>dateOf(r)}, {label: ar ? "الفاتورة" : "Facture",render:r=>r.document_number || "—"}, {label: ar ? "المشتري" : "Acheteur",render:r=>r.buyer_name || "—"}, {label: ar ? "الصافي" : "Total net",render:r=>fmt(r.net_amount_dt)}, {label: ar ? "المقبوض" : "Encaissé",render:r=>fmt(r.paid_amount_dt)}, {label: ar ? "المتبقي للاستخلاص" : "À recevoir",render:r=>fmt(r.outstanding_amount_dt)}
    ]} />

    <DataTable title={ar ? "مقبوضات الحرفاء" : "Encaissements des clients"} description="Règlements reçus sur les factures de trituration et les ventes GS. Les montants encaissés règlent les créances clients; ils ne sont pas ajoutés une seconde fois aux revenus." rows={[
      ...(serviceRows.filter(r=>n(r.paid_amount)>0).map(r=>({...r,_receipt_kind: ar ? "خدمة عصر" : "Prestation",_receipt_amount:r.paid_amount,_receipt_document:r.number,_receipt_customer:r.client_name,_receipt_date:r.payment_date || r.day || r.created_at}))),
      ...(data.commercial_sale_payments || []).map(r=>({...r,_receipt_kind: ar ? "بيع GS" : "Vente GS",_receipt_amount:r.amount_dt || r.amount_tnd || r.amount,_receipt_document:r.invoice_number || r.document_number || r.invoice_id,_receipt_customer:r.buyer_name || r.customer_name || r.buyer_id,_receipt_date:r.payment_date || r.paid_at || r.created_at}))
    ]} empty={ar ? "لا توجد مقبوضات من الحرفاء مسجلة لهذا الموسم." : "Aucun encaissement client enregistré sur la saison active."} columns={[
      {label: ar ? "التاريخ" : "Date",render:r=>String(r._receipt_date || "—").slice(0,10)}, {label: ar ? "المصدر" : "Origine",render:r=>r._receipt_kind}, {label: ar ? "الفاتورة" : "Facture",render:r=>r._receipt_document || "—"}, {label: ar ? "الحريف" : "Client",render:r=>r._receipt_customer || "—"}, {label: ar ? "الطريقة" : "Mode",render:r=>(ar ? paymentLabelsAr[r.payment_method] : paymentLabels[r.payment_method]) || r.payment_method || "—"}, {label: ar ? "المبلغ المقبوض" : "Montant encaissé",render:r=>fmt(r._receipt_amount)}
    ]} />

    <DataTable title={ar ? "الإشعارات الدائنة — المرتجعات المقبولة" : "Avoirs émis — retours acceptés"} description={ar ? "إشعارات AVO الدائنة للموسم الحالي. تخفّض صافي إيراد الفاتورة الأصلية ولا تُخصم مرة ثانية من الإجمالي." : "Avoirs AVO de la saison active. Ils réduisent le revenu net de la facture d’origine; ils ne sont pas soustraits une seconde fois du total."} rows={(data.commercial_credit_notes || []).filter(r => r.status === "ISSUED")} empty={ar ? "لا توجد إشعارات دائنة صادرة." : "Aucun avoir émis."} columns={[
      {label: ar ? "التاريخ" : "Date",render:r=>dateOf(r)}, {label: ar ? "إشعار دائن" : "Avoir",render:r=>r.document_number || "—"}, {label: ar ? "الحريف" : "Client",render:r=>r.buyer_name || r.buyer_id || "—"}, {label: ar ? "الفاتورة الأصلية" : "Facture source",render:r=>r.invoice_number || "—"}, {label: ar ? "المبلغ" : "Montant",render:r=>fmt(r.amount_dt)}
    ]} />

    <Card className="border-amber-200 bg-amber-50/50">
      <CardContent className="flex items-start gap-3 p-4 text-sm text-amber-950">
        <AlertTriangle className="mt-0.5 size-5 shrink-0" />
        <div><strong>{ar ? "مراقبة محاسبية — الإصدار الأول." : "Contrôle comptable — première version."}</strong>
          <p className="mt-1">{ar ? `تقرأ هذه الصفحة المستندات التشغيلية الموجودة دون تعديلها. تقتصر المؤشرات المالية والجداول على الموسم الحالي (${data.active_season})، وتعرض الجداول أحدث العمليات فقط (الحد: ${data.recent_limit}). تُحتسب مبيعات GS من صافي الفواتير بعد الإشعارات الدائنة المقبولة، وتُعرض الإشعارات بشكل منفصل للتدقيق دون خصم مزدوج. المرتجعات المادية المعلقة أو المرفوضة لا تخفض الإيرادات. تُعرض مشتريات الزيتون والزيت باعتبارها اقتناءً للمخزون، ولا تُسجل تلقائياً كمصاريف مستهلكة. أمانة الحرفاء لا تُحتسب شراءً. الدفعات الأولية واللاحقة تسدد ديناً أو مستحقاً ولا تنشئ إيراداً أو مصروفاً ثانياً. وتُعرض مشتريات المزوّدين مع دفعاتها وأرصدتها المستحقة، مع إظهار كل دفعة منفصلة في حركة الخزينة دون مضاعفة مصروف الشراء.` : `Cette page lit les documents opérationnels existants sans les modifier. Les indicateurs financiers et les tableaux sont limités à la saison active (${data.active_season}); les tableaux affichent uniquement les opérations les plus récentes (limite : ${data.recent_limit}). Les ventes GS sont totalisées depuis le net des factures après avoirs acceptés; les avoirs sont listés séparément pour audit sans double déduction. Les retours physiques en attente ou refusés ne réduisent pas le revenu. Les achats d’olives et d’huile sont présentés comme acquisitions de stock, pas comme charges consommées automatiquement. La garde des clients n’est jamais comptée comme achat. Les paiements initiaux et ultérieurs règlent une dette ou une créance et ne créent pas un deuxième produit ou une deuxième charge. Les achats fournisseurs sont affichés avec leurs paiements et leurs soldes dus; chaque règlement est présenté séparément dans la trésorerie sans doubler la charge d’achat.`}</p>
        </div>
      </CardContent>
    </Card>
    </>}
    {activeTab === "daily" && <SituationJournaliere />}
  </div>;
}
