import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Building2, ImageIcon, Trash2, Upload } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiGet, apiPut } from "@/lib/api";
import type { AppSettings } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export default function MillInfoSettings() {
  const { t, errMsg } = useI18n();
  const qc = useQueryClient();
  const s = useQuery({ queryKey: ["settings"], queryFn: () => apiGet<AppSettings>("/settings") });
  const [edit, setEdit] = useState<Partial<Record<keyof AppSettings, string>>>({});
  const [logo, setLogo] = useState<string | null>(null);
  const val = (k: keyof AppSettings) => edit[k] ?? (s.data ? String(s.data[k] ?? "") : "");
  const curLogo = logo ?? s.data?.mill_logo ?? "";
  const m = useMutation({
    mutationFn: (b: AppSettings) => apiPut<AppSettings>("/settings", b),
    onSuccess: () => { toast.success(t("saved")); setEdit({}); setLogo(null); qc.invalidateQueries({ queryKey: ["settings"] }); qc.invalidateQueries({ queryKey: ["mill"] }); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const pickLogo = (file: File | undefined) => {
    if (!file || !file.type.startsWith("image/")) return;
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, 256 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      setLogo(c.toDataURL("image/png")); URL.revokeObjectURL(url);
    };
    img.src = url;
  };
  const field = (k: keyof AppSettings, label: string, testId: string) => (
    <div className="space-y-2"><Label htmlFor={k}>{label}</Label><Input id={k} data-testid={testId} value={val(k)} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} className="h-11 rounded-xl bg-white" /></div>
  );
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (s.data) m.mutate({ ...s.data, mill_name: val("mill_name"), mill_address: val("mill_address"), mill_phone: val("mill_phone"), mill_logo: curLogo }); }} className="max-w-4xl">
      <div className="space-y-4 rounded-2xl border border-teal-200 bg-teal-50/60 p-6">
        <div className="flex items-center gap-3 text-teal-900"><div className="grid size-10 place-items-center rounded-xl bg-teal-600 text-white"><Building2 className="size-5" /></div><h2 className="font-heading text-xl font-bold">{t("mill_info")}</h2></div>
        {field("mill_name", t("mill_name"), "admin-mill-name-input")}
        {field("mill_address", t("mill_address"), "admin-mill-address-input")}
        {field("mill_phone", t("mill_phone"), "admin-mill-phone-input")}
        <div className="space-y-2"><Label>{t("mill_logo")}</Label><div className="flex items-center gap-4">
          <div className="grid size-16 place-items-center overflow-hidden rounded-2xl border border-teal-200 bg-white" data-testid="admin-mill-logo-preview">{curLogo ? <img src={curLogo} alt="" className="size-full object-contain" /> : <ImageIcon className="size-6 text-stone-300" />}</div>
          <label className={cn(buttonVariants({ variant: "outline" }), "cursor-pointer rounded-xl")}><Upload className="size-4" /> {t("mill_logo_pick")}<input type="file" accept="image/*" className="hidden" data-testid="admin-mill-logo-input" onChange={(e) => { pickLogo(e.target.files?.[0]); e.target.value = ""; }} /></label>
          {curLogo && <Button type="button" variant="ghost" onClick={() => setLogo("")} data-testid="admin-mill-logo-remove" className="rounded-xl text-red-600 hover:bg-red-50"><Trash2 className="size-4" /></Button>}
        </div></div>
        <Button type="submit" disabled={m.isPending || !s.data} data-testid="mill-info-save-button" className="h-11 rounded-xl bg-teal-700 px-8 hover:bg-teal-800">{t("save")}</Button>
      </div>
    </form>
  );
}
