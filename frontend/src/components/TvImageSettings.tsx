import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ImageIcon, Trash2, Upload } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { apiGet, apiPut } from "@/lib/api";
import type { AppSettings } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export default function TvImageSettings() {
  const { t, errMsg } = useI18n();
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => apiGet<AppSettings>("/settings") });
  const [selected, setSelected] = useState<string | null>(null);
  const current = selected ?? settings.data?.tv_image ?? "";
  const [processing, setProcessing] = useState(false);

  const save = useMutation({
    mutationFn: (image: string) => apiPut<AppSettings>("/settings", { ...settings.data!, tv_image: image }),
    onSuccess: () => {
      toast.success(t("saved"));
      setSelected(null);
      qc.invalidateQueries({ queryKey: ["settings"] });
      qc.invalidateQueries({ queryKey: ["tv-mill-settings"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const pickImage = (file?: File) => {
    if (!file || !file.type.startsWith("image/")) return;
    setProcessing(true);
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        setProcessing(false);
        toast.error("Impossible de traiter cette image.");
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      let quality = 0.72;
      let data = canvas.toDataURL("image/jpeg", quality);
      while (data.length > 680000 && quality > 0.35) {
        quality -= 0.08;
        data = canvas.toDataURL("image/jpeg", quality);
      }
      URL.revokeObjectURL(url);
      setSelected(data.length <= 700000 ? data : null);
      setProcessing(false);
      if (data.length > 700000) toast.error("Image trop volumineuse. Choisissez une image plus petite.");
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setProcessing(false);
      toast.error("Impossible d’ouvrir cette image.");
    };
    img.src = url;
  };

  return (
    <div className="max-w-4xl space-y-6 rounded-2xl border border-violet-200 bg-violet-50/50 p-6">
      <div className="flex items-center gap-3 text-violet-900">
        <div className="grid size-10 place-items-center rounded-xl bg-violet-600 text-white"><ImageIcon className="size-5" /></div>
        <div>
          <h2 className="font-heading text-xl font-bold">Page TV</h2>
          <p className="text-sm text-violet-800">Choisissez l’image de fond affichée sur l’écran TV.</p>
        </div>
      </div>
      <div className="space-y-3">
        <Label>Image actuelle / aperçu</Label>
        <div className="flex min-h-48 items-center justify-center overflow-hidden rounded-xl border bg-[#142A1B] p-2" data-testid="tv-image-preview">
          {current ? <img src={current} alt="Aperçu du fond de la page TV" className="max-h-80 w-full object-contain" /> : <div className="py-10 text-sm text-white/75">Aucune image personnalisée. Le fond vert actuel sera conservé.</div>}
        </div>
        <div className="flex flex-wrap gap-3">
          <label className={cn(buttonVariants({ variant: "outline" }), "cursor-pointer rounded-xl bg-white")}>
            <Upload className="size-4" /> Choisir une image
            <input type="file" accept="image/*" className="hidden" data-testid="tv-image-input" onChange={(e) => { pickImage(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          {current && <Button type="button" variant="ghost" onClick={() => setSelected("")} className="rounded-xl text-red-600"><Trash2 className="size-4" /> Retirer l’image</Button>}
          <Button type="button" disabled={!settings.data || selected === null || processing || save.isPending} onClick={() => selected !== null && settings.data && save.mutate(selected)} className="rounded-xl bg-violet-700 hover:bg-violet-800">
            {processing ? "Préparation..." : save.isPending ? "Enregistrement..." : "Enregistrer l’image"}
          </Button>
        </div>
        <p className="text-sm text-stone-600">L’image est compressée et enregistrée dans les paramètres, puis affichée sur les appareils qui ouvrent la page TV.</p>
      </div>
    </div>
  );
}
