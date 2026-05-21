import { useEffect, useRef, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  ArrowLeft, Play, Pause, Loader2, AlertCircle, Monitor,
} from "lucide-react";

function fmtTime(s: number): string {
  if (!isFinite(s) || s < 0) return "0:00";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`;
}

interface Props {
  url: string;
  startSecs: number;
  title: string;
  subtitle?: string;
  accentColor?: string;
  onBack: () => void;
  onTimeUpdate?: (pos: number, duration: number) => void;
  onClose?: (finalPos: number) => void;
  /** When true, an unexpected MPV exit shows the "closed" UI instead of calling onClose automatically */
  noAutoClose?: boolean;
}

export function MpvOverlay({
  url, startSecs, title, subtitle, accentColor = "#8b5cf6",
  onBack, onTimeUpdate, onClose, noAutoClose = false,
}: Props) {
  const [launching, setLaunching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(startSecs);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekValue, setSeekValue] = useState(startSecs);
  const [mpvGone, setMpvGone] = useState(false);

  const currentTimeRef = useRef(startSecs);
  const durationRef = useRef(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const aliveRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (aliveRef.current) { clearInterval(aliveRef.current); aliveRef.current = null; }
  }, []);

  // Launch mpv and start polling
  useEffect(() => {
    setLaunching(true);
    setError(null);
    setMpvGone(false);

    invoke<void>("mpv_ipc_launch", { url, startSecs, title })
      .then(() => {
        setLaunching(false);

        // Poll position every second
        pollRef.current = setInterval(async () => {
          try {
            const pos = await invoke<number>("mpv_ipc_get_pos");
            setCurrentTime(pos);
            currentTimeRef.current = pos;
            onTimeUpdate?.(pos, durationRef.current);
          } catch {
            // mpv may have just started or is seeking — ignore transient errors
          }
        }, 1000);

        // Get duration once
        invoke<number>("mpv_ipc_get_duration")
          .then((d) => { setDuration(d); durationRef.current = d; })
          .catch(() => {});

        // Check every 3 s that mpv is still alive (user may close its window)
        aliveRef.current = setInterval(async () => {
          const alive = await invoke<boolean>("mpv_ipc_alive");
          if (!alive) {
            stopPolling();
            if (!noAutoClose) {
              onClose?.(currentTimeRef.current);
            }
            setMpvGone(true);
          }
        }, 3000);
      })
      .catch((e) => { setError(String(e)); setLaunching(false); });

    return () => {
      stopPolling();
      invoke("mpv_ipc_quit").catch(() => {});
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, startSecs]);

  const handleSeek = useCallback((t: number) => {
    invoke("mpv_ipc_seek", { secs: t }).catch(() => {});
    setCurrentTime(t);
    currentTimeRef.current = t;
  }, []);

  const handleTogglePause = useCallback(() => {
    const next = !isPlaying;
    invoke("mpv_ipc_set_pause", { paused: next }).catch(() => {});
    setIsPlaying(!next);
  }, [isPlaying]);

  const handleBack = useCallback(() => {
    stopPolling();
    invoke("mpv_ipc_quit").catch(() => {});
    onClose?.(currentTimeRef.current);
    onBack();
  }, [onBack, onClose, stopPolling]);

  const pct = duration > 0 ? Math.min((isSeeking ? seekValue : currentTime) / duration, 1) : 0;

  if (mpvGone) {
    return (
      <div className="flex-1 flex flex-col bg-black items-center justify-center gap-4">
        <Monitor size={48} className="text-white/30" />
        <p className="text-white/70 text-sm">La ventana de MPV se cerró</p>
        <button onClick={onBack} className="btn-ghost text-xs px-3 py-1.5">
          <ArrowLeft size={13} /> Volver
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-black overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center gap-4 px-4 py-2 bg-bg-primary/90 border-b border-border text-xs text-text-secondary flex-shrink-0">
        <button onClick={handleBack} className="btn-ghost py-1 px-2 text-xs">
          <ArrowLeft size={13} /> Volver
        </button>
        <span className="text-white font-medium truncate flex-1">{title}</span>
        {subtitle && (
          <span className="text-xs opacity-60 flex items-center gap-1">
            <Monitor size={11} /> {subtitle}
          </span>
        )}
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col items-center justify-center gap-6 bg-[#0a0a0a]">
        {launching ? (
          <>
            <Loader2 size={52} className="animate-spin" style={{ color: accentColor }} />
            <p className="text-white/70 text-sm">Iniciando MPV…</p>
          </>
        ) : error ? (
          <>
            <AlertCircle size={48} className="text-red-400" />
            <p className="text-red-300 text-sm font-semibold">No se pudo lanzar MPV</p>
            <p className="text-red-400/70 text-xs max-w-sm text-center">{error}</p>
            <button onClick={onBack} className="btn-ghost text-xs px-3 py-1.5 mt-2">
              <ArrowLeft size={13} /> Volver
            </button>
          </>
        ) : (
          <>
            <Monitor size={64} className="text-white/20" />
            <div className="text-center">
              <p className="text-white/60 text-sm">Reproduciendo en MPV</p>
              <p className="text-white/30 text-xs mt-1">
                vo=gpu-next · ewa_lanczossharp · deband · vulkan
              </p>
            </div>
          </>
        )}
      </div>

      {/* Controls (shown once launched) */}
      {!launching && !error && (
        <div className="bg-bg-primary/95 border-t border-border px-4 pb-4 pt-3 flex flex-col gap-2">
          {/* Seek bar */}
          <div className="relative h-5 flex items-center group">
            <div className="absolute inset-x-0 h-1 bg-white/15 rounded-full" />
            <div
              className="absolute left-0 h-1 rounded-full pointer-events-none transition-[width]"
              style={{ width: `${Math.min(pct * 100, 100)}%`, backgroundColor: accentColor }}
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 bg-white rounded-full shadow pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ left: `${Math.min(pct * 100, 100)}%` }}
            />
            <input
              type="range" min={0}
              max={duration > 0 ? Math.ceil(duration) : Math.max(Math.ceil(currentTime) + 600, 600)}
              step={1}
              value={Math.round(isSeeking ? seekValue : currentTime)}
              className="absolute inset-0 w-full opacity-0 cursor-pointer"
              onMouseDown={() => { setIsSeeking(true); setSeekValue(currentTime); }}
              onChange={(e) => setSeekValue(parseFloat(e.target.value))}
              onMouseUp={(e) => {
                const t = parseFloat((e.target as HTMLInputElement).value);
                handleSeek(t);
                setIsSeeking(false);
              }}
              onTouchEnd={(e) => {
                const t = parseFloat((e.target as HTMLInputElement).value);
                handleSeek(t);
                setIsSeeking(false);
              }}
            />
          </div>

          {/* Buttons row */}
          <div className="flex items-center gap-3">
            <button
              className="text-white hover:text-accent transition-colors p-1"
              onClick={handleTogglePause}
            >
              {isPlaying ? <Pause size={20} /> : <Play size={20} />}
            </button>

            <button
              className="text-white/60 hover:text-white text-xs font-medium px-1.5 py-0.5 transition-colors"
              onClick={() => handleSeek(Math.max(0, currentTime - 30))}
            >−30s</button>
            <button
              className="text-white/60 hover:text-white text-xs font-medium px-1.5 py-0.5 transition-colors"
              onClick={() => handleSeek(Math.max(0, currentTime - 10))}
            >−10s</button>
            <button
              className="text-white/60 hover:text-white text-xs font-medium px-1.5 py-0.5 transition-colors"
              onClick={() => handleSeek(currentTime + 10)}
            >+10s</button>
            <button
              className="text-white/60 hover:text-white text-xs font-medium px-1.5 py-0.5 transition-colors"
              onClick={() => handleSeek(currentTime + 30)}
            >+30s</button>

            <span className="text-white/70 text-xs font-mono tabular-nums ml-1">
              {fmtTime(currentTime)}{duration > 0 ? ` / ${fmtTime(duration)}` : ""}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
