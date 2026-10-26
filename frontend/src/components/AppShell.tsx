import { Navigate, NavLink, Outlet } from "react-router-dom";
import {
  FlaskConical,
  Layers,
  LayoutDashboard,
  LogOut,
  PlusCircle,
  Search,
  Settings,
  Droplets,
  Languages,
  BookUser,
  BarChart3,
  MessageSquareText,
  Ban,
  Tv,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { apiGet } from "@/lib/api";
import type { MillInfo } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { useMe } from "@/lib/useMe";
import SeasonSwitcher from "@/components/SeasonSwitcher";
import { endSession } from "@/lib/session";
import { cn } from "@/lib/utils";

// Menu-only labels (page titles keep their own wording).
const MENU_LABEL: Partial<Record<string, "menu_dashboard" | "menu_search" | "menu_sms">> = {
  dashboard: "menu_dashboard",
  search: "menu_search",
  sms: "menu_sms",
};

const NAV = [
  { to: "/", key: "dashboard", icon: LayoutDashboard, id: "nav-dashboard", color: "text-lime-300" },
  { to: "/intake", key: "intake", icon: PlusCircle, id: "nav-intake", color: "text-emerald-300" },
  { to: "/search", key: "search", icon: Search, id: "nav-search", color: "text-sky-300" },
  { to: "/loads", key: "loads", icon: Layers, id: "nav-loads", color: "text-amber-300" },
  { to: "/lab", key: "lab", icon: FlaskConical, id: "nav-lab", color: "text-cyan-300" },
  { to: "/clients", key: "clients", icon: BookUser, id: "nav-clients", color: "text-teal-300" },
  { to: "/sms", key: "sms", icon: MessageSquareText, id: "nav-sms", color: "text-pink-300" },
  { to: "/tv", key: "tv", icon: Tv, id: "nav-tv-screen", color: "text-orange-300" },
  { to: "/reports", key: "reports", icon: BarChart3, id: "nav-reports", color: "text-fuchsia-300", admin: true },
  { to: "/cancellations", key: "cancellations", icon: Ban, id: "nav-cancellations", color: "text-red-300", admin: true },
  { to: "/tv-admin", key: "tv", icon: Tv, id: "nav-tv", color: "text-orange-300", admin: true },
  { to: "/settings", key: "settings", icon: Settings, id: "nav-settings", color: "text-violet-300", admin: true },
] as const;

export function LangToggle({ className }: { className?: string }) {
  const { lang, setLang } = useI18n();
  const other = lang === "fr" ? "ar" : "fr";
  return (
    <button
      type="button"
      data-testid={`lang-option-${other}`}
      onClick={() => setLang(other)}
      className={cn("inline-flex h-11 items-center gap-2 rounded-2xl border border-stone-200 bg-white px-4 font-semibold text-stone-800 shadow-sm transition-colors duration-200 hover:bg-stone-50", className)}
    >
      <Languages className="size-4 text-stone-600" />
      <span lang={other}>{other === "ar" ? "العربية" : "Français"}</span>
    </button>
  );
}

function BottomNav({ isAdmin }: { isAdmin: boolean }) {
  const { t } = useI18n();
  return (
    <nav
      data-testid="bottom-nav"
      className="no-print fixed inset-x-0 bottom-0 z-40 bg-[#1E2B20] shadow-[0_-10px_30px_rgba(20,35,22,0.25)]"
    >
      <div className="mx-auto flex max-w-7xl items-stretch gap-1 overflow-x-auto px-2 py-2.5 [scrollbar-width:none]">
        {NAV.filter((n) => !("admin" in n) || isAdmin).map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.to === "/"}
            data-testid={n.id}
            className={({ isActive }) =>
              cn(
                "group flex min-w-[5.5rem] flex-1 flex-col items-center gap-1.5 rounded-2xl border-2 px-2 py-2.5 text-xs font-medium transition-[background-color,border-color,color] duration-200",
                isActive ? "border-[#CFE3C4] bg-[#2C4A30] text-white" : "border-transparent text-[#C9D4C6] hover:bg-white/5 hover:text-white",
              )
            }
          >
            <n.icon className="size-6 stroke-[1.6] transition-transform duration-200 group-hover:-translate-y-0.5" />
            <span className="whitespace-nowrap">{t(MENU_LABEL[n.key] ?? n.key)}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

function Brand() {
  const { t } = useI18n();
  const mill = useQuery({ queryKey: ["mill"], queryFn: () => apiGet<MillInfo>("/mill") });
  const m = mill.isError ? undefined : mill.data;
  return (
    <div className="flex items-center gap-3" data-testid="header-brand">
      {m?.mill_logo ? (
        <img src={m.mill_logo} alt="" data-testid="header-brand-logo" className="size-12 rounded-2xl bg-white object-contain shadow-md shadow-green-950/10" />
      ) : (
        <div className="grid size-12 place-items-center rounded-2xl bg-[#1F3A24] shadow-md shadow-green-950/20">
          <Droplets className="size-6 text-amber-400" />
        </div>
      )}
      <div>
        <div className="font-heading text-xl font-bold leading-tight text-stone-900" data-testid="header-brand-name">{m?.mill_name || t("app_name")}</div>
        <div className="hidden text-sm text-stone-500 sm:block">{t("app_tagline")}</div>
      </div>
    </div>
  );
}

export default function AppShell() {
  const me = useMe();
  const { t } = useI18n();

  if (me.isPending) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#F9F8F3]" role="status" aria-label="Vérification de la session">
        <div className="text-center text-stone-600">
          <Droplets className="mx-auto mb-3 size-8 text-lime-700" />
          <p>Vérification de la session…</p>
        </div>
      </div>
    );
  }
  if (me.isError || !me.data) return <Navigate to="/login" replace />;
  const user = me.data;
  const isAdmin = user?.role === "admin";

  return (
    <div className="min-h-screen bg-[#F9F8F3]">
      <div>
        <header className="sticky top-0 z-20 border-b border-stone-200/70 bg-[#F9F8F3]/85 backdrop-blur-md">
          <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 md:px-8">
            <Brand />
            <div className="ms-auto flex items-center gap-4">
              {user && <SeasonSwitcher isAdmin={isAdmin} />}
              <LangToggle />
              {user && (
                <div className="hidden text-end leading-tight sm:block" data-testid="user-role-badge">
                  <div className="font-semibold text-stone-900">{user.full_name}</div>
                  <div className="text-sm text-stone-500">{isAdmin ? t("admin") : t("worker")} · <span dir="ltr">@{user.username}</span></div>
                </div>
              )}
              <Button variant="ghost" size="icon" onClick={() => endSession()} data-testid="logout-button" title={t("logout")} className="rounded-xl text-stone-600 hover:bg-stone-200/60">
                <LogOut className="size-5 rtl:rotate-180" />
              </Button>
            </div>
          </div>
        </header>
        <main className="px-4 pb-32 pt-6 md:px-8 md:pt-8">
          <Outlet />
        </main>
      </div>
      <BottomNav isAdmin={isAdmin} />
    </div>
  );
}
