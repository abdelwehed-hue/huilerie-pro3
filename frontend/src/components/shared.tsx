import type { ReactNode } from "react";
import type { Grade, Load } from "@/lib/types";
import { fmtDate, fmtNum, useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import { Droplet, FlaskConical, Phone, Sprout, Wallet, Percent } from "lucide-react";

const GRADE_STYLE: Record<Grade, string> = {
  extra_vierge: "bg-green-100 text-green-900 border-green-300",
  vierge: "bg-yellow-100 text-yellow-900 border-yellow-300",
  lampante: "bg-red-100 text-red-900 border-red-300",
};

export function GradeBadge({ grade, testId }: { grade: Grade; testId?: string }) {
  const { t } = useI18n();
  return (
    <span data-testid={testId} className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold", GRADE_STYLE[grade])}>
      {t(grade)}
    </span>
  );
}

export function CodeBadge({ code, testId, big }: { code: string; testId?: string; big?: boolean }) {
  return (
    <span
      data-testid={testId}
      dir="ltr"
      className={cn(
        "inline-block rounded-md border border-amber-300 bg-amber-100 font-mono font-bold tracking-wider text-amber-900",
        big ? "px-4 py-2 text-3xl md:text-4xl" : "px-2 py-0.5 text-sm",
      )}
    >
      {code}
    </span>
  );
}

export function StatusPill({ status }: { status: Load["status"] }) {
  const { t } = useI18n();
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold",
        status === "done" ? "bg-sky-100 text-sky-800" : status === "cancelled" ? "bg-red-100 text-red-700 line-through decoration-red-300" : "bg-orange-100 text-orange-800",
      )}
      data-testid={`status-pill-${status}`}
    >
      <span className={cn("size-1.5 rounded-full", status === "done" ? "bg-sky-500" : status === "cancelled" ? "bg-red-500" : "bg-orange-500 animate-pulse")} />
      {t(status)}
    </span>
  );
}

const TONES = {
  olive: "bg-[#F2F8EE] text-[#1E3A14] border-lime-200 [&_.ico]:bg-lime-600",
  gold: "bg-[#FEFCE8] text-[#713F12] border-yellow-200 [&_.ico]:bg-amber-500",
  sky: "bg-sky-50 text-sky-900 border-sky-200 [&_.ico]:bg-sky-600",
  emerald: "bg-[#F0FDF4] text-[#14532D] border-green-200 [&_.ico]:bg-emerald-600",
  violet: "bg-[#FAF5FF] text-[#581C87] border-violet-200 [&_.ico]:bg-violet-600",
  orange: "bg-orange-50 text-orange-900 border-orange-200 [&_.ico]:bg-orange-500",
  rose: "bg-rose-50 text-rose-900 border-rose-200 [&_.ico]:bg-rose-500",
} as const;
export type Tone = keyof typeof TONES;

export function StatCard({
  tone, label, value, unit, icon, testId, sub,
}: { tone: Tone; label: string; value: ReactNode; unit?: string; icon: ReactNode; testId?: string; sub?: ReactNode }) {
  return (
    <div
      data-testid={testId}
      className={cn(
        "rounded-2xl border p-5 transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-md",
        TONES[tone],
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="text-xs font-semibold uppercase tracking-wider opacity-80">{label}</div>
        <div className="ico grid size-9 shrink-0 place-items-center rounded-xl text-white [&_svg]:size-4">{icon}</div>
      </div>
      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="font-heading text-3xl font-bold tracking-tight" dir="ltr">{value}</span>
        {unit && <span className="text-sm font-medium opacity-70">{unit}</span>}
      </div>
      {sub && <div className="mt-1 text-xs opacity-75">{sub}</div>}
    </div>
  );
}

export function LoadDetail({ load }: { load: Load }) {
  const { t } = useI18n();
  return (
    <div data-testid="load-detail" className="code-reveal space-y-5">
      {load.status === "cancelled" && (
        <div data-testid="load-detail-cancelled-banner" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800">
          <div className="font-semibold">{t("cancelled")} — {load.cancel_reason}</div>
          <div className="text-xs opacity-80">{t("cancelled_by")}: @{load.cancelled_by}{load.cancelled_at && <span dir="ltr"> · {fmtDate(load.cancelled_at)}</span>}</div>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-stone-500">{t("client")}</div>
          <div data-testid="load-detail-client-name" className="font-heading text-3xl font-bold text-stone-900">{load.client_name}</div>
          <div className="mt-1 flex items-center gap-2 text-sm text-stone-600">
            <Phone className="size-4" />
            <Link to={`/clients?phone=${encodeURIComponent(load.phone)}`} data-testid="load-detail-phone" dir="ltr" className="text-teal-700 underline-offset-2 hover:underline">{load.phone}</Link>
            <span className="text-stone-300">•</span>
            <span dir="ltr">{fmtDate(load.created_at)}</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <CodeBadge code={load.code} testId="load-detail-code" big />
          <StatusPill status={load.status} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard tone="olive" testId="load-detail-olive-kg" label={t("olive_kg")} value={fmtNum(load.olive_kg)} unit={t("kg")} icon={<Sprout />} />
        <StatCard tone="gold" testId="load-detail-oil-kg" label={t("oil_kg")} value={fmtNum(load.oil_kg)} unit={load.oil_kg != null ? t("kg") : undefined} icon={<Droplet />} sub={load.oil_kg == null ? t("pending") : undefined} />
        <StatCard tone="sky" testId="load-detail-yield" label={t("yield")} value={load.yield_pct != null ? fmtNum(load.yield_pct, 2) : "—"} unit={load.yield_pct != null ? "%" : undefined} icon={<Percent />} />
        {load.amount != null ? (
          <StatCard tone="violet" testId="load-detail-amount" label={t("amount")} value={fmtNum(load.amount, 3)} unit={t("dt")} icon={<Wallet />} sub={`${load.price_per_kg} ${t("dt")} / ${t("kg")}`} />
        ) : (
          <StatCard
            tone="emerald"
            testId="load-detail-lab"
            label={t("lab")}
            value={load.lab ? fmtNum(load.lab.acidity, 2) + "%" : "—"}
            icon={<FlaskConical />}
            sub={load.lab ? <GradeBadge grade={load.lab.classification} /> : t("no_lab")}
          />
        )}
      </div>
      {load.amount != null && (
        <div data-testid="load-detail-lab" className="flex flex-wrap items-center gap-4 rounded-2xl border border-green-200 bg-[#F0FDF4] p-5 text-[#14532D]">
          <FlaskConical className="size-5 text-emerald-600" />
          <span className="font-semibold">{t("lab")}:</span>
          {load.lab ? (
            <>
              <GradeBadge grade={load.lab.classification} />
              <span>{t("acidity")}: <b dir="ltr">{fmtNum(load.lab.acidity, 2)}</b></span>
              {load.lab.peroxide != null && <span>{t("peroxide")}: <b dir="ltr">{fmtNum(load.lab.peroxide, 2)}</b></span>}
              {load.lab.k232 != null && <span>K232: <b dir="ltr">{fmtNum(load.lab.k232, 3)}</b></span>}
              {load.lab.k270 != null && <span>K270: <b dir="ltr">{fmtNum(load.lab.k270, 3)}</b></span>}
            </>
          ) : (
            <span>{t("no_lab")}</span>
          )}
        </div>
      )}
    </div>
  );
}

export function PageHeader({ title, sub, accent, right }: { title: string; sub?: string; accent: string; right?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <div className={cn("mb-3 h-1.5 w-14 rounded-full", accent)} />
        <h1 className="font-heading text-3xl font-bold tracking-tight text-stone-900 md:text-4xl">{title}</h1>
        {sub && <p className="mt-1 text-stone-600">{sub}</p>}
      </div>
      {right}
    </div>
  );
}
