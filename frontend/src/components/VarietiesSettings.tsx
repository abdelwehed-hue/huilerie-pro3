import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Sprout, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiGet, apiPut } from "@/lib/api";
import type { Varieties } from "@/lib/types";
import { useI18n } from "@/lib/i18n";

export default function VarietiesSettings() {
  const { t, errMsg } = useI18n();
  const qc = useQueryClient();
  const vq = useQuery({ queryKey: ["varieties"], queryFn: () => apiGet<Varieties>("/varieties") });
  const list = vq.isError ? [] : (vq.data?.varieties ?? []);
  const [nv, setNv] = useState("");
  const saveV = useMutation({
    mutationFn: (b: Varieties) => apiPut<Varieties>("/varieties", b),
    onSuccess: () => { toast.success(t("varieties_saved")); setNv(""); qc.invalidateQueries({ queryKey: ["varieties"] }); },
    onError: (e) => toast.error(errMsg(e)),
  });
  return (
    <div className="max-w-4xl rounded-2xl border border-lime-200 bg-[#F2F8EE] p-6 shadow-sm" data-testid="varieties-settings">
      <div className="mb-4 flex items-center gap-3 text-[#1E3A14]"><div className="grid size-10 place-items-center rounded-xl bg-lime-600 text-white"><Sprout className="size-5" /></div><h3 className="font-heading text-lg font-bold">{t("varieties")}</h3></div>
      <div className="mb-4 flex flex-wrap gap-2">{list.map((v) => <span key={v} className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-sm font-medium text-lime-900 shadow-sm" data-testid={`variety-chip-${v}`}>{v}<button type="button" onClick={() => saveV.mutate({ varieties: list.filter((x) => x !== v) })} className="rounded-full p-0.5 text-stone-400 transition-colors duration-150 hover:bg-red-50 hover:text-red-600" data-testid={`variety-remove-${v}`}><X className="size-3.5" /></button></span>)}</div>
      <form onSubmit={(e) => { e.preventDefault(); const v = nv.trim(); if (v && !list.some((x) => x.toLowerCase() === v.toLowerCase())) saveV.mutate({ varieties: [...list, v] }); }} className="flex gap-2">
        <Input value={nv} onChange={(e) => setNv(e.target.value)} maxLength={60} data-testid="variety-new-input" className="h-11 rounded-xl bg-white" />
        <Button type="submit" disabled={!nv.trim() || saveV.isPending} data-testid="variety-add-button" className="h-11 rounded-xl bg-lime-700 hover:bg-lime-800"><Plus className="size-4" /> {t("add_variety")}</Button>
      </form>
    </div>
  );
}
