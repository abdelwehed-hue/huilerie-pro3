import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarRange, Download, Plus, Sprout, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiGet, apiPut } from "@/lib/api";
import type { SeasonInfo, SeasonSet, Varieties } from "@/lib/types";
import { useI18n } from "@/lib/i18n";

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
      ["seasons", "stats", "loads"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const vq = useQuery({ queryKey: ["varieties"], queryFn: () => apiGet<Varieties>("/varieties") });
  const list = vq.isError ? [] : (vq.data?.varieties ?? []);
  const [nv, setNv] = useState("");
  const saveV = useMutation({
    mutationFn: (b: Varieties) => apiPut<Varieties>("/varieties", b),
    onSuccess: () => {
      toast.success(t("varieties_saved"));
      setNv("");
      qc.invalidateQueries({ queryKey: ["varieties"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const label = (v: string) => (v === AUTO ? `${t("season_auto")}${s ? ` — ${s.current}` : ""}` : v);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
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
      </div>

      <div className="rounded-2xl border border-lime-200 bg-[#F2F8EE] p-6 shadow-sm" data-testid="varieties-settings">
        <div className="mb-4 flex items-center gap-3 text-[#1E3A14]">
          <div className="grid size-10 place-items-center rounded-xl bg-lime-600 text-white"><Sprout className="size-5" /></div>
          <h3 className="font-heading text-lg font-bold">{t("varieties")}</h3>
        </div>
        <div className="mb-4 flex flex-wrap gap-2">
          {list.map((v) => (
            <span key={v} className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-sm font-medium text-lime-900 shadow-sm" data-testid={`variety-chip-${v}`}>
              {v}
              <button type="button" onClick={() => saveV.mutate({ varieties: list.filter((x) => x !== v) })} className="rounded-full p-0.5 text-stone-400 transition-colors duration-150 hover:bg-red-50 hover:text-red-600" data-testid={`variety-remove-${v}`}>
                <X className="size-3.5" />
              </button>
            </span>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const v = nv.trim();
            if (v && !list.some((x) => x.toLowerCase() === v.toLowerCase())) saveV.mutate({ varieties: [...list, v] });
          }}
          className="flex gap-2"
        >
          <Input value={nv} onChange={(e) => setNv(e.target.value)} maxLength={60} data-testid="variety-new-input" className="h-11 rounded-xl bg-white" />
          <Button type="submit" disabled={!nv.trim() || saveV.isPending} data-testid="variety-add-button" className="h-11 rounded-xl bg-lime-700 hover:bg-lime-800">
            <Plus className="size-4" /> {t("add_variety")}
          </Button>
        </form>
      </div>

      <div className="rounded-2xl border border-sky-200 bg-sky-50 p-6 shadow-sm lg:col-span-2" data-testid="db-export-settings">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-sky-900">
            <div className="grid size-10 place-items-center rounded-xl bg-sky-600 text-white"><Download className="size-5" /></div>
            <div>
              <h3 className="font-heading text-lg font-bold">{t("db_export")}</h3>
              <p className="text-sm text-sky-900/70">{t("db_export_hint")}</p>
            </div>
          </div>
          <a href="/api/admin/export.zip" download data-testid="db-export-button" className={cn(buttonVariants(), "h-11 rounded-xl bg-sky-600 hover:bg-sky-700")}>
            <Download className="size-4" /> {t("db_export_btn")}
          </a>
        </div>
      </div>
    </div>
  );
}
