import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Droplets, Printer } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { apiGet } from "@/lib/api";
import type { Certificate as Cert } from "@/lib/types";
import { fmtDate, fmtNum, useI18n } from "@/lib/i18n";
import { CodeBadge, GradeBadge } from "@/components/shared";

export default function Certificate() {
  const { id = "" } = useParams();
  const { t } = useI18n();
  const q = useQuery({
    queryKey: ["certificate", id],
    queryFn: () => apiGet<Cert>(`/lab/${id}/certificate`),
    retry: false,
  });
  const c = q.isError ? undefined : q.data;
  const a = c?.analysis;

  const ROWS: { label: string; value: number | null | undefined; digits: number; limit: string }[] = [
    { label: t("acidity"), value: a?.acidity, digits: 2, limit: "≤ 0,8" },
    { label: t("peroxide"), value: a?.peroxide, digits: 2, limit: "≤ 20" },
    { label: "K232", value: a?.k232, digits: 3, limit: "≤ 2,50" },
    { label: "K270", value: a?.k270, digits: 3, limit: "≤ 0,22" },
    { label: t("oil_content"), value: a?.oil_content_pct, digits: 1, limit: "—" },
  ];

  return (
    <div>
      <div className="no-print mb-6 flex gap-3">
        <Link to="/lab" className={buttonVariants({ variant: "outline" })} data-testid="certificate-back">
          <ArrowLeft className="size-4 rtl:rotate-180" /> {t("back")}
        </Link>
        <Button onClick={() => window.print()} className="bg-cyan-700 hover:bg-cyan-800" data-testid="certificate-print-button" disabled={!c}>
          <Printer className="size-4" /> {t("print")}
        </Button>
      </div>

      {q.isError && <p className="text-red-700" data-testid="certificate-not-found">{t("not_found")}</p>}
      {c && a && (
        <div className="print-area mx-auto max-w-3xl overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm" data-testid="certificate">
          <div className="h-2 bg-gradient-to-r from-lime-500 via-amber-400 to-emerald-500" />
          <div className="p-8 md:p-10">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-stone-200 pb-6">
              <div className="flex items-center gap-3">
                <div className="grid size-12 place-items-center rounded-xl bg-gradient-to-br from-lime-500 to-amber-400">
                  <Droplets className="size-6 text-white" />
                </div>
                <div>
                  <div className="font-heading text-xl font-bold text-stone-900" data-testid="certificate-mill-name">{c.mill.mill_name || t("app_name")}</div>
                  {c.mill.mill_address && <div className="text-sm text-stone-600">{c.mill.mill_address}</div>}
                  {c.mill.mill_phone && <div className="text-sm text-stone-600" dir="ltr">{c.mill.mill_phone}</div>}
                </div>
              </div>
              <div className="text-end">
                <div className="text-xs uppercase tracking-wider text-stone-500">{t("code")}</div>
                <CodeBadge code={a.code} testId="certificate-code" />
              </div>
            </div>

            <h1 className="mt-8 text-center font-heading text-3xl font-bold text-stone-900">
              Certificat d'analyse <span className="text-stone-300">|</span> شهادة تحليل
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-center text-sm text-stone-600">{t("cert_statement")}</p>

            <dl className="mt-8 grid grid-cols-2 gap-4 rounded-xl bg-stone-50 p-5 text-sm md:grid-cols-4">
              <div><dt className="text-stone-500">{t("client")}</dt><dd className="font-semibold" data-testid="certificate-client">{a.client_name}</dd></div>
              <div><dt className="text-stone-500">{t("phone")}</dt><dd className="font-semibold" dir="ltr">{c.load?.phone ?? "—"}</dd></div>
              <div><dt className="text-stone-500">{t("olive_kg")}</dt><dd className="font-semibold">{fmtNum(c.load?.olive_kg)}</dd></div>
              <div><dt className="text-stone-500">{t("oil_kg")}</dt><dd className="font-semibold">{fmtNum(c.load?.oil_kg)}</dd></div>
              <div><dt className="text-stone-500">{t("analysis_date")}</dt><dd className="font-semibold" dir="ltr">{fmtDate(a.created_at)}</dd></div>
              <div><dt className="text-stone-500">{t("analyst")}</dt><dd className="font-semibold">{a.created_by}</dd></div>
              <div><dt className="text-stone-500">{t("oil_type")}</dt><dd className="font-semibold" data-testid="certificate-oil-type">{a.oil_type || "—"}</dd></div>
            </dl>

            <table className="mt-6 w-full text-sm">
              <thead>
                <tr className="border-b-2 border-stone-200 text-stone-500">
                  <th className="py-2 text-start font-semibold">{t("parameter")}</th>
                  <th className="py-2 text-end font-semibold">{t("value")}</th>
                  <th className="py-2 text-end font-semibold">{t("limit_ev")}</th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map((r) => (
                  <tr key={r.label} className="border-b border-stone-100">
                    <td className="py-2.5">{r.label}</td>
                    <td className="py-2.5 text-end font-semibold" dir="ltr">{fmtNum(r.value, r.digits)}</td>
                    <td className="py-2.5 text-end text-stone-500" dir="ltr">{r.limit}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-8 flex flex-wrap items-center justify-between gap-6">
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-stone-600">{t("classification")}:</span>
                <span className="scale-125"><GradeBadge grade={a.classification} testId="certificate-grade" /></span>
              </div>
              <div className="w-56 border-t border-dashed border-stone-400 pt-2 text-center text-xs text-stone-500">{t("signature")}</div>
            </div>
            {a.notes && <p className="mt-6 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">{t("notes")}: {a.notes}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
