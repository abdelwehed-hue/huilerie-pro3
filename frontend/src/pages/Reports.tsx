import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { FileSpreadsheet, FileText, ShieldAlert, Wallet, Layers, Sprout, Droplet } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { buttonVariants } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiGet } from "@/lib/api";
import type { Load, RevenueReport, User, WorkerReport } from "@/lib/types";
import { fmtDate, fmtNum, useI18n } from "@/lib/i18n";
import { useMe } from "@/lib/useMe";
import { PageHeader, StatCard, StatusPill } from "@/components/shared";
import { cn } from "@/lib/utils";

export default function Reports() {
  const { t } = useI18n();
  const me = useMe();
  const [period, setPeriod] = useState<"daily" | "monthly">("daily");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [worker, setWorker] = useState("");
  const qs = `period=${period}${start ? `&start=${start}` : ""}${end ? `&end=${end}` : ""}${worker ? `&worker=${encodeURIComponent(worker)}` : ""}`;
  const isAdmin = me.data?.role === "admin";
  const users = useQuery({ queryKey: ["users"], queryFn: () => apiGet<User[]>("/users"), enabled: isAdmin });
  const userList = users.isError ? [] : (users.data ?? []);
  const reportLoads = useQuery({
    queryKey: ["report-load-varieties", start, end, period],
    queryFn: () => apiGet<Load[]>("/loads"),
    enabled: isAdmin,
  });
  const reportLoadList = (reportLoads.isError ? [] : (reportLoads.data ?? [])).filter((l) => (!start || l.day >= start) && (!end || l.day <= end));
  const varietiesByPeriod = new Map<string, string[]>();
  reportLoadList.forEach((l) => {
    const key = period === "monthly" ? l.day.slice(0, 7) : l.day;
    const variety = l.variety?.trim();
    if (!variety) return;
    const values = varietiesByPeriod.get(key) ?? [];
    if (!values.includes(variety)) values.push(variety);
    varietiesByPeriod.set(key, values);
  });
  const allVarieties = [...new Set(reportLoadList.map((l) => l.variety?.trim()).filter((v): v is string => !!v))];
  const workerVarieties = new Map<string, string[]>();
  reportLoadList.forEach((l) => {
    const variety = l.variety?.trim();
    if (!variety || !l.created_by_name) return;
    const key = `${l.day}|${l.created_by_name}`;
    const values = workerVarieties.get(key) ?? [];
    if (!values.includes(variety)) values.push(variety);
    workerVarieties.set(key, values);
  });

  const wloads = useQuery({
    queryKey: ["loads", "by-worker", worker],
    queryFn: () => apiGet<Load[]>(`/loads?worker=${encodeURIComponent(worker)}`),
    enabled: isAdmin && !!worker,
  });

  const rep = useQuery({
    queryKey: ["report", qs],
    queryFn: () => apiGet<RevenueReport>(`/reports/revenue?${qs}`),
    enabled: isAdmin,
  });
  const r = rep.isError ? undefined : rep.data;
  const invoicesQuery = useQuery({
    queryKey: ["report-invoice-totals"],
    queryFn: () => apiGet<Array<{ id: string; day?: string; total?: number; paid_amount?: number; balance?: number }>>("/invoices"),
    enabled: isAdmin,
  });
  const wrep = useQuery({
    queryKey: ["report-workers", qs],
    queryFn: () => apiGet<WorkerReport>(`/reports/workers?${qs}`),
    enabled: isAdmin,
  });
  const w = wrep.isError ? undefined : wrep.data;
  const rs = start || r?.start || "";
  const re = end || r?.end || "";
  const reportInvoices = (invoicesQuery.isError ? [] : (invoicesQuery.data ?? []))
    .filter((invoice) => (!rs || (invoice.day ?? "") >= rs) && (!re || (invoice.day ?? "") <= re));
  const invoiceTotals = reportInvoices.reduce(
    (totals, invoice) => ({
      total: totals.total + Number(invoice.total ?? 0),
      paid: totals.paid + Number(invoice.paid_amount ?? 0),
      balance: totals.balance + Number(invoice.balance ?? 0),
    }),
    { total: 0, paid: 0, balance: 0 },
  );
  const wl = (wloads.isError ? [] : (wloads.data ?? [])).filter((l) => (!rs || l.day >= rs) && (!re || l.day <= re));

  if (me.data && !isAdmin) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-6 text-red-800" data-testid="admin-only-notice">
        <ShieldAlert /> {t("admin_only")}
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={t("reports")}
        sub={t("reports_sub")}
        accent="bg-violet-500"
        right={
          <div className="flex gap-2">
            <a href={`https://huilerie-pro3.onrender.com/api/reports/revenue.xlsx?${qs}`} download data-testid="report-export-excel" className={cn(buttonVariants(), "rounded-xl bg-green-700 hover:bg-green-800")}>
              <FileSpreadsheet className="size-4" /> {t("export_excel")}
            </a>
            <a href={`https://huilerie-pro3.onrender.com/api/reports/revenue.pdf?${qs}`} download data-testid="report-export-pdf" className={cn(buttonVariants(), "rounded-xl bg-rose-600 hover:bg-rose-700")}>
              <FileText className="size-4" /> {t("export_pdf")}
            </a>
          </div>
        }
      />
      <div className="mb-6 flex flex-wrap items-end gap-4 rounded-2xl border border-violet-200 bg-[#FAF5FF] p-4">
        <div className="space-y-2">
          <Label>{t("worker_col")}</Label>
          <Select value={worker || "__all"} onValueChange={(v) => setWorker(v === "__all" || !v ? "" : (v as string))}>
            <SelectTrigger className="h-9 w-52 rounded-xl bg-white" data-testid="report-worker-select"><SelectValue>{(v) => (v === "__all" ? t("all_workers") : (userList.find((u) => u.username === v)?.full_name ?? String(v)))}</SelectValue></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">{t("all_workers")}</SelectItem>
              {userList.map((u) => <SelectItem key={u.id} value={u.username} data-testid={`report-worker-option-${u.username}`}>{u.full_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>{t("period")}</Label>
          <Tabs value={period} onValueChange={(v) => setPeriod(v as "daily" | "monthly")}>
            <TabsList>
              <TabsTrigger value="daily" data-testid="report-period-daily">{t("daily")}</TabsTrigger>
              <TabsTrigger value="monthly" data-testid="report-period-monthly">{t("monthly")}</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <div className="space-y-2">
          <Label htmlFor="rs">{t("from")}</Label>
          <Input id="rs" type="date" data-testid="report-start-input" value={start || r?.start || ""} onChange={(e) => setStart(e.target.value)} className="h-9 rounded-xl bg-white" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="re">{t("to")}</Label>
          <Input id="re" type="date" data-testid="report-end-input" value={end || r?.end || ""} onChange={(e) => setEnd(e.target.value)} className="h-9 rounded-xl bg-white" />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard tone="violet" testId="report-total-revenue" label={t("revenue")} value={fmtNum(r?.total.revenue, 3)} unit={t("dt")} icon={<Wallet />} />
        <StatCard tone="rose" label={t("loads")} value={r?.total.loads ?? "—"} icon={<Layers />} />
        <StatCard tone="olive" label={t("olive_kg")} value={fmtNum(r?.total.olive_kg)} unit={t("kg")} icon={<Sprout />} />
        <StatCard tone="gold" label={t("oil_kg")} value={fmtNum(r?.total.oil_kg)} unit={t("kg")} icon={<Droplet />} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <div className="h-72" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={r?.rows ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" vertical={false} />
                <XAxis dataKey="period" fontSize={11} stroke="#78716C" />
                <YAxis fontSize={11} stroke="#78716C" />
                <Tooltip formatter={(v: number) => [`${fmtNum(v, 3)} ${t("dt")}`, t("revenue")]} />
                <Bar dataKey="revenue" fill="#9333EA" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
          <Table data-testid="report-table">
            <TableHeader className="bg-stone-50">
              <TableRow>
                <TableHead className="text-start">{t("period")}</TableHead>
                <TableHead className="text-end">{t("loads")}</TableHead>
                <TableHead className="text-start">Variétés</TableHead>
                <TableHead className="text-end">{t("olive_kg")}</TableHead>
                <TableHead className="text-end">{t("oil_kg")}</TableHead>
                <TableHead className="text-end">{t("revenue")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(r?.rows ?? []).length === 0 && (
                <TableRow><TableCell colSpan={6} className="py-10 text-center text-stone-500">{t("no_data")}</TableCell></TableRow>
              )}
              {r?.rows.map((row) => (
                <TableRow key={row.period} data-testid={`report-row-${row.period}`}>
                  <TableCell dir="ltr" className="text-start font-mono text-sm">{row.period}</TableCell>
                  <TableCell className="text-end">{row.loads}</TableCell>
                  <TableCell className="text-start">{(varietiesByPeriod.get(row.period) ?? []).join(", ") || "—"}</TableCell>
                  <TableCell className="text-end text-lime-800">{fmtNum(row.olive_kg)}</TableCell>
                  <TableCell className="text-end text-amber-700">{fmtNum(row.oil_kg)}</TableCell>
                  <TableCell className="text-end font-semibold text-violet-700">{fmtNum(row.revenue, 3)}</TableCell>
                </TableRow>
              ))}
              {r && r.rows.length > 0 && (
                <TableRow className="bg-violet-50 font-bold">
                  <TableCell>{t("totals")}</TableCell>
                  <TableCell className="text-end">{r.total.loads}</TableCell>
                  <TableCell className="text-start">{allVarieties.join(", ") || "—"}</TableCell>
                  <TableCell className="text-end">{fmtNum(r.total.olive_kg)}</TableCell>
                  <TableCell className="text-end">{fmtNum(r.total.oil_kg)}</TableCell>
                  <TableCell className="text-end text-violet-800">{fmtNum(r.total.revenue, 3)}</TableCell>
                </TableRow>
              )}
              {r && (
                <TableRow className="bg-emerald-50" data-testid="report-invoice-financial-totals">
                  <TableCell colSpan={6} className="py-3">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-stone-700">Total des factures</span>
                        <span className="font-bold tabular-nums text-emerald-800">{fmtNum(invoiceTotals.total, 3)} {t("dt")}</span>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-stone-700">Montant payé</span>
                        <span className="font-bold tabular-nums text-blue-800">{fmtNum(invoiceTotals.paid, 3)} {t("dt")}</span>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-stone-700">Reste à payer</span>
                        <span className="font-bold tabular-nums text-rose-700">{fmtNum(invoiceTotals.balance, 3)} {t("dt")}</span>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-teal-200 bg-white shadow-sm" data-testid="worker-report-section">
        <div className="border-b border-teal-100 bg-teal-50 px-5 py-3 font-semibold text-teal-900">{t("by_worker")}</div>
        <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
          {(w?.totals ?? []).map((tot) => (
            <div key={tot.username} className="rounded-xl border border-teal-100 bg-teal-50/50 p-4" data-testid={`worker-total-${tot.username}`}>
              <div className="text-sm font-semibold text-stone-800">{tot.full_name}</div>
              <div className="text-xs text-stone-500" dir="ltr">@{tot.username}</div>
              <div className="mt-2 text-2xl font-bold text-teal-800">{fmtNum(tot.revenue, 3)} <span className="text-sm font-medium">{t("dt")}</span></div>
              <div className="text-xs text-stone-600">{tot.loads} {t("loads")} · {fmtNum(tot.olive_kg)} {t("kg")}</div>
            </div>
          ))}
        </div>
        <Table data-testid="worker-report-table">
          <TableHeader className="bg-stone-50">
            <TableRow>
              <TableHead className="text-start">{t("period")}</TableHead>
              <TableHead className="text-start">{t("worker_col")}</TableHead>
              <TableHead className="text-end">{t("loads")}</TableHead>
              <TableHead className="text-start">Variétés</TableHead>
              <TableHead className="text-end">{t("olive_kg")}</TableHead>
              <TableHead className="text-end">{t("oil_kg")}</TableHead>
              <TableHead className="text-end">{t("revenue")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(w?.rows ?? []).length === 0 && (
              <TableRow><TableCell colSpan={7} className="py-8 text-center text-stone-500">{t("no_data")}</TableCell></TableRow>
            )}
            {w?.rows.map((row) => (
              <TableRow key={`${row.day}-${row.username}`} data-testid={`worker-row-${row.day}-${row.username}`}>
                <TableCell dir="ltr" className="text-start font-mono text-sm">{row.day}</TableCell>
                <TableCell className="text-start">{row.full_name}</TableCell>
                <TableCell className="text-end">{row.loads}</TableCell>
                <TableCell className="text-start">{(workerVarieties.get(`${row.day}|${row.full_name}`) ?? []).join(", ") || "—"}</TableCell>
                <TableCell className="text-end text-lime-800">{fmtNum(row.olive_kg)}</TableCell>
                <TableCell className="text-end text-amber-700">{fmtNum(row.oil_kg)}</TableCell>
                <TableCell className="text-end font-semibold text-teal-700">{fmtNum(row.revenue, 3)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {worker && (
        <div className="mt-6 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm" data-testid="report-worker-loads">
          <div className="border-b border-stone-100 bg-stone-50 px-4 py-2 text-sm font-semibold text-stone-600">
            {t("loads")} — {userList.find((u) => u.username === worker)?.full_name ?? worker}
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-start">{t("code")}</TableHead>
                <TableHead className="text-start">{t("client")}</TableHead>
                <TableHead className="text-end">{t("olive_kg")}</TableHead>
                <TableHead className="text-end">{t("oil_kg")}</TableHead>
                <TableHead className="text-start">{t("date")}</TableHead>
                <TableHead className="text-start">{t("status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {wl.length === 0 && <TableRow><TableCell colSpan={6} className="py-8 text-center text-stone-500">{t("no_data")}</TableCell></TableRow>}
              {wl.map((l) => (
                <TableRow key={l.id} data-testid={`report-worker-load-${l.code}`}>
                  <TableCell dir="ltr" className="text-start font-mono text-sm">{l.code}</TableCell>
                  <TableCell>{l.client_name}</TableCell>
                  <TableCell className="text-end text-lime-800">{fmtNum(l.olive_kg)}</TableCell>
                  <TableCell className="text-end text-amber-700">{fmtNum(l.oil_kg)}</TableCell>
                  <TableCell dir="ltr" className="text-start text-xs text-stone-500">{fmtDate(l.created_at)}</TableCell>
                  <TableCell><StatusPill status={l.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
