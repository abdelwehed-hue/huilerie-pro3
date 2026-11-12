import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPost } from "@/lib/api";
import { fmtMoney } from "@/lib/i18n";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
type Overview = {
  active_season: string;
  season_code: string;
  traditional_invoices: Row[];
  supplier_olive_purchases: Row[];
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
  const amount = mills(v);
  const negative = amount < 0n;
  const absolute = negative ? -amount : amount;
  const whole = absolute / 1000n;
  const fraction = String(absolute % 1000n).padStart(3, "0");
  const formatted = fmtMoney(`${negative ? "-" : ""}${whole}.${fraction}`);
  return `${formatted} TND`;
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
// Customer olive purchase amounts are stored in millimes by the legacy purchase path,
// while this accounting view expects decimal TND. Normalize only this category for display.
const customerOliveTnd = (value: unknown) => { const scaled = mills(value) / 1000n; return `${scaled / 1000n}.${String(scaled % 1000n).padStart(3, "0")}`; };
const dateOf = (r: Row) => String(r.purchase_date || r.sale_date || r.day || r.created_at || "").slice(0, 10);
const sum = (rows: Row[], field: string) => rows.reduce((total, row) => total + n(row[field]), 0);

function Metric({ title, value, detail, icon: Icon, tone, cardColor }: {
  title: string; value: string; detail: string; icon: LucideIcon; tone: string; cardColor: string;
}) {
  return <Card style={{ backgroundColor: cardColor, border: "2px solid rgba(71, 85, 105, 0.35)" }} className="shadow-sm transition-shadow hover:shadow-md">
    <CardContent className="flex items-start gap-3 p-4">
      <div className={`rounded-xl p-2.5 ${tone}`}><Icon className="size-5" /></div>
      <div className="min-w-0">
        <p className="text-sm text-stone-500">{title}</p>
        <p className="mt-1 text-xl font-bold tabular-nums text-stone-900">{value}</p>
        <p className="mt-1 text-xs text-stone-500">{detail}</p>
      </div>
    </CardContent>
  </Card>;
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
  const query = useQuery({
    queryKey: ["accounting-overview"],
    queryFn: () => apiGet<Overview>("/accounting/overview"),
    staleTime: 30_000,
  });
  const data = query.data;
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
 
  const calculated = useMemo(() => {
    const supplierPurchases = (data?.supplier_olive_purchases || []).filter(r => r.status === "APPROVED");
    const customerOlivePurchases = data?.customer_olive_purchases || [];
    const customerOilPurchases = data?.customer_oil_purchases || [];
    const summary = data?.summary;
    return {
      serviceRevenue: mills(summary?.pressing_revenue_total),
      salesRevenue: mills(summary?.gs_sales_revenue_total),
      stockPurchases: mills(summary?.supplier_olive_purchase_total),
      customerOlivePurchaseTotal: mills(customerOliveTnd(summary?.customer_olive_purchase_total)),
      customerOilPurchaseTotal: mills(summary?.customer_oil_purchase_total),
      serviceCollected: mills(summary?.pressing_collected_total),
      gsCollected: mills(summary?.gs_sales_collected_total),
      olivePaid: mills(summary?.customer_olive_paid_total),
      oilPaid: mills(summary?.customer_oil_paid_total),
      supplierPurchases,
      customerOlivePurchases: customerOlivePurchases.map((row) => ({
        ...row,
        unit_price_tnd_per_kg: customerOliveTnd(row.unit_price_tnd_per_kg),
        agreed_amount_tnd: customerOliveTnd(row.agreed_amount_tnd),
        paid_amount_tnd: customerOliveTnd(row.paid_amount_tnd),
        outstanding_amount_tnd: customerOliveTnd(row.outstanding_amount_tnd),
      })),
      customerOilPurchases,
    };
  }, [data]);

  if (query.isPending) return <div className="mx-auto max-w-7xl p-6 text-stone-600">Chargement des données comptables…</div>;
  if (query.isError || !data) return <div className="mx-auto max-w-7xl p-6">
    <Card className="border-red-200"><CardContent className="flex items-center gap-3 p-5 text-red-800">
      <AlertTriangle className="size-5" /> Impossible de charger les données comptables. Vérifiez la session et réessayez.
      <button className="ms-auto inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm" onClick={() => void query.refetch()}><RefreshCw className="size-4" /> Réessayer</button>
    </CardContent></Card>
  </div>;

  const serviceRows = data.traditional_invoices || [];
  const saleRows = data.commercial_sales_invoices || [];
  const fmt = (value: unknown) => money(value);
  return <div className="mx-auto max-w-7xl space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="flex items-center gap-2"><ReceiptText className="size-6 text-emerald-700" /><h1 className="text-2xl font-bold text-stone-900">Comptabilité</h1></div>
        <p className="mt-1 text-sm text-stone-500">Vue consolidée Oro Verde et Gestion Commerciale · saison active : {data.active_season} · lecture seule</p>
      </div>
      <button onClick={() => void query.refetch()} className="inline-flex items-center gap-2 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"><RefreshCw className="size-4" /> Actualiser</button>
    </div>

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric title="Revenus de prestation" value={fmt(calculated.serviceRevenue)} detail="Factures de trituration Oro Verde · saison active" icon={TrendingUp} tone="bg-emerald-100 text-emerald-800" cardColor="#a7f3d0" />
      <Metric title="Ventes d’huile GS" value={fmt(calculated.salesRevenue)} detail="Factures commerciales validées · saison active" icon={TrendingUp} tone="bg-blue-100 text-blue-800" cardColor="#bfdbfe" />
      <Metric title="Achats de stock" value={fmt(calculated.stockPurchases)} detail="Achats d’olives approuvés auprès des fournisseurs uniquement" icon={Package} tone="bg-amber-100 text-amber-800" cardColor="#fde68a" />
      <Metric title="Achats d’olives aux clients" value={fmt(calculated.customerOlivePurchaseTotal)} detail="Bons BAH · présentés séparément des achats fournisseurs" icon={Package} tone="bg-orange-100 text-orange-800" cardColor="#fed7aa" />
      <Metric title="Achats d’huile aux clients" value={fmt(calculated.customerOilPurchaseTotal)} detail="Bons BAH · présentés séparément des achats fournisseurs" icon={Package} tone="bg-yellow-100 text-yellow-800" cardColor="#fef08a" />
      <Metric title="Encaissements clients" value={fmt(calculated.serviceCollected + calculated.gsCollected)} detail="Règlements cumulés sur factures · saison active" icon={Wallet} tone="bg-violet-100 text-violet-800" cardColor="#ddd6fe" />
      <Metric title="Paiements achats clients" value={fmt(calculated.olivePaid + calculated.oilPaid)} detail="Paiements RPA pour huile et olives · saison active" icon={Wallet} tone="bg-rose-100 text-rose-800" cardColor="#fecdd3" />
    </div>

    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="border-emerald-200 bg-emerald-50/40">
        <CardHeader><CardTitle className="flex items-center gap-2 text-emerald-900"><TrendingUp className="size-5" /> Revenus actifs</CardTitle><CardDescription>Activité réelle de la huilerie</CardDescription></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between gap-3"><span>Prestation de trituration</span><strong>{fmt(calculated.serviceRevenue)}</strong></div>
          <div className="flex justify-between gap-3"><span>Vente d’huile — GS</span><strong>{fmt(calculated.salesRevenue)}</strong></div>
          <div className="mt-2 flex justify-between border-t border-emerald-200 pt-3 text-base font-bold text-emerald-900"><span>Total</span><span>{fmt(calculated.serviceRevenue + calculated.salesRevenue)}</span></div>
        </CardContent>
      </Card>
      <Card className="border-sky-200 bg-sky-50/40">
        <CardHeader><CardTitle className="flex items-center gap-2 text-sky-900"><TrendingUp className="size-5" /> Revenus passifs</CardTitle><CardDescription>Enregistrement des revenus complémentaires de la saison active</CardDescription></CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1"><span className="font-medium">Type de revenu</span><select className="w-full rounded-lg border bg-white px-3 py-2" value={passiveForm.income_type} onChange={e=>setPassiveForm(v=>({...v,income_type:e.target.value}))}><option value="RENT">Location de local / entrepôt</option><option value="EQUIPMENT_RENTAL">Location de matériel</option><option value="INTEREST">Intérêts</option><option value="INVESTMENT">Investissement</option><option value="OTHER">Autre revenu</option></select></label>
            <label className="space-y-1"><span className="font-medium">Date</span><input type="date" required className="w-full rounded-lg border bg-white px-3 py-2" value={passiveForm.income_date} onChange={e=>setPassiveForm(v=>({...v,income_date:e.target.value}))}/></label>
            <label className="space-y-1 sm:col-span-2"><span className="font-medium">Description</span><input required minLength={2} maxLength={180} className="w-full rounded-lg border bg-white px-3 py-2" placeholder="Ex. Location du dépôt" value={passiveForm.description} onChange={e=>setPassiveForm(v=>({...v,description:e.target.value}))}/></label>
            <label className="space-y-1"><span className="font-medium">Montant (TND)</span><input type="number" min="0.001" step="0.001" required className="w-full rounded-lg border bg-white px-3 py-2" placeholder="0.000" value={passiveForm.amount_tnd} onChange={e=>setPassiveForm(v=>({...v,amount_tnd:e.target.value}))}/></label>
            <label className="space-y-1"><span className="font-medium">Mode de paiement</span><select className="w-full rounded-lg border bg-white px-3 py-2" value={passiveForm.payment_method} onChange={e=>setPassiveForm(v=>({...v,payment_method:e.target.value}))}><option value="CASH">Espèces</option><option value="BANK_TRANSFER">Virement bancaire</option><option value="CHEQUE">Chèque</option><option value="OTHER">Autre</option></select></label>
            <label className="space-y-1 sm:col-span-2"><span className="font-medium">Notes (facultatif)</span><textarea rows={2} maxLength={500} className="w-full rounded-lg border bg-white px-3 py-2" value={passiveForm.notes} onChange={e=>setPassiveForm(v=>({...v,notes:e.target.value}))}/></label>
          </div>
          <button type="button" disabled={createPassiveIncome.isPending || !passiveForm.description.trim() || !passiveForm.amount_tnd} onClick={()=>createPassiveIncome.mutate(passiveForm)} className="inline-flex items-center gap-2 rounded-lg bg-sky-700 px-4 py-2 font-semibold text-white disabled:opacity-50"><Plus className="size-4"/>{createPassiveIncome.isPending ? "Enregistrement…" : "Ajouter le revenu"}</button>
          {createPassiveIncome.isError && <p className="text-red-700">Erreur : {createPassiveIncome.error.message}</p>}
          {passiveQuery.isError && <p className="text-red-700">Impossible de charger les revenus passifs.</p>}
          <div className="overflow-x-auto rounded-lg border border-sky-200 bg-white"><table className="w-full min-w-[620px] text-sm">
            <thead><tr className="border-b bg-sky-50 text-left text-xs"><th className="px-3 py-2">Date</th><th className="px-3 py-2">Type / description</th><th className="px-3 py-2">Paiement</th><th className="px-3 py-2 text-right">Montant</th><th className="px-3 py-2">Action</th></tr></thead>
            <tbody>{passiveIncomes.length===0 ? <tr><td colSpan={5} className="px-3 py-4 text-center text-stone-500">{passiveQuery.isPending ? "Chargement…" : "Aucun revenu passif enregistré pour cette saison."}</td></tr> : passiveIncomes.map(item=><tr key={item.id} className="border-b last:border-0"><td className="px-3 py-2">{item.income_date}</td><td className="px-3 py-2"><div className="font-medium">{passiveTypeLabels[item.income_type] || item.income_type}</div><div>{item.description}</div>{item.notes && <div className="text-xs text-stone-500">{item.notes}</div>}</td><td className="px-3 py-2">{paymentLabels[item.payment_method] || item.payment_method}</td><td className="px-3 py-2 text-right font-semibold">{fmt(item.amount_tnd)}</td><td className="px-3 py-2"><button type="button" title="Supprimer" disabled={deletePassiveIncome.isPending} onClick={()=>{if(window.confirm("Supprimer ce revenu passif ?")) deletePassiveIncome.mutate(item.id);}} className="rounded-md p-2 text-red-700 hover:bg-red-50"><Trash2 className="size-4"/></button></td></tr>)}</tbody>
          </table></div>
          {deletePassiveIncome.isError && <p className="text-red-700">La suppression a échoué : {deletePassiveIncome.error.message}</p>}
          <div className="flex justify-between border-t border-sky-200 pt-3 text-base font-bold text-sky-900"><span>Total des revenus passifs</span><span>{fmt(passiveIncomeTotal)}</span></div>
        </CardContent>
      </Card>

      <Card className="border-rose-200 bg-rose-50/30">
        <CardHeader><CardTitle className="flex items-center gap-2 text-rose-900"><Wallet className="size-5"/> Dépenses</CardTitle><CardDescription>Charges de fonctionnement de la saison active</CardDescription></CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1"><span className="font-medium">Catégorie</span><select className="w-full rounded-lg border bg-white px-3 py-2" value={expenseForm.expense_type} onChange={e=>setExpenseForm(v=>({...v,expense_type:e.target.value}))}><option value="ELECTRICITY">Électricité</option><option value="WAGES">Salaires</option><option value="MAINTENANCE">Entretien et réparation</option><option value="FUEL">Carburant</option><option value="TRANSPORT">Transport</option><option value="SUPPLIES">Fournitures</option><option value="RENT">Loyer</option><option value="INSURANCE">Assurance</option><option value="TAXES">Taxes et impôts</option><option value="OTHER">Autre dépense</option></select></label>
            <label className="space-y-1"><span className="font-medium">Date</span><input type="date" className="w-full rounded-lg border bg-white px-3 py-2" value={expenseForm.expense_date} onChange={e=>setExpenseForm(v=>({...v,expense_date:e.target.value}))}/></label>
            <label className="space-y-1 sm:col-span-2"><span className="font-medium">Description</span><input required minLength={2} className="w-full rounded-lg border bg-white px-3 py-2" placeholder="Ex. Facture STEG du mois" value={expenseForm.description} onChange={e=>setExpenseForm(v=>({...v,description:e.target.value}))}/></label>
            <label className="space-y-1"><span className="font-medium">Montant (TND)</span><input type="number" min="0.001" step="0.001" className="w-full rounded-lg border bg-white px-3 py-2" placeholder="0.000" value={expenseForm.amount_tnd} onChange={e=>setExpenseForm(v=>({...v,amount_tnd:e.target.value}))}/></label>
            <label className="space-y-1"><span className="font-medium">Mode de paiement</span><select className="w-full rounded-lg border bg-white px-3 py-2" value={expenseForm.payment_method} onChange={e=>setExpenseForm(v=>({...v,payment_method:e.target.value}))}><option value="CASH">Espèces</option><option value="BANK_TRANSFER">Virement bancaire</option><option value="CHEQUE">Chèque</option><option value="OTHER">Autre</option></select></label>
            <label className="space-y-1 sm:col-span-2"><span className="font-medium">Bénéficiaire / fournisseur</span><input className="w-full rounded-lg border bg-white px-3 py-2" value={expenseForm.beneficiary} onChange={e=>setExpenseForm(v=>({...v,beneficiary:e.target.value}))}/></label>
            <label className="space-y-1 sm:col-span-2"><span className="font-medium">Notes</span><textarea rows={2} className="w-full rounded-lg border bg-white px-3 py-2" value={expenseForm.notes} onChange={e=>setExpenseForm(v=>({...v,notes:e.target.value}))}/></label>
          </div>
          <button disabled={createExpense.isPending||!expenseForm.description.trim()||!expenseForm.amount_tnd} onClick={()=>createExpense.mutate(expenseForm)} className="inline-flex items-center gap-2 rounded-lg bg-rose-700 px-4 py-2 font-semibold text-white disabled:opacity-50"><Plus className="size-4"/>{createExpense.isPending?"Enregistrement…":"Ajouter la dépense"}</button>
          {createExpense.isError&&<p className="text-red-700">Erreur : {createExpense.error.message}</p>}{expenseQuery.isError&&<p className="text-red-700">Impossible de charger les dépenses.</p>}
          <div className="overflow-x-auto rounded-lg border border-rose-200 bg-white"><table className="w-full min-w-[600px] text-sm"><thead><tr className="border-b bg-rose-50 text-left text-xs"><th className="px-3 py-2">Date</th><th className="px-3 py-2">Catégorie / description</th><th className="px-3 py-2">Paiement</th><th className="px-3 py-2 text-right">Montant</th><th className="px-3 py-2">Action</th></tr></thead><tbody>{expenses.length===0?<tr><td colSpan={5} className="px-3 py-4 text-center text-stone-500">{expenseQuery.isPending?"Chargement…":"Aucune dépense enregistrée."}</td></tr>:expenses.map(x=><tr key={x.id} className="border-b"><td className="px-3 py-2">{x.expense_date}</td><td className="px-3 py-2"><b>{expenseTypeLabels[x.expense_type]||x.expense_type}</b><div>{x.description}</div>{x.beneficiary&&<small>{x.beneficiary}</small>}{x.notes&&<div className="text-xs text-stone-500">{x.notes}</div>}</td><td className="px-3 py-2">{paymentLabels[x.payment_method]||x.payment_method}</td><td className="px-3 py-2 text-right font-semibold">{fmt(x.amount_tnd)}</td><td className="px-3 py-2"><button title="Supprimer" disabled={deleteExpense.isPending} onClick={()=>{if(window.confirm("Supprimer cette dépense ?"))deleteExpense.mutate(x.id);}} className="rounded-md p-2 text-red-700"><Trash2 className="size-4"/></button></td></tr>)}</tbody></table></div>
          {deleteExpense.isError&&<p className="text-red-700">La suppression a échoué : {deleteExpense.error.message}</p>}
          <div className="flex justify-between border-t border-rose-200 pt-3 text-base font-bold text-rose-900"><span>Total des dépenses</span><span>{fmt(expenseTotal)}</span></div>
        </CardContent>
      </Card>
    </div>

    <DataTable title="Achats d’olives auprès des fournisseurs" description="Achats de stock GS de la saison active — affichage des opérations récentes. Les règlements fournisseurs ne sont pas consolidés." rows={calculated.supplierPurchases} empty="Aucun achat fournisseur approuvé." columns={[
      {label:"Date",render:r=>dateOf(r)}, {label:"Bon",render:r=>r.document_number || "—"}, {label:"Fournisseur",render:r=>r.supplier_name || "—"}, {label:"Quantité (kg)",render:r=>fmt(r.total_quantity_kg)}, {label:"Montant",render:r=>fmt(r.total_amount_dt)}
    ]} />

    <DataTable title="Achats d’olives aux clients" description="Bons BAH de transfert de propriété de la saison active. La garde client est exclue." rows={calculated.customerOlivePurchases} empty="Aucun achat d’olives auprès d’un client enregistré." columns={[
      {label:"Date",render:r=>dateOf(r)}, {label:"Bon d’achat",render:r=>r.document_number || "—"}, {label:"Client",render:r=>r.customer_name || "—"}, {label:"Traçabilité",render:r=>r.traceability_code || "—"}, {label:"Quantité (kg)",render:r=>n(r.quantity_kg).toLocaleString("fr-TN")}, {label:"Prix / kg",render:r=>fmt(r.unit_price_tnd_per_kg)}, {label:"Montant",render:r=>fmt(r.agreed_amount_tnd)}, {label:"Payé",render:r=>fmt(r.paid_amount_tnd)}, {label:"Reste dû",render:r=>fmt(r.outstanding_amount_tnd)}
    ]} />

    <DataTable title="Achats d’huile auprès des clients" description="Bons BAH de la saison active. Les versements RPA règlent la dette." rows={calculated.customerOilPurchases} empty="Aucun achat d’huile auprès d’un client." columns={[
      {label:"Date",render:r=>dateOf(r)}, {label:"Bon d’achat",render:r=>r.document_number || "—"}, {label:"Client",render:r=>r.customer_name || "—"}, {label:"Code",render:r=>r.traceability_code || "—"}, {label:"Quantité (L)",render:r=>n(r.quantity_l).toLocaleString("fr-TN")}, {label:"Prix / L",render:r=>fmt(r.unit_price_tnd_per_l)}, {label:"Montant",render:r=>fmt(r.agreed_amount_tnd)}, {label:"Payé",render:r=>fmt(r.paid_amount_tnd)}, {label:"Reste dû",render:r=>fmt(r.outstanding_amount_tnd)}
    ]} />

    <DataTable title="Paiements aux clients" description="Règlements RPA effectués par la huilerie pour les achats d’olives et d’huile. Ces paiements diminuent les dettes d’achat et ne sont pas comptés une seconde fois comme dépenses." rows={[...(data.customer_olive_purchase_payments || []), ...(data.customer_oil_purchase_payments || [])]} empty="Aucun paiement RPA enregistré pour la saison active." columns={[
      {label:"Date",render:r=>String(r.payment_date || r.paid_at || r.created_at || r.day || "—").slice(0,10)}, {label:"Référence",render:r=>r.document_number || r.payment_number || r.id || "—"}, {label:"Client",render:r=>r.customer_name || r.client_name || r.customer_id || "—"}, {label:"Achat lié",render:r=>r.purchase_document_number || r.purchase_id || r.document_id || "—"}, {label:"Type",render:r=>r.product_kind === "OLIVE" ? "Olives" : "Huile"}, {label:"Mode",render:r=>paymentLabels[r.payment_method] || r.payment_method || "—"}, {label:"Montant payé",render:r=>fmt(r.amount_tnd || r.amount_dt || r.amount)}
    ]} />

    <DataTable title="Revenus de trituration — Oro Verde" description="Factures de service de la saison active. Garde des clients : seule la prestation est un revenu." rows={serviceRows} empty="Aucune facture de prestation." columns={[
      {label:"Date",render:r=>dateOf(r)}, {label:"Facture",render:r=>r.number || "—"}, {label:"Client",render:r=>r.client_name || "—"}, {label:"Total",render:r=>fmt(r.total)}, {label:"Encaissé",render:r=>fmt(r.paid_amount)}, {label:"À recevoir",render:r=>fmt(r.balance)}
    ]} />

    <DataTable title="Ventes d’huile — GS" description="Factures commerciales validées de la saison active. Le total net intègre déjà les avoirs acceptés; les paiements règlent les créances." rows={saleRows} empty="Aucune vente commerciale facturée." columns={[
      {label:"Date",render:r=>dateOf(r)}, {label:"Facture",render:r=>r.document_number || "—"}, {label:"Acheteur",render:r=>r.buyer_name || "—"}, {label:"Total net",render:r=>fmt(r.net_amount_dt)}, {label:"Encaissé",render:r=>fmt(r.paid_amount_dt)}, {label:"À recevoir",render:r=>fmt(r.outstanding_amount_dt)}
    ]} />

    <DataTable title="Encaissements des clients" description="Règlements reçus sur les factures de trituration et les ventes GS. Les montants encaissés règlent les créances clients; ils ne sont pas ajoutés une seconde fois aux revenus." rows={[
      ...(serviceRows.filter(r=>n(r.paid_amount)>0).map(r=>({...r,_receipt_kind:"Prestation",_receipt_amount:r.paid_amount,_receipt_document:r.number,_receipt_customer:r.client_name,_receipt_date:r.payment_date || r.day || r.created_at}))),
      ...(data.commercial_sale_payments || []).map(r=>({...r,_receipt_kind:"Vente GS",_receipt_amount:r.amount_dt || r.amount_tnd || r.amount,_receipt_document:r.invoice_number || r.document_number || r.invoice_id,_receipt_customer:r.buyer_name || r.customer_name || r.buyer_id,_receipt_date:r.payment_date || r.paid_at || r.created_at}))
    ]} empty="Aucun encaissement client enregistré sur la saison active." columns={[
      {label:"Date",render:r=>String(r._receipt_date || "—").slice(0,10)}, {label:"Origine",render:r=>r._receipt_kind}, {label:"Facture",render:r=>r._receipt_document || "—"}, {label:"Client",render:r=>r._receipt_customer || "—"}, {label:"Mode",render:r=>paymentLabels[r.payment_method] || r.payment_method || "—"}, {label:"Montant encaissé",render:r=>fmt(r._receipt_amount)}
    ]} />

    <DataTable title="Avoirs émis — retours acceptés" description="Avoirs AVO de la saison active. Ils réduisent le revenu net de la facture d’origine; ils ne sont pas soustraits une seconde fois du total." rows={(data.commercial_credit_notes || []).filter(r => r.status === "ISSUED")} empty="Aucun avoir émis." columns={[
      {label:"Date",render:r=>dateOf(r)}, {label:"Avoir",render:r=>r.document_number || "—"}, {label:"Client",render:r=>r.buyer_name || r.buyer_id || "—"}, {label:"Facture source",render:r=>r.invoice_number || "—"}, {label:"Montant",render:r=>fmt(r.amount_dt)}
    ]} />

    <Card className="border-amber-200 bg-amber-50/50">
      <CardContent className="flex items-start gap-3 p-4 text-sm text-amber-950">
        <AlertTriangle className="mt-0.5 size-5 shrink-0" />
        <div><strong>Contrôle comptable — première version.</strong>
          <p className="mt-1">Cette page lit les documents opérationnels existants sans les modifier. Les indicateurs financiers et les tableaux sont limités à la saison active ({data.active_season}); les tableaux affichent uniquement les opérations les plus récentes (limite : {data.recent_limit}). Les ventes GS sont totalisées depuis le net des factures après avoirs acceptés; les avoirs sont listés séparément pour audit sans double déduction. Les retours physiques en attente ou refusés ne réduisent pas le revenu. Les achats d’olives et d’huile sont présentés comme acquisitions de stock, pas comme charges consommées automatiquement. La garde des clients n’est jamais comptée comme achat. Les paiements initiaux et ultérieurs règlent une dette ou une créance et ne créent pas un deuxième produit ou une deuxième charge. Les achats fournisseurs ne disposent pas encore d’un registre de règlements consolidé : leurs soldes de trésorerie ne sont donc pas estimés.</p>
        </div>
      </CardContent>
    </Card>
  </div>;
}
