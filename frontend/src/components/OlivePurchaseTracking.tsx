import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Row = Record<string, any>;
type Status = { ready?: boolean };

async function getAllPages<T>(path: string, pageSize: number): Promise<T[]> {
  const rows: T[] = [];
  for (let skip = 0, page = 0; page <= 100; skip += pageSize, page += 1) {
    const chunk = await apiGet<T[]>(`${path}?limit=${pageSize}&skip=${skip}`);
    rows.push(...chunk);
    if (chunk.length < pageSize) return rows;
  }
  throw new Error("La liste dépasse la limite de pagination autorisée.");
}

function displayDate(value: unknown, lang: string) {
  if (!value) return "—";
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? String(value) : new Intl.DateTimeFormat(lang === "ar" ? "ar-TN" : "fr-FR").format(parsed);
}

export default function OlivePurchaseTracking() {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const status = useQuery({ queryKey: ["commercial", "status"], queryFn: () => apiGet<Status>("/commercial/v1/status"), refetchInterval: 30_000 });
  const ready = status.data?.ready === true;
  const purchases = useQuery({ queryKey: ["commercial", "purchases"], queryFn: () => getAllPages<Row>("/commercial/v1/olive-purchases", 500), enabled: ready });
  const suppliers = useQuery({ queryKey: ["commercial", "suppliers"], queryFn: () => getAllPages<Row>("/commercial/v1/suppliers", 500), enabled: ready });
  const varieties = useQuery({ queryKey: ["commercial", "varieties"], queryFn: () => getAllPages<Row>("/commercial/v1/varieties", 500), enabled: ready });
  const lots = useQuery({ queryKey: ["commercial", "lots"], queryFn: () => getAllPages<Row>("/commercial/v1/lots", 500), enabled: ready });
  const balances = useQuery({ queryKey: ["commercial", "balances"], queryFn: () => getAllPages<Row>("/commercial/v1/stock-balances", 1000), enabled: ready });
  const productionRuns = useQuery({ queryKey: ["commercial", "production-runs"], queryFn: () => getAllPages<Row>("/commercial/v1/production-runs", 500), enabled: ready });

  const rows = [...(purchases.data ?? [])].sort((a, b) =>
    String(b.purchase_date ?? b.created_at ?? "").localeCompare(String(a.purchase_date ?? a.created_at ?? "")),
  );
  const loading = status.isLoading || (ready && (purchases.isLoading || suppliers.isLoading || varieties.isLoading || lots.isLoading || balances.isLoading || productionRuns.isLoading));
  const failed = status.isError || (ready && (purchases.isError || suppliers.isError || varieties.isError || lots.isError || balances.isError || productionRuns.isError));

  const text = {
    title: ar ? "متابعة عمليات شراء الزيتون" : "Suivi des achats d’olives",
    description: ar ? "تتبع كود الشراء وموقعه في مراحل الإنتاج" : "Suivi du code d’achat et de son avancement dans le processus de production",
    code: ar ? "كود الشراء" : "Code d’achat",
    date: ar ? "تاريخ الشراء" : "Date d’achat",
    supplier: ar ? "المزوّد" : "Fournisseur",
    variety: ar ? "صنف الزيتون" : "Variété d’olives",
    status: ar ? "الحالة" : "Statut",
    noRows: ar ? "لا توجد بيانات لعرضها" : "Aucune donnée à afficher",
    loading: ar ? "جارٍ تحميل متابعة المشتريات…" : "Chargement du suivi des achats…",
    unavailable: ar ? "تعذر تحميل بيانات متابعة المشتريات." : "Impossible de charger le suivi des achats.",
    notReady: ar ? "وحدة التسيير التجاري غير مهيأة بعد." : "Le module commercial n’est pas encore initialisé.",
  };

  const value = (v: unknown) => v == null || v === "" ? "—" : String(v);
  const codeFor = (purchase: Row) => {
    const linked = (lots.data ?? []).filter((lot) => lot.source_purchase_id === purchase.id && lot.batch_code).map((lot) => String(lot.batch_code));
    const stored = [
      ...(Array.isArray(purchase.batch_codes) ? purchase.batch_codes : []),
      purchase.batch_code,
      purchase.traceability_code,
      ...(Array.isArray(purchase.lines) ? purchase.lines.map((line: Row) => line.batch_code ?? line.traceability_code) : []),
    ].filter(Boolean).map(String);
    return Array.from(new Set([...linked, ...stored])).join(", ") || value(purchase.document_number);
  };

  const stageFor = (purchase: Row) => {
    if (purchase.status === "DRAFT") return ar ? "مسودة شراء" : "Brouillon d’achat";
    if (purchase.status === "CANCELLED") return ar ? "شراء ملغى" : "Achat annulé";
    const linkedLots = (lots.data ?? []).filter((lot) => lot.source_purchase_id === purchase.id || (purchase.batch_codes ?? [purchase.batch_code]).filter(Boolean).includes(lot.batch_code));
    const production = (productionRuns.data ?? []).some((run) => linkedLots.some((lot) => lot.id === run.input_lot_id || lot.id === run.source_lot_id));
    if (production) return ar ? "تم تسجيل الإنتاج" : "Production enregistrée";
    const available = linkedLots.some((lot) => (balances.data ?? []).some((balance) => balance.product_kind === "OLIVE" && balance.lot_id === lot.id && Number(balance.quantity_kg ?? 0) > 0));
    if (available) return ar ? "مخزون زيتون — بانتظار الإنتاج" : "Stock d’olives — en attente de production";
    if (linkedLots.length) return ar ? "الدفعة موجودة — لا يوجد رصيد زيتون متبقٍ" : "Lot créé — olives consommées ou transférées";
    return ar ? "شراء مصادق عليه — بانتظار الاستلام" : "Achat approuvé — réception à suivre";
  };

  return (
    <Card className="mt-6 overflow-hidden rounded-2xl border border-emerald-900/15 shadow-sm" dir={ar ? "rtl" : "ltr"}>
      <CardHeader className="bg-[#0F5425] text-white">
        <CardTitle className="text-xl font-bold">{text.title}</CardTitle>
        <CardDescription className="text-white/80">{text.description}</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? <p className="p-6 text-center text-sm text-muted-foreground">{text.loading}</p>
          : failed ? <p className="p-6 text-center text-sm text-red-700">{text.unavailable}</p>
          : !ready ? <p className="p-6 text-center text-sm text-muted-foreground">{text.notReady}</p>
          : <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow className="bg-emerald-50">
                <TableHead>{text.code}</TableHead>
                <TableHead>{text.date}</TableHead>
                <TableHead>{text.supplier}</TableHead>
                <TableHead>{text.variety}</TableHead>
                <TableHead>{text.status}</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {rows.map((purchase) => {
                  const linkedLots = (lots.data ?? []).filter((lot) => lot.source_purchase_id === purchase.id || (purchase.batch_codes ?? [purchase.batch_code]).filter(Boolean).includes(lot.batch_code));
                  const varietyIds = Array.from(new Set(linkedLots.map((lot) => lot.variety_id).concat((purchase.lines ?? []).map((line: Row) => line.variety_id)).filter(Boolean)));
                  const varietyNames = varietyIds.map((id) => {
                    const variety = (varieties.data ?? []).find((item) => item.id === id);
                    return variety ? (ar ? variety.name_ar || variety.name_fr : variety.name_fr || variety.name_ar) : "";
                  }).filter(Boolean);
                  const supplier = (suppliers.data ?? []).find((item) => item.id === purchase.supplier_id);
                  return <TableRow key={purchase.id}>
                    <TableCell className="font-mono font-bold text-stone-900">{codeFor(purchase)}</TableCell>
                    <TableCell>{displayDate(purchase.purchase_date ?? purchase.created_at, lang)}</TableCell>
                    <TableCell>{value(supplier?.name)}</TableCell>
                    <TableCell>{varietyNames.join(" / ") || "—"}</TableCell>
                    <TableCell><span className="inline-flex rounded-md bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-800">{stageFor(purchase)}</span></TableCell>
                  </TableRow>;
                })}
                {!rows.length && <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">{text.noRows}</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>}
      </CardContent>
    </Card>
  );
}
