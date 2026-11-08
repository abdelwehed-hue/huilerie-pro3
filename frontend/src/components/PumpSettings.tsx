import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Fuel, Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiGet, apiPut } from "@/lib/api";
import type { AppSettings, PumpConfig } from "@/lib/types";
import { useI18n } from "@/lib/i18n";

export default function PumpSettings() {
  const { lang, errMsg } = useI18n();
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => apiGet<AppSettings>("/settings") });
  const [enabled, setEnabled] = useState(false);
  const [pumps, setPumps] = useState<PumpConfig[]>([]);

  useEffect(() => {
    if (!settings.data) return;
    setEnabled(settings.data.pump_system_enabled ?? false);
    setPumps(settings.data.pumps ?? []);
  }, [settings.data]);

  const effectiveEnabled = enabled && pumps.some((pump) => pump.active);
  const duplicateNames = new Set(pumps.map((pump) => pump.name.trim().toLocaleLowerCase())).size !== pumps.length;

  const dirty = useMemo(() => {
    if (!settings.data) return false;
    return enabled !== (settings.data.pump_system_enabled ?? false)
      || JSON.stringify(pumps) !== JSON.stringify(settings.data.pumps ?? []);
  }, [enabled, pumps, settings.data]);

  const save = useMutation({
    mutationFn: () => apiPut<AppSettings>("/settings", {
      ...settings.data!,
      pump_system_enabled: enabled && pumps.some((pump) => pump.active),
      pumps,
    }),
    onSuccess: async () => {
      toast.success(lang === "ar" ? "تم حفظ إعدادات المضخّات" : "Configuration des pompes enregistrée");
      await qc.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (error) => toast.error(errMsg(error)),
  });

  const addPump = () => {
    const nextNumber = pumps.reduce((max, pump) => {
      const match = pump.name.match(/(\\d+)$/);
      return Math.max(max, match ? Number(match[1]) : 0);
    }, 0) + 1;
    setPumps((current) => [...current, {
      id: `pump-${Date.now()}-${current.length}`,
      name: `Pompe ${nextNumber}`,
      active: true,
    }]);
  };

  const updatePump = (id: string, patch: Partial<PumpConfig>) => {
    setPumps((current) => current.map((pump) => pump.id === id ? { ...pump, ...patch } : pump));
  };

  const removePump = (id: string) => {
    setPumps((current) => current.filter((pump) => pump.id !== id));
  };

  const text = (fr: string, ar: string) => lang === "ar" ? ar : fr;

  return (
    <div className="max-w-4xl space-y-5">
      <section className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5">
        <div className="flex items-center gap-3 text-emerald-950">
          <div className="grid size-10 place-items-center rounded-xl bg-emerald-600 text-white"><Fuel className="size-5" /></div>
          <div>
            <h2 className="text-xl font-bold">{text("Pompes de remplissage", "مضخّات التعبئة")}</h2>
            <p className="text-sm text-emerald-800">{text("Configuration du nombre et des noms des pompes", "إعداد عدد المضخّات وأسمائها")}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-white p-4">
          <div className="flex items-center gap-3">
            <Power className="size-5 text-emerald-700" />
            <div>
              <Label htmlFor="pump-system-enabled" className="font-semibold">{text("Système de pompes", "نظام المضخّات")}</Label>
              <p className="text-xs text-muted-foreground">{text("Activation de la future interface de remplissage", "تفعيل واجهة التعبئة المستقبلية")}</p>
            </div>
          </div>
          <button
            id="pump-system-enabled"
            type="button"
            role="switch"
            aria-checked={enabled}
            disabled={!enabled && pumps.length === 0}
            onClick={() => setEnabled((value) => !value)}
            className={`relative h-7 w-12 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${effectiveEnabled ? "bg-emerald-600" : "bg-stone-300"}`}
          >
            <span className={`absolute top-1 size-5 rounded-full bg-white shadow transition-all ${effectiveEnabled ? "left-6" : "left-1"}`} />
          </button>
          <span className={`text-sm font-bold ${effectiveEnabled ? "text-emerald-700" : "text-stone-500"}`}>
            {effectiveEnabled ? "ACTIVE" : "DÉSACTIVÉ"}
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold">{text("Pompes configurées", "المضخّات المعرّفة")}: {pumps.length}</p>
            <p className="text-xs text-muted-foreground">{text("Le nombre est libre : ajoutez ou supprimez des pompes selon vos besoins.", "العدد غير ثابت؛ أضف أو احذف المضخّات حسب حاجتك.")}</p>
          </div>
          <Button type="button" variant="outline" onClick={addPump} className="rounded-xl border-emerald-300 bg-white text-emerald-800 hover:bg-emerald-100">
            <Plus className="size-4" /> {text("Ajouter une pompe", "إضافة مضخّة")}
          </Button>
        </div>

        {pumps.length === 0 ? (
          <div className="rounded-xl border border-dashed border-emerald-300 bg-white p-6 text-center text-sm text-muted-foreground">
            {text("Aucune pompe configurée. Ajoutez votre première pompe.", "لا توجد مضخّات مضافة. أضف المضخّة الأولى.")}
          </div>
        ) : (
          <div className="space-y-3">
            {pumps.map((pump) => (
              <div key={pump.id} className="grid grid-cols-1 items-center gap-3 rounded-xl border border-emerald-200 bg-white p-3 sm:grid-cols-[1fr_auto_auto]">
                <div className="flex items-center gap-3">
                  <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-700"><Fuel className="size-5" /></div>
                  <div className="min-w-0 flex-1">
                    <Label htmlFor={`pump-name-${pump.id}`}>{text("Nom de la pompe", "اسم المضخّة")}</Label>
                    <Input id={`pump-name-${pump.id}`} value={pump.name} maxLength={60} onChange={(event) => updatePump(pump.id, { name: event.target.value })} className="mt-1 h-10 bg-white" />
                  </div>
                </div>
                <button type="button" onClick={() => updatePump(pump.id, { active: !pump.active })} className={`rounded-full px-3 py-2 text-xs font-bold ${pump.active ? "bg-emerald-100 text-emerald-800" : "bg-stone-100 text-stone-600"}`}>
                  {pump.active ? text("ACTIVE", "نشطة") : text("DÉSACTIVÉE", "معطّلة")}
                </button>
                <Button type="button" variant="ghost" size="icon" aria-label={text("Supprimer la pompe", "حذف المضخّة")} onClick={() => removePump(pump.id)} className="text-red-600 hover:bg-red-50 hover:text-red-700">
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {text(
            "Important : cette étape enregistre uniquement la configuration logicielle. Elle ne commande pas encore les pompes physiques et ne mesure pas le volume distribué. Le raccordement au contrôleur et aux débitmètres sera une phase séparée.",
            "مهم: هذه المرحلة تحفظ إعدادات البرنامج فقط. لا تشغّل المضخّات الحقيقية ولا تقيس كمية الزيت المعبأة. ربط وحدة التحكّم وعدادات التدفق سيكون مرحلة مستقلة لاحقًا."
          )}
        </div>

        <Button
          type="button"
          disabled={!settings.data || !dirty || save.isPending || pumps.some((pump) => !pump.name.trim()) || duplicateNames}
          onClick={() => save.mutate()}
          className="h-11 rounded-xl bg-emerald-700 px-8 hover:bg-emerald-800"
        >
          {save.isPending ? text("Enregistrement…", "جارٍ الحفظ…") : text("Enregistrer les paramètres", "حفظ الإعدادات")}
        </Button>
      </section>
    </div>
  );
}
