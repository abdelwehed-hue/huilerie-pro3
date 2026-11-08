import { useEffect, useState } from "react";
import { Navigate, NavLink, Outlet, useLocation } from "react-router-dom";
import {
  FlaskConical,
  Layers,
  LayoutDashboard,
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
  ReceiptText,
  Warehouse,
  Clock3,
  Volume2,
  VolumeX,
  Menu,
  LogOut,
  Sun,
  Moon,
  Monitor,
  Check,
  ArrowLeft,
  CircleHelp,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { API_ORIGIN, apiGet, apiPut } from "@/lib/api";
import type { MillInfo, Stats } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { useMe } from "@/lib/useMe";
import SeasonSwitcher from "@/components/SeasonSwitcher";
import { cn } from "@/lib/utils";
import { ThemeProvider, useTheme } from "@/lib/theme";
import { endSession } from "@/lib/session";

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
  { to: "/reports", key: "reports", icon: BarChart3, id: "nav-reports", color: "text-fuchsia-300", admin: true },
  { to: "/factures", key: "factures", icon: ReceiptText, id: "nav-factures", color: "text-emerald-300" },
  { to: "/sms", key: "sms", icon: MessageSquareText, id: "nav-sms", color: "text-pink-300" },
  { to: "/cancellations", key: "cancellations", icon: Ban, id: "nav-cancellations", color: "text-red-300", admin: true },
  { to: "/tv-admin", key: "tv", icon: Tv, id: "nav-tv-screen", color: "text-orange-300" },
  { to: "/commercial", key: "commercial", icon: Warehouse, id: "nav-commercial", color: "text-lime-300" },
  { to: "/help", key: "help", icon: CircleHelp, id: "nav-help", color: "text-sky-300" },

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
      className={cn("inline-flex h-9 items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 font-semibold text-stone-800 shadow-sm transition-colors duration-200 hover:bg-stone-50", className)}
    >
      <Languages className="size-4 text-stone-600" />
      <span lang={other}>{other === "ar" ? "العربية" : "Français"}</span>
    </button>
  );
}

function BottomNav({ isAdmin, revealEnabled, isCommercialWorkspace }: { isAdmin: boolean; revealEnabled: boolean; isCommercialWorkspace: boolean }) {
  const { t, lang } = useI18n();
  return (
    <div className={cn("no-print group fixed inset-x-0 bottom-0 z-40", revealEnabled ? "h-3" : "")}>
      <nav
        data-testid="bottom-nav"
        className={cn("absolute inset-x-0 bottom-0 border-t border-[#CFE3C4]/30 bg-[#1E2B20]/80 shadow-[0_-8px_24px_rgba(20,35,22,0.20)] backdrop-blur-none transition-opacity duration-700 ease-in-out motion-reduce:transition-none", revealEnabled ? "opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto" : "opacity-100")}
      >
        <div className="mx-auto flex max-w-7xl items-stretch gap-1 overflow-x-auto px-2 py-1.5 [scrollbar-width:none]">
          {NAV.filter((n) => (!("admin" in n) || isAdmin) && !(isCommercialWorkspace && n.key === "help")).map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === "/"}
              data-testid={n.id}
              className={({ isActive }) =>
                cn(
                  "group flex min-w-[5.25rem] flex-1 flex-col items-center gap-1 rounded-xl border-2 px-2 py-1.5 text-xs font-medium transition-[background-color,border-color,color] duration-200",
                  isActive ? "border-[#CFE3C4] bg-[#2C4A30]/95 text-white" : "border-transparent text-[#C9D4C6] hover:bg-white/10 hover:text-white",
                )
              }
            >
              <n.icon className="size-5 stroke-[1.6] transition-transform duration-200 group-hover:-translate-y-0.5" />
              <span className="whitespace-nowrap">{n.key === "help" ? (lang === "ar" ? "مساعدة" : "Aide") : t(MENU_LABEL[n.key] ?? n.key)}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}

function HeaderAppearanceMenu() {
  const { mode, setMode } = useTheme();
  const [open, setOpen] = useState(false);
  const options = [
    { value: "light" as const, label: "Mode clair", Icon: Sun },
    { value: "dark" as const, label: "Mode sombre", Icon: Moon },
    { value: "system" as const, label: "Mode automatique", Icon: Monitor },
  ];
  return (
    <div className="relative shrink-0" data-testid="header-appearance-menu">
      <button
        type="button"
        aria-label="Choisir le thème"
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="header-appearance-trigger"
        onClick={() => setOpen((value) => !value)}
        className="grid size-10 place-items-center rounded-xl border border-stone-200 bg-white text-stone-700 shadow-sm transition-colors hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-800"
      >
        <Menu className="size-5" />
      </button>
      {open && (
        <>
          <button type="button" aria-label="Fermer le menu" className="fixed inset-0 z-30 cursor-default" onClick={() => setOpen(false)} />
          <div role="menu" aria-label="Apparence" className="absolute left-0 top-full z-40 mt-2 w-52 rounded-xl border border-stone-200 bg-white p-1.5 shadow-xl shadow-stone-900/10">
            {options.map(({ value, label, Icon }) => (
              <button
                key={value}
                type="button"
                role="menuitemradio"
                aria-checked={mode === value}
                data-testid={`header-theme-${value}`}
                onClick={() => { setMode(value); setOpen(false); }}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-start text-sm transition-colors",
                  mode === value ? "bg-indigo-50 font-semibold text-indigo-900" : "text-stone-700 hover:bg-stone-50"
                )}
              >
                <Icon className="size-4 shrink-0" />
                <span className="flex-1">{label}</span>
                {mode === value && <Check className="size-4 text-indigo-700" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Brand() {
  const { t } = useI18n();
  const mill = useQuery({ queryKey: ["mill"], queryFn: () => apiGet<MillInfo>("/mill") });
  const m = mill.isError ? undefined : mill.data;

  // Build a square, safe-area app icon so iOS never crops a non-square campaign logo.
  useEffect(() => {
    const logo = m?.mill_logo;
    const iconLinks = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]'));
    const appleLink = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
    if (!logo) {
      for (const link of iconLinks) if (link.dataset.defaultHref) link.href = link.dataset.defaultHref;
      if (appleLink?.dataset.defaultHref) appleLink.href = appleLink.dataset.defaultHref;
      return;
    }

    const image = new Image();
    image.onload = () => {
      const size = 512;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext("2d");
      if (!context) return;

      // A solid dark olive background plus 14% safe padding keeps the whole logo
      // visible inside iOS's rounded icon mask, even when the uploaded image is rectangular.
      context.fillStyle = "#10180f";
      context.fillRect(0, 0, size, size);
      const safeSize = size * 0.72;
      const scale = Math.min(safeSize / image.naturalWidth, safeSize / image.naturalHeight);
      const width = image.naturalWidth * scale;
      const height = image.naturalHeight * scale;
      context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);

      const appIcon = canvas.toDataURL("image/png");
      for (const link of iconLinks) link.href = appIcon;
      if (appleLink) appleLink.href = appIcon;
    };
    image.src = logo;
  }, [m?.mill_logo]);

  return (
    <div className="flex items-center gap-2" data-testid="header-brand">
      {m?.mill_logo ? (
        <img src={m.mill_logo} alt="" data-testid="header-brand-logo" className="size-10 rounded-xl bg-white object-contain shadow-md shadow-green-950/10" />
      ) : (
        <div className="grid size-10 place-items-center rounded-xl bg-[#1F3A24] shadow-md shadow-green-950/20">
          <Droplets className="size-5 text-amber-400" />
        </div>
      )}
      <div>
        <div className="font-heading text-lg font-bold leading-tight text-stone-900" data-testid="header-brand-name">{m?.mill_name || t("app_name")}</div>
        <div className="hidden text-sm text-stone-500 sm:block">{t("app_tagline")}</div>
      </div>
    </div>
  );
}

export default function AppShell() {
  const location = useLocation();
  const isCommercialWorkspace = location.pathname.startsWith("/commercial");
  const me = useMe();
  const { t } = useI18n();
  const [navRevealEnabled, setNavRevealEnabled] = useState(() => localStorage.getItem("oroverde-nav-reveal") === "true");
  useEffect(() => { const sync = () => setNavRevealEnabled(localStorage.getItem("oroverde-nav-reveal") === "true"); window.addEventListener("oroverde-nav-reveal-change", sync); window.addEventListener("storage", sync); return () => { window.removeEventListener("oroverde-nav-reveal-change", sync); window.removeEventListener("storage", sync); }; }, []);
  const queryClient = useQueryClient();
  const tvControl = useQuery({
    queryKey: ["tv-control"],
    queryFn: () => apiGet<{ sound_enabled: boolean }>("/tv/control"),
    refetchInterval: 5_000,
  });
  const tvSoundMutation = useMutation({
    mutationFn: (sound_enabled: boolean) => apiPut<{ sound_enabled: boolean }>("/tv/control", { sound_enabled }),
    onSuccess: (data) => queryClient.setQueryData(["tv-control"], data),
  });
  const todayLoads = useQuery({
    queryKey: ["stats"],
    queryFn: () => apiGet<Stats>("/stats"),
    refetchInterval: 30_000,
  });
  const pendingLabLots = useQuery({
    queryKey: ["header-lab-pending-lots"],
    queryFn: async () => {
      const [lots, assessments, customerLoads, labAnalyses] = await Promise.all([
        apiGet<Array<Record<string, any>>>("/commercial/v1/lots?limit=500"),
        apiGet<Array<Record<string, any>>>("/commercial/v1/quality-assessments?limit=500"),
        apiGet<Array<Record<string, any>>>("/loads?limit=500"),
        apiGet<Array<Record<string, any>>>("/lab"),
      ]);
      const assessedCodes = new Set(assessments.map((assessment) => String(assessment.batch_code || assessment.sample_reference || "").trim().toUpperCase()).filter(Boolean));
      const pendingGsCount = lots.filter((lot) => lot.product_kind === "OLIVE" && lot.status === "OPEN" && lot.batch_code && !assessedCodes.has(String(lot.batch_code).trim().toUpperCase())).length;
      const analysedLoadIds = new Set(labAnalyses.map((analysis) => String(analysis.load_id)));
      const pendingCustomerCount = customerLoads.filter((load) => !load.lab && load.status !== "cancelled" && !analysedLoadIds.has(String(load.id))).length;
      return pendingGsCount + pendingCustomerCount;
    },
    refetchInterval: 30_000,
    retry: false,
  });

  // Keep every authenticated device in sync, regardless of the page it is viewing.
  useEffect(() => {
    if (!me.data) return;

    let disposed = false;
    let reconnectTimer: number | undefined;
    let heartbeatTimer: number | undefined;
    let retryDelay = 1_000;
    let socket: WebSocket | undefined;

    const connect = () => {
      if (disposed) return;
      const wsOrigin = API_ORIGIN.replace(/^http/, "ws");
      const currentSocket = new WebSocket(`${wsOrigin}/api/realtime`);
      socket = currentSocket;

      currentSocket.onopen = () => {
        retryDelay = 1_000;
        // Re-sync after initial connection and every reconnect.
        void queryClient.invalidateQueries();
        heartbeatTimer = window.setInterval(() => {
          if (currentSocket.readyState === WebSocket.OPEN) currentSocket.send("ping");
        }, 25_000);
      };

      currentSocket.onmessage = (event) => {
        try {
          const message = JSON.parse(String(event.data)) as { type?: string };
          if (message.type === "data_changed") {
            void queryClient.invalidateQueries();
          }
        } catch {
          // Ignore malformed or non-event messages.
        }
      };

      currentSocket.onclose = () => {
        if (heartbeatTimer !== undefined) window.clearInterval(heartbeatTimer);
        heartbeatTimer = undefined;
        if (!disposed) {
          reconnectTimer = window.setTimeout(connect, retryDelay);
          retryDelay = Math.min(retryDelay * 2, 30_000);
        }
      };

      currentSocket.onerror = () => currentSocket.close();
    };

    connect();
    return () => {
      disposed = true;
      if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer);
      if (heartbeatTimer !== undefined) window.clearInterval(heartbeatTimer);
      socket?.close();
    };
  }, [me.data, queryClient]);

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
    <ThemeProvider userId={user.id}>
    <div className="min-h-screen bg-[#F9F8F3]">
      <div>
        <div className={cn("group fixed inset-x-0 top-0 z-50", navRevealEnabled ? "h-3" : "")}>
        <header className={cn("app-topbar-header border-b border-stone-200/70 bg-[#F9F8F3]/95 shadow-sm backdrop-blur-none transition-opacity duration-700 ease-in-out motion-reduce:transition-none", navRevealEnabled ? "opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto" : "opacity-100")}>
          <div className="relative mx-auto flex max-w-7xl items-center gap-3 px-4 py-2 md:px-8">
            <div dir="ltr" className="flex shrink-0 items-center gap-2">
              <HeaderAppearanceMenu />
              <Brand />
            </div>
            <div
              data-testid="header-lab-pending-count"
              title="Lots d’huile en attente d’analyse"
              className="flex shrink-0 items-center gap-1.5 rounded-xl border border-cyan-200 bg-cyan-50 px-2 py-1.5 text-cyan-950 shadow-sm"
              aria-live="polite"
            >
              <FlaskConical className="size-4 text-cyan-700" />
              <span className="hidden text-sm font-semibold sm:inline">En attente d’analyse</span>
              <span className="inline-flex min-w-7 items-center justify-center rounded-full bg-cyan-600 px-2 py-0.5 text-sm font-bold text-white">
                {pendingLabLots.data ?? "—"}
              </span>
            </div>
            <div
              data-testid="header-non-terminated"
              title="كل الحمولات التي لم تنتهِ من العصر"
              className="flex shrink-0 items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-2 py-1.5 text-amber-950 shadow-sm"
              aria-live="polite"
            >
              <Clock3 className="size-4 text-amber-700" />
              <span className="hidden text-sm font-semibold sm:inline">Non terminé</span>
              <span className="inline-flex min-w-7 items-center justify-center rounded-full bg-amber-600 px-2 py-0.5 text-sm font-bold text-white">
                {todayLoads.data?.non_terminated ?? "—"}
              </span>
            </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => { void endSession(); }}
                title="Fermer la session"
                aria-label="Fermer la session"
                data-testid="header-logout"
                className="absolute right-4 top-2 z-10 size-9 shrink-0 rounded-xl border-stone-200 bg-white text-stone-700 shadow-sm hover:border-red-300 hover:bg-red-50 hover:text-red-700 md:right-8"
              >
                <LogOut className="size-4" />
              </Button>
            <div className="ms-auto flex items-center gap-3 pr-12">
              {user && <SeasonSwitcher isAdmin={isAdmin} />}
              {user && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={tvSoundMutation.isPending || tvControl.isPending}
                  onClick={() => tvSoundMutation.mutate(!(tvControl.data?.sound_enabled ?? false))}
                  title={tvControl.data?.sound_enabled ? "Désactiver le son sur l’écran TV" : "Activer le son sur l’écran TV"}
                  aria-label={tvControl.data?.sound_enabled ? "Désactiver le son sur l’écran TV" : "Activer le son sur l’écran TV"}
                  data-testid="tv-remote-sound-toggle"
                  className={cn("h-9 gap-1.5 rounded-xl px-2.5", tvControl.data?.sound_enabled ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-stone-200 bg-white text-stone-600")}
                >
                  {tvControl.data?.sound_enabled ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
                  <span className="hidden text-xs font-semibold sm:inline">{tvControl.data?.sound_enabled ? "Son TV activé" : "Activer le son TV"}</span>
                </Button>
              )}
              <LangToggle />
              {user && (
                <div className="hidden text-end leading-tight sm:block" data-testid="user-role-badge">
                  <div className="font-semibold text-stone-900">{user.full_name}</div>
                  <div className="text-sm text-stone-500">{isAdmin ? t("admin") : t("worker")} · <span dir="ltr">@{user.username}</span></div>
                </div>
              )}

            </div>
          </div>
        </header>
        </div>
        <div aria-hidden="true" className="h-14" />
        <main className="px-4 pb-32 pt-6 md:px-8 md:pt-8">
          <Outlet />
        </main>
      </div>
      {!isCommercialWorkspace && <BottomNav isAdmin={isAdmin} revealEnabled={navRevealEnabled} isCommercialWorkspace={isCommercialWorkspace} />}
    </div>
    </ThemeProvider>
  );
}
