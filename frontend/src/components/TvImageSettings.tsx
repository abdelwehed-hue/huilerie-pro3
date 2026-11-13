import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Music2, Trash2, Upload, Youtube } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { API_ORIGIN, apiGet, apiPut } from "@/lib/api";
import type { TvMediaSettings } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export default function TvImageSettings() {
  const { t, errMsg, lang } = useI18n();
  const ar = lang === "ar";
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => apiGet<TvMediaSettings>("/tv/media-settings") });
  const [selected, setSelected] = useState<string | null>(null);
  const current = selected ?? settings.data?.tv_image ?? "";
  const [processing, setProcessing] = useState(false);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [videoSource, setVideoSource] = useState<"youtube" | "direct">("youtube");
  const [displayMode, setDisplayMode] = useState<"background" | "split" | "fullscreen">("background");
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [receiptDuration, setReceiptDuration] = useState(8);
  const [musicEnabled, setMusicEnabled] = useState(false);
  const [musicVolume, setMusicVolume] = useState(40);
  const [musicUploading, setMusicUploading] = useState(false);
  useEffect(() => {
    if (settings.data) {
      setYoutubeUrl(settings.data.tv_youtube_url ?? "");
      setVideoSource(settings.data.tv_video_source ?? "youtube");
      setDisplayMode(settings.data.tv_display_mode ?? "background");
      setVideoEnabled(settings.data.tv_video_enabled ?? true);
      setReceiptDuration(settings.data.tv_receipt_duration ?? 8);
      setMusicEnabled(settings.data.tv_music_enabled ?? false);
      setMusicVolume(settings.data.tv_music_volume ?? 40);
    }
  }, [settings.data]);
  const uploadMusic = async (file?: File) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".mp3") || (file.type && !["audio/mpeg", "audio/mp3", "application/octet-stream"].includes(file.type))) { toast.error((ar ? "اختر ملف MP3." : "Choisissez un fichier MP3.")); return; }
    if (file.size > 20 * 1024 * 1024) { toast.error((ar ? "يجب ألا يتجاوز ملف MP3 حجم 20 ميغابايت." : "Le fichier MP3 ne doit pas dépasser 20 Mo.")); return; }
    setMusicUploading(true);
    try {
      const body = new FormData(); body.append("file", file);
      const response = await fetch(`${API_ORIGIN}/api/tv/music/upload`, { method: "POST", credentials: "include", body });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.detail || (ar ? "فشل رفع ملف MP3." : "Échec du téléversement du MP3."));
      toast.success((ar ? "تم رفع ملف MP3 بنجاح." : "Fichier MP3 téléversé avec succès."));
      qc.invalidateQueries({ queryKey: ["settings"] }); qc.invalidateQueries({ queryKey: ["tv-mill-settings"] });
    } catch (error) { toast.error(error instanceof Error ? error.message : (ar ? "فشل رفع ملف MP3." : "Échec du téléversement du MP3.")); }
    finally { setMusicUploading(false); }
  };

  const saveVideo = useMutation({
    mutationFn: () => apiPut<TvMediaSettings>("/tv/media-settings", {
      ...settings.data!, tv_youtube_url: youtubeUrl.trim(), tv_video_source: videoSource,
      tv_display_mode: displayMode, tv_video_enabled: videoEnabled, tv_receipt_duration: receiptDuration,
      tv_music_enabled: musicEnabled, tv_music_volume: musicVolume,
    }),
    onSuccess: () => {
      toast.success(t("saved"));
      qc.invalidateQueries({ queryKey: ["settings"] });
      qc.invalidateQueries({ queryKey: ["tv-mill-settings"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const save = useMutation({
    mutationFn: (image: string) => apiPut<TvMediaSettings>("/tv/media-settings", { ...settings.data!, tv_image: image }),
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
        toast.error((ar ? "تعذّر معالجة هذه الصورة." : "Impossible de traiter cette image."));
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
      if (data.length > 700000) toast.error((ar ? "حجم الصورة كبير جداً. اختر صورة أصغر." : "Image trop volumineuse. Choisissez une image plus petite."));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setProcessing(false);
      toast.error((ar ? "تعذّر فتح هذه الصورة." : "Impossible d’ouvrir cette image."));
    };
    img.src = url;
  };

  return (
    <div className="max-w-6xl space-y-6 rounded-2xl border border-violet-200 bg-violet-50/50 p-6">
      <div className="space-y-4">
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-red-200 bg-white p-4 space-y-3">
          <div className="flex items-center gap-2 font-semibold text-stone-800"><Youtube className="size-5 text-red-600" /> {ar ? "فيديو شاشة التلفاز" : "Vidéo sur l’écran TV"}</div>
          <Label htmlFor="tv-youtube-url">{ar ? "رابط الفيديو (اتركه فارغاً حالياً)" : "Lien de la vidéo (laisser vide pour le moment)"}</Label>
          <input id="tv-youtube-url" type="url" value={youtubeUrl} onChange={(e) => setYoutubeUrl(e.target.value)} placeholder={videoSource === "youtube" ? "https://www.youtube.com/watch?v=..." : "https://exemple.com/video.mp4"} className="w-full rounded-lg border px-3 py-2 text-sm" />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="tv-video-source">{ar ? "مصدر الفيديو" : "Source de la vidéo"}</Label>
              <select id="tv-video-source" value={videoSource} onChange={(e) => setVideoSource(e.target.value as "youtube" | "direct")} className="w-full rounded-lg border bg-white px-3 py-2 text-sm">
                <option value="youtube">{ar ? "رابط YouTube" : "Lien YouTube"}</option>
                <option value="direct">{ar ? "رابط مباشر MP4 / WebM (مستضاف خارجياً)" : "Lien direct MP4 / WebM (hébergé ailleurs)"}</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="tv-display-mode">{ar ? "طريقة العرض" : "Mode d’affichage"}</Label>
              <select id="tv-display-mode" value={displayMode} onChange={(e) => setDisplayMode(e.target.value as "background" | "split" | "fullscreen")} className="w-full rounded-lg border bg-white px-3 py-2 text-sm">
                <option value="background">{ar ? "فيديو في الخلفية + الوصولات" : "Vidéo en arrière-plan + reçus"}</option>
                <option value="split">{ar ? "فيديو على اليسار + الوصولات على اليمين" : "Vidéo à gauche + reçus à droite"}</option>
                <option value="fullscreen">{ar ? "فيديو بملء الشاشة + وصل جديد مؤقت" : "Vidéo plein écran + nouveau reçu temporaire"}</option>
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={videoEnabled} onChange={(e) => setVideoEnabled(e.target.checked)} /> {ar ? "تفعيل الفيديو على شاشة التلفاز" : "Activer la vidéo sur l’écran TV"}</label>
          <div className="flex items-center gap-3">
            <Label htmlFor="tv-receipt-duration">{ar ? "مدة عرض الرقم (بالثواني)" : "Durée d’affichage du numéro (secondes)"}</Label>
            <input id="tv-receipt-duration" type="number" min={3} max={30} value={receiptDuration} onChange={(e) => setReceiptDuration(Math.max(3, Math.min(30, Number(e.target.value) || 8)))} className="w-24 rounded-lg border px-3 py-2" />
          </div>
          <Button type="button" disabled={!settings.data || saveVideo.isPending} onClick={() => saveVideo.mutate()} className="rounded-xl bg-red-600 hover:bg-red-700">
            {saveVideo.isPending ? (ar ? "جارٍ الحفظ..." : "Enregistrement...") : (ar ? "حفظ إعدادات الفيديو" : "Enregistrer les paramètres vidéo")}
          </Button>
          <p className="text-xs text-stone-500">{ar ? "اترك الرابط فارغاً إلى حين إدخاله. يمكن استعمال YouTube أو رابط مباشر لملف MP4/WebM مستضاف على خدمة أخرى. لا يتم رفع ملف الفيديو أو تخزينه في MongoDB." : "Le lien reste vide tant que vous ne l’avez pas renseigné. YouTube ou une URL directe MP4/WebM hébergée sur un autre service sont acceptés. Aucun fichier vidéo n’est envoyé ni stocké dans MongoDB."}</p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-white p-4 space-y-4" data-testid="tv-music-settings">
          <div className="flex items-center gap-2 font-semibold text-stone-800"><Music2 className="size-5 text-emerald-700" /> {ar ? "الموسيقى الخلفية على شاشة التلفاز" : "Musique de fond sur l’écran TV"}</div>
          <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={musicEnabled} onChange={(e) => setMusicEnabled(e.target.checked)} /> {ar ? "تفعيل الموسيقى الخلفية" : "Activer la musique de fond"}</label>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3"><Label htmlFor="tv-music-volume">{ar ? "مستوى الصوت" : "Niveau sonore"}</Label><span className="text-sm font-semibold tabular-nums">{musicVolume}%</span></div>
            <input id="tv-music-volume" type="range" min="0" max="100" step="1" value={musicVolume} onChange={(e) => setMusicVolume(Number(e.target.value))} disabled={!musicEnabled} className="w-full accent-emerald-700" />
          </div>
          <div className="rounded-lg border border-dashed border-stone-300 bg-stone-50 p-3 text-sm text-stone-600">
            <div className="font-medium text-stone-800">{ar ? "ملف الموسيقى MP3" : "Fichier musical MP3"}</div>
            <p className="mt-1">{settings.data?.tv_music_filename ? (ar ? `الملف الحالي: ${settings.data.tv_music_filename}` : `Fichier actuel : ${settings.data.tv_music_filename}`) : (ar ? "لم تتم إضافة ملف MP3." : "Aucun fichier MP3 ajouté.")}</p>
            <label className={cn(buttonVariants({ variant: "outline" }), "mt-3 cursor-pointer rounded-xl bg-white")}>
              <Upload className="size-4" /> {musicUploading ? (ar ? "جارٍ الرفع..." : "Téléversement...") : (ar ? "رفع ملف MP3" : "Télécharger un fichier MP3")}
              <input type="file" accept=".mp3,audio/mpeg" className="hidden" disabled={musicUploading} data-testid="tv-music-input" onChange={(e) => { void uploadMusic(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
            <p className="mt-2 text-xs text-stone-500">{ar ? "ملفات MP3 فقط · 20 ميغابايت كحد أقصى · تخزين دائم في MongoDB." : "MP3 uniquement · 20 Mo maximum · stockage permanent dans MongoDB."}</p>
          </div>
          <Button type="button" disabled={!settings.data || saveVideo.isPending} onClick={() => saveVideo.mutate()} className="rounded-xl bg-emerald-700 hover:bg-emerald-800">
            {saveVideo.isPending ? (ar ? "جارٍ الحفظ..." : "Enregistrement...") : (ar ? "حفظ إعدادات الموسيقى" : "Enregistrer les paramètres musicaux")}
          </Button>
          <p className="text-xs text-stone-500">{ar ? "سيتم تشغيل الموسيقى باستمرار بعد إضافة الملف. قد يطلب متصفح التلفاز تفعيل الصوت يدوياً لأول مرة." : "La musique sera lue en continu dès qu’un fichier sera ajouté. Le navigateur du téléviseur peut demander une première activation manuelle du son."}</p>
        </div>
        </div>
        <Label>{ar ? "الصورة الحالية / المعاينة" : "Image actuelle / aperçu"}</Label>
        <div className="flex min-h-48 items-center justify-center overflow-hidden rounded-xl border bg-stone-100 p-2" data-testid="tv-image-preview">
          {current ? <img src={current} alt={ar ? "معاينة خلفية صفحة التلفاز" : "Aperçu du fond de la page TV"} className="max-h-80 w-full object-contain" /> : <div className="py-10 text-sm text-stone-500">{ar ? "لا توجد صورة مخصصة. سيتم الاحتفاظ بالخلفية الافتراضية." : "Aucune image personnalisée. Le fond par défaut sera conservé."}</div>}
        </div>
        <div className="flex flex-wrap gap-3">
          <label className={cn(buttonVariants({ variant: "outline" }), "cursor-pointer rounded-xl bg-white")}>
            <Upload className="size-4" /> {ar ? "اختيار صورة" : "Choisir une image"}
            <input type="file" accept="image/*" className="hidden" data-testid="tv-image-input" onChange={(e) => { pickImage(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          {current && <Button type="button" variant="ghost" onClick={() => setSelected("")} className="rounded-xl text-red-600"><Trash2 className="size-4" /> {ar ? "إزالة الصورة" : "Retirer l’image"}</Button>}
          <Button type="button" disabled={!settings.data || selected === null || processing || save.isPending} onClick={() => selected !== null && settings.data && save.mutate(selected)} className="rounded-xl bg-violet-700 hover:bg-violet-800">
            {processing ? (ar ? "جارٍ التحضير..." : "Préparation...") : save.isPending ? (ar ? "جارٍ الحفظ..." : "Enregistrement...") : (ar ? "حفظ الصورة" : "Enregistrer l’image")}
          </Button>
        </div>
        <p className="text-sm text-stone-600">{ar ? "يتم ضغط الصورة وحفظها في الإعدادات، ثم عرضها على الأجهزة التي تفتح صفحة التلفاز." : "L’image est compressée et enregistrée dans les paramètres, puis affichée sur les appareils qui ouvrent la page TV."}</p>
      </div>
    </div>
  );
}
