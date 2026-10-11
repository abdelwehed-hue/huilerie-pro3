import { useState } from "react";
import { Navigate, NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  FlaskConical,
  Layers,
  LayoutDashboard,
  LogOut,
  Menu,
  PlusCircle,
  Search,
  Settings,
  Droplets,
  Languages,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useI18n } from "@/lib/i18n";
import { useMe } from "@/lib/useMe";
import { endSession } from "@/lib/session";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", key: "dashboard", icon: LayoutDashboard, id: "nav-dashboard", color: "text-lime-300" },
  { to: "/intake", key: "intake", icon: PlusCircle, id: "nav-intake", color: "text-emerald-300" },
  { to: "/search", key: "search", icon: Search, id: "nav-search", color: "text-sky-300" },
  { to: "/loads", key: "loads", icon: Layers, id: "nav-loads", color: "text-amber-300" },
  { to: "/lab", key: "lab", icon: FlaskConical, id: "nav-lab", color: "text-cyan-300" },
  { to: "/settings", key: "settings", icon: Settings, id: "nav-settings", color: "text-violet-300", admin: true },
] as const;

export function LangToggle({ className }: { className?: string }) {
  const { lang, setLang } = useI18n();
  return (
    <div
      data-testid="lang-toggle-button"
      className={cn("inline-flex items-center gap-1 rounded-full border border-stone-200 bg-white/80 p-1 shadow-sm backdrop-blur", className)}
    >
      <Languages className="mx-1 size-4 text-stone-500" />
      {(["fr", "ar"] as const).map((l) => (
        <button
          key={l}
          type="button"
          data-testid={`lang-option-${l}`}
          onClick={() => setLang(l)}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-semibold transition-colors duration-200",
            lang === l ? "bg-lime-700 text-white" : "text-stone-600 hover:bg-stone-100",
          )}
        >
          {l === "fr" ? "FR" : "عربي"}
        </button>
      ))}
    </div>
  );
}

function SideNav({ isAdmin, onNavigate }: { isAdmin: boolean; onNavigate?: () => void }) {
  const { t } = useI18n();
  return (
    <nav className="flex flex-col gap-1">
      {NAV.filter((n) => !("admin" in n) || isAdmin).map((n) => (
        <NavLink
          key={n.to}
          to={n.to}
          end={n.to === "/"}
          data-testid={n.id}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-200",
              isActive ? "bg-[#2D3E2D] text-white" : "text-[#A1B0A1] hover:bg-white/5 hover:text-white",
            )
          }
        >
          {({ isActive }) => (
            <>
              {isActive && <span className="absolute inset-y-2 start-0 w-1 rounded-full bg-lime-400" />}
              <n.icon className={cn("size-5", n.color)} />
              {t(n.key)}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

function Brand() {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-3">
      <div className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-lime-400 to-amber-400 shadow-lg shadow-lime-900/40">
        <Droplets className="size-5 text-[#1E291E]" />
      </div>
      <div>
        <div className="font-heading text-lg font-bold leading-tight text-white">{t("app_name")}</div>
        <div className="text-xs text-[#A1B0A1]">{t("app_tagline")}</div>
      </div>
    </div>
  );
}

export default function AppShell() {
  const me = useMe();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [open, setOpen] = useState(false);
  const { lang } = useI18n();

  if (me.isError) return <Navigate to="/login" replace />;
  const user = me.data;
  const isAdmin = user?.role === "admin";

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.trim()) navigate(`/search?code=${encodeURIComponent(code.trim())}`);
  };

  return (
    <div className="min-h-screen bg-[#F9F8F3]">
      <aside className="fixed inset-y-0 start-0 z-30 hidden w-64 flex-col justify-between bg-[#1E291E] p-5 lg:flex">
        <div className="space-y-8">
          <Brand />
          <SideNav isAdmin={isAdmin} />
        </div>
        <div className="rounded-xl bg-white/5 p-3 text-xs text-[#A1B0A1]">
          <div className="font-semibold text-white" data-testid="sidebar-user-name">{user?.full_name ?? "…"}</div>
          <div>@{user?.username}</div>
        </div>
      </aside>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side={lang === "ar" ? "right" : "left"} className="w-72 border-0 bg-[#1E291E] p-5">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <div className="space-y-8">
            <Brand />
            <SideNav isAdmin={isAdmin} onNavigate={() => setOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>

      <div className="lg:ps-64">
        <header className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-stone-200/70 bg-[#F9F8F3]/80 px-4 py-3 backdrop-blur-md md:px-8">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)} data-testid="mobile-menu-button">
            <Menu />
          </Button>
          <form onSubmit={submitSearch} className="flex min-w-0 flex-1 items-center gap-2 md:max-w-md">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
              <Input
                data-testid="quick-code-search-input"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={t("quick_search")}
                className="h-10 rounded-xl bg-white ps-9 font-mono"
              />
            </div>
            <Button type="submit" data-testid="quick-code-search-btn" className="h-10 rounded-xl bg-lime-700 hover:bg-lime-800">
              {t("go")}
            </Button>
          </form>
          <div className="ms-auto flex items-center gap-3">
            <LangToggle />
            {user && (
              <span
                data-testid="user-role-badge"
                className={cn(
                  "hidden rounded-full px-3 py-1 text-xs font-semibold sm:inline-block",
                  isAdmin ? "bg-violet-100 text-violet-800" : "bg-emerald-100 text-emerald-800",
                )}
              >
                {user.full_name} · {isAdmin ? t("admin") : t("worker")}
              </span>
            )}
            <Button variant="outline" size="sm" onClick={() => endSession()} data-testid="logout-button" className="rounded-xl">
              <LogOut className="size-4 rtl:rotate-180" />
              <span className="hidden sm:inline">{t("logout")}</span>
            </Button>
          </div>
        </header>
        <main className="px-4 py-6 md:px-8 md:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
