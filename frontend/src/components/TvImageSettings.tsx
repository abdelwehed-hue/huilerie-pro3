import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ImageIcon, Trash2, Upload, Youtube } from "lucide-react";
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
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [videoSource, setVideoSource] = useState<"youtube" | "direct">("youtube");
  const [displayMode, setDisplayMode] = useState<"background" | "split" | "fullscreen">("background");
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [receiptDuration, setReceiptDuration] = useState(8);
  useEffect(() => {
    if (settings.data) {
      setYoutubeUrl(settings.data.tv_youtube_url ?? "");
      setVideoSource(settings.data.tv_video_source ?? "youtube");
      setDisplayMode(settings.data.tv_display_mode ?? "background");
      setVideoEnabled(settings.data.tv_video_enabled ?? true);
      setReceiptDuration(settings.data.tv_receipt_duration ?? 8);
    }
  }, [settings.data]);
  const saveVideo = useMutation({
    mutationFn: () => apiPut<AppSettings>("/settings", {
      ...settings.data!, tv_youtube_url: youtubeUrl.trim(), tv_video_source: videoSource,
      tv_display_mode: displayMode, tv_video_enabled: videoEnabled, tv_receipt_duration: receiptDuration,
    }),
    onSuccess: () => {
      toast.success(t("saved"));
      qc.invalidateQueries({ queryKey: ["settings"] });
      qc.invalidateQueries({ queryKey: ["tv-mill-settings"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

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
      <div className="space-y-3">
        <div className="rounded-xl border border-red-200 bg-white p-4 space-y-3">
          <div className="flex items-center gap-2 font-semibold text-stone-800"><Youtube className="size-5 text-red-600" /> Vidéo sur l’écran TV</div>
          <Label htmlFor="tv-youtube-url">Lien de la vidéo (laisser vide pour le moment)</Label>
          <input id="tv-youtube-url" type="url" value={youtubeUrl} onChange={(e) => setYoutubeUrl(e.target.value)} placeholder={videoSource === "youtube" ? "https://www.youtube.com/watch?v=..." : "https://exemple.com/video.mp4"} className="w-full rounded-lg border px-3 py-2 text-sm" />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="tv-video-source">Source de la vidéo</Label>
              <select id="tv-video-source" value={videoSource} onChange={(e) => setVideoSource(e.target.value as "youtube" | "direct")} className="w-full rounded-lg border bg-white px-3 py-2 text-sm">
                <option value="youtube">Lien YouTube</option>
                <option value="direct">Lien direct MP4 / WebM (hébergé ailleurs)</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="tv-display-mode">Mode d’affichage</Label>
              <select id="tv-display-mode" value={displayMode} onChange={(e) => setDisplayMode(e.target.value as "background" | "split" | "fullscreen")} className="w-full rounded-lg border bg-white px-3 py-2 text-sm">
                <option value="background">Vidéo en arrière-plan + reçus</option>
                <option value="split">Vidéo à gauche + reçus à droite</option>
                <option value="fullscreen">Vidéo plein écran + nouveau reçu temporaire</option>
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={videoEnabled} onChange={(e) => setVideoEnabled(e.target.checked)} /> Activer la vidéo sur l’écran TV</label>
          <div className="flex items-center gap-3">
            <Label htmlFor="tv-receipt-duration">Durée d’affichage du numéro (secondes)</Label>
            <input id="tv-receipt-duration" type="number" min={3} max={30} value={receiptDuration} onChange={(e) => setReceiptDuration(Math.max(3, Math.min(30, Number(e.target.value) || 8)))} className="w-24 rounded-lg border px-3 py-2" />
          </div>
          <Button type="button" disabled={!settings.data || saveVideo.isPending} onClick={() => saveVideo.mutate()} className="rounded-xl bg-red-600 hover:bg-red-700">
            {saveVideo.isPending ? "Enregistrement..." : "Enregistrer les paramètres vidéo"}
          </Button>
          <p className="text-xs text-stone-500">Le lien reste vide tant que vous ne l’avez pas renseigné. YouTube ou une URL directe MP4/WebM hébergée sur un autre service sont acceptés. Aucun fichier vidéo n’est envoyé ni stocké dans MongoDB.</p>
        </div>
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
