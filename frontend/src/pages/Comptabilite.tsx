import { useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshCw, TrendingUp, Wallet, Package, AlertTriangle, ReceiptText, type LucideIcon } from "lucide-react";

type Row = Record<string, any>;
type Overview = {
  traditional_invoices: Row[];
  supplier_olive_purchases: Row[];
  customer_ownership_transfers: Row[];
  customer_oil_purchases: Row[];
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
  const formatted = new Intl.NumberFormat("fr-TN", { maximumFractionDigits: 0 }).format(whole);
  return `${negative ? "-" : ""}${formatted},${fraction} TND`;
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
  title: string; value: string; detail: string; icon: LucideIcon; tone: string;
}) {
  return <Card className="border-stone-200 shadow-sm">
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
  const calculated = useMemo(() => {
    const supplierPurchases = (data?.supplier_olive_purchases || []).filter(r => r.status === "APPROVED");
    const customerOlivePurchases = (data?.customer_ownership_transfers || []).filter(r =>
      r.status === "APPROVED" && r.movement_kind === "OWNERSHIP_TRANSFER" &&
      r.product_kind === "OLIVE" && r.consideration?.type === "SALE"
    );
    const customerOilPurchases = data?.customer_oil_purchases || [];
    const summary = data?.summary;
    return {
      serviceRevenue: mills(summary?.pressing_revenue_total),
      salesRevenue: mills(summary?.gs_sales_revenue_total),
      stockPurchases: addMoney(summary?.supplier_olive_purchase_total,
        summary?.customer_olive_purchase_total, summary?.customer_oil_purchase_total),
      serviceCollected: mills(summary?.pressing_collected_total),
      gsCollected: mills(summary?.gs_sales_collected_total),
      oilPaid: mills(summary?.customer_oil_paid_total),
      supplierPurchases, customerOlivePurchases, customerOilPurchases,
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
        <p className="mt-1 text-sm text-stone-500">Vue consolidée des opérations Oro Verde et Gestion Commerciale · lecture seule</p>
      </div>
      <button onClick={() => void query.refetch()} className="inline-flex items-center gap-2 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"><RefreshCw className="size-4" /> Actualiser</button>
    </div>

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric title="Revenus de prestation" value={fmt(calculated.serviceRevenue)} detail="Factures de trituration Oro Verde · total complet" icon={TrendingUp} tone="bg-emerald-50 text-emerald-700" />
      <Metric title="Ventes d’huile GS" value={fmt(calculated.salesRevenue)} detail="Factures commerciales validées · total complet" icon={TrendingUp} tone="bg-blue-50 text-blue-700" />
      <Metric title="Achats de stock" value={fmt(calculated.stockPurchases)} detail="Achats validés · total complet, tous historiques" icon={Package} tone="bg-amber-50 text-amber-700" />
      <Metric title="Encaissements clients" value={fmt(calculated.serviceCollected + calculated.gsCollected)} detail="Règlements cumulés sur factures · total complet" icon={Wallet} tone="bg-violet-50 text-violet-700" />
      <Metric title="Paiements huile clients" value={fmt(calculated.oilPaid)} detail="Paiements RPA enregistrés · total complet" icon={Wallet} tone="bg-rose-50 text-rose-700" />
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
        <CardHeader><CardTitle className="flex items-center gap-2 text-sky-900"><TrendingUp className="size-5" /> Revenus passifs</CardTitle><CardDescription>Revenus hors activité principale</CardDescription></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-sky-900">Aucune source de revenu passif n’est actuellement définie dans les opérations existantes.</p>
          <div className="border-t border-sky-200 pt-3 text-base font-bold text-sky-900">Total : 0,000 TND</div>
        </CardContent>
      </Card>
    </div>

    <DataTable title="Achats d’olives auprès des fournisseurs" description="Achats de stock GS — affichage des opérations récentes; total calculé sur tout l’historique. Les règlements fournisseurs ne sont pas consolidés." rows={calculated.supplierPurchases} empty="Aucun achat fournisseur approuvé." columns={[
      {label:"Date",render:r=>dateOf(r)}, {label:"Bon",render:r=>r.document_number || "—"}, {label:"Fournisseur",render:r=>r.supplier_name || r.supplier_id || "—"}, {label:"Quantité (kg)",render:r=>fmt(r.total_quantity_kg)}, {label:"Montant",render:r=>fmt(r.total_amount_dt)}
    ]} />

    <DataTable title="Achats d’olives aux clients" description="Transferts récents avec contrepartie financière. La garde client est exclue; le total comptable couvre tout l’historique." rows={calculated.customerOlivePurchases} empty="Aucun achat d’olives auprès d’un client enregistré." columns={[
      {label:"Date",render:r=>dateOf(r)}, {label:"Document",render:r=>r.document_number || "—"}, {label:"Client",render:r=>r.customer_name || r.source_owner?.customer_id || "—"}, {label:"Traçabilité",render:r=>r.batch_code || "—"}, {label:"Montant convenu",render:r=>fmt(r.consideration?.agreed_amount)}
    ]} />

    <DataTable title="Achats d’huile auprès des clients" description="Bons BAH récents. Les versements RPA règlent la dette; le total couvre tout l’historique." rows={calculated.customerOilPurchases} empty="Aucun achat d’huile auprès d’un client." columns={[
      {label:"Date",render:r=>dateOf(r)}, {label:"Bon d’achat",render:r=>r.document_number || "—"}, {label:"Client",render:r=>r.customer_name || "—"}, {label:"Code",render:r=>r.traceability_code || "—"}, {label:"Montant",render:r=>fmt(r.agreed_amount_tnd)}, {label:"Payé",render:r=>fmt(r.paid_amount_tnd)}, {label:"Reste dû",render:r=>fmt(r.outstanding_amount_tnd)}
    ]} />

    <DataTable title="Revenus de trituration — Oro Verde" description="Factures de service récentes. Garde des clients : seule la prestation est un revenu. Total calculé sur tout l’historique." rows={serviceRows} empty="Aucune facture de prestation." columns={[
      {label:"Date",render:r=>dateOf(r)}, {label:"Facture",render:r=>r.number || "—"}, {label:"Client",render:r=>r.client_name || "—"}, {label:"Total",render:r=>fmt(r.total)}, {label:"Encaissé",render:r=>fmt(r.paid_amount)}, {label:"À recevoir",render:r=>fmt(r.balance)}
    ]} />

    <DataTable title="Ventes d’huile — GS" description="Factures commerciales récentes validées. Le total net intègre déjà les avoirs acceptés; les paiements règlent les créances." rows={saleRows} empty="Aucune vente commerciale facturée." columns={[
      {label:"Date",render:r=>dateOf(r)}, {label:"Facture",render:r=>r.document_number || "—"}, {label:"Acheteur",render:r=>r.buyer_name || r.buyer_id || "—"}, {label:"Total net",render:r=>fmt(r.net_amount_dt)}, {label:"Encaissé",render:r=>fmt(r.paid_amount_dt)}, {label:"À recevoir",render:r=>fmt(r.outstanding_amount_dt)}
    ]} />

    <DataTable title="Avoirs émis — retours acceptés" description="Avoirs AVO récents. Ils réduisent le revenu net de la facture d’origine; ils ne sont pas soustraits une seconde fois du total." rows={(data.commercial_credit_notes || []).filter(r => r.status === "ISSUED")} empty="Aucun avoir émis." columns={[
      {label:"Date",render:r=>dateOf(r)}, {label:"Avoir",render:r=>r.document_number || "—"}, {label:"Client",render:r=>r.buyer_name || r.buyer_id || "—"}, {label:"Facture source",render:r=>r.invoice_number || r.invoice_id || "—"}, {label:"Montant",render:r=>fmt(r.amount_dt)}
    ]} />

    <Card className="border-amber-200 bg-amber-50/50">
      <CardContent className="flex items-start gap-3 p-4 text-sm text-amber-950">
        <AlertTriangle className="mt-0.5 size-5 shrink-0" />
        <div><strong>Contrôle comptable — première version.</strong>
          <p className="mt-1">Cette page lit les documents opérationnels existants sans les modifier. Les indicateurs financiers sont agrégés côté serveur sur l’ensemble des documents; les tableaux affichent uniquement les opérations les plus récentes (limite : {data.recent_limit}). Les ventes GS sont totalisées depuis le net des factures après avoirs acceptés; les avoirs sont listés séparément pour audit sans double déduction. Les retours physiques en attente ou refusés ne réduisent pas le revenu. Les achats d’olives et d’huile sont présentés comme acquisitions de stock, pas comme charges consommées automatiquement. La garde des clients n’est jamais comptée comme achat. Les paiements initiaux et ultérieurs règlent une dette ou une créance et ne créent pas un deuxième produit ou une deuxième charge. Les achats fournisseurs et les transferts d’olives clients ne disposent pas encore d’un registre de règlements consolidé : leurs soldes de trésorerie ne sont donc pas estimés.</p>
        </div>
      </CardContent>
    </Card>
  </div>;
}
