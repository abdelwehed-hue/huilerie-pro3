import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Droplet, EyeOff, Wifi, WifiOff } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { TvBoard } from "@/lib/types";

const pad = (n: number) => String(n).padStart(2, "0");
const hhmm = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const ddmmyyyy = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};

/** Live board over WebSocket; polls /api/tv/board every 3 s whenever the socket is down. */
function useLiveBoard() {
  const [wsBoard, setWsBoard] = useState<TvBoard | null>(null);
  const [wsOk, setWsOk] = useState(false);
  useEffect(() => {
    let ws: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const connect = () => {
      try {
        ws = new WebSocket(`${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/api/tv/ws`);
      } catch {
        retry = setTimeout(connect, 30000);
        return;
      }
      let opened = false;
      ws.onopen = () => { opened = true; setWsOk(true); };
      ws.onmessage = (e) => {
        try { setWsBoard(JSON.parse(e.data) as TvBoard); } catch { /* ignore malformed frame */ }
      };
      ws.onclose = () => {
        setWsOk(false);
        // Server recycles healthy sockets every ~60 s: reconnect at once; otherwise poll and retry later.
        if (!stopped) retry = setTimeout(connect, opened ? 1000 : 15000);
      };
      ws.onerror = () => ws?.close();
    };
    connect();
    return () => {
      stopped = true;
      clearTimeout(retry);
      ws?.close();
    };
  }, []);
  const poll = useQuery({
    queryKey: ["tv-board"],
    queryFn: () => apiGet<TvBoard>("/tv/board"),
    refetchInterval: wsOk ? false : 3000,
    refetchIntervalInBackground: true,
  });
  const board = wsOk && wsBoard ? wsBoard : poll.isError ? wsBoard : (poll.data ?? wsBoard);
  return { board, live: wsOk };
}

export default function TvScreen() {
  const { board, live } = useLiveBoard();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const i = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(i);
  }, []);

  // Flash tiles that just appeared.
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const ids = (board?.items ?? []).map((i) => i.id).join(",");
  useEffect(() => {
    const cur = new Set(ids ? ids.split(",") : []);
    if (seen.current) {
      const added = [...cur].filter((x) => !seen.current!.has(x));
      if (added.length) {
        setFresh(new Set(added));
        const tm = setTimeout(() => setFresh(new Set()), 6000);
        seen.current = cur;
        return () => clearTimeout(tm);
      }
    }
    seen.current = cur;
  }, [ids]);

  const items = board?.items ?? [];
  return (
    <div className="tv-screen min-h-screen overflow-hidden bg-[#0F1A10] text-white" data-testid="tv-screen">
      <div className="pointer-events-none fixed -start-40 -top-40 size-[36rem] rounded-full bg-lime-500/10 blur-3xl" />
      <div className="pointer-events-none fixed -bottom-40 -end-40 size-[36rem] rounded-full bg-amber-500/10 blur-3xl" />
      <header className="relative flex items-center justify-between gap-6 border-b border-white/10 px-[4vw] py-[2.5vh]">
        <div className="flex items-center gap-5">
          <div className="grid size-[7vh] min-h-14 min-w-14 place-items-center rounded-2xl bg-amber-400 text-[#1B2A1C]"><Droplet className="size-[60%]" /></div>
          <div>
            <div className="font-heading text-[clamp(1.5rem,3vw,3rem)] font-bold leading-tight">Huile prête</div>
            <div dir="rtl" className="text-[clamp(1.2rem,2.2vw,2.2rem)] font-bold leading-tight text-amber-300">الزيت جاهز</div>
          </div>
        </div>
        <div className="text-end">
          <div className="font-mono text-[clamp(2rem,5vw,5rem)] font-bold leading-none tracking-wider" data-testid="tv-clock">
            {pad(now.getHours())}:{pad(now.getMinutes())}<span className="text-white/40">:{pad(now.getSeconds())}</span>
          </div>
          <div className="mt-1 flex items-center justify-end gap-2 text-[clamp(0.9rem,1.3vw,1.4rem)] text-white/60">
            <span data-testid="tv-date">{ddmmyyyy(now.toISOString())}</span>
            {live ? <Wifi className="size-5 text-lime-400" data-testid="tv-live-ws" /> : <WifiOff className="size-5 text-white/40" data-testid="tv-live-poll" />}
          </div>
        </div>
      </header>

      <main className="relative px-[4vw] py-[4vh]">
        {items.length === 0 ? (
          <div className="grid h-[65vh] place-items-center text-center" data-testid="tv-empty">
            <div>
              <div className="text-[clamp(1.5rem,3vw,3rem)] font-semibold text-white/50">Aucun reçu terminé pour le moment</div>
              <div dir="rtl" className="mt-3 text-[clamp(1.3rem,2.5vw,2.6rem)] text-white/40">لا توجد وصولات منتهية حالياً</div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-[2.5vw] sm:grid-cols-2 xl:grid-cols-3" data-testid="tv-grid">
            {items.slice(0, 12).map((i) => (
              <div
                key={i.id}
                data-testid={`tv-item-${i.id}`}
                className={
                  "rounded-3xl border p-[2vw] backdrop-blur " +
                  (fresh.has(i.id) ? "tv-pop border-amber-300 bg-amber-400/20 shadow-[0_0_60px_rgba(251,191,36,0.35)]" : "border-white/10 bg-white/[0.06]")
                }
              >
                {i.code ? (
                  <div className="font-mono text-[clamp(2rem,3.3vw,5rem)] font-bold leading-none tracking-wider text-amber-300" dir="ltr" data-testid="tv-item-code">{i.code}</div>
                ) : (
                  <div className="flex items-center gap-4 font-mono text-[clamp(2rem,3.3vw,5rem)] font-bold leading-none text-white/30" data-testid="tv-item-code-hidden">
                    <EyeOff className="size-[0.7em]" /> ••••••
                  </div>
                )}
                <div className="mt-[1.5vh] flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-[clamp(1rem,1.6vw,1.8rem)] text-white/70">
                  <span className="whitespace-nowrap">Terminé · <span dir="rtl">منتهية</span></span>
                  <span dir="ltr" className="whitespace-nowrap" data-testid="tv-item-time"><span className="font-mono text-[1.3em] font-bold text-white">{hhmm(i.finished_at)}</span> · {ddmmyyyy(i.finished_at)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
