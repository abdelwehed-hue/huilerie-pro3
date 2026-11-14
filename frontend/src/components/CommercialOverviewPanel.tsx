import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Activity, AlertTriangle, Beaker, CheckCircle2, ClipboardList, MapPin, ShoppingBasket, Warehouse } from "lucide-react";
import { apiGet } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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
  const error = status.isError;

  return (
    <section className="mt-8 overflow-hidden rounded-3xl border border-[#D8DDC9] bg-white shadow-sm" dir={ar ? "rtl" : "ltr"} data-testid="dashboard-commercial-overview">
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
            <Metric label={ar ? "مخزون الزيتون" : "Stock d’olives"} value={!ready || balances.isLoading || balances.isError ? "—" : `${totals.olives.toLocaleString("fr-FR")} kg`} icon={ShoppingBasket} tone="commercial-card commercial-card--lime" />
            <Metric label={ar ? "مخزون الزيت" : "Stock d’huile"} value={!ready || balances.isLoading || balances.isError ? "—" : `${totals.oil.toLocaleString("fr-FR")} L`} icon={Beaker} tone="commercial-card commercial-card--amber" />
            <Metric label={ar ? "دفعات تنتظر الجودة" : "Lots en attente qualité"} value={!ready || lots.isLoading || lots.isError ? "—" : totals.pending} icon={CheckCircle2} tone="commercial-card commercial-card--rose" />
          </div>

          {showTankLevels && (
            <div id="dashboard-tank-levels" className="overflow-hidden rounded-2xl border border-sky-200 bg-white shadow-sm">
              <div className="border-b border-sky-100 bg-sky-50 px-4 py-3">
                <h3 className="font-bold text-sky-950">{ar ? "مستوى الزيت في الخزانات" : "Niveau d’huile dans les cuves"}</h3>
                <p className="text-sm text-sky-800/80">{ar ? "كمية الزيت الحالية في كل خزان" : "Quantité d’huile actuellement stockée dans chaque cuve"}</p>
              </div>
              {tanks.isLoading || balances.isLoading ? (
                <p className="p-5 text-center text-sm text-stone-500">{ar ? "جار تحميل مستويات الخزانات…" : "Chargement des niveaux des cuves…"}</p>
              ) : tanks.isError || balances.isError ? (
                <p className="p-5 text-center text-sm text-amber-800">{ar ? "تعذّر تحميل مستويات الخزانات." : "Impossible de charger les niveaux des cuves."}</p>
              ) : tankOilStocks.length === 0 ? (
                <p className="p-5 text-center text-sm text-stone-500">{ar ? "لا توجد خزانات نشطة." : "Aucune cuve active."}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-sm">
                    <thead className="bg-sky-50/70 text-sky-950"><tr>
                      <th className="px-4 py-3 text-start font-semibold">{ar ? "الخزان" : "Cuve"}</th>
                      <th className="px-4 py-3 text-end font-semibold">{ar ? "مستوى الزيت" : "Niveau d’huile"}</th>
                      <th className="px-4 py-3 text-end font-semibold">{ar ? "السعة" : "Capacité"}</th>
                    </tr></thead>
                    <tbody>{tankOilStocks.map(({ tank, index, quantity }) => (
                      <tr key={tank.id} className="border-t border-sky-100">
                        <td className="px-4 py-3 font-semibold text-stone-800">{ar ? "خزان" : "Cuve"} {String(tank.code ?? tank.name ?? index + 1)}</td>
                        <td className="px-4 py-3 text-end font-bold tabular-nums text-sky-800">{quantity.toLocaleString("fr-FR")} L</td>
                        <td className="px-4 py-3 text-end tabular-nums text-stone-600">{Number(tank.capacity_kg ?? 0) > 0 ? `${Number(tank.capacity_kg).toLocaleString("fr-FR")} L` : (ar ? "غير محددة" : "Non définie")}</td>
                      </tr>
                    ))}</tbody>
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
