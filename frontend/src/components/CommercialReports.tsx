import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CalendarDays, Factory, ShoppingBasket, ArrowLeftRight, ShoppingCart, RefreshCw } from "lucide-react";
import { apiGet } from "@/lib/api";
import { StatCard } from "@/components/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Row = Record<string, any>;
type Props = { lang: string };

const list = async (path: string): Promise<Row[]> => {
  const result: Row[] = [];
  for (let skip = 0, page = 0; page < 101; skip += 500, page += 1) {
    const chunk = await apiGet<Row[]>(`${path}${path.includes("?") ? "&" : "?"}limit=500&skip=${skip}`);
    result.push(...chunk);
    if (chunk.length < 500) return result;
  }
  throw new Error("Rapport GS: trop d'enregistrements pour une seule extraction.");
};
const first = (row: Row, keys: string[]) => {
  for (const key of keys) if (row[key] !== undefined && row[key] !== null && row[key] !== "") return row[key];
  return undefined;
};
const num = (row: Row, keys: string[]) => Number(first(row, keys) ?? 0) || 0;
const dateOf = (row: Row) => String(first(row, ["purchase_date", "production_date", "movement_date", "sale_date", "date", "created_at", "approved_at"]) ?? "").slice(0, 10);
const fmt = (v: number, digits = 0) => new Intl.NumberFormat("fr-TN", { maximumFractionDigits: digits }).format(v);
const labelDate = (v: string) => v ? new Date(v + "T12:00:00").toLocaleDateString() : "—";

export default function CommercialReports({ lang }: Props) {
  const ar = lang === "ar";
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const purchases = useQuery({ queryKey: ["commercial", "report", "purchases"], queryFn: () => list("/commercial/v1/olive-purchases") });
  const production = useQuery({ queryKey: ["commercial", "report", "production"], queryFn: () => list("/commercial/v1/production-runs") });
  const transfers = useQuery({ queryKey: ["commercial", "report", "transfers"], queryFn: () => list("/commercial/v1/internal-movements") });
  const sales = useQuery({ queryKey: ["commercial", "report", "sales"], queryFn: () => list("/commercial/v1/sales") });

  const filtered = useMemo(() => {
    const within = (row: Row) => {
      const d = dateOf(row);
      return (!start || (d && d >= start)) && (!end || (d && d <= end));
    };
    const groups = [
      ...(purchases.data ?? []).filter(within).map(row => ({ row, kind: "Achat", kindAr: "شراء", date: dateOf(row), code: first(row, ["document_number", "purchase_number", "batch_code"]), party: first(row, ["supplier_name", "supplier"]), qty: num(row, ["total_quantity_kg", "quantity_kg", "total_olive_kg"]), unit: "kg", amount: num(row, ["total_amount_dt", "total_amount", "amount_dt"]), status: first(row, ["status", "approval_status"]) })),
      ...(production.data ?? []).filter(within).map(row => ({ row, kind: "Production", kindAr: "إنتاج", date: dateOf(row), code: first(row, ["document_number", "production_number"]), party: first(row, ["output_tank_code", "tank_code"]), qty: num(row, ["output_quantity_liters", "output_liters", "oil_quantity_liters"]), unit: "L", amount: 0, status: first(row, ["status"]) })),
      ...(transfers.data ?? []).filter(within).map(row => ({ row, kind: "Transfert", kindAr: "تحويل", date: dateOf(row), code: first(row, ["document_number", "movement_number"]), party: [first(row, ["source_location_name", "source_location"]), first(row, ["destination_location_name", "destination_location"])].filter(Boolean).join(" → "), qty: num(row, ["quantity", "quantity_kg", "quantity_liters"]), unit: first(row, ["product_kind"]) === "OIL" ? "L" : "kg", amount: 0, status: first(row, ["status", "movement_kind"]) })),
      ...(sales.data ?? []).filter(within).map(row => ({ row, kind: "Vente", kindAr: "بيع", date: dateOf(row), code: first(row, ["document_number", "sale_number", "id"]), party: first(row, ["buyer_name", "customer_name"]), qty: num(row, ["quantity_liters", "total_quantity_liters", "shipped_quantity_liters"]), unit: "L", amount: num(row, ["total_amount_dt", "total_amount", "amount_dt"]), status: first(row, ["status"]) })),
    ];
    return groups.sort((a, b) => b.date.localeCompare(a.date));
  }, [purchases.data, production.data, transfers.data, sales.data, start, end]);

  const totalPurchaseKg = filtered.filter(x => x.kind === "Achat").reduce((s, x) => s + x.qty, 0);
  const totalProductionL = filtered.filter(x => x.kind === "Production").reduce((s, x) => s + x.qty, 0);
  const totalSalesL = filtered.filter(x => x.kind === "Vente").reduce((s, x) => s + x.qty, 0);
  const totalSalesAmount = filtered.filter(x => x.kind === "Vente").reduce((s, x) => s + x.amount, 0);
  const chart = useMemo(() => {
    const buckets = new Map<string, { period: string; achats: number; production: number; ventes: number }>();
    filtered.forEach(x => {
      const period = x.date ? x.date.slice(0, 7) : "Sans date";
      const b = buckets.get(period) ?? { period, achats: 0, production: 0, ventes: 0 };
      if (x.kind === "Achat") b.achats += x.qty;
      if (x.kind === "Production") b.production += x.qty;
      if (x.kind === "Vente") b.ventes += x.qty;
      buckets.set(period, b);
    });
    return [...buckets.values()].sort((a, b) => a.period.localeCompare(b.period));
  }, [filtered]);
  const loading = purchases.isLoading || production.isLoading || transfers.isLoading || sales.isLoading;
  const error = purchases.error || production.error || transfers.error || sales.error;

  return <div className="space-y-5" dir={ar ? "rtl" : "ltr"}>
    <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-violet-200 bg-violet-50/70 p-4">
      <div className="flex items-center gap-2 font-semibold text-violet-950"><CalendarDays className="size-5" /> {ar ? "الفترة" : "Période du rapport"}</div>
      <label className="grid gap-1 text-xs font-medium text-stone-600">{ar ? "من" : "Du"}<input type="date" value={start} onChange={e => setStart(e.target.value)} className="h-9 rounded-lg border bg-white px-2 text-sm" /></label>
      <label className="grid gap-1 text-xs font-medium text-stone-600">{ar ? "إلى" : "Au"}<input type="date" value={end} onChange={e => setEnd(e.target.value)} className="h-9 rounded-lg border bg-white px-2 text-sm" /></label>
      <button className="h-9 rounded-lg border border-stone-300 bg-white px-3 text-sm hover:bg-stone-100" onClick={() => { setStart(""); setEnd(""); }}>{ar ? "كل الفترات" : "Toute la période"}</button>
      <button className="ml-auto flex h-9 items-center gap-2 rounded-lg border border-stone-300 bg-white px-3 text-sm hover:bg-stone-100" onClick={() => { void purchases.refetch(); void production.refetch(); void transfers.refetch(); void sales.refetch(); }}><RefreshCw className="size-4" />{ar ? "تحديث" : "Actualiser"}</button>
    </div>
    {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{ar ? "تعذر تحميل جزء من بيانات التقرير. تحقق من الاتصال ثم حدّث الصفحة." : "Impossible de charger une partie des données du rapport. Vérifiez la connexion puis actualisez."}</div>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard tone="gold" label={ar ? "الزيتون المشتَرى" : "Olives achetées"} value={fmt(totalPurchaseKg, 3)} unit="kg" icon={<ShoppingBasket />} />
      <StatCard tone="emerald" label={ar ? "الإنتاج" : "Production d'huile"} value={fmt(totalProductionL, 3)} unit="L" icon={<Factory />} />
      <StatCard tone="sky" label={ar ? "المبيعات" : "Volume vendu"} value={fmt(totalSalesL, 3)} unit="L" icon={<ShoppingCart />} />
      <StatCard tone="rose" label={ar ? "قيمة المبيعات" : "Valeur des ventes"} value={fmt(totalSalesAmount, 3)} unit="TND" icon={<ShoppingCart />} />
    </div>
    <Card>
      <CardHeader><CardTitle>{ar ? "تطور النشاط حسب الشهر" : "Évolution mensuelle des opérations"}</CardTitle></CardHeader>
      <CardContent>
        {chart.length ? <div className="h-[320px] w-full" dir="ltr"><ResponsiveContainer width="100%" height="100%"><BarChart data={chart} margin={{ top: 8, right: 18, left: 8, bottom: 8 }}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="period" /><YAxis /><Tooltip formatter={(v: number) => fmt(Number(v), 3)} /><Legend /><Bar dataKey="achats" name="Achats (kg)" fill="#D6A33A" radius={[5,5,0,0]} /><Bar dataKey="production" name="Production (L)" fill="#15966B" radius={[5,5,0,0]} /><Bar dataKey="ventes" name="Ventes (L)" fill="#3987C9" radius={[5,5,0,0]} /></BarChart></ResponsiveContainer></div> : <p className="py-12 text-center text-sm text-stone-500">{loading ? (ar ? "جار تحميل البيانات…" : "Chargement des données…") : (ar ? "لا توجد بيانات في هذه الفترة" : "Aucune donnée sur cette période")}</p>}
      </CardContent>
    </Card>
    <Card>
      <CardHeader><CardTitle>{ar ? "سجل جميع عمليات GS" : "Journal des opérations GS"}</CardTitle></CardHeader>
      <CardContent className="p-0 sm:p-6">
        <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>{ar ? "التاريخ" : "Date"}</TableHead><TableHead>{ar ? "العملية" : "Opération"}</TableHead><TableHead>{ar ? "المرجع" : "Document / Code"}</TableHead><TableHead>{ar ? "المزوّد / الحريف / الموقع" : "Fournisseur / Client / Emplacement"}</TableHead><TableHead className="text-end">{ar ? "الكمية" : "Quantité"}</TableHead><TableHead>{ar ? "الحالة" : "Statut"}</TableHead></TableRow></TableHeader><TableBody>
          {filtered.map((x, i) => <TableRow key={String(x.code ?? i) + x.kind}><TableCell className="whitespace-nowrap">{labelDate(x.date)}</TableCell><TableCell className="font-semibold">{ar ? x.kindAr : x.kind}</TableCell><TableCell className="font-mono text-xs">{String(x.code ?? "—")}</TableCell><TableCell>{String(x.party ?? "—")}</TableCell><TableCell className="text-end tabular-nums">{fmt(x.qty, 3)} {x.unit}</TableCell><TableCell>{String(x.status ?? "—")}</TableCell></TableRow>)}
          {!filtered.length && <TableRow><TableCell colSpan={6} className="py-10 text-center text-stone-500">{loading ? (ar ? "جار تحميل البيانات…" : "Chargement…") : (ar ? "لا توجد عمليات مسجلة" : "Aucune opération enregistrée")}</TableCell></TableRow>}
        </TableBody></Table></div>
      </CardContent>
    </Card>
    <p className="text-xs text-stone-500">{ar ? "تعرض هذه الصفحة عمليات GS المسجلة فقط. لا تشمل عمليات العصر العادية." : "Ce rapport couvre uniquement les opérations enregistrées dans GS. Les opérations de trituration classiques en sont exclues."}</p>
  </div>;
}
