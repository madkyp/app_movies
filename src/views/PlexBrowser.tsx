import { useState, useRef } from "react";
import {
  Server, Play, Pause, ArrowLeft, Volume2, VolumeX, Maximize2,
  Loader2, AlertCircle, Tv, Film, ChevronRight,
} from "lucide-react";
import { useStore } from "../store/useStore";
import { usePlexLibraries, usePlexLibraryItems, usePlexChildren, plexAssetUrl, plexStreamUrl } from "../hooks/usePlex";
import { cn } from "../lib/utils";
import type { PlexLibrary, PlexItem } from "../types";

function fmtMs(ms?: number) {
  if (!ms) return "";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtTime(s: number) {
  if (!isFinite(s) || s < 0) return "0:00";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`;
}

const PLEX_PROXY = "http://127.0.0.1:7777";

// ── Mini Plex video player ────────────────────────────────────────────────────

function PlexPlayer({
  rawUrl,
  durationSecs,
  title,
  onClose,
}: {
  rawUrl: string;
  durationSecs: number;
  title: string;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration] = useState(durationSecs); // from Plex metadata — accurate
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekValue, setSeekValue] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [startOffset, setStartOffset] = useState(0);

  const transcodeUrl = `${PLEX_PROXY}/play/plex?url=${encodeURIComponent(rawUrl)}${startOffset > 0.5 ? `&start=${startOffset}` : ""}`;
  // Reset buffering state on seek-restart
  const handleSeekRestart = (offset: number) => { setIsBuffering(true); setHasError(false); setStartOffset(offset); };
  const pct = duration > 0 ? Math.min((isSeeking ? seekValue : currentTime) / duration, 1) : 0;

  const doSeek = (target: number) => {
    const t = Math.max(0, duration > 0 ? Math.min(target, duration) : target);
    const v = videoRef.current;
    if (!v) return;
    const videoT = t - startOffset;
    if (videoT >= 0) {
      const buf = v.buffered;
      for (let i = 0; i < buf.length; i++) {
        if (videoT >= buf.start(i) && videoT <= buf.end(i) + 2) {
          v.currentTime = videoT;
          setCurrentTime(t);
          return;
        }
      }
    }
    handleSeekRestart(Math.floor(t));
    setCurrentTime(t);
  };

  return (
    <div className="flex-1 flex flex-col bg-black overflow-hidden">
      {/* Title bar */}
      <div className="flex items-center gap-3 px-4 py-2 bg-bg-primary/90 border-b border-border flex-shrink-0">
        <button onClick={onClose} className="btn-ghost py-1 px-2 text-xs">
          <ArrowLeft size={13} /> Biblioteca
        </button>
        <span className="text-white font-medium text-sm truncate flex-1">{title}</span>
        <span className="text-[10px] text-orange-400 font-semibold px-2 py-0.5 rounded bg-orange-400/10 border border-orange-400/20">
          PLEX
        </span>
      </div>

      {/* Video */}
      <div className="flex-1 relative bg-black overflow-hidden">
        <video
          key={`plex-${startOffset}`}
          ref={videoRef}
          src={transcodeUrl}
          autoPlay
          className="w-full h-full cursor-pointer"
          onClick={() => { const v = videoRef.current; if (!v) return; v.paused ? v.play() : v.pause(); }}
          onTimeUpdate={() => setCurrentTime(startOffset + (videoRef.current?.currentTime ?? 0))}
          onPlay={() => { setIsPlaying(true); setIsBuffering(false); }}
          onPause={() => setIsPlaying(false)}
          onWaiting={() => setIsBuffering(true)}
          onCanPlay={() => setIsBuffering(false)}
          onError={() => setHasError(true)}
          onVolumeChange={() => {
            if (!videoRef.current) return;
            setVolume(videoRef.current.volume);
            setIsMuted(videoRef.current.muted);
          }}
        />
        {/* Buffering / error overlay */}
        {(isBuffering || hasError) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60 pointer-events-none">
            {hasError ? (
              <>
                <AlertCircle size={36} className="text-red-400" />
                <p className="text-red-300 text-sm font-semibold">Servidor Plex no disponible</p>
                <p className="text-red-400/70 text-xs">El servidor se ha caído o no es accesible</p>
                <button
                  className="mt-1 px-4 py-1.5 rounded-lg text-xs font-medium bg-white/10 hover:bg-white/20 text-white transition-colors pointer-events-auto"
                  onClick={() => { setHasError(false); setIsBuffering(true); }}
                >
                  Reintentar
                </button>
              </>
            ) : (
              <>
                <Loader2 size={40} className="animate-spin text-orange-400" />
                <p className="text-white/70 text-sm">Iniciando transcodificación…</p>
              </>
            )}
          </div>
        )}

        {/* Controls overlay */}
        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 to-transparent pt-8 pb-2 px-3 flex flex-col gap-1.5">
          {/* Seek bar */}
          <div className="relative h-5 flex items-center group">
            <div className="absolute inset-x-0 h-1 bg-white/20 rounded-full" />
            <div className="absolute left-0 h-1 bg-orange-400 rounded-full pointer-events-none"
                 style={{ width: `${pct * 100}%` }} />
            <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 bg-white rounded-full shadow pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"
                 style={{ left: `${pct * 100}%` }} />
            <input
              type="range" min={0} max={Math.max(duration, 1)} step={1}
              value={Math.round(isSeeking ? seekValue : currentTime)}
              className="absolute inset-0 w-full opacity-0 cursor-pointer"
              onMouseDown={() => { setIsSeeking(true); setSeekValue(currentTime); }}
              onChange={(e) => setSeekValue(parseFloat(e.target.value))}
              onMouseUp={(e) => { doSeek(parseFloat((e.target as HTMLInputElement).value)); setIsSeeking(false); }}
              onTouchEnd={(e) => { doSeek(parseFloat((e.target as HTMLInputElement).value)); setIsSeeking(false); }}
            />
          </div>

          {/* Controls row */}
          <div className="flex items-center gap-2">
            <button className="text-white hover:text-orange-400 transition-colors p-1"
                    onClick={() => { const v = videoRef.current; if (!v) return; v.paused ? v.play() : v.pause(); }}>
              {isPlaying ? <Pause size={18} /> : <Play size={18} />}
            </button>
            <button className="text-white/70 hover:text-white text-xs font-medium px-1.5 transition-colors"
                    onClick={() => doSeek(currentTime - 30)}>−30s</button>
            <button className="text-white/70 hover:text-white text-xs font-medium px-1.5 transition-colors"
                    onClick={() => doSeek(currentTime - 10)}>−10s</button>
            <button className="text-white/70 hover:text-white text-xs font-medium px-1.5 transition-colors"
                    onClick={() => doSeek(currentTime + 10)}>+10s</button>
            <button className="text-white/70 hover:text-white text-xs font-medium px-1.5 transition-colors"
                    onClick={() => doSeek(currentTime + 30)}>+30s</button>
            <span className="text-white/80 text-xs font-mono ml-1 tabular-nums">
              {fmtTime(currentTime)}{duration > 0 ? ` / ${fmtTime(duration)}` : ""}
            </span>
            <div className="flex-1" />
            <button className="text-white/70 hover:text-white p-1 transition-colors"
                    onClick={() => { const v = videoRef.current; if (!v) return; v.muted = !v.muted; }}>
              {isMuted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
            <input type="range" min={0} max={1} step={0.05} value={isMuted ? 0 : volume}
                   className="w-16 cursor-pointer"
                   style={{ accentColor: "#fb923c" }}
                   onChange={(e) => { const v = videoRef.current; if (!v) return; v.volume = parseFloat(e.target.value); v.muted = parseFloat(e.target.value) === 0; }} />
            <button className="text-white/70 hover:text-white p-1 transition-colors"
                    onClick={() => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else videoRef.current?.requestFullscreen().catch(() => {}); }}>
              <Maximize2 size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Poster card ───────────────────────────────────────────────────────────────

function PlexCard({
  item,
  plexUrl,
  token,
  onClick,
}: {
  item: PlexItem;
  plexUrl: string;
  token: string;
  onClick: () => void;
}) {
  const thumb = plexAssetUrl(plexUrl, token, item.thumb);
  const isEpisode = item.type === "episode";

  return (
    <div
      onClick={onClick}
      className="group cursor-pointer rounded-xl overflow-hidden border border-border hover:border-orange-400/50 bg-bg-card transition-all duration-150 hover:scale-[1.02]"
    >
      <div className="relative" style={{ aspectRatio: isEpisode ? "16/9" : "2/3" }}>
        {thumb ? (
          <img src={thumb} alt={item.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-bg-secondary flex items-center justify-center">
            {item.type === "show" ? <Tv size={32} className="text-text-muted opacity-30" />
              : <Film size={32} className="text-text-muted opacity-30" />}
          </div>
        )}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
          <Play size={32} className="text-white opacity-0 group-hover:opacity-100 transition-opacity fill-white" />
        </div>
        {item.type === "episode" && item.index != null && (
          <span className="absolute top-1.5 left-1.5 text-[10px] font-mono bg-black/70 text-white px-1.5 py-0.5 rounded">
            E{String(item.index).padStart(2, "0")}
          </span>
        )}
      </div>
      <div className="p-2.5">
        <p className="text-white text-xs font-medium truncate">{item.title}</p>
        <div className="flex items-center gap-2 mt-0.5">
          {item.year && <span className="text-text-muted text-[10px]">{item.year}</span>}
          {item.duration && <span className="text-text-muted text-[10px]">{fmtMs(item.duration)}</span>}
          {item.type === "show" && item.childCount && (
            <span className="text-text-muted text-[10px]">{item.childCount} temp.</span>
          )}
          {item.type === "season" && item.leafCount && (
            <span className="text-text-muted text-[10px]">{item.leafCount} ep.</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Season row for shows ──────────────────────────────────────────────────────

function SeasonRow({
  season,
  plexUrl,
  token,
  isSelected,
  onClick,
}: {
  season: PlexItem;
  plexUrl: string;
  token: string;
  isSelected: boolean;
  onClick: () => void;
}) {
  const thumb = plexAssetUrl(plexUrl, token, season.thumb);
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 w-full p-3 rounded-xl border text-left transition-colors",
        isSelected
          ? "border-orange-400/60 bg-orange-400/10 text-white"
          : "border-border bg-bg-card hover:border-border/80 hover:bg-bg-hover text-text-secondary",
      )}
    >
      {thumb ? (
        <img src={thumb} alt="" className="w-10 h-14 object-cover rounded-md flex-shrink-0" />
      ) : (
        <div className="w-10 h-14 bg-bg-secondary rounded-md flex-shrink-0 flex items-center justify-center">
          <Tv size={16} className="text-text-muted opacity-40" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{season.title}</p>
        {season.leafCount && (
          <p className="text-[11px] text-text-muted mt-0.5">{season.leafCount} episodios</p>
        )}
      </div>
      <ChevronRight size={14} className="flex-shrink-0 opacity-40" />
    </button>
  );
}

// ── Main PlexBrowser view ────────────────────────────────────────────────────

export function PlexBrowser() {
  const { settings } = useStore();
  const plexUrl   = settings?.plexUrl   ?? "";
  const plexToken = settings?.plexToken ?? "";

  const [activeLibrary, setActiveLibrary] = useState<PlexLibrary | null>(null);
  const [selectedShow, setSelectedShow] = useState<PlexItem | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<PlexItem | null>(null);
  const [playingItem, setPlayingItem] = useState<{ rawUrl: string; durationSecs: number; title: string } | null>(null);

  const { libraries, loading: loadingLibs, error: libError, refetch } = usePlexLibraries();
  const { items: libraryItems, loading: loadingItems } = usePlexLibraryItems(activeLibrary?.key ?? null);
  const { children: seasons, loading: loadingSeasons } = usePlexChildren(selectedShow?.ratingKey ?? null);
  const { children: episodes, loading: loadingEpisodes } = usePlexChildren(selectedSeason?.ratingKey ?? null);

  // ── Not configured ───────────────────────────────────────────────────────────
  if (!plexUrl || !plexToken) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-8">
        <Server size={48} className="text-orange-400 opacity-60" />
        <h2 className="text-white text-xl font-bold">Plex no configurado</h2>
        <p className="text-text-secondary text-sm max-w-xs">
          Ve a Ajustes y añade la URL de tu servidor Plex y tu token para empezar.
        </p>
      </div>
    );
  }

  // ── Player mode ───────────────────────────────────────────────────────────────
  if (playingItem) {
    return (
      <PlexPlayer
        rawUrl={playingItem.rawUrl}
        durationSecs={playingItem.durationSecs}
        title={playingItem.title}
        onClose={() => setPlayingItem(null)}
      />
    );
  }

  const playItem = (item: PlexItem) => {
    const rawUrl = plexStreamUrl(plexUrl, plexToken, item);
    if (!rawUrl) return;
    const label = item.type === "episode"
      ? `${item.grandparentTitle ?? item.parentTitle ?? ""} · S${String(item.parentIndex ?? 0).padStart(2, "0")}E${String(item.index ?? 0).padStart(2, "0")} · ${item.title}`
      : item.title;
    setPlayingItem({ rawUrl, durationSecs: item.duration ? item.duration / 1000 : 0, title: label });
  };

  // ── Breadcrumb navigation ────────────────────────────────────────────────────
  const goBack = () => {
    if (selectedSeason) { setSelectedSeason(null); return; }
    if (selectedShow) { setSelectedShow(null); return; }
    setActiveLibrary(null);
  };

  const breadcrumbs = [
    { label: "Plex", onClick: () => { setActiveLibrary(null); setSelectedShow(null); setSelectedSeason(null); } },
    ...(activeLibrary ? [{ label: activeLibrary.title, onClick: () => { setSelectedShow(null); setSelectedSeason(null); } }] : []),
    ...(selectedShow ? [{ label: selectedShow.title, onClick: () => setSelectedSeason(null) }] : []),
    ...(selectedSeason ? [{ label: selectedSeason.title, onClick: () => {} }] : []),
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-border flex-shrink-0">
        {activeLibrary && (
          <button onClick={goBack} className="btn-ghost py-1 px-2 text-xs">
            <ArrowLeft size={13} /> Atrás
          </button>
        )}
        <div className="flex items-center gap-1.5 text-sm">
          {breadcrumbs.map((b, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <ChevronRight size={12} className="text-text-muted" />}
              <button
                onClick={b.onClick}
                className={cn(
                  "hover:text-white transition-colors",
                  i === breadcrumbs.length - 1 ? "text-white font-medium" : "text-text-muted",
                )}
              >
                {b.label}
              </button>
            </span>
          ))}
        </div>
        <span className="ml-auto text-[10px] text-orange-400 font-semibold px-2 py-0.5 rounded bg-orange-400/10 border border-orange-400/20">
          PLEX
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {/* ── Library list ───────────────────────────────────────────────────── */}
        {!activeLibrary && (
          <>
            {loadingLibs && (
              <div className="flex items-center justify-center py-16">
                <Loader2 size={32} className="animate-spin text-orange-400" />
              </div>
            )}
            {libError && (
              <div className="flex flex-col items-center gap-4 py-16 text-center">
                <Server size={48} className="text-red-400 opacity-60" />
                <div>
                  <p className="text-white font-semibold text-base">Servidor Plex no disponible</p>
                  <p className="text-text-secondary text-sm mt-1 max-w-xs">
                    {libError.toLowerCase().includes("fetch")
                      ? "No se puede conectar con el servidor. Comprueba que está encendido y accesible."
                      : `Error del servidor: ${libError}`}
                  </p>
                </div>
                <button onClick={refetch} className="btn-ghost border border-border text-sm">
                  <Loader2 size={14} /> Reintentar
                </button>
              </div>
            )}
            {!loadingLibs && !libError && (
              <div className="grid grid-cols-2 gap-4 max-w-md">
                {libraries.map((lib) => (
                  <button
                    key={lib.key}
                    onClick={() => { setActiveLibrary(lib); setSelectedShow(null); setSelectedSeason(null); }}
                    className="flex flex-col items-center gap-3 p-6 rounded-xl border border-border bg-bg-card hover:border-orange-400/50 hover:bg-bg-hover transition-all cursor-pointer"
                  >
                    {lib.type === "show" ? (
                      <Tv size={32} className="text-orange-400" />
                    ) : (
                      <Film size={32} className="text-orange-400" />
                    )}
                    <span className="text-white font-medium text-sm text-center">{lib.title}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── Movies grid ────────────────────────────────────────────────────── */}
        {activeLibrary?.type === "movie" && !selectedShow && (
          <>
            {loadingItems && (
              <div className="flex items-center justify-center py-16">
                <Loader2 size={32} className="animate-spin text-orange-400" />
              </div>
            )}
            {!loadingItems && (
              <div className="grid grid-cols-4 gap-4 xl:grid-cols-5 2xl:grid-cols-6">
                {libraryItems.map((item) => (
                  <PlexCard
                    key={item.ratingKey}
                    item={item}
                    plexUrl={plexUrl}
                    token={plexToken}
                    onClick={() => playItem(item)}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* ── Shows grid ─────────────────────────────────────────────────────── */}
        {activeLibrary?.type === "show" && !selectedShow && (
          <>
            {loadingItems && (
              <div className="flex items-center justify-center py-16">
                <Loader2 size={32} className="animate-spin text-orange-400" />
              </div>
            )}
            {!loadingItems && (
              <div className="grid grid-cols-4 gap-4 xl:grid-cols-5 2xl:grid-cols-6">
                {libraryItems.map((item) => (
                  <PlexCard
                    key={item.ratingKey}
                    item={item}
                    plexUrl={plexUrl}
                    token={plexToken}
                    onClick={() => setSelectedShow(item)}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* ── Season list ────────────────────────────────────────────────────── */}
        {selectedShow && !selectedSeason && (
          <>
            {loadingSeasons && (
              <div className="flex items-center justify-center py-16">
                <Loader2 size={32} className="animate-spin text-orange-400" />
              </div>
            )}
            {!loadingSeasons && (
              <div className="space-y-2 max-w-md">
                {seasons.map((s) => (
                  <SeasonRow
                    key={s.ratingKey}
                    season={s}
                    plexUrl={plexUrl}
                    token={plexToken}
                    isSelected={false}
                    onClick={() => setSelectedSeason(s)}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* ── Episode list ───────────────────────────────────────────────────── */}
        {selectedSeason && (
          <>
            {loadingEpisodes && (
              <div className="flex items-center justify-center py-16">
                <Loader2 size={32} className="animate-spin text-orange-400" />
              </div>
            )}
            {!loadingEpisodes && (
              <div className="grid grid-cols-3 gap-4 xl:grid-cols-4">
                {episodes.map((ep) => (
                  <PlexCard
                    key={ep.ratingKey}
                    item={ep}
                    plexUrl={plexUrl}
                    token={plexToken}
                    onClick={() => playItem(ep)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
