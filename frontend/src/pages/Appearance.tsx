import { Monitor, Moon, Sun } from "lucide-react";
import { PageHeader } from "@/components/shared";
import { useTheme, type ThemeMode } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

const choices: { value: ThemeMode; title: string; titleAr: string; description: string; descriptionAr: string; icon: typeof Sun }[] = [
  { value: "light", title: "Mode clair", titleAr: "الوضع الفاتح", description: "Conserver l’apparence claire de l’application.", descriptionAr: "استخدام المظهر الفاتح للتطبيق.", icon: Sun },
  { value: "dark", title: "Mode sombre", titleAr: "الوضع الداكن", description: "Utiliser un fond sombre pour réduire la luminosité.", descriptionAr: "استخدام خلفية داكنة لتقليل السطوع.", icon: Moon },
  { value: "system", title: "Automatique", titleAr: "تلقائي", description: "Suivre automatiquement le thème défini sur cet appareil.", descriptionAr: "اتباع المظهر المحدد تلقائياً على هذا الجهاز.", icon: Monitor },
];

export default function Appearance() {
  const { mode, setMode } = useTheme();
  const { lang } = useI18n();
  const ar = lang === "ar";
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={ar ? "المظهر" : "Apparence"} sub={ar ? "خصص طريقة عرض التطبيق." : "Personnalisez l’affichage de votre application."} accent="bg-indigo-500" />
      <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-6" aria-label={ar ? "اختيار المظهر" : "Choix du thème"}>
        <h2 className="mb-1 text-lg font-bold text-stone-900">{ar ? "مظهر التطبيق" : "Thème de l’application"}</h2>
        <p className="mb-5 text-sm text-stone-500">{ar ? "يُحفظ هذا الاختيار بشكل مستقل لحسابك على هذا الجهاز." : "Ce choix est enregistré séparément pour votre compte sur cet appareil."}</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {choices.map(({ value, title, titleAr, description, descriptionAr, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              aria-pressed={mode === value}
              data-testid={`theme-${value}`}
              className={cn(
                "flex min-h-36 flex-col items-start gap-3 rounded-xl border-2 p-4 text-start transition-colors",
                mode === value ? "border-indigo-500 bg-indigo-50 text-indigo-950" : "border-stone-200 bg-white text-stone-700 hover:border-stone-300 hover:bg-stone-50"
              )}
            >
              <span className="grid size-10 place-items-center rounded-xl bg-white shadow-sm"><Icon className="size-5" /></span>
              <span className="font-semibold">{ar ? titleAr : title}</span>
              <span className="text-xs leading-relaxed opacity-80">{ar ? descriptionAr : description}</span>
              {mode === value && <span className="text-xs font-bold text-indigo-700">{ar ? "محدد" : "Sélectionné"}</span>}
            </button>
          ))}
        </div>
        <p className="mt-5 text-xs text-stone-500">{ar ? "تحتفظ الفواتير ومستندات PDF المطبوعة بمظهرها الفاتح." : "Les factures et les documents PDF imprimés conservent leur présentation claire."}</p>
      </section>
    </div>
  );
}
