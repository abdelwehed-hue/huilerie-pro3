import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { ArrowLeft, Droplets, Printer } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { apiGet } from "@/lib/api";
import { fmtDate, fmtNum, useI18n } from "@/lib/i18n";
import { GradeBadge } from "@/components/shared";

type AnyRecord = Record<string, any>;

export default function CommercialCertificate() {
  const { id = "" } = useParams();
  const { t } = useI18n();
  const assessmentQuery = useQuery({
    queryKey: ["commercial-certificate", id],
    queryFn: () => apiGet<AnyRecord[]>(`/commercial/v1/quality-assessments?limit=500`),
    retry: false,
  });
  const lotsQuery = useQuery({
    queryKey: ["commercial-certificate-lots"],
    queryFn: () => apiGet<AnyRecord[]>(`/commercial/v1/lots?product_kind=OIL&limit=500`),
    retry: false,
  });
  const purchasesQuery = useQuery({ queryKey: ["commercial-certificate-purchases"], queryFn: () => apiGet<AnyRecord[]>(`/commercial/v1/olive-purchases?limit=500`), retry: false });
  const suppliersQuery = useQuery({ queryKey: ["commercial-certificate-suppliers"], queryFn: () => apiGet<AnyRecord[]>(`/commercial/v1/suppliers?limit=500`), retry: false });
  const varietiesQuery = useQuery({ queryKey: ["commercial-certificate-varieties"], queryFn: () => apiGet<AnyRecord[]>(`/commercial/v1/varieties?limit=500`), retry: false });
  const assessment = (assessmentQuery.data ?? []).find((item) => item.id === id);
  const lot = (lotsQuery.data ?? []).find((item) => item.id === assessment?.oil_lot_id);
  const purchase = (purchasesQuery.data ?? []).find((item) => item.id === lot?.source_purchase_id || item.batch_code === assessment?.batch_code);
  const supplier = (suppliersQuery.data ?? []).find((item) => item.id === purchase?.supplier_id);
  const varietyNames = [...new Set((purchase?.lines ?? []).map((line: AnyRecord) => (varietiesQuery.data ?? []).find((v) => v.id === line.variety_id)?.name || line.variety_id))];
  const loading = assessmentQuery.isLoading || lotsQuery.isLoading || purchasesQuery.isLoading || suppliersQuery.isLoading || varietiesQuery.isLoading;
  const failed = assessmentQuery.isError || lotsQuery.isError || purchasesQuery.isError || suppliersQuery.isError || varietiesQuery.isError || (!loading && !assessment);

  const rows = [
    { label: t("acidity"), value: assessment?.acidity, digits: 2 },
    { label: t("peroxide"), value: assessment?.peroxide, digits: 2 },
    { label: "K232", value: assessment?.k232, digits: 3 },
    { label: "K270", value: assessment?.k270, digits: 3 },
    { label: t("oil_content"), value: assessment?.oil_content_pct, digits: 1 },
  ];

  return (
    <div>
      <div className="no-print mb-6 flex gap-3">
        <Link to="/commercial" className={buttonVariants({ variant: "outline" })}>
          <ArrowLeft className="size-4 rtl:rotate-180" /> {t("back")}
        </Link>
        <Button onClick={() => window.print()} disabled={!assessment || !lot} className="bg-cyan-700 hover:bg-cyan-800">
          <Printer className="size-4" /> {t("print")}
        </Button>
      </div>
      {loading && <p className="text-sm text-stone-500">{t("loading")}</p>}
      {failed && <p className="text-red-700">{t("not_found")}</p>}
      {assessment && lot && (
        <div className="print-area mx-auto max-w-3xl overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
          <div className="h-2 bg-gradient-to-r from-lime-500 via-amber-400 to-emerald-500" />
          <div className="p-8 md:p-10">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-stone-200 pb-6">
              <div className="flex items-center gap-3">
                <div className="grid size-12 place-items-center rounded-xl bg-gradient-to-br from-lime-500 to-amber-400">
                  <Droplets className="size-6 text-white" />
                </div>
                <div>
                  <div className="font-heading text-xl font-bold text-stone-900">Oro Verde</div>
                  <div className="text-sm text-stone-600">Certificat d'analyse d'huile</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex flex-col items-center gap-1 text-center">
                  <QRCodeSVG value={window.location.href} size={84} level="M" marginSize={1} />
                  <span className="text-[10px] text-stone-600">Scanner pour consulter l'analyse</span>
                </div>
                <div className="text-end">
                  <div className="text-xs uppercase tracking-wider text-stone-500">CODE ACHAT</div>
                  <div className="font-mono text-lg font-bold text-stone-900">{assessment.batch_code || lot.batch_code || lot.document_number || lot.id}</div>
                </div>
              </div>
            </div>
            <h1 className="mt-8 text-center font-heading text-3xl font-bold text-stone-900">
              Certificat d'analyse <span className="text-stone-300">|</span> شهادة تحليل
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-center text-sm text-stone-600">
              Résultats de l'analyse de l'huile correspondant au lot indiqué.
            </p>
            <dl className="mt-8 grid grid-cols-2 gap-4 rounded-xl bg-stone-50 p-5 text-sm md:grid-cols-4">
              <div><dt className="text-stone-500">Lot d'huile</dt><dd className="font-semibold">{lot.document_number ?? lot.id}</dd></div>
              <div><dt className="text-stone-500">Date de prélèvement</dt><dd className="font-semibold" dir="ltr">{fmtDate(assessment.sample_date)}</dd></div>
              <div><dt className="text-stone-500">Date d'analyse</dt><dd className="font-semibold" dir="ltr">{fmtDate(assessment.tested_date)}</dd></div>
              <div><dt className="text-stone-500">Laboratoire</dt><dd className="font-semibold">{assessment.laboratory_name || "—"}</dd></div>
              <div><dt className="text-stone-500">Référence échantillon</dt><dd className="font-semibold">{assessment.sample_reference || "—"}</dd></div>
              <div><dt className="text-stone-500">Référence norme</dt><dd className="font-semibold">{assessment.specification_reference || "—"}</dd></div>
              <div><dt className="text-stone-500">Type d'huile</dt><dd className="font-semibold">{assessment.oil_type || "—"}</dd></div>
            </dl>
            <table className="mt-6 w-full text-sm">
              <thead><tr className="border-b-2 border-stone-200 text-stone-500">
                <th className="py-2 text-start font-semibold">Paramètre</th>
                <th className="py-2 text-end font-semibold">Résultat</th>
              </tr></thead>
              <tbody>{rows.map((row) => <tr key={row.label} className="border-b border-stone-100">
                <td className="py-2.5">{row.label}</td>
                <td className="py-2.5 text-end font-semibold" dir="ltr">{row.value == null ? "—" : fmtNum(row.value, row.digits)}</td>
              </tr>)}</tbody>
            </table>
            <div className="mt-8 flex flex-wrap items-center justify-between gap-6">
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-stone-600">{t("classification")}:</span>
                {assessment.classification ? <GradeBadge grade={assessment.classification} /> : <span>—</span>}
              </div>
              <div className="w-40 border-t border-dashed border-stone-400 pt-2 text-center text-xs text-stone-500">{t("signature")}</div>
            </div>
            {assessment.notes && <p className="mt-6 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">{t("notes")}: {assessment.notes}</p>}
            <p className="mt-5 text-xs text-stone-500">Cette attestation présente les résultats enregistrés. La libération du lot relève d'une validation qualité indépendante.</p>
          </div>
        </div>
      )}
    </div>
  );
}
