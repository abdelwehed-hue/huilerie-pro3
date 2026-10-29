import { useCallback, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Droplets, PackagePlus, Scale, ScanLine, Coins, Clock, FileText, Layers } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { Load, Stats } from "@/lib/types";
import { fmtNum, useI18n } from "@/lib/i18n";
import { useMe } from "@/lib/useMe";
import { CodeBadge, StatusPill } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import IntakePanel from "@/components/IntakePanel";
import QrScanDialog from "@/components/QrScanDialog";

function KpiCard({ label, value, icon, testId, tint }: { label: string; value: React.ReactNode; icon: React.ReactNode; testId: string; tint: string }) {
  return (
    <div data-testid={testId} className={`flex min-h-40 flex-col justify-between rounded-3xl border p-6 shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-md ${tint}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="text-[15px] leading-snug font-semibold opacity-80">{label}</div>
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/90 shadow-sm [&_svg]:size-5 [&_svg]:stroke-[2.5]">{icon}</div>
      </div>
      <div className="mt-4 font-heading text-3xl font-bold tracking-tight" dir="ltr">{value}</div>
    </div>
  );
}

export default function Dashboard() {
  const { t } = useI18n();
  const me = useMe();
  const navigate = useNavigate();
  const isAdmin = me.data?.role === "admin";
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const closeScan = useCallback(() => setScanOpen(false), []);
  const [code, setCode] = useState("");
  const stats = useQuery({ queryKey: ["stats"], queryFn: () => apiGet<Stats>("/stats") });
  const loads = useQuery({ queryKey: ["loads", "", ""], queryFn: () => apiGet<Load[]>("/loads") });
  const s = stats.isError ? undefined : stats.data;
  const today = (loads.isError ? [] : (loads.data ?? [])).filter((l) => s && l.day === s.today);
  const invoices = useQuery({ queryKey: ["invoices", "load-links"], queryFn: () => apiGet<Array<{ id: string; load_id: string; number: string }>>("/invoices") });
  const invoiceByLoad = new Map((invoices.data ?? []).map((invoice) => [invoice.load_id, invoice]));

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-4xl font-bold tracking-tight text-stone-900 md:text-5xl" data-testid="dashboard-greeting">
            {t("welcome")}, {me.data?.full_name ?? ""}
          </h1>
          <p className="mt-1 text-lg text-stone-500">{t("app_tagline")}</p>
        </div>
        <Button onClick={() => setIntakeOpen(true)} data-testid="dashboard-new-reception-button" className="h-11 rounded-xl bg-[#1F4D2B] px-5 text-base shadow-md shadow-green-900/20 transition-transform hover:bg-[#173B21] active:scale-[0.97]">
          <PackagePlus className="size-5" /> {t("new_reception")}
        </Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.15fr_2fr]">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const v = code.trim();
            if (v) navigate(/^\d{10}$/.test(v) ? `/search?code=${v}` : `/search?q=${encodeURIComponent(v)}`);
          }}
          className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#1B2A1C] via-[#203320] to-[#3A3A1C] p-7 text-white shadow-xl shadow-green-950/25"
          data-testid="dashboard-quick-search"
        >
          <div className="pointer-events-none absolute -end-16 -top-16 size-48 rounded-full bg-lime-400/10 blur-2xl" />
          <div className="text-sm font-semibold uppercase tracking-wide text-lime-300">{t("quick_search_title")}</div>
          <div className="mt-1 text-sm text-white/70">{t("quick_search_hint")}</div>
          <div className="mt-7 flex gap-3">
            <button type="button" onClick={() => setScanOpen(true)} data-testid="qr-scan-button" title={t("scan_qr")} className="grid size-14 shrink-0 place-items-center rounded-xl bg-lime-400 text-[#1B2A1C] shadow-lg shadow-lime-500/30 transition-transform duration-150 hover:scale-105 active:scale-95">
              <ScanLine className="size-8" />
            </button>
            <div className="relative flex-1">
              <Input
                data-testid="quick-code-search-input"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={t("search_any_hint")}
                className="h-14 rounded-xl border-white/15 bg-white/5 text-lg text-white placeholder:text-sm placeholder:text-white/35 focus-visible:ring-lime-400/40"
              />
            </div>
            <Button type="submit" data-testid="quick-code-search-btn" className="h-14 rounded-xl bg-[#2F6B3A] px-6 text-base hover:bg-[#387E45]">
              {t("search_btn")}
            </Button>
          </div>
        </form>

        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <KpiCard testId="kpi-loads-today" label={t("today_arrivals")} value={s?.loads_today ?? "—"} icon={<Layers />} tint="border-rose-200 bg-rose-50 text-rose-900 [&_svg]:text-rose-600" />
          <KpiCard testId="kpi-olive-today" label={t("olive_today")} value={<>{fmtNum(s?.olive_kg_today)} <span className="text-2xl">{t("kg")}</span></>} icon={<Scale />} tint="border-lime-200 bg-[#F2F8EE] text-[#1E3A14] [&_svg]:text-lime-700" />
          <KpiCard testId="kpi-oil-today" label={t("oil_today")} value={<>{fmtNum(s?.oil_kg_today)} <span className="text-2xl">{t("kg")}</span></>} icon={<Droplets />} tint="border-yellow-200 bg-[#FEFCE8] text-[#713F12] [&_svg]:text-amber-600" />
          {isAdmin ? (
            <KpiCard testId="admin-revenue-metric-card" label={t("revenue_today")} value={<>{fmtNum(s?.revenue_today, 3)} <span className="text-2xl">{t("dt")}</span></>} icon={<Coins />} tint="border-violet-200 bg-[#FAF5FF] text-[#581C87] [&_svg]:text-violet-600" />
          ) : (
            <KpiCard testId="kpi-pending" label={t("pending_loads")} value={s?.pending ?? "—"} icon={<Clock />} tint="border-orange-200 bg-orange-50 text-orange-900 [&_svg]:text-orange-600" />
          )}
        </div>
      </div>

      <h2 className="mb-4 mt-10 font-heading text-2xl font-bold text-stone-900">{t("today_arrivals")}</h2>
      <div className="overflow-hidden rounded-3xl border border-stone-200/80 bg-white shadow-sm">
        <Table data-testid="today-arrivals-table">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-12 ps-4 text-start text-[15px] text-stone-700">{t("code")}</TableHead>
              <TableHead className="text-start text-[15px] text-stone-700">{t("client")}</TableHead>
              <TableHead className="text-start text-[15px] text-stone-700">{t("phone")}</TableHead>
              <TableHead className="text-start text-[15px] text-stone-700">{t("varieties")}</TableHead>
              <TableHead className="text-end text-[15px] text-stone-700">{t("olive_kg")}</TableHead>
              <TableHead className="text-end text-[15px] text-stone-700">{t("oil_kg")}</TableHead>
              <TableHead className="text-start text-[15px] text-stone-700">{t("status")}</TableHead>
              <TableHead className="text-start text-[15px] text-stone-700">Facture</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {today.length === 0 && (
              <TableRow><TableCell colSpan={8} className="py-12 text-center text-stone-500">{t("no_data")}</TableCell></TableRow>
            )}
            {today.map((l) => (
              <TableRow key={l.id} data-testid={`today-row-${l.code}`} className={l.status === "cancelled" ? "bg-red-50/40 text-[15px] opacity-70" : "text-[15px] transition-colors hover:bg-amber-50/40"}>
                <TableCell className="ps-4"><Link to={`/search?code=${l.code}`}><CodeBadge code={l.code} /></Link></TableCell>
                <TableCell className="text-stone-900">{l.client_name}</TableCell>
                <TableCell className="font-mono text-stone-500" dir="ltr">{l.phone}</TableCell>
                <TableCell className="text-stone-700">{l.variety || "—"}</TableCell>
                <TableCell className="text-end font-semibold text-lime-800">{fmtNum(l.olive_kg)} {t("kg")}</TableCell>
                <TableCell className="text-end font-semibold text-amber-700">{l.oil_kg != null ? `${fmtNum(l.oil_kg, 1)} ${t("kg")}` : "—"}</TableCell>
                <TableCell><StatusPill status={l.status} size="large" /></TableCell>
                <TableCell>{invoiceByLoad.has(l.id) ? <Link to={`/factures?invoice_id=${encodeURIComponent(invoiceByLoad.get(l.id)!.id)}`} className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"><FileText className="size-4" />{invoiceByLoad.get(l.id)!.number}</Link> : <span className="text-stone-400">—</span>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Sheet open={intakeOpen} onOpenChange={setIntakeOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto bg-[#F9F8F3] p-6 sm:max-w-2xl" data-testid="new-reception-sheet">
          <SheetTitle className="mb-4 font-heading text-2xl">{t("new_reception")}</SheetTitle>
          <IntakePanel stacked />
        </SheetContent>
      </Sheet>
      <QrScanDialog open={scanOpen} onClose={closeScan} />
    </div>
  );
}
