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
import { apiGet, apiPost } from "@/lib/api";
import type { Grade, LabAnalysis, LabCreate, Load, Varieties } from "@/lib/types";
import { fmtDate, fmtNum, useI18n } from "@/lib/i18n";
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
  const qc = useQueryClient();
  const [f, setF] = useState(EMPTY);
  const [scanOpen, setScanOpen] = useState(false);
  const [specificationReference, setSpecificationReference] = useState("");
  const code = f.code.trim();
  const isGsCode = /^\d{4}A\d{4}$/i.test(code);
  const gsLots = useQuery({ queryKey: ["lab-gs-lots"], queryFn: () => apiGet<Array<Record<string, any>>>("/commercial/v1/lots?limit=500"), enabled: isGsCode, retry: false });
  const gsSamples = useQuery({ queryKey: ["lab-gs-preproduction-samples"], queryFn: () => apiGet<Array<Record<string, any>>>("/commercial/v1/preproduction-samples?limit=500"), enabled: isGsCode, retry: false });
  const gsAssessments = useQuery({ queryKey: ["lab-gs-quality-assessments"], queryFn: () => apiGet<Array<Record<string, any>>>("/commercial/v1/quality-assessments?limit=500"), enabled: isGsCode, retry: false });
  const mill = useQuery({ queryKey: ["mill"], queryFn: () => apiGet<{ mill_name?: string }>("/mill"), enabled: isGsCode, retry: false });
  const gsOliveLot = (gsLots.data ?? []).find((lot) => lot.product_kind === "OLIVE" && lot.batch_code === code && lot.status === "OPEN");
  const gsSample = gsOliveLot ? (gsSamples.data ?? []).find((sample) => sample.source_olive_lot_id === gsOliveLot.id && sample.status === "COMPLETED" && sample.id === gsOliveLot.latest_preproduction_sample_id) : undefined;
  const gsOilLot = gsSample ? (gsLots.data ?? []).find((lot) => lot.id === gsSample.oil_sample_lot_id && lot.product_kind === "OIL" && lot.lot_purpose === "PREPRODUCTION_SAMPLE" && lot.status === "OPEN") : undefined;
  const gsExistingAssessment = gsOilLot ? (gsAssessments.data ?? []).find((assessment) => assessment.oil_lot_id === gsOilLot.id && assessment.status === "AWAITING_INDEPENDENT_REVIEW" && assessment.id === gsOilLot.last_quality_assessment_id) : undefined;
  const gsLotCanBeAnalysed = !!gsOilLot && ["PENDING", "REJECTED"].includes(String(gsOilLot.quality_status));
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
  const rows = list.isError ? [] : (list.data ?? []);
  const found = lookup.data && !lookup.isError ? lookup.data : null;
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
      if (!gsLotCanBeAnalysed || gsExistingAssessment) throw new Error("Une analyse est déjà en attente ou ce Lot d’huile ne peut plus être analysé.");
      if (!specificationReference.trim()) throw new Error("La référence de la norme est obligatoire.");
      if (acid == null) throw new Error("L’acidité est obligatoire.");
      return apiPost("/commercial/v1/quality-assessments", {
        oil_lot_id: gsOilLot.id, expected_lot_version: gsOilLot.version ?? 1,
        sample_reference: code, sample_date: gsSample.trial_date, tested_date: new Date().toISOString().slice(0, 10),
        laboratory_name: gsConfiguredLaboratoryName, specification_reference: specificationReference.trim(), measurements: [],
        acidity: acid, peroxide: num(f.peroxide), k232: num(f.k232), k270: num(f.k270), oil_content_pct: num(f.oil),
        classification: finalGrade, oil_type: oilType || null, notes: f.notes, idempotency_key: crypto.randomUUID(),
      });
    },
    onSuccess: () => {
      toast.success("Résultats transmis à la Décision indépendante");
      setF(EMPTY); setSpecificationReference("");
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
  const oilType = f.oilType || found?.variety || "";
  const oilTypes = [...new Set([...(vq.isError ? [] : (vq.data?.varieties ?? [])), ...(oilType ? [oilType] : [])])];
  const GRADE_LABEL: Record<string, string> = { auto: t("auto"), extra_vierge: t("extra_vierge"), vierge: t("vierge"), lampante: t("lampante") };

  return (
    <div>
      <PageHeader title={t("lab_title")} sub={t("lab_sub")} accent="bg-cyan-500" />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,420px)_1fr]">
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
              <Input id="lc" dir="ltr" data-testid="lab-code-input" value={f.code} onChange={(e) => set("code")(e.target.value)} placeholder="2503141035" className="h-11 min-w-0 flex-1 rounded-xl bg-white font-mono text-lg tracking-wider" />
              <Button type="button" onClick={() => setScanOpen(true)} data-testid="lab-qr-scan-button" title={t("scan_qr")} aria-label={t("scan_qr")} className="h-11 shrink-0 rounded-xl bg-gradient-to-br from-cyan-600 to-teal-600 px-3 text-white shadow-md hover:from-cyan-700 hover:to-teal-700">
                <ScanLine className="size-5" />
                <span className="hidden sm:inline">Scan QR Code</span>
              </Button>
            </div>
            {isGsCode && gsOilLot && gsSample && (\n              <div className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-900">Code GS confirmé · Lot d’huile expérimental prêt · {code}</div>\n            )}\n            {isGsCode && gsExistingAssessment && (\n              <div className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-900">Une analyse existe déjà et attend la Décision indépendante pour {code}.</div>\n            )}\n            {isGsCode && !gsLots.isLoading && !gsSamples.isLoading && !gsLots.isError && !gsSamples.isError && !gsOilLot && (\n              <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Aucun Lot d’huile expérimental actif trouvé pour ce code. Créez d’abord l’échantillon d’huile dans GS.</div>\n            )}\n            {isGsCode && (gsLots.isError || gsSamples.isError || mill.isError) && (\n              <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">Accès GS impossible ou autorisation manquante. Vérifiez les permissions commerciales.</div>\n            )}\n            {found && (
              <div data-testid="lab-client-found" className="flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-900">
                <CheckCircle2 className="size-4 text-green-600" /> {found.client_name} · {fmtNum(found.olive_kg)} {t("kg")}
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
          {isGsCode && <div className="space-y-2"><Label htmlFor="lab-specification">Référence de la norme</Label><Input id="lab-specification" required minLength={2} maxLength={160} value={specificationReference} onChange={(e) => setSpecificationReference(e.target.value)} className="h-10 rounded-xl bg-white" placeholder="IOC / COI..." /></div>}\n          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="la">{t("acidity")}</Label>
              <Input id="la" inputMode="decimal" data-testid="lab-acidity-input" value={f.acidity} onChange={(e) => set("acidity")(e.target.value)} className="h-10 rounded-xl bg-white" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lp">{t("peroxide")}</Label>
              <Input id="lp" inputMode="decimal" data-testid="lab-peroxide-input" value={f.peroxide} onChange={(e) => set("peroxide")(e.target.value)} className="h-10 rounded-xl bg-white" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="k2">K232</Label>
              <Input id="k2" inputMode="decimal" data-testid="lab-k232-input" value={f.k232} onChange={(e) => set("k232")(e.target.value)} className="h-10 rounded-xl bg-white" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="k7">K270</Label>
              <Input id="k7" inputMode="decimal" data-testid="lab-k270-input" value={f.k270} onChange={(e) => set("k270")(e.target.value)} className="h-10 rounded-xl bg-white" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lo">{t("oil_content")}</Label>
              <Input id="lo" inputMode="decimal" data-testid="lab-oil-content-input" value={f.oil} onChange={(e) => set("oil")(e.target.value)} className="h-10 rounded-xl bg-white" />
            </div>
            <div className="space-y-2">
              <Label>{t("classification")}</Label>
              <Select value={f.grade} onValueChange={(v: string) => set("grade")(v)}>
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
            <Label>{t("oil_type")}</Label>
            <Select value={oilType || null} onValueChange={(v) => set("oilType")((v as string) ?? "")}>
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
            <Textarea id="ln" data-testid="lab-notes-input" value={f.notes} onChange={(e) => set("notes")(e.target.value)} className="rounded-xl bg-white" />
          </div>
          <div className="flex items-center justify-between rounded-xl border border-stone-200 bg-white p-3">
            <span className="text-sm font-medium text-stone-600">{t("classification")}</span>
            {finalGrade ? <GradeBadge grade={finalGrade} testId="lab-classification-badge" /> : <span className="text-stone-400">—</span>}
          </div>
          <Button type="submit" disabled={acid == null || (isGsCode ? (!gsOilLot || !gsSample || !gsLotCanBeAnalysed || !!gsExistingAssessment || gsLots.isLoading || gsSamples.isLoading || gsAssessments.isLoading || mill.isLoading || !specificationReference.trim() || gsMutation.isPending) : (!found || m.isPending))} data-testid="lab-save-button" className="h-11 w-full rounded-xl bg-cyan-700 hover:bg-cyan-800">
            {isGsCode ? "Envoyer à la Décision indépendante" : t("save")}
          </Button>
        </form>

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
                <TableHead className="text-start">{t("oil_type")}</TableHead>
                <TableHead className="text-start">{t("date")}</TableHead>
                <TableHead className="text-end">{t("certificate")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={11} className="py-12 text-center text-stone-500">{t("no_data")}</TableCell></TableRow>
              )}
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
