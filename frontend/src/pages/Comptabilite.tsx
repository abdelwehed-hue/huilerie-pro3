import { useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshCw, TrendingUp, TrendingDown, Wallet, Package, AlertTriangle, ReceiptText, type LucideIcon } from "lucide-react";

type Row = Record<string, any>;
type Overview = {
  traditional_invoices: Row[];
  supplier_olive_purchases: Row[];
  customer_ownership_transfers: Row[];
  customer_oil_purchases: Row[];
  commercial_sales_invoices: Row[];
  commercial_sale_payments: Row[];
  customer_oil_purchase_payments: Row[];
  suppliers: Row[];
};

const n = (v: unknown) => {
  const value = Number(v ?? 0);
  return Number.isFinite(value) ? value : 0;
};
const money = (v: unknown) => new Intl.NumberFormat("fr-TN", {
  minimumFractionDigits: 3, maximumFractionDigits: 3,
}).format(n(v)) + " TND";
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
    const serviceRevenue = sum(data?.traditional_invoices || [], "total");
    const salesRevenue = sum(data?.commercial_sales_invoices || [], "net_amount_dt");
    const supplierPurchases = (data?.supplier_olive_purchases || []).filter(r => r.status === "APPROVED");
    const customerOlivePurchases = (data?.customer_ownership_transfers || []).filter(r =>
      r.status === "APPROVED" && r.movement_kind === "OWNERSHIP_TRANSFER" &&
      r.product_kind === "OLIVE" && r.consideration?.type === "SALE"
    );
    const customerOilPurchases = data?.customer_oil_purchases || [];
    const stockPurchases = sum(supplierPurchases, "total_amount_dt") +
      customerOlivePurchases.reduce((s, r) => s + n(r.consideration?.agreed_amount), 0) +
      sum(customerOilPurchases, "agreed_amount_tnd");
    const serviceCollected = sum(data?.traditional_invoices || [], "paid_amount");
    const gsCollected = sum(data?.commercial_sales_invoices || [], "paid_amount_dt");
    const oilPaid = sum(customerOilPurchases, "initial_paid_amount_tnd") +
      sum(data?.customer_oil_purchase_payments || [], "amount_tnd");
    return { serviceRevenue, salesRevenue, supplierPurchases, customerOlivePurchases,
      customerOilPurchases, stockPurchases, serviceCollected, gsCollected, oilPaid };
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
      <Metric title="Revenus de prestation" value={fmt(calculated.serviceRevenue)} detail="Factures de trituration Oro Verde" icon={TrendingUp} tone="bg-emerald-50 text-emerald-700" />
      <Metric title="Ventes d’huile GS" value={fmt(calculated.salesRevenue)} detail="Factures commerciales approuvées" icon={TrendingUp} tone="bg-blue-50 text-blue-700" />
      <Metric title="Achats de stock" value={fmt(calculated.stockPurchases)} detail="Olives fournisseurs + clients et huile clients" icon={Package} tone="bg-amber-50 text-amber-700" />
      <Metric title="Encaissements connus" value={fmt(calculated.serviceCollected + calculated.gsCollected)} detail="Règlements clients enregistrés sur factures" icon={Wallet} tone="bg-violet-50 text-violet-700" />
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

    <DataTable title="Achats d’olives auprès des fournisseurs" description="Achats de stock GS — les paiements fournisseurs ne sont pas encore consolidés ici." rows={calculated.supplierPurchases} empty="Aucun achat fournisseur approuvé." columns={[
      {label:"Date",render:r=>dateOf(r)}, {label:"Bon",render:r=>r.document_number || "—"}, {label:"Fournisseur",render:r=>r.supplier_name || r.supplier_id || "—"}, {label:"Quantité (kg)",render:r=>fmt(r.total_quantity_kg)}, {label:"Montant",render:r=>fmt(r.total_amount_dt)}
    ]} />

    <DataTable title="Achats d’olives aux clients" description="Uniquement les transferts de propriété avec contrepartie financière. La garde client est exclue." rows={calculated.customerOlivePurchases} empty="Aucun achat d’olives auprès d’un client enregistré." columns={[
      {label:"Date",render:r=>dateOf(r)}, {label:"Document",render:r=>r.document_number || "—"}, {label:"Client",render:r=>r.source_owner?.customer_id || r.customer_name || "—"}, {label:"Traçabilité",render:r=>r.batch_code || "—"}, {label:"Montant convenu",render:r=>fmt(r.consideration?.agreed_amount)}
    ]} />

    <DataTable title="Achats d’huile auprès des clients" description="Bons BAH. Les versements RPA sont des règlements de dette, pas de nouveaux achats." rows={calculated.customerOilPurchases} empty="Aucun achat d’huile auprès d’un client." columns={[
      {label:"Date",render:r=>dateOf(r)}, {label:"Bon d’achat",render:r=>r.document_number || "—"}, {label:"Client",render:r=>r.customer_name || "—"}, {label:"Code",render:r=>r.traceability_code || "—"}, {label:"Montant",render:r=>fmt(r.agreed_amount_tnd)}, {label:"Payé",render:r=>fmt(r.paid_amount_tnd)}, {label:"Reste dû",render:r=>fmt(r.outstanding_amount_tnd)}
    ]} />

    <DataTable title="Revenus de trituration — Oro Verde" description="Factures de service. Garde des clients : seule la prestation est un revenu, les olives et l’huile restent la propriété du client." rows={serviceRows} empty="Aucune facture de prestation." columns={[
      {label:"Date",render:r=>dateOf(r)}, {label:"Facture",render:r=>r.number || "—"}, {label:"Client",render:r=>r.client_name || "—"}, {label:"Total",render:r=>fmt(r.total)}, {label:"Encaissé",render:r=>fmt(r.paid_amount)}, {label:"À recevoir",render:r=>fmt(r.balance)}
    ]} />

    <DataTable title="Ventes d’huile — GS" description="Factures commerciales approuvées. Les paiements sont des encaissements de créances, pas un second revenu." rows={saleRows} empty="Aucune vente commerciale facturée." columns={[
      {label:"Date",render:r=>dateOf(r)}, {label:"Facture",render:r=>r.document_number || "—"}, {label:"Acheteur",render:r=>r.buyer_name || r.buyer_id || "—"}, {label:"Total net",render:r=>fmt(r.net_amount_dt)}, {label:"Encaissé",render:r=>fmt(r.paid_amount_dt)}, {label:"À recevoir",render:r=>fmt(r.outstanding_amount_dt)}
    ]} />

    <Card className="border-amber-200 bg-amber-50/50">
      <CardContent className="flex items-start gap-3 p-4 text-sm text-amber-950">
        <AlertTriangle className="mt-0.5 size-5 shrink-0" />
        <div><strong>Contrôle comptable — première version.</strong>
          <p className="mt-1">Cette page lit les documents opérationnels existants sans les modifier. Les achats d’olives et d’huile sont présentés comme acquisitions de stock, pas comme charges consommées automatiquement. La garde des clients n’est jamais comptée comme achat. Les paiements initiaux et ultérieurs règlent une dette ou une créance et ne créent pas un deuxième produit ou une deuxième charge. Les achats fournisseurs et les transferts d’olives clients ne disposent pas encore d’un registre de règlements consolidé : leurs soldes de trésorerie ne sont donc pas estimés.</p>
        </div>
      </CardContent>
    </Card>
  </div>;
}
