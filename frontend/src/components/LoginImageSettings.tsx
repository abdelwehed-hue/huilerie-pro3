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

export default function LoginImageSettings() {
  const { t, errMsg, lang } = useI18n();
  const ar = lang === "ar";
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => apiGet<AppSettings>("/settings") });
  const [selected, setSelected] = useState<string | null>(null);
  const current = selected ?? settings.data?.login_image ?? "";
  const [processing, setProcessing] = useState(false);

  const save = useMutation({
    mutationFn: (image: string) => apiPut<AppSettings>("/settings", { ...settings.data!, login_image: image }),
    onSuccess: () => {
      toast.success(t("saved"));
      setSelected(null);
      qc.invalidateQueries({ queryKey: ["settings"] });
      qc.invalidateQueries({ queryKey: ["login-image"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const pickImage = (file?: File) => {
    if (!file || !file.type.startsWith("image/")) return;
    setProcessing(true);
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1200 / Math.max(img.width, img.height));
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
          <h2 className="font-heading text-xl font-bold">Page Login</h2>
          <p className="text-sm text-violet-800">{ar ? "اختر الصورة التي تظهر في صفحة تسجيل الدخول." : "Choisissez l’image affichée sur la page de connexion."}</p>
        </div>
      </div>
      <div className="space-y-3">
        <Label>{ar ? "الصورة الحالية / المعاينة" : "Image actuelle / aperçu"}</Label>
        <div className="flex min-h-48 items-center justify-center overflow-hidden rounded-xl border bg-white p-2" data-testid="login-image-preview">
          {current ? <img src={current} alt={ar ? "معاينة صفحة تسجيل الدخول" : "Aperçu de la page de connexion"} className="max-h-80 w-full object-contain" /> : <div className="py-10 text-sm text-stone-500">{ar ? "لم يتم اختيار صورة مخصصة." : "Aucune image personnalisée sélectionnée."}</div>}
        </div>
        <div className="flex flex-wrap gap-3">
          <label className={cn(buttonVariants({ variant: "outline" }), "cursor-pointer rounded-xl bg-white")}>
            <Upload className="size-4" /> {ar ? "اختيار صورة" : "Choisir une image"}
            <input type="file" accept="image/*" className="hidden" data-testid="login-image-input" onChange={(e) => { pickImage(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          {current && <Button type="button" variant="ghost" onClick={() => setSelected("")} className="rounded-xl text-red-600"><Trash2 className="size-4" /> Retirer l’image</Button>}
          <Button type="button" disabled={!settings.data || selected === null || processing || save.isPending} onClick={() => selected !== null && settings.data && save.mutate(selected)} className="rounded-xl bg-violet-700 hover:bg-violet-800">
            {processing ? "Préparation..." : save.isPending ? "Enregistrement..." : "Enregistrer l’image"}
          </Button>
        </div>
        <p className="text-sm text-stone-600">{ar ? "يتم ضغط الصورة قبل حفظها، ثم تُستخدم على الأجهزة التي تفتح التطبيق." : "L’image est compressée avant l’enregistrement et sera utilisée sur les appareils qui ouvrent l’application."}</p>
      </div>
    </div>
  );
}
