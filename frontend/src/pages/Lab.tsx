import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FlaskConical, CheckCircle2, XCircle, Award, ScanLine } from "lucide-react";
import { Link } from "react-router-dom";
import { buttonVariants } from "@/components/ui/button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiGet, apiPost, apiPut } from "@/lib/api";
import type { Grade, LabAnalysis, LabCreate, Load, Varieties } from "@/lib/types";
import { fmtDate, fmtNum, useI18n } from "@/lib/i18n";
import { useMe } from "@/lib/useMe";
import { CodeBadge, GradeBadge, PageHeader } from "@/components/shared";
import QrScanDialog from "@/components/QrScanDialog";

const num = (s: string): number | null => {
  const v = parseFloat(s.replace(",", "."));
  return isNaN(v) ? null : v;
};

function classify(a: number, p: number | null, k232: number | null, k270: number | null): Grade {
  const ok = (v: number | null, lim: number) => v == null || v <= lim;
  if (a <= 0.8 && ok(p, 20) && ok(k232, 2.5) && ok(k270, 0.22)) return "extra_vierge";
  if (a <= 2.0 && ok(p, 20) && ok(k232, 2.6) && ok(k270, 0.25)) return "vierge";
  return "lampante";
}

const EMPTY = { code: "", acidity: "", peroxide: "", k232: "", k270: "", oil: "", notes: "", grade: "auto", oilType: "" };

export default function Lab() {
  const { t, errMsg } = useI18n();
  const me = useMe();
  const qc = useQueryClient();
  const [f, setF] = useState(EMPTY);
  const [scanOpen, setScanOpen] = useState(false);
  const [codeListOpen, setCodeListOpen] = useState(false);
  const [specificationReference, setSpecificationReference] = useState("");
  const [selectedGsAssessment, setSelectedGsAssessment] = useState<Record<string, any> | null>(null);
  const code = f.code.trim();
  const isGsCode = /^\d{4}A\d{4}$/i.test(code);
  const gsLots = useQuery({ queryKey: ["lab-gs-lots"], queryFn: () => apiGet<Array<Record<string, any>>>("/commercial/v1/lots?limit=500"), enabled: true, retry: false });
  const gsSamples = useQuery({ queryKey: ["lab-gs-preproduction-samples"], queryFn: () => apiGet<Array<Record<string, any>>>("/commercial/v1/preproduction-samples?limit=500"), enabled: isGsCode, retry: false });
  const gsAssessments = useQuery({ queryKey: ["lab-gs-quality-assessments"], queryFn: () => apiGet<Array<Record<string, any>>>("/commercial/v1/quality-assessments?limit=500"), retry: false });
  const gsCodeAssessments = (gsAssessments.data ?? [])
    .filter((assessment) => assessment.lot_purpose === "PREPRODUCTION_SAMPLE"
      && code && String(assessment.batch_code || assessment.sample_reference || "").trim().toUpperCase() === code.toUpperCase())
    .sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
  const gsCodeAssessment = gsCodeAssessments[0];
  const gsPurchases = useQuery({ queryKey: ["lab-gs-purchases"], queryFn: () => apiGet<Array<Record<string, any>>>("/commercial/v1/olive-purchases?limit=500"), retry: false });
  const gsCustodyReceipts = useQuery({ queryKey: ["lab-gs-custody-receipts"], queryFn: () => apiGet<Array<Record<string, any>>>("/commercial/v1/customer-custody/receipts?limit=500"), retry: false });
  const gsVarieties = useQuery({ queryKey: ["lab-gs-varieties"], queryFn: () => apiGet<Array<Record<string, any>>>("/commercial/v1/varieties?limit=500"), retry: false });
  const mill = useQuery({ queryKey: ["mill"], queryFn: () => apiGet<{ mill_name?: string }>("/mill"), enabled: isGsCode, retry: false });
  const gsOliveLot = (gsLots.data ?? []).find((lot) => lot.product_kind === "OLIVE" && lot.batch_code === code && lot.status === "OPEN");
  const gsSample = gsOliveLot ? (gsSamples.data ?? []).find((sample) => (sample.source_olive_lot_id === gsOliveLot.id || (sample.source_olive_lot_ids ?? []).includes(gsOliveLot.id)) && sample.status === "COMPLETED" && sample.id === gsOliveLot.latest_preproduction_sample_id) : undefined;
  const gsAutoSample = useQuery({
    queryKey: ["lab-gs-auto-preproduction-sample", code],
    queryFn: async () => {
      const created = await apiPost<Record<string, any>>("/commercial/v1/preproduction-samples/auto-complete", { batch_code: code });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["lab-gs-lots"] }),
        qc.invalidateQueries({ queryKey: ["lab-gs-preproduction-samples"] }),
      ]);
      return created;
    },
    enabled: isGsCode && gsLots.isSuccess && gsSamples.isSuccess && gsAssessments.isSuccess && !!gsOliveLot && !gsSample && !gsCodeAssessment,
    retry: false,
  });
  const gsOilLot = gsSample ? (gsLots.data ?? []).find((lot) => lot.id === gsSample.oil_sample_lot_id && lot.product_kind === "OIL" && lot.lot_purpose === "PREPRODUCTION_SAMPLE" && lot.status === "OPEN") : undefined;
  const gsExistingAssessment = gsOilLot ? (gsAssessments.data ?? []).find((assessment) => assessment.oil_lot_id === gsOilLot.id && assessment.status === "AWAITING_INDEPENDENT_REVIEW" && assessment.id === gsOilLot.last_quality_assessment_id) : undefined;
  const gsCodeAssessmentPending = gsCodeAssessment?.status === "AWAITING_INDEPENDENT_REVIEW";
  const gsCodeAssessmentReviewed = !!gsCodeAssessment && !gsCodeAssessmentPending;
  const gsAnalysisLocked = isGsCode && gsCodeAssessmentReviewed && !selectedGsAssessment;
  const gsLotCanBeAnalysed = !!gsOilLot && ["PENDING", "REJECTED"].includes(String(gsOilLot.quality_status)) && !gsCodeAssessment;
  const gsPurchaseForCode = (gsPurchases.data ?? []).find((purchase) => String(purchase.batch_code || "").trim().toUpperCase() === code.toUpperCase());
  const gsCustodyReceiptForCode = (gsCustodyReceipts.data ?? []).find((receipt) => String(receipt.batch_code || "").trim().toUpperCase() === code.toUpperCase() && receipt.status === "RECEIVED");
  const gsCustodyVariety = (gsVarieties.data ?? []).find((item) => item.id === gsCustodyReceiptForCode?.variety_id);
  const gsOliveVariety = [...new Set([
    ...(gsPurchaseForCode?.lines ?? []).map((line: any) => {
      const variety = (gsVarieties.data ?? []).find((item) => item.id === line.variety_id);
      return String(variety?.name_fr || variety?.name || line.variety_id || "").trim();
    }),
    ...(gsCustodyReceiptForCode ? [String(gsCustodyVariety?.name_fr || gsCustodyVariety?.name || gsCustodyReceiptForCode.variety_id || "").trim()] : []),
  ].filter(Boolean))].join(", ");
  const gsOwnerLabel = gsOliveLot?.owner?.kind === "CUSTOMER"
    ? (gsCustodyReceiptForCode?.customer_name || "Garde du client")
    : "Achat de la maâsra";
  const gsLaboratoryName = String(mill.data?.mill_name ?? "").trim();
  const gsConfiguredLaboratoryName = gsLaboratoryName ? (/^labo\b/i.test(gsLaboratoryName) ? gsLaboratoryName : `Labo ${gsLaboratoryName}`) : "Labo Oroverde";
  const set = (k: keyof typeof EMPTY) => (v: string) => setF((s) => ({ ...s, [k]: v }));

  const lookup = useQuery({
    queryKey: ["load-by-code", code],
    queryFn: () => apiGet<Load>(`/loads/by-code/${encodeURIComponent(code)}`),
    enabled: code.length >= 7 && !isGsCode,
    retry: false,
  });
  const list = useQuery({ queryKey: ["lab"], queryFn: () => apiGet<LabAnalysis[]>("/lab") });
  const loadsList = useQuery({ queryKey: ["lab-pending-load-codes"], queryFn: () => apiGet<Load[]>("/loads?limit=500"), retry: false });
  const pendingGsCodes = [...new Set((gsLots.data ?? []).filter((lot) => lot.product_kind === "OLIVE" && lot.status === "OPEN" && lot.batch_code && !(gsAssessments.data ?? []).some((assessment) => String(assessment.batch_code || assessment.sample_reference || "").trim().toUpperCase() === String(lot.batch_code).trim().toUpperCase())).map((lot) => String(lot.batch_code || "").trim()).filter(Boolean))];
  const rows = list.isError ? [] : (list.data ?? []);
  const pendingLoads = (loadsList.data ?? []).filter((load) => !load.lab && load.status !== "cancelled" && !rows.some((analysis) => analysis.load_id === load.id));
  const gsAnalysisRows = (gsAssessments.data ?? []).filter((assessment) => assessment.lot_purpose === "PREPRODUCTION_SAMPLE" && (assessment.batch_code || assessment.sample_reference));
  const found = lookup.data && !lookup.isError ? lookup.data : null;
  const oliveVarietyLabel = isGsCode ? gsOliveVariety : (found?.variety || "");
  // Existing analysis of this receipt (rows are newest first) -> prefill the form so it can be edited.
  const existing = found ? rows.find((r) => r.load_id === found.id) : undefined;
  const [prefillFor, setPrefillFor] = useState("");
  const prefillKey = found && list.isSuccess ? `${found.id}:${existing?.id ?? "none"}` : "";
  if (prefillKey !== prefillFor) {
    setPrefillFor(prefillKey);
    if (prefillKey) {
      const s = (v: number | null | undefined) => (v == null ? "" : String(v));
      const autoG = existing ? classify(existing.acidity, existing.peroxide ?? null, existing.k232 ?? null, existing.k270 ?? null) : null;
      setF((cur) => ({
        ...cur,
        acidity: s(existing?.acidity), peroxide: s(existing?.peroxide), k232: s(existing?.k232), k270: s(existing?.k270),
        oil: s(existing?.oil_content_pct), notes: existing?.notes ?? "", oilType: existing?.oil_type ?? "",
        grade: existing && existing.classification !== autoG ? existing.classification : "auto",
      }));
    }
  }

  const acid = num(f.acidity);
  const auto = acid != null ? classify(acid, num(f.peroxide), num(f.k232), num(f.k270)) : null;
  const finalGrade = f.grade === "auto" ? auto : (f.grade as Grade);

  const gsMutation = useMutation({
    mutationFn: async () => {
      if (!gsOilLot || !gsOliveLot || !gsSample) throw new Error("Aucun Lot d’huile expérimental actif n’est lié à ce code d’achat.");
      const editing = !!selectedGsAssessment;
      if (editing) {
        if (selectedGsAssessment?.status !== "AWAITING_INDEPENDENT_REVIEW" || selectedGsAssessment.oil_lot_id !== gsOilLot.id) {
          throw new Error("Cette analyse a déjà fait l’objet d’une Décision et ne peut plus être modifiée.");
        }
      } else if (!gsLotCanBeAnalysed || gsExistingAssessment) {
        throw new Error("Une analyse est déjà en attente ou ce Lot d’huile ne peut plus être analysé.");
      }
      if (!specificationReference.trim()) throw new Error("La référence de la norme est obligatoire.");
      if (acid == null) throw new Error("L’acidité est obligatoire.");
      const payload = {
        oil_lot_id: gsOilLot.id, expected_lot_version: gsOilLot.version ?? 1,
        sample_reference: code, sample_date: selectedGsAssessment?.sample_date || gsSample.trial_date,
        tested_date: selectedGsAssessment?.tested_date || new Date().toISOString().slice(0, 10),
        laboratory_name: gsConfiguredLaboratoryName, specification_reference: specificationReference.trim(), measurements: [],
        acidity: acid, peroxide: num(f.peroxide), k232: num(f.k232), k270: num(f.k270), oil_content_pct: num(f.oil),
        classification: finalGrade, oil_type: oilType || null, notes: f.notes, idempotency_key: crypto.randomUUID(),
      };
      return editing
        ? apiPut("/commercial/v1/quality-assessments/" + selectedGsAssessment!.id, payload)
        : apiPost("/commercial/v1/quality-assessments", payload);
    },
    onSuccess: () => {
      toast.success(selectedGsAssessment ? "Analyse mise à jour" : "Résultats transmis à la Décision indépendante");
      setF(EMPTY); setSpecificationReference(""); setSelectedGsAssessment(null);
      qc.invalidateQueries({ queryKey: ["commercial"] });
      qc.invalidateQueries({ queryKey: ["lab-gs-quality-assessments"] });
      qc.invalidateQueries({ queryKey: ["lab-gs-lots"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const m = useMutation({
    mutationFn: (b: LabCreate) => apiPost<LabAnalysis>("/lab", b),
    onSuccess: () => {
      toast.success(t("saved"));
      setF(EMPTY);
      qc.invalidateQueries({ queryKey: ["lab"] });
      qc.invalidateQueries({ queryKey: ["loads"] });
      qc.invalidateQueries({ queryKey: ["load-by-code"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const vq = useQuery({ queryKey: ["varieties"], queryFn: () => apiGet<Varieties>("/varieties") });
  const oilType = isGsCode ? (gsOliveVariety || f.oilType) : (f.oilType || found?.variety || "");
  const oilTypes = [...new Set([...(isGsCode ? (gsVarieties.data ?? []).map((item: any) => String(item.name_fr || item.name || "").trim()).filter(Boolean) : (vq.isError ? [] : (vq.data?.varieties ?? []))), ...(oilType ? [oilType] : [])])];
  const GRADE_LABEL: Record<string, string> = { auto: t("auto"), extra_vierge: t("extra_vierge"), vierge: t("vierge"), lampante: t("lampante") };
  const [reviewAssessmentId, setReviewAssessmentId] = useState("");
  const [reviewDecision, setReviewDecision] = useState<"RELEASED" | "REJECTED">("RELEASED");
  const [reviewReason, setReviewReason] = useState("");
  const [reviewQrOpen, setReviewQrOpen] = useState(false);
  const gsPermissions = useQuery({ queryKey: ["lab-gs-permissions"], queryFn: () => apiGet<{ permissions: string[] }>("/commercial/v1/me/permissions"), retry: false });
  const canReviewGsQuality = me.data?.role === "admin" || (gsPermissions.data?.permissions ?? []).includes("commercial.quality_release");
  const reviewableGsAssessments = (gsAssessments.data ?? []).filter((assessment) => {
    const lot = (gsLots.data ?? []).find((item) => item.id === assessment.oil_lot_id);
    const isPreproduction = assessment.lot_purpose === "PREPRODUCTION_SAMPLE"
      || lot?.lot_purpose === "PREPRODUCTION_SAMPLE";
    // The lots endpoint is capped/paginated independently. A missing lot in that
    // response must not hide a submitted assessment from the reviewer; the backend
    // remains authoritative and re-checks that the linked lot is open and current.
    const lotIsReviewable = !lot || (
      lot.status === "OPEN"
      && (!lot.last_quality_assessment_id || lot.last_quality_assessment_id === assessment.id)
      && ["PENDING", "REJECTED"].includes(String(lot.quality_status ?? "PENDING"))
    );
    return isPreproduction
      && assessment.status === "AWAITING_INDEPENDENT_REVIEW"
      && lotIsReviewable;
  }).sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
  const reviewAssessmentCode = (assessment: Record<string, any>) => {
    const lot = (gsLots.data ?? []).find((item) => item.id === assessment.oil_lot_id);
    return String(assessment.batch_code || lot?.batch_code || assessment.sample_reference || "Code indisponible");
  };
  const selectedReviewAssessment = reviewableGsAssessments.find((item) => item.id === reviewAssessmentId);
  const selectedReviewLot = selectedReviewAssessment ? (gsLots.data ?? []).find((lot) => lot.id === selectedReviewAssessment.oil_lot_id) : undefined;
  const releaseGsAssessment = useMutation({
    mutationFn: async () => {
      if (!selectedReviewAssessment) throw new Error("Analyse introuvable. Actualisez la page.");
      if (reviewReason.trim().length < 10) throw new Error("La justification doit contenir au moins 10 caractères.");
      // Use the version captured when the assessment was submitted if its lot
      // is outside the independently limited lots response. The backend still
      // validates the live lot state/version transactionally before release.
      const expectedLotVersion = selectedReviewLot?.version ?? selectedReviewAssessment.lot_version_after_submission ?? 1;
      return apiPost("/commercial/v1/quality-assessments/release", { assessment_id: selectedReviewAssessment.id, expected_lot_version: expectedLotVersion, decision: reviewDecision, decision_reason: reviewReason.trim(), idempotency_key: crypto.randomUUID() });
    },
    onSuccess: async () => {
      toast.success("Décision indépendante enregistrée");
      setReviewAssessmentId(""); setReviewReason(""); setReviewDecision("RELEASED");
      await Promise.all([qc.invalidateQueries({ queryKey: ["lab-gs-quality-assessments"] }), qc.invalidateQueries({ queryKey: ["lab-gs-lots"] }), qc.invalidateQueries({ queryKey: ["commercial"] })]);
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const handleReviewQrScan = (raw: string) => {
    const scanned = raw.trim(); let certificateId = ""; let codeValue = scanned;
    try { const parsed = new URL(scanned); const certificatePart = parsed.pathname.includes("/commercial/certificate/") ? parsed.pathname.split("/").pop() : ""; if (certificatePart) certificateId = decodeURIComponent(certificatePart); codeValue = parsed.searchParams.get("code")?.trim() || codeValue; } catch { /* QR contenant directement le code de traçabilité. */ }
    const match = reviewableGsAssessments.find((item) => (certificateId && item.id === certificateId) || reviewAssessmentCode(item).trim().toLowerCase() === codeValue.toLowerCase() || String(item.sample_reference ?? "").trim().toLowerCase() === codeValue.toLowerCase());
    if (!match) { toast.error("Aucune analyse en attente ne correspond à ce QR code."); return; }
    setReviewAssessmentId(match.id); toast.success("Analyse sélectionnée pour la revue indépendante");
  };


  return (
    <div>
      <PageHeader title={t("lab_title")} sub={t("lab_sub")} accent="bg-cyan-500" />
      <div className="grid gap-6 xl:grid-cols-2">
        <form
          data-testid="lab-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (isGsCode) { gsMutation.mutate(); return; }
            if (acid == null || !code) return;
            m.mutate({
              code, acidity: acid, peroxide: num(f.peroxide), k232: num(f.k232), k270: num(f.k270),
              oil_content_pct: num(f.oil), notes: f.notes, oil_type: oilType || null,
              classification: f.grade === "auto" ? null : (f.grade as Grade),
            });
          }}
          className="space-y-4 rounded-2xl border border-cyan-200 bg-gradient-to-b from-cyan-50 to-white p-6 shadow-sm"
        >
          <div className="flex items-center gap-3 text-cyan-900">
            <div className="grid size-10 place-items-center rounded-xl bg-cyan-600 text-white"><FlaskConical className="size-5" /></div>
            <h2 className="font-heading text-xl font-bold">{t("lab_title")}</h2>
          </div>
          <div className="space-y-2">
            <Label htmlFor="lc">{t("code")}</Label>
            <div className="flex gap-2">
              <Input id="lc" dir="ltr" data-testid="lab-code-input" value={f.code} onFocus={() => setCodeListOpen(true)} onChange={(e) => { setSelectedGsAssessment(null); set("code")(e.target.value); setCodeListOpen(true); }} placeholder="2503141035" className="h-11 min-w-0 flex-1 rounded-xl bg-white font-mono text-lg tracking-wider" />
              <Button type="button" onClick={() => setScanOpen(true)} data-testid="lab-qr-scan-button" title={t("scan_qr")} aria-label={t("scan_qr")} className="h-11 shrink-0 rounded-xl bg-gradient-to-br from-cyan-600 to-teal-600 px-3 text-white shadow-md hover:from-cyan-700 hover:to-teal-700">
                <ScanLine className="size-5" />
                <span className="hidden sm:inline">Scan QR Code</span>
              </Button>
            </div>
            {codeListOpen && (
              <div className="max-h-64 overflow-y-auto rounded-xl border border-cyan-200 bg-white shadow-lg" data-testid="lab-pending-code-options">
                <div className="border-b bg-stone-50 px-3 py-2 text-xs font-semibold text-stone-600">Codes de réception et de lots non analysés</div>
                {pendingLoads.map((load) => (
                  <button key={load.id} type="button" onClick={() => { setSelectedGsAssessment(null); set("code")(load.code); setCodeListOpen(false); }} className="flex w-full items-center justify-between gap-3 border-b px-3 py-2 text-left hover:bg-cyan-50">
                    <span className="font-mono text-sm font-semibold">{load.code}</span><span className="truncate text-xs text-stone-500">{load.client_name} · {load.olive_kg} kg</span>
                  </button>
                ))}
                {pendingGsCodes.map((pendingCode) => (
                  <button key={pendingCode} type="button" onClick={() => { setSelectedGsAssessment(null); set("code")(pendingCode); setCodeListOpen(false); }} className="flex w-full items-center justify-between gap-3 border-b px-3 py-2 text-left hover:bg-cyan-50">
                    <span className="font-mono text-sm font-semibold">{pendingCode}</span><span className="text-xs text-amber-700">GS · En attente d’analyse</span>
                  </button>
                ))}
                {pendingLoads.length === 0 && pendingGsCodes.length === 0 && <div className="px-3 py-4 text-center text-sm text-stone-500">Aucun code en attente d’analyse</div>}
                <div className="px-3 py-2 text-xs text-stone-500">Vous pouvez aussi saisir un code manuellement dans le champ.</div>
              </div>
            )}
            {isGsCode && gsAutoSample.isLoading && !gsSample && (
              <div className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-900">Création automatique de l’Échantillon de préproduction pour {code}… Aucun stock ne sera consommé.</div>
            )}
            {isGsCode && gsOilLot && gsSample && (
              <div className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-900">Code GS confirmé · {gsOwnerLabel} · Échantillon de laboratoire créé sans consommation du stock · {code}</div>
            )}
            {isGsCode && (gsExistingAssessment || gsCodeAssessmentPending) && !selectedGsAssessment && (
              <div className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-900">Une analyse existe déjà et attend la Décision indépendante. Cliquez sur son code dans le tableau pour la modifier.</div>
            )}
            {isGsCode && gsCodeAssessmentReviewed && !selectedGsAssessment && (
              <div data-testid="lab-gs-analysis-already-reviewed" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                Ce code a déjà été analysé. Décision enregistrée : {String(gsCodeAssessment.decision || gsCodeAssessment.status)}. L’analyse est verrouillée et ne peut pas être recréée ni modifiée.
              </div>
            )}
            {isGsCode && selectedGsAssessment && (
              <div className="rounded-lg bg-cyan-100 px-3 py-2 text-sm font-medium text-cyan-900">Modification de l’analyse en attente · {code}</div>
            )}
            {isGsCode && !gsCodeAssessment && !gsLots.isLoading && !gsSamples.isLoading && !gsAutoSample.isLoading && !gsLots.isError && !gsSamples.isError && !gsOilLot && !gsAutoSample.isError && (
              <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Aucun lot de réception ouvert n’est associé à ce code d’achat, ou un échantillon existant doit être vérifié.</div>
            )}
            {isGsCode && gsAutoSample.isError && (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{errMsg(gsAutoSample.error)}</div>
            )}
            {isGsCode && (gsLots.isError || gsSamples.isError || mill.isError) && (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">Accès GS impossible ou autorisation manquante. Vérifiez les permissions commerciales.</div>
            )}
            {found && (
              <div data-testid="lab-client-found" className="flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-900">
                <CheckCircle2 className="size-4 text-green-600" /> {found.client_name} · {fmtNum(found.olive_kg)} {t("kg")}
              </div>
            )}
            {oliveVarietyLabel && (
              <div data-testid="lab-olive-variety" className="rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
                Type d’olive : <span className="font-bold">{oliveVarietyLabel}</span>
              </div>
            )}
            {found && existing && (
              <div data-testid="lab-existing-analysis" className="rounded-lg bg-cyan-100 px-3 py-2 text-sm font-medium text-cyan-900">
                {t("lab_existing")} · <span dir="ltr">{fmtDate(existing.created_at)}</span>
              </div>
            )}
            {lookup.isError && (
              <div data-testid="lab-client-not-found" className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
                <XCircle className="size-4" /> {t("not_found")}
              </div>
            )}
          </div>
          {isGsCode && <div className="space-y-2"><Label htmlFor="lab-specification">Référence de la norme</Label><Input id="lab-specification" required minLength={2} maxLength={160} value={specificationReference} disabled={gsAnalysisLocked} onChange={(e) => setSpecificationReference(e.target.value)} className="h-10 rounded-xl bg-white" placeholder="IOC / COI..." /></div>}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="la">{t("acidity")}</Label>
              <Input id="la" inputMode="decimal" data-testid="lab-acidity-input" value={f.acidity} disabled={gsAnalysisLocked} onChange={(e) => set("acidity")(e.target.value)} className="h-10 rounded-xl bg-white" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lp">{t("peroxide")}</Label>
              <Input id="lp" inputMode="decimal" data-testid="lab-peroxide-input" value={f.peroxide} disabled={gsAnalysisLocked} onChange={(e) => set("peroxide")(e.target.value)} className="h-10 rounded-xl bg-white" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="k2">K232</Label>
              <Input id="k2" inputMode="decimal" data-testid="lab-k232-input" value={f.k232} disabled={gsAnalysisLocked} onChange={(e) => set("k232")(e.target.value)} className="h-10 rounded-xl bg-white" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="k7">K270</Label>
              <Input id="k7" inputMode="decimal" data-testid="lab-k270-input" value={f.k270} disabled={gsAnalysisLocked} onChange={(e) => set("k270")(e.target.value)} className="h-10 rounded-xl bg-white" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lo">{t("oil_content")}</Label>
              <Input id="lo" inputMode="decimal" data-testid="lab-oil-content-input" value={f.oil} disabled={gsAnalysisLocked} onChange={(e) => set("oil")(e.target.value)} className="h-10 rounded-xl bg-white" />
            </div>
            <div className="space-y-2">
              <Label>{t("classification")}</Label>
              <Select value={f.grade} disabled={gsAnalysisLocked} onValueChange={(v: string) => set("grade")(v)}>
                <SelectTrigger className="h-10 w-full rounded-xl bg-white" data-testid="lab-classification-select">
                  <SelectValue>{(v) => GRADE_LABEL[v as string]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">{t("auto")}</SelectItem>
                  <SelectItem value="extra_vierge">{t("extra_vierge")}</SelectItem>
                  <SelectItem value="vierge">{t("vierge")}</SelectItem>
                  <SelectItem value="lampante">{t("lampante")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>{isGsCode ? "Type d’olive" : t("oil_type")}</Label>
            <Select value={oilType || null} disabled={gsAnalysisLocked} onValueChange={(v) => set("oilType")((v as string) ?? "")}>
              <SelectTrigger className="h-10 w-full rounded-xl bg-white" data-testid="lab-oil-type-select">
                <SelectValue>{(v) => (v ? String(v) : <span className="text-stone-400">{t("choose_oil_type")}</span>)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {oilTypes.map((v) => <SelectItem key={v} value={v} data-testid={`lab-oil-type-option-${v}`}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ln">{t("notes")}</Label>
            <Textarea id="ln" data-testid="lab-notes-input" value={f.notes} disabled={gsAnalysisLocked} onChange={(e) => set("notes")(e.target.value)} className="rounded-xl bg-white" />
          </div>
          <div className="flex items-center justify-between rounded-xl border border-stone-200 bg-white p-3">
            <span className="text-sm font-medium text-stone-600">{t("classification")}</span>
            {finalGrade ? <GradeBadge grade={finalGrade} testId="lab-classification-badge" /> : <span className="text-stone-400">—</span>}
          </div>
          <Button type="submit" disabled={acid == null || (isGsCode ? (!gsOilLot || !gsSample || (!selectedGsAssessment && (!gsLotCanBeAnalysed || !!gsExistingAssessment || !!gsCodeAssessment)) || (selectedGsAssessment && selectedGsAssessment.status !== "AWAITING_INDEPENDENT_REVIEW") || gsLots.isLoading || gsSamples.isLoading || gsAutoSample.isLoading || gsAssessments.isLoading || mill.isLoading || !specificationReference.trim() || gsMutation.isPending) : (!found || m.isPending))} data-testid="lab-save-button" className="h-11 w-full rounded-xl bg-cyan-700 hover:bg-cyan-800">
            {isGsCode ? (selectedGsAssessment ? "Enregistrer les modifications" : "Envoyer à la Décision indépendante") : t("save")}
          </Button>
        </form>
          <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-sm">
            <div className="border-b border-amber-100 px-5 py-4">
              <h2 className="font-heading text-lg font-bold text-stone-900">Lots d’huile en attente d’analyse</h2>
              <p className="mt-1 text-sm text-stone-500">Lots analytiques liés au code d’achat unique. Ils ne représentent pas un stock d’huile produite et ne consomment pas d’olives.</p>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-4">
              <Table>
                <TableHeader><TableRow><TableHead>Code de traçabilité</TableHead><TableHead>Achat</TableHead><TableHead>Type d’olive</TableHead><TableHead>Statut</TableHead></TableRow></TableHeader>
                <TableBody>
                  {pendingGsCodes.map((pendingCode) => {
                    const purchase = (gsPurchases.data ?? []).find((item) => String(item.batch_code || "").trim().toUpperCase() === pendingCode.toUpperCase());
                    const custodyReceipt = (gsCustodyReceipts.data ?? []).find((item) => String(item.batch_code || "").trim().toUpperCase() === pendingCode.toUpperCase() && item.status === "RECEIVED");
                    const oliveLot = (gsLots.data ?? []).find((lot) => lot.product_kind === "OLIVE" && String(lot.batch_code || "").trim().toUpperCase() === pendingCode.toUpperCase());
                    const purchaseTypes = (purchase?.lines ?? []).map((line: any) => {
                      const item = (gsVarieties.data ?? []).find((v) => v.id === line.variety_id);
                      return String(item?.name_fr || item?.name || line.variety_id || "").trim();
                    });
                    const custodyVariety = (gsVarieties.data ?? []).find((v) => v.id === custodyReceipt?.variety_id);
                    const types = [...new Set([
                      ...purchaseTypes,
                      ...(custodyReceipt ? [String(custodyVariety?.name_fr || custodyVariety?.name || custodyReceipt.variety_id || "").trim()] : []),
                    ].filter(Boolean))].join(", ");
                    const sourceLabel = purchase
                      ? String(purchase.document_number || oliveLot?.source_purchase_id || "Achat de la huilerie")
                      : custodyReceipt
                        ? "Garde du client" + (custodyReceipt.customer_name ? " · " + custodyReceipt.customer_name : "")
                        : "—";
                    const statusLabel = custodyReceipt ? "Garde client · En attente d’analyse" : "Achat reçu · En attente d’analyse";
                    return <TableRow key={pendingCode}>
                      <TableCell><button type="button" onClick={() => { setSelectedGsAssessment(null); setSpecificationReference(""); setF({ ...EMPTY, code: pendingCode }); setCodeListOpen(false); }} className="rounded-lg text-left font-mono text-xs font-semibold text-cyan-800 underline decoration-dotted underline-offset-4 hover:text-cyan-950" title="Sélectionner ce code pour l’analyse">{pendingCode}</button></TableCell>
                      <TableCell>{sourceLabel}</TableCell>
                      <TableCell>{types || "—"}</TableCell>
                      <TableCell><span className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800"><span className="size-2 rounded-full bg-amber-600 animate-pulse" /> <span className="animate-pulse">{statusLabel}</span></span></TableCell>
                    </TableRow>;
                  })}
                  {pendingLoads.map((load) => <TableRow key={load.id}>
                    <TableCell><button type="button" onClick={() => { setSelectedGsAssessment(null); setSpecificationReference(""); setF({ ...EMPTY, code: load.code }); setCodeListOpen(false); }} className="rounded-lg text-left font-mono text-xs font-semibold text-cyan-800 underline decoration-dotted underline-offset-4 hover:text-cyan-950" title="Sélectionner ce code pour l’analyse">{load.code}</button></TableCell>
                    <TableCell>{load.client_name || "—"}</TableCell>
                    <TableCell>{load.variety || "—"}</TableCell>
                    <TableCell><span className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800"><span className="size-2 rounded-full bg-amber-600 animate-pulse" /> <span className="animate-pulse">En attente d’analyse</span></span></TableCell>
                  </TableRow>)}
                  {(!gsLots.isLoading && pendingLoads.length === 0 && !(gsLots.data ?? []).some((lot) => lot.product_kind === "OIL" && lot.lot_purpose === "PREPRODUCTION_SAMPLE" && lot.analysis_only === true && lot.status === "OPEN" && !lot.last_quality_assessment_id)) && <TableRow><TableCell colSpan={4} className="py-8 text-center text-stone-500">{t("no_data")}</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          </div>


      </div>
      
      {canReviewGsQuality && <section data-testid="lab-independent-quality-decision" className="mb-6 rounded-2xl border border-violet-200 bg-white shadow-sm">
        <div className="border-b border-violet-100 bg-violet-50/60 px-5 py-4"><h2 className="font-heading text-lg font-bold text-violet-950">Décision indépendante</h2><p className="mt-1 text-sm text-violet-800">Réservée aux réviseurs autorisés et aux administrateurs. Un administrateur peut décider même s’il a enregistré l’analyse ; un autre utilisateur ne peut pas valider sa propre analyse.</p></div>
        <div className="space-y-4 p-5">
          <div className="flex flex-wrap items-end gap-2"><label className="min-w-0 flex-1 space-y-2 text-sm font-medium">Analyse à examiner
            <Select value={reviewAssessmentId || undefined} onValueChange={setReviewAssessmentId}><SelectTrigger className="h-10 w-full"><SelectValue placeholder="Choisir une analyse en attente" /></SelectTrigger><SelectContent>{reviewableGsAssessments.map((assessment) => <SelectItem key={assessment.id} value={assessment.id}><span className="font-mono font-semibold">{reviewAssessmentCode(assessment)}</span> · {assessment.laboratory_name || "Laboratoire"}</SelectItem>)}</SelectContent></Select>
          </label><Button type="button" variant="outline" onClick={() => setReviewQrOpen(true)}><ScanLine className="mr-2 size-4" />Scanner le QR</Button></div>
          {selectedReviewAssessment && <div className="rounded-xl border bg-stone-50 p-3 text-sm"><div><strong>Code de traçabilité :</strong> <span className="font-mono">{reviewAssessmentCode(selectedReviewAssessment)}</span></div><div><strong>Laboratoire :</strong> {selectedReviewAssessment.laboratory_name || "—"}</div><div><strong>Date d’analyse :</strong> {fmtDate(selectedReviewAssessment.tested_date || selectedReviewAssessment.created_at)}</div><div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4"><div>Acidité : <strong>{selectedReviewAssessment.acidity ?? "—"}</strong></div><div>Peroxyde : <strong>{selectedReviewAssessment.peroxide ?? "—"}</strong></div><div>K232 : <strong>{selectedReviewAssessment.k232 ?? "—"}</strong></div><div>K270 : <strong>{selectedReviewAssessment.k270 ?? "—"}</strong></div><div>Classification : <strong>{selectedReviewAssessment.classification ?? "—"}</strong></div><div>Type : <strong>{selectedReviewAssessment.oil_type ?? "—"}</strong></div></div></div>}
          <label className="block space-y-2 text-sm font-medium">Décision<Select value={reviewDecision} onValueChange={(value) => setReviewDecision(value as "RELEASED" | "REJECTED")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="RELEASED">Accepter le lot</SelectItem><SelectItem value="REJECTED">Refuser le lot</SelectItem></SelectContent></Select></label>
          <label className="block space-y-2 text-sm font-medium">Justification (10 caractères minimum)<Textarea value={reviewReason} onChange={(event) => setReviewReason(event.target.value)} minLength={10} maxLength={1000} className="min-h-24" /></label>
          {gsAssessments.isLoading || gsLots.isLoading ? <p className="text-sm text-stone-500">Chargement des analyses et des codes de traçabilité…</p> : null}
          {(gsAssessments.isError || gsLots.isError) && <p className="text-sm text-red-600">Impossible de charger les analyses ou les lots. Vérifiez votre connexion et vos droits d’accès, puis actualisez la page.</p>}
          {!gsAssessments.isLoading && !gsLots.isLoading && !gsAssessments.isError && !gsLots.isError && reviewableGsAssessments.length === 0 && <p className="text-sm text-stone-500">Aucune analyse préproduction en attente de décision indépendante.</p>}
          <Button type="button" disabled={!selectedReviewAssessment || reviewReason.trim().length < 10 || releaseGsAssessment.isPending} onClick={() => releaseGsAssessment.mutate()}>{releaseGsAssessment.isPending ? "Enregistrement…" : "Enregistrer la décision"}</Button>
        </div>
      </section>}
      <QrScanDialog open={reviewQrOpen} onClose={() => setReviewQrOpen(false)} onScan={(raw) => { handleReviewQrScan(raw); setReviewQrOpen(false); }} />
<div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
        <div className="border-b border-stone-100 px-5 py-4 font-heading text-lg font-bold text-stone-900">{t("analyses")}</div>
        <Table data-testid="lab-table">
          <TableHeader className="bg-stone-50">
            <TableRow>
              <TableHead className="text-start">{t("code")}</TableHead>
              <TableHead className="text-start">{t("client")}</TableHead>
              <TableHead className="text-end">{t("acidity")}</TableHead>
              <TableHead className="text-end">Perox.</TableHead>
              <TableHead className="text-end">K232</TableHead>
              <TableHead className="text-end">K270</TableHead>
              <TableHead className="text-end">%</TableHead>
              <TableHead className="text-start">{t("classification")}</TableHead>
              <TableHead className="text-start">Type d’olive</TableHead>
              <TableHead className="text-start">{t("oil_type")}</TableHead>
              <TableHead className="text-start">{t("date")}</TableHead>
              <TableHead className="text-end">{t("certificate")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && gsAnalysisRows.length === 0 && (
              <TableRow><TableCell colSpan={12} className="py-12 text-center text-stone-500">{t("no_data")}</TableCell></TableRow>
            )}
            {gsAnalysisRows.map((r) => (
              <TableRow key={`gs-${r.id}`} data-testid={`lab-gs-row-${r.batch_code || r.sample_reference}`}>
                <TableCell>
                  {r.status === "AWAITING_INDEPENDENT_REVIEW" ? (
                    <button type="button" title="Modifier l’analyse avant Décision" className="rounded-lg hover:opacity-80" onClick={() => {
                      setSelectedGsAssessment(r);
                      setF({ ...EMPTY, code: String(r.batch_code || r.sample_reference || ""), acidity: r.acidity == null ? "" : String(r.acidity), peroxide: r.peroxide == null ? "" : String(r.peroxide), k232: r.k232 == null ? "" : String(r.k232), k270: r.k270 == null ? "" : String(r.k270), oil: r.oil_content_pct == null ? "" : String(r.oil_content_pct), notes: r.notes || "", oilType: r.oil_type || "", grade: r.classification || "auto" });
                      setSpecificationReference(r.specification_reference || "");
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}>
                      <CodeBadge code={String(r.batch_code || r.sample_reference)} />
                    </button>
                  ) : <span title="Décision enregistrée : analyse verrouillée"><CodeBadge code={String(r.batch_code || r.sample_reference)} /></span>}
                </TableCell>
                <TableCell className="font-medium">GS · Lot d’huile<div className="max-w-48 truncate text-xs text-stone-500">{r.status === "AWAITING_INDEPENDENT_REVIEW" ? "En attente de décision indépendante" : r.decision || r.status || "Analyse enregistrée"}</div></TableCell>
                <TableCell className="text-end font-semibold">{fmtNum(r.acidity, 2)}</TableCell>
                <TableCell className="text-end">{fmtNum(r.peroxide, 2)}</TableCell>
                <TableCell className="text-end">{fmtNum(r.k232, 3)}</TableCell>
                <TableCell className="text-end">{fmtNum(r.k270, 3)}</TableCell>
                <TableCell className="text-end">{fmtNum(r.oil_content_pct, 1)}</TableCell>
                <TableCell>{r.classification ? <GradeBadge grade={r.classification} /> : "—"}</TableCell>
                <TableCell className="text-sm font-medium text-stone-800">{(() => { const purchase = (gsPurchases.data ?? []).find((p) => p.batch_code === (r.batch_code || r.sample_reference)); const varietyIds = (purchase?.lines ?? []).map((line: any) => line.variety_id); const names = varietyIds.map((id: string) => (gsVarieties.data ?? []).find((v) => v.id === id)?.name_fr || id); return [...new Set(names)].join(", ") || "—"; })()}</TableCell>
                <TableCell className="text-sm font-medium text-stone-800">{r.oil_type || "—"}</TableCell>
                <TableCell className="text-xs text-stone-500" dir="ltr">{fmtDate(r.tested_date || r.created_at)}</TableCell>
                <TableCell className="text-end">{<Link to={`/commercial/certificate/${r.id}?from=lab`} data-testid={`lab-gs-certificate-${r.batch_code || r.sample_reference}`} className={buttonVariants({ variant: "outline", size: "sm" })}><Award className="size-4 text-emerald-600" /> {t("view_certificate")}</Link>}</TableCell>
              </TableRow>
            ))}
            {rows.map((r) => (
              <TableRow key={r.id} data-testid={`lab-row-${r.code}`}>
                <TableCell>
                  <button type="button" onClick={() => { setF({ ...EMPTY, code: r.code }); window.scrollTo({ top: 0, behavior: "smooth" }); }} data-testid={`lab-row-code-${r.code}`} title={t("lab_edit")} className="rounded-lg transition-transform duration-150 hover:scale-105">
                    <CodeBadge code={r.code} />
                  </button>
                </TableCell>
                <TableCell className="font-medium">
                  {r.client_name}
                  {r.notes && <div className="max-w-48 truncate text-xs text-stone-500">{r.notes}</div>}
                </TableCell>
                <TableCell className="text-end font-semibold">{fmtNum(r.acidity, 2)}</TableCell>
                <TableCell className="text-end">{fmtNum(r.peroxide, 2)}</TableCell>
                <TableCell className="text-end">{fmtNum(r.k232, 3)}</TableCell>
                <TableCell className="text-end">{fmtNum(r.k270, 3)}</TableCell>
                <TableCell className="text-end">{fmtNum(r.oil_content_pct, 1)}</TableCell>
                <TableCell><GradeBadge grade={r.classification} /></TableCell>
                <TableCell className="text-sm font-medium text-stone-800" data-testid={`lab-row-oil-type-${r.code}`}>{r.oil_type || "—"}</TableCell>
                <TableCell className="text-xs text-stone-500" dir="ltr">{fmtDate(r.created_at)}</TableCell>
                <TableCell className="text-end">
                  <Link to={`/certificate/${r.id}`} data-testid={`lab-certificate-${r.code}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                    <Award className="size-4 text-emerald-600" /> {t("view_certificate")}
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <QrScanDialog
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onScan={(scannedCode) => {
          setF((current) => ({ ...current, code: scannedCode }));
          setScanOpen(false);
        }}
      />
    </div>
  );
}
