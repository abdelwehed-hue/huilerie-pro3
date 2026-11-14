import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Activity, AlertTriangle, Beaker, CheckCircle2, ClipboardList, MapPin, ShoppingBasket, Warehouse } from "lucide-react";
import { apiGet } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type CommercialStatus = {
  active_season?: string;
  season_code?: string;
  tanks_provisioned?: number;
  active_olive_locations?: number;
  season_counters_provisioned?: number;
  ready?: boolean;
};
type Row = Record<string, any>;

async function apiGetAllPages<T>(path: string, pageSize: number): Promise<T[]> {
  const rows: T[] = [];
  for (let skip = 0, page = 0; page <= 100; skip += pageSize, page += 1) {
    const separator = path.includes("?") ? "&" : "?";
    const chunk = await apiGet<T[]>(`${path}${separator}limit=${pageSize}&skip=${skip}`);
    rows.push(...chunk);
    if (chunk.length < pageSize) return rows;
  }
  throw new Error("Commercial list exceeded the safe pagination limit.");
}

function Metric({ label, value, icon: Icon, tone }: { label: string; value: React.ReactNode; icon: React.ElementType; tone: string }) {
  return (
    <Card className={`min-w-0 border ${tone}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardDescription className="font-semibold text-current/75">{label}</CardDescription>
          <Icon className="size-6 shrink-0 opacity-80" />
        </div>
        <CardTitle className="text-2xl font-bold tabular-nums">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

export default function CommercialOverviewPanel() {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const [showTankLevels, setShowTankLevels] = useState(false);
  const [selectedTankId, setSelectedTankId] = useState("");
  const status = useQuery({
    queryKey: ["commercial", "status"],
    queryFn: () => apiGet<CommercialStatus>("/commercial/v1/status"),
    refetchInterval: 30_000,
    retry: false,
  });
  const ready = status.data?.ready === true;
  const balances = useQuery({
    queryKey: ["commercial", "balances"],
    queryFn: () => apiGetAllPages<Row>("/commercial/v1/stock-balances", 1000),
    enabled: ready,
    refetchInterval: 30_000,
    retry: false,
  });
  const lots = useQuery({
    queryKey: ["commercial", "lots"],
    queryFn: () => apiGetAllPages<Row>("/commercial/v1/lots", 500),
    enabled: ready,
    refetchInterval: 30_000,
    retry: false,
  });
  const tanks = useQuery({
    queryKey: ["commercial", "tanks"],
    queryFn: () => apiGet<Row[]>("/commercial/v1/tanks"),
    enabled: ready,
    refetchInterval: 30_000,
    retry: false,
  });
  const totals = useMemo(() => {
    const rows = balances.data ?? [];
    return {
      olives: rows.filter((row) => row.product_kind === "OLIVE").reduce((sum, row) => sum + Number(row.quantity_kg ?? 0), 0),
      oil: rows.filter((row) => row.product_kind === "OIL").reduce((sum, row) => sum + Number(row.quantity_kg ?? 0), 0),
      pending: (lots.data ?? []).filter((lot) => lot.product_kind === "OIL" && lot.quality_status !== "RELEASED").length,
    };
  }, [balances.data, lots.data]);
  const tankOilStocks = useMemo(() => (tanks.data ?? [])
    .filter((tank) => tank.active !== false)
    .map((tank, index) => ({
      tank,
      index,
      quantity: (balances.data ?? [])
        .filter((balance) => balance.product_kind === "OIL" && balance.location_id === tank.id)
        .reduce((sum, balance) => sum + Number(balance.quantity_kg ?? 0), 0),
    })), [tanks.data, balances.data]);
  const selectedTank = tankOilStocks.find(({ tank }) => String(tank.id) === selectedTankId)?.tank;
  const historyEnabled = ready && !!selectedTankId;
  const historyMovements = useQuery({ queryKey: ["dashboard", "tank-history", "movements", selectedTankId], queryFn: () => apiGetAllPages<Row>("/commercial/v1/stock-movements", 500), enabled: historyEnabled });
  const historyTransfers = useQuery({ queryKey: ["dashboard", "tank-history", "transfers", selectedTankId], queryFn: () => apiGetAllPages<Row>("/commercial/v1/internal-movements", 500), enabled: historyEnabled });
  const historyProduction = useQuery({ queryKey: ["dashboard", "tank-history", "production", selectedTankId], queryFn: () => apiGetAllPages<Row>("/commercial/v1/production-runs", 500), enabled: historyEnabled });
  const historySales = useQuery({ queryKey: ["dashboard", "tank-history", "sales", selectedTankId], queryFn: () => apiGetAllPages<Row>("/commercial/v1/sales", 500), enabled: historyEnabled });
  const historyRows = useMemo(() => {
    if (!selectedTankId) return [];
    const rows = [
      ...(historyProduction.data ?? []).filter((run) => run.output_tank_id === selectedTankId).map((run) => ({ id: "production-" + run.id, date: run.production_date ?? run.created_at, type: ar ? "إنتاج" : "Production", reference: run.document_number ?? run.batch_code ?? "—", quantity: Number(run.output_quantity_liters ?? run.actual_oil_output_kg ?? run.output_quantity_kg ?? 0), status: run.status })),
      ...(historySales.data ?? []).filter((sale) => sale.source_tank_id === selectedTankId).map((sale) => ({ id: "sale-" + sale.id, date: sale.sale_date ?? sale.created_at, type: ar ? "بيع" : "Vente", reference: sale.document_number ?? sale.batch_code ?? "—", quantity: -Number(sale.quantity_liters ?? sale.quantity_kg ?? 0), status: sale.status })),
      ...(historyTransfers.data ?? []).filter((move) => move.product_kind === "OIL" && (move.source_location_id === selectedTankId || move.destination_location_id === selectedTankId)).map((move) => ({ id: "transfer-" + move.id, date: move.created_at, type: ar ? "تحويل" : "Transfert", reference: move.document_number ?? "—", quantity: move.destination_location_id === selectedTankId ? Number(move.quantity_kg ?? 0) : -Number(move.quantity_kg ?? 0), status: move.source_location_id === selectedTankId ? (ar ? "خروج" : "Sortie") : (ar ? "دخول" : "Entrée") })),
      ...(historyMovements.data ?? []).filter((move) => move.product_kind === "OIL" && (move.source_location_id === selectedTankId || move.destination_location_id === selectedTankId)).map((move) => ({ id: "movement-" + move.id, date: move.created_at, type: ar ? "حركة مخزون" : "Mouvement de stock", reference: move.document_number ?? "—", quantity: move.destination_location_id === selectedTankId ? Number(move.quantity_kg ?? 0) : -Number(move.quantity_kg ?? 0), status: move.movement_kind ?? "—" })),
    ];
    return rows.sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")));
  }, [selectedTankId, historyProduction.data, historySales.data, historyTransfers.data, historyMovements.data, ar]);
  const historyLoading = historyMovements.isLoading || historyTransfers.isLoading || historyProduction.isLoading || historySales.isLoading;
  const historyError = historyMovements.isError || historyTransfers.isError || historyProduction.isError || historySales.isError;
  const error = status.isError;

  return (
    <section className="commercial-workspace mt-8 overflow-hidden rounded-3xl border border-[#D8DDC9] bg-white shadow-sm" dir={ar ? "rtl" : "ltr"} data-testid="dashboard-commercial-overview">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#315B25] px-5 py-4 text-white">
        <div className="flex items-center gap-3">
          <Activity className="size-6" />
          <div>
            <h2 className="text-xl font-bold">{ar ? "الإدارة التجارية — نظرة عامة" : "Gestion commerciale — Vue générale"}</h2>
            <p className="text-sm text-white/75">{ar ? "متابعة المخزون والشراء والإنتاج" : "Suivi des stocks, achats et production"}</p>
          </div>
        </div>
        <Link to="/commercial?tab=overview" className="rounded-lg border border-white/30 px-3 py-2 text-sm font-semibold hover:bg-white/10">
          {ar ? "فتح الإدارة التجارية" : "Ouvrir la gestion commerciale"} →
        </Link>
      </div>

      {error ? (
        <div className="flex items-center gap-3 p-5 text-sm text-amber-900">
          <AlertTriangle className="size-5 shrink-0" />
          {ar ? "تعذّر تحميل بيانات الإدارة التجارية. تحقق من اتصال الخادم." : "Impossible de charger les données commerciales. Vérifiez la connexion au serveur."}
        </div>
      ) : !status.data ? (
        <p className="p-5 text-sm text-stone-500">{ar ? "جارٍ تحميل بيانات الإدارة التجارية…" : "Chargement des données commerciales…"}</p>
      ) : (
        <div className="space-y-4 p-4 md:p-5">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Metric label={ar ? "الموسم النشط" : "Saison active"} value={status.data.season_code || status.data.active_season || "—"} icon={Activity} tone="commercial-card commercial-card--green" />
            <button type="button" onClick={() => setShowTankLevels((open) => !open)} aria-expanded={showTankLevels} aria-controls="dashboard-tank-levels" className="w-full rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2">
              <Metric label={ar ? "الخزانات المهيأة" : "Cuves configurées"} value={status.data.tanks_provisioned == null ? "—/9" : `${status.data.tanks_provisioned}/9`} icon={Warehouse} tone="commercial-card commercial-card--blue" />
              <span className="sr-only">{showTankLevels ? (ar ? "إخفاء مستويات الزيت" : "Masquer les niveaux") : (ar ? "عرض مستويات الزيت" : "Afficher les niveaux")}</span>
            </button>
            <Metric label={ar ? "مواقع نشطة" : "Emplacements actifs"} value={status.data.active_olive_locations ?? "—"} icon={MapPin} tone="commercial-card commercial-card--teal" />
            <Metric label={ar ? "عدادات الوثائق" : "Compteurs de documents"} value={status.data.season_counters_provisioned ?? "—"} icon={ClipboardList} tone="commercial-card commercial-card--amber" />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Metric label={ar ? "مخزون الزيتون" : "Stock d’olives"} value={!ready || balances.isLoading || balances.isError ? "—" : `${totals.olives.toLocaleString("fr-FR")} kg`} icon={ShoppingBasket} tone="commercial-card commercial-card--olive" />
            <Metric label={ar ? "مخزون الزيت" : "Stock d’huile"} value={!ready || balances.isLoading || balances.isError ? "—" : `${totals.oil.toLocaleString("fr-FR")} L`} icon={Beaker} tone="commercial-card commercial-card--amber" />
            <Metric label={ar ? "دفعات تنتظر الجودة" : "Lots en attente qualité"} value={!ready || lots.isLoading || lots.isError ? "—" : totals.pending} icon={CheckCircle2} tone="commercial-card commercial-card--rose" />
          </div>

          {showTankLevels && (
            <div id="dashboard-tank-levels" className="overflow-hidden rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-blue-100/80 p-4 shadow-sm md:p-5">
              <div className="mb-5">
                <h3 className="text-lg font-extrabold text-blue-900">{ar ? "مستوى الزيت في الخزانات" : "Niveau d’huile dans les cuves"}</h3>
                <p className="mt-1 text-sm font-semibold text-blue-800/90">{ar ? "كمية الزيت الحالية المخزنة في كل خزان" : "Quantité d’huile actuellement stockée dans chaque cuve"}</p>
              </div>
              {tanks.isLoading || balances.isLoading ? (
                <p className="rounded-xl bg-white/60 p-5 text-center text-sm text-stone-500">{ar ? "جار تحميل مستويات الخزانات…" : "Chargement des niveaux des cuves…"}</p>
              ) : tanks.isError || balances.isError ? (
                <p className="rounded-xl bg-white/60 p-5 text-center text-sm text-amber-800">{ar ? "تعذّر تحميل مستويات الخزانات." : "Impossible de charger les niveaux des cuves."}</p>
              ) : tankOilStocks.length === 0 ? (
                <p className="rounded-xl bg-white/60 p-5 text-center text-sm text-stone-500">{ar ? "لا توجد خزانات نشطة." : "Aucune cuve active."}</p>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-9">
                  {tankOilStocks.map(({ tank, index, quantity }) => {
                    const capacity = Number(tank.capacity_kg ?? 0);
                    const fillPercent = Math.max(0, Math.min(100, capacity > 0 ? quantity / capacity * 100 : 0));
                    const tankLabel = String(tank.code ?? tank.name ?? `T${String(index + 1).padStart(2, "0")}`);
                    return (
                      <div key={tank.id} className="flex min-w-0 flex-col items-center gap-2 rounded-2xl border border-[#D8E7D5] bg-white/55 px-2 pb-3 pt-4">
                        <div className="flex h-44 w-full max-w-[84px] items-end overflow-hidden rounded-xl border border-sky-200 bg-white shadow-inner">
                          <div className="w-full rounded-t-lg bg-gradient-to-t from-cyan-600 via-cyan-500 to-cyan-300 transition-[height] duration-700 ease-out" style={{ height: `${fillPercent}%`, minHeight: quantity > 0 ? "5px" : "0" }} />
                        </div>
                        <div className="w-full truncate text-center text-base font-extrabold text-slate-800">{ar ? "خزان" : "Cuve"} {tankLabel}</div>
                        <div className="text-sm font-bold tabular-nums text-sky-800">{quantity.toLocaleString("fr-FR")} L</div>
                        {capacity > 0 && <div className="text-xs font-semibold tabular-nums text-stone-600">{Math.round(fillPercent)}%</div>}
                        <button type="button" onClick={() => setSelectedTankId((current) => current === String(tank.id) ? "" : String(tank.id))} aria-expanded={selectedTankId === String(tank.id)} className="mt-1 text-xs font-bold text-sky-700 hover:text-sky-900 hover:underline">
                          {selectedTankId === String(tank.id) ? (ar ? "إخفاء العمليات" : "Masquer opérations") : (ar ? "عرض العمليات" : "Voir opérations")}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          {selectedTank && (
            <div className="overflow-hidden rounded-2xl border border-sky-200 bg-white shadow-sm" data-testid="dashboard-tank-operations">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sky-100 bg-sky-50 px-4 py-3">
                <div>
                  <h3 className="font-bold text-sky-950">{ar ? "سجل عمليات الخزان" : "Historique des opérations — Cuve"} {selectedTank.code ?? selectedTank.name}</h3>
                  <p className="text-sm text-sky-800/80">{ar ? "الإنتاج والبيع والتحويلات وحركات المخزون" : "Production, ventes, transferts et mouvements de stock"}</p>
                </div>
                <Button type="button" size="sm" variant="outline" onClick={() => setSelectedTankId("")}>{ar ? "إغلاق" : "Fermer"}</Button>
              </div>
              {historyLoading ? (
                <p className="p-5 text-center text-sm text-stone-500">{ar ? "جار تحميل العمليات…" : "Chargement des opérations…"}</p>
              ) : historyError ? (
                <p className="p-5 text-center text-sm text-amber-800">{ar ? "تعذّر تحميل سجل العمليات." : "Impossible de charger l’historique des opérations."}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead className="bg-sky-50/70 text-sky-950"><tr>
                      <th className="px-4 py-3 text-start font-semibold">{ar ? "التاريخ" : "Date"}</th>
                      <th className="px-4 py-3 text-start font-semibold">{ar ? "العملية" : "Opération"}</th>
                      <th className="px-4 py-3 text-start font-semibold">{ar ? "المرجع" : "Référence"}</th>
                      <th className="px-4 py-3 text-end font-semibold">{ar ? "كمية الزيت" : "Quantité d’huile"}</th>
                      <th className="px-4 py-3 text-start font-semibold">{ar ? "الحالة / التفاصيل" : "Statut / détails"}</th>
                    </tr></thead>
                    <tbody>
                      {historyRows.map((row) => (
                        <tr key={row.id} className="border-t border-sky-100">
                          <td className="whitespace-nowrap px-4 py-3 text-stone-700">{row.date ? new Date(row.date).toLocaleDateString(ar ? "ar-TN" : "fr-FR") : "—"}</td>
                          <td className="px-4 py-3 font-semibold text-stone-800">{row.type}</td>
                          <td className="px-4 py-3 font-mono font-semibold text-stone-800">{row.reference}</td>
                          <td className={`px-4 py-3 text-end font-bold tabular-nums ${row.quantity < 0 ? "text-rose-700" : "text-emerald-700"}`}>{row.quantity > 0 ? "+" : ""}{row.quantity.toLocaleString("fr-FR")} L</td>
                          <td className="px-4 py-3 text-stone-600">{String(row.status ?? "—")}</td>
                        </tr>
                      ))}
                      {!historyRows.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-stone-500">{ar ? "لا توجد عمليات مسجلة لهذا الخزان." : "Aucune opération enregistrée pour cette cuve."}</td></tr>}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
          {(balances.isError || lots.isError) && (
            <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <AlertTriangle className="size-5 shrink-0" />
              {ar ? "تعذّر تحميل بعض مؤشرات المخزون أو الجودة؛ لم تُعرض أرقام تقديرية." : "Certains indicateurs de stock ou de qualité sont indisponibles ; aucun chiffre estimé n’est affiché."}
            </div>
          )}

        </div>
      )}
    </section>
  );
}
