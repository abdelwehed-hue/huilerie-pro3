import { Monitor, Moon, Sun } from "lucide-react";
import { PageHeader } from "@/components/shared";
import { useTheme, type ThemeMode } from "@/lib/theme";
import { cn } from "@/lib/utils";

const choices: { value: ThemeMode; title: string; description: string; icon: typeof Sun }[] = [
  { value: "light", title: "Mode clair", description: "Conserver l’apparence claire de l’application.", icon: Sun },
  { value: "dark", title: "Mode sombre", description: "Utiliser un fond sombre pour réduire la luminosité.", icon: Moon },
  { value: "system", title: "Automatique", description: "Suivre automatiquement le thème défini sur cet appareil.", icon: Monitor },
];

export default function Appearance() {
  const { mode, setMode } = useTheme();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Apparence" sub="Personnalisez l’affichage de votre application." accent="bg-indigo-500" />
      <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-6" aria-label="Choix du thème">
        <h2 className="mb-1 text-lg font-bold text-stone-900">Thème de l’application</h2>
        <p className="mb-5 text-sm text-stone-500">Ce choix est enregistré séparément pour votre compte sur cet appareil.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {choices.map(({ value, title, description, icon: Icon }) => (
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
              <span className="font-semibold">{title}</span>
              <span className="text-xs leading-relaxed opacity-80">{description}</span>
              {mode === value && <span className="text-xs font-bold text-indigo-700">Sélectionné</span>}
            </button>
          ))}
        </div>
        <p className="mt-5 text-xs text-stone-500">Les factures et les documents PDF imprimés conservent leur présentation claire.</p>
      </section>
    </div>
  );
}
