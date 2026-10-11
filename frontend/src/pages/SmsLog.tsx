import { useQuery } from "@tanstack/react-query";
import { MessageSquareText, TriangleAlert } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { SmsLog as Sms } from "@/lib/types";
import { fmtDate, useI18n } from "@/lib/i18n";
import { CodeBadge, PageHeader } from "@/components/shared";
import { cn } from "@/lib/utils";

export default function SmsLog() {
  const { t } = useI18n();
  const q = useQuery({ queryKey: ["sms"], queryFn: () => apiGet<Sms[]>("/sms") });
  const rows = q.isError ? [] : (q.data ?? []);

  return (
    <div>
      <PageHeader title={t("sms")} sub={t("sms_sub")} accent="bg-pink-500" />
      <div className="mb-6 flex items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-900" data-testid="sms-simulation-banner">
        <TriangleAlert className="size-5 shrink-0" /> {t("sms_simulated")}
      </div>
      {rows.length === 0 && <p className="py-10 text-center text-stone-500">{t("no_data")}</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        {rows.map((s) => (
          <div key={s.id} data-testid={`sms-item-${s.code}-${s.kind}`} className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-md">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold", s.kind === "arrival" ? "bg-lime-100 text-lime-800" : "bg-amber-100 text-amber-800")}>
                <MessageSquareText className="size-3.5" /> {s.kind === "arrival" ? t("sms_arrival") : t("sms_ready")}
              </span>
              <CodeBadge code={s.code} />
              <span className="font-medium text-stone-900">{s.client_name}</span>
              <span className="text-sm text-stone-500" dir="ltr">{s.phone}</span>
              <span className="ms-auto text-xs text-stone-400" dir="ltr">{fmtDate(s.created_at)}</span>
            </div>
            <div className="whitespace-pre-line rounded-xl bg-pink-50/60 p-3 text-sm text-stone-800">{s.message}</div>
            <div className="mt-2 text-end text-xs font-semibold uppercase tracking-wider text-amber-700">{s.status}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
