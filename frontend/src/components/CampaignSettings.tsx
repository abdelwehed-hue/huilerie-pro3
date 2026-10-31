import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarRange, Download, FileArchive, FileText, Plus } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { API_ORIGIN, apiGet, apiPost, apiPut } from "@/lib/api";
import type { SeasonInfo, SeasonSet } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import MillInfoSettings from "@/components/MillInfoSettings";

const AUTO = "__auto";

export default function CampaignSettings() {
  const { t, errMsg } = useI18n();
  const qc = useQueryClient();
  const sq = useQuery({ queryKey: ["seasons"], queryFn: () => apiGet<SeasonInfo>("/seasons") });
  const s = sq.isError ? undefined : sq.data;
  const setSeason = useMutation({
    mutationFn: (b: SeasonSet) => apiPut<SeasonInfo>("/seasons/active", b),
    onSuccess: () => {
      toast.success(t("season_saved"));
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const [ns, setNs] = useState("");
  const nsValid = /^\d{4}-\d{4}$/.test(ns) && Number(ns.slice(5)) === Number(ns.slice(0, 4)) + 1;
  const createSeason = useMutation({
    mutationFn: (b: SeasonSet) => apiPost<SeasonInfo>("/seasons", b),
    onSuccess: () => {
      toast.success(t("season_saved"));
      setNs("");
      qc.invalidateQueries({ queryKey: ["seasons"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });


  const label = (v: string) => (v === AUTO ? `${t("season_auto")}${s ? ` — ${s.current}` : ""}` : v);

  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
      <div className="rounded-2xl border border-amber-200 bg-[#FFFBEB] p-6 shadow-sm" data-testid="season-settings">
        <div className="mb-4 flex items-center gap-3 text-amber-900">
          <div className="grid size-10 place-items-center rounded-xl bg-amber-500 text-white"><CalendarRange className="size-5" /></div>
          <h3 className="font-heading text-lg font-bold">{t("season")}</h3>
        </div>
        <p className="mb-4 text-sm text-amber-900/80">{t("season_hint")}</p>
        <div className="mb-4 text-sm">
          {t("season")}: <span className="font-mono text-lg font-bold text-amber-800" dir="ltr" data-testid="season-active">{s?.active ?? "—"}</span>
        </div>
        <Label className="mb-2 block">{t("season")}</Label>
        <Select
          value={s ? (s.auto ? AUTO : s.active) : null}
          disabled={setSeason.isPending}
          onValueChange={(v) => setSeason.mutate({ season: v === AUTO || !v ? "" : (v as string) })}
        >
          <SelectTrigger className="h-11 w-full rounded-xl bg-white" data-testid="season-select">
            <SelectValue>{(v) => (v ? label(String(v)) : "—")}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={AUTO} data-testid="season-option-auto">{label(AUTO)}</SelectItem>
            {(s?.available ?? []).map((x) => <SelectItem key={x} value={x} data-testid={`season-option-${x}`}>{x}</SelectItem>)}
          </SelectContent>
        </Select>
        <p className="mt-3 text-xs text-amber-900/70" data-testid="season-code-hint">
          {t("season_code_hint")} <span className="font-mono font-bold" dir="ltr">{s ? `${s.active.slice(2, 4)}${s.active.slice(7, 9)}100` : ""}</span>
        </p>
        <form
          onSubmit={(e) => { e.preventDefault(); if (nsValid) createSeason.mutate({ season: ns }); }}
          className="mt-4 flex gap-2"
        >
          <Input value={ns} onChange={(e) => setNs(e.target.value.trim())} placeholder="2025-2026" dir="ltr" maxLength={9} data-testid="season-new-input" className="h-11 rounded-xl bg-white font-mono" />
          <Button type="submit" disabled={!nsValid || createSeason.isPending} data-testid="season-create-button" className="h-11 rounded-xl bg-amber-600 hover:bg-amber-700">
            <Plus className="size-4" /> {t("season_create")}
          </Button>
        </form>
      </div>

      <MillInfoSettings />

      <div className="rounded-2xl border border-sky-200 bg-sky-50 p-6 shadow-sm lg:col-span-2" data-testid="db-export-settings">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-sky-900">
            <div className="grid size-10 place-items-center rounded-xl bg-sky-600 text-white"><Download className="size-5" /></div>
            <div>
              <h3 className="font-heading text-lg font-bold">{t("db_export")}</h3>
              <p className="text-sm text-sky-900/70">{t("db_export_hint")}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a href={`${API_ORIGIN}/api/admin/export.zip`} download data-testid="admin-database-export-zip" className={cn(buttonVariants(), "h-11 rounded-xl border-sky-600 bg-sky-600 text-white hover:border-sky-700 hover:bg-sky-700")}>
              <FileArchive className="size-4" /> {t("db_export_btn")}
            </a>
            <a href={`${API_ORIGIN}/api/admin/export.pdf`} download data-testid="admin-database-export-pdf" className={cn(buttonVariants(), "h-11 rounded-xl bg-rose-600 hover:bg-rose-700")}>
              <FileText className="size-4" /> {t("db_export_pdf_btn")}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
