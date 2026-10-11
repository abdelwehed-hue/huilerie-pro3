import { useQuery } from "@tanstack/react-query";
import { MessageSquareText, Radio, TriangleAlert } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { SmsLog as Sms, SmsStatus } from "@/lib/types";
import { fmtDate, useI18n } from "@/lib/i18n";
import { CodeBadge, PageHeader } from "@/components/shared";
import { cn } from "@/lib/utils";

const STATUS_STYLE: Record<Sms["status"], string> = {
  sent: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
  simulated: "bg-amber-100 text-amber-800",
  disabled: "bg-stone-200 text-stone-700",
};

const KIND_STYLE: Record<Sms["kind"], string> = {
  arrival: "bg-lime-100 text-lime-800",
  ready: "bg-amber-100 text-amber-800",
  reminder: "bg-fuchsia-100 text-fuchsia-800",
  test: "bg-stone-200 text-stone-700",
};

export default function SmsLog() {
  const { t } = useI18n();
  const q = useQuery({ queryKey: ["sms"], queryFn: () => apiGet<Sms[]>("/sms") });
  const st = useQuery({ queryKey: ["sms-status"], queryFn: () => apiGet<SmsStatus>("/sms/status") });
  const rows = q.isError ? [] : (q.data ?? []);
  const status = st.isError ? undefined : st.data;
  const live = status?.mode === "live";

  return (
    <div>
      <PageHeader title={t("sms")} sub={t("sms_sub")} accent="bg-pink-500" />
      {status && (
        <div
          data-testid="sms-simulation-banner"
          className={cn(
            "mb-6 flex items-center gap-3 rounded-2xl border p-4",
            !status.enabled ? "border-stone-300 bg-stone-100 text-stone-800" : live ? "border-green-300 bg-green-50 text-green-900" : "border-amber-300 bg-amber-50 text-amber-900",
          )}
        >
          {live && status.enabled ? <Radio className="size-5 shrink-0" /> : <TriangleAlert className="size-5 shrink-0" />}
          {!status.enabled ? t("sms_disabled_note") : live ? t("sms_live") : t("sms_simulated")}
        </div>
      )}
      {rows.length === 0 && <p className="py-10 text-center text-stone-500">{t("no_data")}</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        {rows.map((s) => (
          <div key={s.id} data-testid={`sms-item-${s.code}-${s.kind}`} className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-md">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold", KIND_STYLE[s.kind])}>
                <MessageSquareText className="size-3.5" /> {t(`sms_${s.kind}`)}
              </span>
              <CodeBadge code={s.code} />
              <span className="font-medium text-stone-900">{s.client_name}</span>
              <span className="text-sm text-stone-500" dir="ltr">{s.to_number ?? s.phone}</span>
              <span className="ms-auto text-xs text-stone-400" dir="ltr">{fmtDate(s.created_at)}</span>
            </div>
            <div className="whitespace-pre-line rounded-xl bg-pink-50/60 p-3 text-sm text-stone-800">{s.message}</div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="truncate text-xs text-red-700" data-testid={`sms-error-${s.id}`}>{s.error ?? ""}</span>
              <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", STATUS_STYLE[s.status])} data-testid={`sms-status-${s.code}-${s.kind}`}>
                {t(`sms_status_${s.status}`)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
