import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Droplet, EyeOff, Wifi, WifiOff } from "lucide-react";
import { API_ORIGIN, apiGet } from "@/lib/api";
import type { TvBoard, TvDisplaySettings } from "@/lib/types";

type YouTubePlayer = { mute(): void; unMute(): void; playVideo(): void; destroy(): void };
type YouTubeApi = {
  Player: new (element: HTMLElement, options: {
    videoId: string;
    width: string;
    height: string;
    playerVars: Record<string, string | number>;
    events: {
      onReady: (event: { target: YouTubePlayer }) => void;
      onError: (event: { data: number }) => void;
    };
  }) => YouTubePlayer;
};
declare global {
  interface Window { YT?: YouTubeApi; onYouTubeIframeAPIReady?: () => void }
}

const youtubeId = (value: string) => {
  try {
    const u = new URL(value);
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1).split("/")[0];
    if (u.hostname.includes("youtube.com")) return u.searchParams.get("v") || u.pathname.split("/").filter(Boolean).pop() || "";
  } catch { /* invalid URL */ }
  return "";
};

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
  const settingsQuery = useQuery({ queryKey: ["tv-mill-settings"], queryFn: () => apiGet<TvDisplaySettings>("/tv/display-settings") });
  const mill = settingsQuery.data;
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const i = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(i);
  }, []);

  // Flash tiles that just appeared.
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const audioContext = useRef<AudioContext | null>(null);
  const youtubeHost = useRef<HTMLDivElement | null>(null);
  const directVideo = useRef<HTMLVideoElement | null>(null);
  const musicAudio = useRef<HTMLAudioElement | null>(null);
  const [musicNeedsGesture, setMusicNeedsGesture] = useState(false);
  const youtubePlayer = useRef<YouTubePlayer | null>(null);
  const soundGestureUnlocked = useRef(false);
  const [youtubeReady, setYoutubeReady] = useState(false);
  const [youtubeError, setYoutubeError] = useState("");
  const [soundEnabled, setSoundEnabled] = useState(false);
  const knownArrivals = useRef<Set<string> | null>(null);
  const [arrivalNotice, setArrivalNotice] = useState<{ id: string; code: string } | null>(null);
  const [arrivalQueue, setArrivalQueue] = useState<{ id: string; code: string }[]>([]);
  const enableSound = () => {
    // A click on the TV itself unlocks audible playback in the TV browser.
    soundGestureUnlocked.current = true;
    try {
      const context = audioContext.current ?? new window.AudioContext();
      audioContext.current = context;
      void context.resume();
    } catch { /* YouTube audio does not depend on Web Audio. */ }
    const player = youtubePlayer.current;
    if (player) {
      player.unMute();
      player.playVideo();
      setSoundEnabled(true);
      setYoutubeError("");
      return;
    }
    if (directVideo.current) {
      directVideo.current.muted = false;
      void directVideo.current.play();
      setSoundEnabled(true);
      setYoutubeError("");
      return;
    }
    setYoutubeError("Le lecteur vidéo n’est pas encore prêt. Réessayez dans quelques secondes.");
  };
  const playNewItemSound = () => {
    const context = audioContext.current;
    if (!context || context.state !== "running") return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.16, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.22);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.23);
  };

  const musicEnabled = Boolean(mill?.tv_music_enabled && mill?.tv_music_url);
  useEffect(() => {
    const audio = musicAudio.current;
    if (!audio) return;
    if (!musicEnabled) { audio.pause(); setMusicNeedsGesture(false); return; }
    audio.loop = true;
    audio.volume = Math.max(0, Math.min(100, mill?.tv_music_volume ?? 40)) / 100;
    void audio.play().then(() => setMusicNeedsGesture(false)).catch(() => setMusicNeedsGesture(true));
  }, [musicEnabled, mill?.tv_music_url, mill?.tv_music_volume]);
  const enableBackgroundMusic = () => {
    const audio = musicAudio.current;
    if (!audio || !musicEnabled) return;
    audio.volume = Math.max(0, Math.min(100, mill?.tv_music_volume ?? 40)) / 100;
    audio.loop = true;
    void audio.play().then(() => setMusicNeedsGesture(false)).catch(() => setMusicNeedsGesture(true));
  };

  const ids = (board?.items ?? []).map((i) => i.id).join(",");
  useEffect(() => {
    const cur = new Set(ids ? ids.split(",") : []);
    if (seen.current) {
      const added = [...cur].filter((x) => !seen.current!.has(x));
      if (added.length) {
        if (soundEnabled) playNewItemSound();
        setFresh(new Set(added));
        const tm = setTimeout(() => setFresh(new Set()), 6000);
        seen.current = cur;
        return () => clearTimeout(tm);
      }
    }
    seen.current = cur;
  }, [ids, soundEnabled]);

  const items = board?.items ?? [];
  const arrivals = board?.arrivals ?? [];
  const videoUrl = mill?.tv_youtube_url?.trim() ?? "";
  const videoSource = mill?.tv_video_source ?? "youtube";
  const displayMode = mill?.tv_display_mode ?? "background";
  const videoId = videoSource === "youtube" ? youtubeId(videoUrl) : "";
  const directVideoUrl = videoSource === "direct" ? videoUrl : "";
  useEffect(() => {
    if (!videoId || !youtubeHost.current) {
      setYoutubeReady(false);
      youtubePlayer.current = null;
      return;
    }
    let cancelled = false;
    let player: YouTubePlayer | null = null;
    const mountPlayer = () => {
      if (cancelled || !window.YT?.Player || !youtubeHost.current || player) return;
      setYoutubeError("");
      player = new window.YT.Player(youtubeHost.current, {
        videoId,
        width: "100%",
        height: "100%",
        playerVars: {
          autoplay: 1, controls: 0, loop: 1, playlist: videoId,
          playsinline: 1, rel: 0, enablejsapi: 1, origin: window.location.origin,
        },
        events: {
          onReady: ({ target }) => {
            if (cancelled) return;
            youtubePlayer.current = target;
            setYoutubeReady(true);
            target.mute();
            target.playVideo();
            if (soundGestureUnlocked.current) {
              target.unMute();
              setSoundEnabled(true);
            }
          },
          onError: ({ data }) => setYoutubeError("Erreur du lecteur YouTube (" + data + "). Vérifiez le lien vidéo."),
        },
      });
    };

    if (window.YT?.Player) {
      mountPlayer();
    } else {
      const previousReady = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previousReady?.();
        mountPlayer();
      };
      let script = document.querySelector<HTMLScriptElement>('script[src="https://www.youtube.com/iframe_api"]');
      if (!script) {
        script = document.createElement("script");
        script.src = "https://www.youtube.com/iframe_api";
        script.async = true;
        document.head.appendChild(script);
      } else {
        script.addEventListener("load", mountPlayer, { once: true });
      }
    }

    return () => {
      cancelled = true;
      if (player) player.destroy();
      if (youtubePlayer.current === player) youtubePlayer.current = null;
      setYoutubeReady(false);
    };
  }, [videoId]);

  // Apply worker/admin remote commands only after the TV browser has received
  // its one-time local gesture. A remote click cannot bypass autoplay policy.
  useEffect(() => {
    const player = youtubePlayer.current;
    if (player && youtubeReady) {
      if (board?.sound_enabled && soundGestureUnlocked.current) {
        player.unMute();
        player.playVideo();
        setSoundEnabled(true);
      } else if (!board?.sound_enabled) {
        player.mute();
        setSoundEnabled(false);
      }
      return;
    }
    if (directVideo.current) {
      const audible = Boolean(board?.sound_enabled && soundGestureUnlocked.current);
      directVideo.current.muted = !audible;
      if (audible) void directVideo.current.play();
      setSoundEnabled(audible);
    }
  }, [board?.sound_enabled, youtubeReady]);
  useEffect(() => {
    const current = new Set(arrivals.map((a) => a.id));
    if (knownArrivals.current) {
      const added = arrivals
        .filter((a) => !knownArrivals.current!.has(a.id))
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      if (added.length) setArrivalQueue((queue) => [...queue, ...added.map((a) => ({ id: a.id, code: a.code }))]);
    }
    knownArrivals.current = current;
  }, [arrivals.map((a) => a.id).join(",")]);
  useEffect(() => {
    if (!arrivalNotice && arrivalQueue.length > 0) {
      setArrivalNotice(arrivalQueue[0]);
      setArrivalQueue((queue) => queue.slice(1));
    }
  }, [arrivalQueue, arrivalNotice]);
  useEffect(() => {
    if (!arrivalNotice) return;
    const activeId = arrivalNotice.id;
    const timer = window.setTimeout(() => setArrivalNotice((old) => old?.id === activeId ? null : old), Math.max(3, Math.min(30, mill?.tv_receipt_duration ?? 8)) * 1000);
    return () => window.clearTimeout(timer);
  }, [arrivalNotice, mill?.tv_receipt_duration]);
  return (
    <div className="tv-screen relative min-h-screen overflow-hidden bg-[radial-gradient(ellipse_at_top_left,rgba(132,153,42,0.18),transparent_44%),radial-gradient(ellipse_at_bottom_right,rgba(61,91,40,0.24),transparent_46%),linear-gradient(135deg,#0B1710_0%,#142A1B_52%,#20351F_100%)] bg-cover bg-center text-white" style={mill?.tv_image ? { backgroundImage: `linear-gradient(rgba(8,18,12,0.52), rgba(8,18,12,0.62)), url("${mill.tv_image}")`, backgroundSize: "cover", backgroundPosition: "center" } : undefined} data-testid="tv-screen">
      {mill?.tv_music_url ? <audio ref={musicAudio} src={`${API_ORIGIN}${mill.tv_music_url}`} preload="auto" loop /> : null}
      {musicEnabled && musicNeedsGesture ? <button type="button" onClick={enableBackgroundMusic} className="fixed right-5 top-5 z-30 rounded-lg border border-emerald-300/50 bg-emerald-900/90 px-4 py-2 text-sm font-semibold text-white shadow-lg" data-testid="tv-music-unlock">🎵 Activer la musique</button> : null}
      {mill?.tv_video_enabled !== false && (videoId || directVideoUrl) ? (
        <div
          title="Vidéo de la page TV"
          className={
            "pointer-events-none fixed z-0 overflow-hidden " +
            (displayMode === "split"
              ? "inset-y-0 left-0 h-screen w-1/2"
              : displayMode === "fullscreen"
                ? "inset-0 h-screen w-screen"
                : "left-1/2 top-1/2 h-[56.25vw] min-h-screen w-screen min-w-[177.78vh] -translate-x-1/2 -translate-y-1/2")
          }
          data-testid="tv-video-player"
        >
          {videoId ? <div ref={youtubeHost} className="h-full w-full" data-testid="tv-youtube-player" /> : (
            <video ref={directVideo} src={directVideoUrl} autoPlay muted loop playsInline className="h-full w-full object-cover" data-testid="tv-direct-video" />
          )}
        </div>
      ) : null}
      <div className={"pointer-events-none fixed z-0 bg-black/45 " + (displayMode === "split" ? "inset-y-0 left-0 w-1/2" : "inset-0")} />
      {arrivalNotice ? (
        <div key={arrivalNotice.id} className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-black/35 px-4" data-testid="tv-new-arrival-notice">
          <div className="rounded-[2rem] border-4 border-amber-300 bg-[#142A1B]/95 px-12 py-10 text-center shadow-2xl">
            <div className="mb-4 text-[clamp(1.5rem,3vw,3rem)] font-bold text-white">Nouveau reçu · وصل جديد</div>
            <div dir="ltr" className="font-mono text-[clamp(4rem,12vw,11rem)] font-black leading-none tracking-widest text-amber-300">{arrivalNotice.code}</div>
          </div>
        </div>
      ) : null}
      {displayMode === "fullscreen" && (videoId || directVideoUrl) ? (
        <button type="button" onClick={enableSound} disabled={!youtubeReady && !directVideoUrl} className="fixed right-5 top-5 z-20 rounded-lg border border-white/30 bg-black/50 px-4 py-2 text-sm font-semibold text-white" data-testid="tv-sound-toggle-fullscreen">
          {soundEnabled ? "🔊 Son activé" : "🔈 Activer le son"}
        </button>
      ) : null}
      <div className="pointer-events-none fixed -start-40 -top-40 size-[36rem] rounded-full bg-lime-500/15 blur-3xl" />
      <div className="pointer-events-none fixed -bottom-40 -end-40 size-[36rem] rounded-full bg-lime-700/15 blur-3xl" />
      {displayMode !== "fullscreen" ? <header style={displayMode === "split" ? { marginLeft: "50%", width: "50%" } : undefined} className="relative z-10 grid grid-cols-1 items-center gap-4 border-b border-white/10 px-[2vw] py-[2vh] md:grid-cols-[1fr_auto_1fr]">
        <div className="flex min-w-0 flex-col items-center gap-1 text-center md:justify-self-start" data-testid="tv-mill-info">
          <div className="font-heading text-[clamp(1.1rem,2vw,2rem)] font-bold leading-tight text-amber-300">{mill?.mill_name || ""}</div>
          {mill?.mill_address ? <div className="mt-1 text-[clamp(0.8rem,1.1vw,1.15rem)] leading-snug text-white/75">{mill.mill_address}</div> : null}
          {mill?.mill_phone ? <div className="text-[clamp(0.8rem,1.1vw,1.15rem)] leading-snug text-white/75">{mill.mill_phone}</div> : null}
        </div>
        <div className="flex items-center justify-center gap-3 text-center md:justify-self-center">
          <div className="grid size-[5vh] min-h-10 min-w-10 place-items-center rounded-xl bg-amber-400 text-[#1B2A1C]"><Droplet className="size-[55%]" /></div>
          <div>
            <div className="font-heading text-[clamp(1.35rem,2.4vw,2.5rem)] font-bold leading-tight">Huile prête</div>
            <div dir="rtl" className="text-[clamp(1.05rem,1.8vw,1.8rem)] font-bold leading-tight text-amber-300">الزيت جاهز</div>
          </div>
        </div>
        <div className="text-left md:justify-self-end md:text-right">
          <div className="font-mono text-[clamp(1.4rem,2.8vw,2.8rem)] font-bold leading-none tracking-wider" data-testid="tv-clock">
            {pad(now.getHours())}:{pad(now.getMinutes())}<span className="text-white/40">:{pad(now.getSeconds())}</span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-[clamp(0.75rem,1vw,1rem)] text-white/60 md:justify-end">
            <span className="text-[clamp(0.9rem,1.2vw,1.15rem)]" data-testid="tv-date">{ddmmyyyy(now.toISOString())}</span>
            {live ? <Wifi className="size-4 text-lime-400" data-testid="tv-live-ws" /> : <WifiOff className="size-4 text-white/40" data-testid="tv-live-poll" />}
          </div>
        </div>
      </header> : null}

      {displayMode !== "fullscreen" ? <main style={displayMode === "split" ? { marginLeft: "50%", width: "50%" } : undefined} className="relative z-10 px-[2vw] py-[3vh]">
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={enableSound}
            disabled={!youtubeReady && !directVideoUrl}
            className="rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20 disabled:cursor-wait disabled:opacity-60"
            data-testid="tv-sound-toggle"
          >
            {soundEnabled ? "🔊 Son activé" : youtubeReady || directVideoUrl ? "🔈 Activer le son" : "Aucune vidéo configurée"}
          </button>
        </div>
        {youtubeError ? <div role="status" className="mb-3 text-center text-sm text-amber-200">{youtubeError}</div> : null}
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
      </main> : null}
    </div>
  );
}
