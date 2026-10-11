import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Clock, Droplet, Layers, Percent, Sprout, Wallet, Landmark } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { Load, Stats } from "@/lib/types";
import { fmtDate, fmtNum, useI18n } from "@/lib/i18n";
import { useMe } from "@/lib/useMe";
import { CodeBadge, PageHeader, StatCard, StatusPill } from "@/components/shared";
import { buttonVariants } from "@/components/ui/button";
import IntakePanel from "@/components/IntakePanel";

export default function Dashboard() {
  const { t } = useI18n();
  const me = useMe();
  const isAdmin = me.data?.role === "admin";
  const stats = useQuery({ queryKey: ["stats"], queryFn: () => apiGet<Stats>("/stats") });
  const loads = useQuery({ queryKey: ["loads", "", ""], queryFn: () => apiGet<Load[]>("/loads") });
  const s = stats.isError ? undefined : stats.data;
  const recent = loads.isError ? [] : (loads.data ?? []).slice(0, 6);

  return (
    <div>
      <PageHeader
        title={`${t("welcome")}, ${me.data?.full_name ?? ""}`}
        sub={t("dashboard")}
        accent="bg-gradient-to-r from-lime-500 via-amber-400 to-violet-500"
      />

      <section className="mb-8" data-testid="dashboard-intake-section">
        <IntakePanel />
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard tone="olive" testId="kpi-loads-today" label={t("loads_today")} value={s?.loads_today ?? "—"} icon={<Layers />} sub={`${t("totals")}: ${s?.loads_total ?? "—"}`} />
        <StatCard tone="emerald" testId="kpi-olive-today" label={t("olive_today")} value={fmtNum(s?.olive_kg_today)} unit={t("kg")} icon={<Sprout />} sub={`${t("totals")}: ${fmtNum(s?.olive_kg_total)} ${t("kg")}`} />
        <StatCard tone="gold" testId="kpi-oil-today" label={t("oil_today")} value={fmtNum(s?.oil_kg_today)} unit={t("kg")} icon={<Droplet />} sub={`${t("totals")}: ${fmtNum(s?.oil_kg_total)} ${t("kg")}`} />
        <StatCard tone="sky" testId="kpi-avg-yield" label={t("avg_yield")} value={s?.avg_yield != null ? fmtNum(s.avg_yield, 2) : "—"} unit="%" icon={<Percent />} />
        <StatCard tone="orange" testId="kpi-pending" label={t("pending_loads")} value={s?.pending ?? "—"} icon={<Clock />} />
      </div>

      {isAdmin && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <StatCard tone="violet" testId="admin-revenue-metric-card" label={t("revenue_today")} value={fmtNum(s?.revenue_today, 3)} unit={t("dt")} icon={<Wallet />} />
          <StatCard tone="rose" testId="admin-revenue-total-card" label={t("revenue_total")} value={fmtNum(s?.revenue_total, 3)} unit={t("dt")} icon={<Landmark />} />
        </div>
      )}

      <div className="mt-8 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm" data-testid="production-chart">
          <h3 className="mb-4 font-heading text-lg font-bold text-stone-900">{t("last_14_days")}</h3>
          <div className="h-72" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={s?.daily ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" vertical={false} />
                <XAxis dataKey="day" tickFormatter={(d: string) => d.slice(8) + "/" + d.slice(5, 7)} fontSize={12} stroke="#78716C" />
                <YAxis fontSize={12} stroke="#78716C" />
                <Tooltip labelFormatter={(l: string) => l} formatter={(v: number, name: string) => [`${fmtNum(v)} ${t("kg")}`, name]} />
                <Legend />
                <Bar dataKey="olive_kg" name={t("olives")} fill="#65A30D" radius={[6, 6, 0, 0]} />
                <Bar dataKey="oil_kg" name={t("oil")} fill="#EAB308" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm" data-testid="recent-loads">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-heading text-lg font-bold text-stone-900">{t("recent_loads")}</h3>
            <Link to="/loads" className={buttonVariants({ variant: "ghost", size: "sm" })} data-testid="recent-loads-see-all">
              {t("see_all")}
            </Link>
          </div>
          {recent.length === 0 ? (
            <p className="py-10 text-center text-sm text-stone-500">{t("no_data")}</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {recent.map((l) => (
                <li key={l.id}>
                  <Link to={`/search?code=${l.code}`} className="flex items-center justify-between gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-stone-50" data-testid={`recent-load-${l.code}`}>
                    <div className="min-w-0">
                      <div className="truncate font-medium text-stone-900">{l.client_name}</div>
                      <div className="text-xs text-stone-500" dir="ltr">{fmtDate(l.created_at)} · {fmtNum(l.olive_kg)} kg</div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <CodeBadge code={l.code} />
                      <StatusPill status={l.status} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
