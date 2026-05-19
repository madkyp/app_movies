import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ArrowLeft, Wifi, Users, HardDrive, Loader2, AlertCircle, Play, Pause, X, Calendar, Volume2, VolumeX, Maximize2, ChevronUp, FileText, Server, FolderOpen, Subtitles } from "lucide-react";
import { useStore } from "../store/useStore";
import { useSeasonEpisodes } from "../hooks/useTmdb";
import { cn, TMDB_IMAGE_BASE } from "../lib/utils";
import type { TorrentSource, Episode, SubtitleResult } from "../types";

function fmtTimestamp(s: number): string {
  if (!isFinite(s) || s < 0) return "0:00";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`;
}

function srtToVtt(srt: string): string {
  return "WEBVTT\n\n" + srt
    .replace(/\r\n/g, "\n").replace(/\r/g, "\n")
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2")
    .replace(/^\d+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

interface StreamInfo {
  id: number;
  stream_url: string; // raw — for MPV
  play_url: string;   // ffmpeg fragmented MP4 — for in-app <video>
}

interface TrackInfo {
  index: number;
  codec: string;
  language: string;
  label: string;
  is_text: boolean;
}

interface VideoTracks {
  duration_secs: number;
  audio: TrackInfo[];
  subtitles: TrackInfo[];
}

interface TorrentStats {
  id: number;
  downloaded_bytes: number;
  total_bytes: number;
  download_speed_mbps: number;
  peers: number;
  progress_percent: number;
}

function QualityBadge({ q }: { q: string }) {
  return (
    <span className={cn("badge-quality", {
      "badge-4k": q === "4K",
      "badge-1080": q === "1080p",
      "badge-720": q === "720p",
      "badge-quality bg-gray-500/20 text-gray-400 border border-gray-500/30": q === "480p",
    })}>
      {q}
    </span>
  );
}

function CodecBadge({ codec }: { codec: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    "x264":    { label: "x264",    cls: "bg-green-500/20 text-green-300 border-green-500/40" },
    "x265":    { label: "x265",    cls: "bg-blue-500/20 text-blue-300 border-blue-500/40" },
    "av1":     { label: "AV1",     cls: "bg-purple-500/20 text-purple-300 border-purple-500/40" },
    "unknown": { label: "?",       cls: "bg-gray-600/20 text-gray-400 border-gray-600/40" },
  };
  const { label, cls } = map[codec] ?? map["unknown"];
  return (
    <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded border", cls)}>
      {label}
    </span>
  );
}

function LangBadge({ lang }: { lang: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    "es":         { label: "🇪🇸 ESP",      cls: "bg-yellow-500/20 text-yellow-300 border-yellow-500/40" },
    "es-lat":     { label: "🌎 LAT",       cls: "bg-orange-500/20 text-orange-300 border-orange-500/40" },
    "dual":       { label: "⚡ DUAL",       cls: "bg-blue-500/20 text-blue-300 border-blue-500/40" },
    "en-sub-es":  { label: "🇺🇸 SUB ESP", cls: "bg-teal-500/20 text-teal-300 border-teal-500/40" },
    "en":         { label: "🇺🇸 ENG",      cls: "bg-gray-500/20 text-gray-300 border-gray-500/40" },
    "multi":      { label: "🌍 MULTI",     cls: "bg-indigo-500/20 text-indigo-300 border-indigo-500/40" },
    "unknown":    { label: "❓",            cls: "bg-gray-600/20 text-gray-500 border-gray-600/40" },
  };
  const { label, cls } = map[lang] ?? map["unknown"];
  return (
    <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded border", cls)}>
      {label}
    </span>
  );
}

function formatBytes(bytes: number) {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  return `${(bytes / 1_048_576).toFixed(0)} MB`;
}

interface SubtitlePanelProps {
  show: boolean;
  lang: string;
  results: SubtitleResult[];
  loading: boolean;
  downloading: boolean;
  error: string | null;
  extSubUrl: string | null;
  onClose: () => void;
  onLangChange: (l: string) => void;
  onSearch: () => void;
  onSelect: (fileId: number) => void;
  onClear: () => void;
}

function SubtitlePanel({ show, lang, results, loading, downloading, error, extSubUrl, onClose, onLangChange, onSearch, onSelect, onClear }: SubtitlePanelProps) {
  if (!show) return null;
  return (
    <div className="absolute bottom-20 right-3 w-80 bg-bg-card border border-border rounded-xl shadow-2xl z-50 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-white text-xs font-semibold flex items-center gap-1.5">
          <FileText size={12} /> Subtítulos externos
        </span>
        <button onClick={onClose} className="text-text-muted hover:text-white transition-colors"><X size={13} /></button>
      </div>
      <div className="p-3 space-y-2">
        {extSubUrl && (
          <div className="flex items-center justify-between px-2 py-1 rounded bg-green-500/10 border border-green-500/30">
            <span className="text-green-400 text-xs">Subtítulo cargado ✓</span>
            <button onClick={onClear} className="text-text-muted hover:text-red-400 text-xs transition-colors">Quitar</button>
          </div>
        )}
        <div className="flex gap-2">
          <select
            value={lang}
            onChange={(e) => onLangChange(e.target.value)}
            className="flex-1 bg-bg-secondary border border-border rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-accent cursor-pointer"
          >
            <option value="es">Español</option>
            <option value="en">English</option>
            <option value="fr">Français</option>
            <option value="de">Deutsch</option>
            <option value="it">Italiano</option>
            <option value="pt">Português</option>
          </select>
          <button
            onClick={onSearch}
            disabled={loading || downloading}
            className="btn-primary text-xs py-1 px-3 disabled:opacity-50"
          >
            {loading ? <Loader2 size={11} className="animate-spin" /> : "Buscar"}
          </button>
        </div>

        {downloading && (
          <div className="flex items-center gap-2 text-xs text-text-secondary px-1">
            <Loader2 size={11} className="animate-spin text-accent" /> Descargando subtítulo…
          </div>
        )}
        {error && <p className="text-red-400 text-xs px-1">{error}</p>}

        {results.length > 0 && (
          <div className="space-y-0.5 max-h-52 overflow-y-auto">
            {results.map((r) => (
              <button
                key={r.file_id}
                disabled={downloading}
                onClick={() => onSelect(r.file_id)}
                className="w-full text-left px-2 py-2 rounded text-xs hover:bg-bg-hover transition-colors disabled:opacity-50 group"
              >
                <p className="text-white truncate">{r.release || r.file_name}</p>
                <p className="text-text-muted text-[10px] mt-0.5">{r.language.toUpperCase()} · {r.download_count.toLocaleString()} descargas</p>
              </button>
            ))}
          </div>
        )}

        {!loading && !error && results.length === 0 && (
          <p className="text-text-muted text-xs text-center py-3">Elige idioma y pulsa Buscar</p>
        )}
      </div>
    </div>
  );
}

const ES_LANGS = new Set(["es", "es-lat", "dual"]);
function sortSources(sources: TorrentSource[]): TorrentSource[] {
  return [...sources].sort((a, b) => {
    const aEs = ES_LANGS.has(a.language) ? 0 : 1;
    const bEs = ES_LANGS.has(b.language) ? 0 : 1;
    if (aEs !== bEs) return aEs - bEs;
    return b.seeds - a.seeds;
  });
}

export function Player() {
  // ── Hooks (all unconditional) ────────────────────────────────────────────────
  const { selectedMedia: media, setView, plexDirectUrl, plexDirectDuration, setPlexDirectUrl, localFileUrl, localFileTitle, setLocalFileUrl, addToHistory, updateHistoryProgress, history, settings } = useStore();

  // SMB: download to local cache before playing
  const [effectiveLocalPath, setEffectiveLocalPath] = useState<string | null>(null);
  const [smbLoading, setSmbLoading] = useState(false);
  const [smbError, setSmbError] = useState<string | null>(null);

  const isMovie = media?.media_type === "movie";
  const isSeries = media?.media_type === "tv";
  const mediaId = media?.id ?? null;
  const title = media?.title || media?.name || "";
  const seasons = useMemo(() => {
    const all = (media as any)?.seasons ?? [];
    return all.filter((s: any) => s.season_number > 0);
  }, [media]);

  // Source fetching
  const [sources, setSources] = useState<TorrentSource[]>([]);
  const [loadingSources, setLoadingSources] = useState(false);
  const [sourcesError, setSourcesError] = useState<string | null>(null);

  // Streaming
  const [streamInfo, setStreamInfo] = useState<StreamInfo | null>(null);
  const [videoFileIdx, setVideoFileIdx] = useState(0); // resolved after metadata
  const [connecting, setConnecting] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [tracksReady, setTracksReady] = useState(false); // true after /tracks/ fetch completes
  const [mpvLaunched, setMpvLaunched] = useState(false);
  const [bufferError, setBufferError] = useState<string | null>(null);
  const [stats, setStats] = useState<TorrentStats | null>(null);

  // Track selection
  const [tracks, setTracks] = useState<VideoTracks | null>(null);
  const [selectedAudio, setSelectedAudio] = useState(0);
  const [selectedSub, setSelectedSub] = useState(-1); // -1 = off
  const [showAudioMenu, setShowAudioMenu] = useState(false);
  const [showSubMenu, setShowSubMenu] = useState(false);

  // External subtitles (OpenSubtitles)
  const [extSubUrl, setExtSubUrl] = useState<string | null>(null);
  const [showSubPanel, setShowSubPanel] = useState(false);
  const [subLang, setSubLang] = useState("es");
  const [subResults, setSubResults] = useState<SubtitleResult[]>([]);
  const [subLoading, setSubLoading] = useState(false);
  const [subError, setSubError] = useState<string | null>(null);
  const [subDownloading, setSubDownloading] = useState(false);

  // Playback controls
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);       // Plex player
  const [isStreamBuffering, setIsStreamBuffering] = useState(false); // Torrent player
  const [plexVideoError, setPlexVideoError] = useState(false);
  const [localVideoError, setLocalVideoError] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekValue, setSeekValue] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [startOffset, setStartOffset] = useState(0); // ffmpeg ?start= offset in seconds

  // Series-specific state
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [selectedEpisode, setSelectedEpisode] = useState<Episode | null>(null);

  const { episodes, loading: loadingEpisodes } = useSeasonEpisodes(
    isSeries ? mediaId : null,
    selectedSeason
  );

  const videoRef = useRef<HTMLVideoElement>(null);
  const statsInterval = useRef<ReturnType<typeof setInterval>>(null);
  const bufferStart = useRef<number>(0);

  // Refs for stable access inside keyboard/interval callbacks
  const currentTimeRef = useRef(0);
  const durationRef = useRef(0);
  const startOffsetRef = useRef(0);
  const currentHistoryId = useRef<string | null>(null);
  const pendingResumeAt = useRef(0); // for torrent: seek target after tracksReady
  const seekFn = useRef<((t: number) => void) | null>(null);

  // Resume toast: non-null when we auto-resumed from history
  const [resumeToast, setResumeToast] = useState<{ at: number } | null>(null);

  // ── Default season when media changes ────────────────────────────────────────
  useEffect(() => {
    if (isSeries && seasons.length > 0 && selectedSeason == null) {
      setSelectedSeason(seasons[0].season_number);
    }
  }, [isSeries, seasons, selectedSeason]);

  // ── Fetch sources (movie immediately, series only after episode selected) ────
  useEffect(() => {
    if (!media || plexDirectUrl) return;

    // Movies: search on mount with movie title + IMDB ID (for Torrentio)
    if (isMovie) {
      const searchTitle = (media as any).original_title || title;
      const imdbId = (media as any).imdb_id || (media as any).external_ids?.imdb_id || "";
      setLoadingSources(true);
      setSourcesError(null);
      invoke<TorrentSource[]>("search_yts", { query: searchTitle, imdbId })
        .then((s) => setSources(sortSources(s)))
        .catch((e) => setSourcesError(String(e)))
        .finally(() => setLoadingSources(false));
      return;
    }

    // Series: only search when an episode is selected
    if (isSeries && selectedEpisode) {
      const imdbId = (media as any).imdb_id || (media as any).external_ids?.imdb_id || "";
      const searchTitle = (media as any).original_name || title;
      setLoadingSources(true);
      setSourcesError(null);
      setSources([]);
      invoke<TorrentSource[]>("search_eztv", {
        imdbId,
        query: searchTitle,
        season: selectedEpisode.season_number,
        episode: selectedEpisode.episode_number,
      })
        .then((s) => setSources(sortSources(s)))
        .catch((e) => setSourcesError(String(e)))
        .finally(() => setLoadingSources(false));
    }
  }, [mediaId, isMovie, isSeries, selectedEpisode?.id, plexDirectUrl]);

  // ── Stats polling + video-ready gate + timeout ───────────────────────────────
  const streamInfoRef = useRef<StreamInfo | null>(null);
  streamInfoRef.current = streamInfo;

  useEffect(() => {
    if (!streamInfo) return;
    setVideoReady(false);
    setTracksReady(false);
    setMpvLaunched(false);
    setVideoFileIdx(0);
    setBufferError(null);
    setTracks(null);
    setIsStreamBuffering(false);
    setSelectedAudio(0);
    setSelectedSub(-1);
    setShowAudioMenu(false);
    setShowSubMenu(false);
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
    setIsSeeking(false);
    setSeekValue(0);
    setStartOffset(0);
    bufferStart.current = Date.now();

    const torrentId = streamInfo.id;
    let downloadedBytes = 0;
    let peers = 0;
    let fired = false;

    const bail = (msg: string) => {
      clearInterval(statsInterval.current!);
      statsInterval.current = null;
      invoke("stop_torrent", { id: torrentId }).catch(() => {});
      setStreamInfo(null);
      setStats(null);
      setVideoReady(false);
      setMpvLaunched(false);
      setBufferError(msg);
    };

    statsInterval.current = setInterval(async () => {
      const elapsed = Date.now() - bufferStart.current;

      try {
        const s = await invoke<TorrentStats>("get_torrent_stats", { id: torrentId });
        setStats(s);
        downloadedBytes = s.downloaded_bytes;
        peers = s.peers;

        // Start playback once metadata resolves and 2 MB downloaded.
        // Do NOT call setStreamInfo here — it would re-trigger this effect.
        if (!fired && s.total_bytes > 0 && s.downloaded_bytes >= 2 * 1024 * 1024) {
          fired = true;
          const fileIdx = await invoke<number>("find_video_file", { id: torrentId }).catch(() => 0);
          setVideoFileIdx(fileIdx);
          setVideoReady(true);
        }
      } catch (e) {
        console.warn("stats poll failed (metadata phase?):", e);
      }

      if (elapsed > 20_000 && downloadedBytes < 1024 && peers === 0) {
        bail("Sin peers después de 20 s — el torrent parece muerto. Prueba otra fuente.");
        return;
      }
      if (elapsed > 45_000 && downloadedBytes < 100 * 1024) {
        bail("Timeout: sin datos después de 45 s. Prueba otra fuente.");
      }
    }, 1000);
    return () => { if (statsInterval.current) clearInterval(statsInterval.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamInfo?.id]); // only re-run when the torrent ID changes, not on URL updates

  // Fetch audio/subtitle tracks once video is ready.
  // Importantly, setTracksReady(true) only after this completes so that
  // the <video> element (which triggers /play/) starts AFTER ffprobe finishes.
  // This avoids concurrent reads of the same librqbit stream by ffprobe and ffmpeg.
  useEffect(() => {
    if (!videoReady || !streamInfo) return;
    const serverBase = streamInfo.play_url.replace(/\/play\/.*$/, "");
    fetch(`${serverBase}/tracks/${streamInfo.id}/${videoFileIdx}`)
      .then((r) => r.json())
      .then((t: VideoTracks) => {
        setTracks(t);
        if (t.duration_secs > 0) setDuration(t.duration_secs);
        setTracksReady(true);
      })
      .catch(() => { setTracksReady(true); }); // fail silently but still proceed
  }, [videoReady, streamInfo?.id, videoFileIdx]);

  // Seed duration from Plex metadata when entering Plex mode (avoids calling setState during render)
  useEffect(() => {
    if (plexDirectUrl) {
      setIsBuffering(true);
      setPlexVideoError(false);
      setResumeToast(null);
      if (plexDirectDuration > 0) setDuration(plexDirectDuration);

      const histId = `plex-${media?.id ?? plexDirectUrl}`;
      currentHistoryId.current = histId;
      const saved = history.find((h) => h.id === histId);
      if (saved?.progressSecs && saved.progressSecs > 30 &&
          saved.durationSecs && saved.progressSecs < saved.durationSecs * 0.9) {
        setStartOffset(saved.progressSecs);
        setResumeToast({ at: saved.progressSecs });
      } else {
        setStartOffset(0);
      }

      addToHistory({
        id: histId,
        title,
        poster: media?.poster_path ?? null,
        media_type: isSeries ? "tv" : "movie",
        tmdb_id: media?.id,
        source: "plex",
        playedAt: Date.now(),
      });
    }
  }, [plexDirectUrl, plexDirectDuration]);

  // When localFileUrl changes: resolve SMB → local path, then fetch tracks
  useEffect(() => {
    if (!localFileUrl) { setEffectiveLocalPath(null); return; }
    setTracks(null);
    setSelectedAudio(0);
    setSelectedSub(-1);
    setCurrentTime(0);
    setDuration(0);
    setLocalVideoError(false);
    setSmbError(null);
    setResumeToast(null);

    // Check history for a saved position before resetting startOffset
    const histId = `local-${localFileUrl}`;
    currentHistoryId.current = histId;
    const saved = history.find((h) => h.id === histId);
    if (saved?.progressSecs && saved.progressSecs > 30 &&
        saved.durationSecs && saved.progressSecs < saved.durationSecs * 0.9) {
      setStartOffset(saved.progressSecs);
      setResumeToast({ at: saved.progressSecs });
    } else {
      setStartOffset(0);
    }

    // History for local files
    addToHistory({
      id: histId,
      title: localFileTitle || localFileUrl.split(/[\\/]/).pop() || localFileUrl,
      poster: null,
      media_type: "file",
      source: "local",
      path: localFileUrl,
      playedAt: Date.now(),
    });

    if (localFileUrl.startsWith("smb://")) {
      setSmbLoading(true);
      setEffectiveLocalPath(null);
      invoke<string>("fetch_smb_to_cache", { url: localFileUrl })
        .then((path) => { setEffectiveLocalPath(path); setSmbLoading(false); })
        .catch((e) => { setSmbError(String(e)); setSmbLoading(false); });
    } else {
      setEffectiveLocalPath(localFileUrl);
    }
  }, [localFileUrl]);

  // Fetch tracks once effective path is resolved
  useEffect(() => {
    if (!effectiveLocalPath) return;
    setIsBuffering(true);
    fetch(`http://127.0.0.1:7777/tracks/local?path=${encodeURIComponent(effectiveLocalPath)}`)
      .then((r) => r.json())
      .then((t: VideoTracks) => {
        setTracks(t);
        if (t.duration_secs > 0) setDuration(t.duration_secs);
      })
      .catch(() => {});
  }, [effectiveLocalPath]);

  useEffect(() => {
    return () => {
      if (statsInterval.current) clearInterval(statsInterval.current);
      if (streamInfo) invoke("stop_torrent", { id: streamInfo.id }).catch(() => {});
      // Delete SMB cached file when leaving player (can be several GB)
      invoke("clear_smb_cache").catch(() => {});
    };
  }, [streamInfo]);

  // ── Keyboard shortcuts ───────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const v = videoRef.current;
      switch (e.key) {
        case " ":
          e.preventDefault();
          if (v) v.paused ? v.play() : v.pause();
          break;
        case "ArrowLeft":
          e.preventDefault();
          seekFn.current?.(Math.max(0, currentTimeRef.current - 10));
          break;
        case "ArrowRight":
          e.preventDefault();
          seekFn.current?.(currentTimeRef.current + 10);
          break;
        case "f": case "F":
          e.preventDefault();
          v?.requestFullscreen().catch(() => {});
          break;
        case "m": case "M":
          e.preventDefault();
          if (v) { v.muted = !v.muted; setIsMuted(v.muted); }
          break;
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []); // stable: only uses refs

  // ── Progress auto-save every 10 s ───────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      if (currentHistoryId.current && durationRef.current > 0 && currentTimeRef.current > 5) {
        updateHistoryProgress(currentHistoryId.current, currentTimeRef.current, durationRef.current);
      }
    }, 10_000);
    return () => clearInterval(id);
  }, [updateHistoryProgress]);

  // ── After torrent tracksReady: apply pending resume seek ────────────────────
  useEffect(() => {
    if (!tracksReady || !streamInfo) return;
    if (pendingResumeAt.current > 0) {
      const target = pendingResumeAt.current;
      pendingResumeAt.current = 0;
      setTimeout(() => {
        const v = videoRef.current;
        if (v) { v.currentTime = target; setCurrentTime(target); }
      }, 800);
    }
  }, [tracksReady, streamInfo?.id]);

  // Sync refs with latest state values (safe to do in render body)
  currentTimeRef.current = currentTime;
  durationRef.current = duration;
  startOffsetRef.current = startOffset;

  const handleSubSearch = useCallback(async () => {
    setSubResults([]);
    setSubError(null);
    setSubLoading(true);
    const apiKey = settings.openSubtitlesApiKey ?? "";
    try {
      const imdbId: string | undefined = (media as any)?.imdb_id ?? undefined;
      const queryFallback = localFileUrl
        ? (localFileTitle || localFileUrl.split(/[\\/]/).pop() || "").replace(/\.[^.]+$/, "")
        : (media?.title || media?.name || undefined);
      const results = await invoke<SubtitleResult[]>("search_subtitles", {
        imdbId: imdbId ?? null,
        query: imdbId ? null : (queryFallback ?? null),
        language: subLang,
        season: selectedEpisode?.season_number ?? null,
        episodeNum: selectedEpisode?.episode_number ?? null,
        apiKey,
      });
      setSubResults(results);
      if (results.length === 0) setSubError("No se encontraron subtítulos para estos parámetros.");
    } catch (e) {
      const msg = String(e);
      if (msg === "opensubtitles_no_key") {
        setSubError("Configura tu API key de OpenSubtitles en Ajustes.");
      } else {
        setSubError(msg);
      }
    } finally {
      setSubLoading(false);
    }
  }, [settings.openSubtitlesApiKey, media, localFileUrl, localFileTitle, subLang, selectedEpisode]);

  const handleSubtitleSelect = useCallback(async (fileId: number) => {
    setSubDownloading(true);
    setSubError(null);
    const apiKey = settings.openSubtitlesApiKey ?? "";
    try {
      const srtContent = await invoke<string>("download_subtitle", { fileId, apiKey });
      const vtt = srtToVtt(srtContent);
      const blob = new Blob([vtt], { type: "text/vtt" });
      if (extSubUrl) URL.revokeObjectURL(extSubUrl);
      setExtSubUrl(URL.createObjectURL(blob));
      setShowSubPanel(false);
    } catch (e) {
      setSubError(String(e));
    } finally {
      setSubDownloading(false);
    }
  }, [settings.openSubtitlesApiKey, extSubUrl]);

  const handlePlay = useCallback(async (source: TorrentSource) => {
    if (!source.magnet) return;
    if (source.seeds === 0) {
      const ok = window.confirm(
        "Este torrent tiene 0 seeds — probablemente está muerto y no descargará nada.\n\n" +
        "¿Quieres intentarlo de todas formas? (se cancelará automáticamente)"
      );
      if (!ok) return;
    }
    setConnecting(true);
    setBufferError(null);
    setSourcesError(null);
    setResumeToast(null);
    try {
      const histId = `torrent-${media?.id ?? Date.now()}-${selectedEpisode?.id ?? ""}`;
      currentHistoryId.current = histId;

      // Check for saved progress before starting
      const saved = history.find((h) => h.id === histId);
      if (saved?.progressSecs && saved.progressSecs > 30 &&
          saved.durationSecs && saved.progressSecs < saved.durationSecs * 0.9) {
        pendingResumeAt.current = saved.progressSecs;
        setResumeToast({ at: saved.progressSecs });
      } else {
        pendingResumeAt.current = 0;
      }

      const info = await invoke<StreamInfo>("start_torrent", { magnet: source.magnet });
      setStreamInfo(info);
      addToHistory({
        id: histId,
        title: selectedEpisode
          ? `${title} S${String(selectedEpisode.season_number).padStart(2,"0")}E${String(selectedEpisode.episode_number).padStart(2,"0")}`
          : title,
        poster: media?.poster_path ?? null,
        media_type: isSeries ? "tv" : "movie",
        tmdb_id: media?.id,
        imdb_id: (media as any)?.imdb_id ?? undefined,
        source: "torrent",
        playedAt: Date.now(),
        episode: selectedEpisode ? { season: selectedEpisode.season_number, episode: selectedEpisode.episode_number, name: selectedEpisode.name } : undefined,
      });
    } catch (e) {
      setSourcesError(`Error iniciando torrent: ${e}`);
    } finally {
      setConnecting(false);
    }
  }, []);

  const handleCancelStream = useCallback(() => {
    if (streamInfo) invoke("stop_torrent", { id: streamInfo.id }).catch(() => {});
    setStreamInfo(null);
    setStats(null);
    setVideoReady(false);
  }, [streamInfo]);

  const handleBack = useCallback(() => {
    if (streamInfo) invoke("stop_torrent", { id: streamInfo.id }).catch(() => {});
    setStreamInfo(null);
    setStats(null);
    if (selectedEpisode) {
      setSelectedEpisode(null);
    } else {
      setView("detail");
    }
  }, [streamInfo, selectedEpisode, setView]);

  // ── Local file player ────────────────────────────────────────────────────────
  if (localFileUrl) {
    const isSmb = localFileUrl.startsWith("smb://");

    // SMB: show download overlay until file is cached locally
    if (isSmb && (smbLoading || smbError)) {
      return (
        <div className="flex-1 flex flex-col bg-black overflow-hidden">
          <div className="flex items-center gap-4 px-4 py-2 bg-bg-primary/90 border-b border-border text-xs text-text-secondary flex-shrink-0">
            <button onClick={() => { setLocalFileUrl(null); setView("folders"); }} className="btn-ghost py-1 px-2 text-xs">
              <ArrowLeft size={13} /> Volver
            </button>
            <span className="text-white font-medium truncate flex-1">{localFileTitle}</span>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center gap-4 bg-black">
            {smbError ? (
              <>
                <AlertCircle size={44} className="text-red-400" />
                <p className="text-red-300 text-sm font-semibold">Error accediendo al NAS</p>
                <p className="text-red-400/70 text-xs max-w-md text-center">{smbError}</p>
              </>
            ) : (
              <>
                <Loader2 size={48} className="animate-spin text-accent" />
                <p className="text-white font-semibold">Descargando del NAS…</p>
                <p className="text-text-secondary text-sm">El archivo se guardará en caché para reproducción instantánea la próxima vez</p>
              </>
            )}
          </div>
        </div>
      );
    }

    if (!effectiveLocalPath) return null;

    const localPlayUrl = [
      `http://127.0.0.1:7777/play/local`,
      `?path=${encodeURIComponent(effectiveLocalPath)}`,
      `&audio=${selectedAudio}`,
      startOffset > 0.5 ? `&start=${Math.floor(startOffset)}` : "",
    ].join("");

    const fmtTimeLocal = (s: number) => {
      if (!isFinite(s) || s < 0) return "0:00";
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const sec = Math.floor(s % 60);
      return h > 0
        ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
        : `${m}:${String(sec).padStart(2, "0")}`;
    };

    const doLocalSeek = (target: number) => {
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
      setIsBuffering(true);
      setStartOffset(Math.floor(t));
      setCurrentTime(t);
    };
    seekFn.current = doLocalSeek;

    const displayTime = isSeeking ? seekValue : currentTime;
    const pct = duration > 0 ? Math.min(displayTime / duration, 1) : 0;

    return (
      <div className="flex-1 flex flex-col bg-black overflow-hidden">
        <div className="flex items-center gap-4 px-4 py-2 bg-bg-primary/90 border-b border-border text-xs text-text-secondary flex-shrink-0">
          <button
            onClick={() => { setLocalFileUrl(null); setView("folders"); setStartOffset(0); }}
            className="btn-ghost py-1 px-2 text-xs"
          >
            <ArrowLeft size={13} /> Volver
          </button>
          <span className="text-white font-medium truncate flex-1">{localFileTitle}</span>
          <span className="text-accent/70 text-[10px] flex items-center gap-1">
            <FolderOpen size={11} /> Archivo local
          </span>
        </div>

        <div className="flex-1 relative bg-black overflow-hidden">
          {resumeToast && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 bg-bg-card/95 border border-border rounded-xl px-4 py-2 flex items-center gap-3 shadow-xl backdrop-blur-sm">
              <Play size={13} className="text-accent flex-shrink-0" />
              <span className="text-white text-xs">Reanudando desde <strong>{fmtTimestamp(resumeToast.at)}</strong></span>
              <button onClick={() => { setStartOffset(0); setCurrentTime(0); setResumeToast(null); }} className="text-text-muted hover:text-white text-xs underline">Reiniciar</button>
              <button onClick={() => setResumeToast(null)} className="text-text-muted hover:text-white ml-1"><X size={12} /></button>
            </div>
          )}
          <video
            key={`local-${effectiveLocalPath}-${startOffset}-${selectedAudio}`}
            ref={videoRef}
            src={localPlayUrl}
            autoPlay
            className="w-full h-full cursor-pointer"
            onClick={() => { const v = videoRef.current; if (!v) return; v.paused ? v.play() : v.pause(); }}
            onTimeUpdate={() => setCurrentTime(startOffset + (videoRef.current?.currentTime ?? 0))}
            onPlay={() => { setIsPlaying(true); setIsBuffering(false); }}
            onPause={() => setIsPlaying(false)}
            onWaiting={() => setIsBuffering(true)}
            onCanPlay={() => setIsBuffering(false)}
            onError={() => { setIsBuffering(false); setLocalVideoError(true); }}
            onVolumeChange={() => {
              if (!videoRef.current) return;
              setVolume(videoRef.current.volume);
              setIsMuted(videoRef.current.muted);
            }}
          >
            {extSubUrl && <track key={extSubUrl} src={extSubUrl} kind="subtitles" label="Externo" default />}
          </video>

          {(isBuffering || localVideoError) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60 pointer-events-none">
              {localVideoError ? (
                <>
                  <AlertCircle size={44} className="text-red-400" />
                  <p className="text-red-300 text-sm font-semibold">Error reproduciendo el archivo</p>
                  <p className="text-red-400/70 text-xs">El archivo no es accesible o el formato no es compatible</p>
                  <button
                    className="mt-1 px-4 py-1.5 rounded-lg text-xs font-medium bg-white/10 hover:bg-white/20 text-white transition-colors pointer-events-auto"
                    onClick={() => { setLocalVideoError(false); setIsBuffering(true); setStartOffset(0); setCurrentTime(0); }}
                  >
                    Reintentar
                  </button>
                </>
              ) : (
                <>
                  <Loader2 size={48} className="animate-spin text-accent" />
                  <p className="text-white/70 text-sm">Iniciando reproducción…</p>
                </>
              )}
            </div>
          )}

          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 to-transparent pt-8 pb-2 px-3 flex flex-col gap-1.5">
            {/* Seek bar */}
            <div className="relative h-5 flex items-center group">
              <div className="absolute inset-x-0 h-1 bg-white/20 rounded-full" />
              <div
                className="absolute left-0 h-1 bg-accent rounded-full pointer-events-none"
                style={{ width: `${Math.min(pct * 100, 100)}%` }}
              />
              <div
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 bg-white rounded-full shadow pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ left: `${Math.min(pct * 100, 100)}%` }}
              />
              <input
                type="range" min={0}
                max={duration > 0 ? Math.ceil(duration) : Math.max(Math.ceil(currentTime) + 300, 600)}
                step={1}
                value={Math.round(isSeeking ? seekValue : currentTime)}
                className="absolute inset-0 w-full opacity-0 cursor-pointer"
                onMouseDown={() => { setIsSeeking(true); setSeekValue(currentTime); }}
                onChange={(e) => setSeekValue(parseFloat(e.target.value))}
                onMouseUp={(e) => { doLocalSeek(parseFloat((e.target as HTMLInputElement).value)); setIsSeeking(false); }}
                onTouchEnd={(e) => { doLocalSeek(parseFloat((e.target as HTMLInputElement).value)); setIsSeeking(false); }}
              />
            </div>

            {/* Controls row */}
            <div className="flex items-center gap-2">
              <button
                className="text-white hover:text-accent transition-colors p-1"
                onClick={() => { const v = videoRef.current; if (!v) return; v.paused ? v.play() : v.pause(); }}
              >
                {isPlaying ? <Pause size={18} /> : <Play size={18} />}
              </button>
              <button className="text-white/70 hover:text-white text-xs font-medium px-1.5 py-0.5 transition-colors"
                      onClick={() => doLocalSeek(currentTime - 30)}>−30s</button>
              <button className="text-white/70 hover:text-white text-xs font-medium px-1.5 py-0.5 transition-colors"
                      onClick={() => doLocalSeek(currentTime - 10)}>−10s</button>
              <button className="text-white/70 hover:text-white text-xs font-medium px-1.5 py-0.5 transition-colors"
                      onClick={() => doLocalSeek(currentTime + 10)}>+10s</button>
              <button className="text-white/70 hover:text-white text-xs font-medium px-1.5 py-0.5 transition-colors"
                      onClick={() => doLocalSeek(currentTime + 30)}>+30s</button>
              <span className="text-white/80 text-xs font-mono ml-1 tabular-nums">
                {fmtTimeLocal(currentTime)}{duration > 0 ? ` / ${fmtTimeLocal(duration)}` : ""}
              </span>

              <div className="flex-1" />

              <button
                className="text-white/70 hover:text-white transition-colors p-1"
                onClick={() => { const v = videoRef.current; if (!v) return; v.muted = !v.muted; }}
              >
                {isMuted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </button>
              <input
                type="range" min={0} max={1} step={0.05} value={isMuted ? 0 : volume}
                className="w-16 cursor-pointer"
                style={{ accentColor: "rgb(var(--color-accent, 109 40 217))" }}
                onChange={(e) => {
                  const v = videoRef.current;
                  if (!v) return;
                  v.volume = parseFloat(e.target.value);
                  v.muted = parseFloat(e.target.value) === 0;
                }}
              />

              {tracks && tracks.audio.length > 1 && (
                <div className="relative">
                  <button
                    className="flex items-center gap-1 text-[11px] text-white/70 hover:text-white px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 transition-colors"
                    onClick={() => { setShowAudioMenu((v) => !v); setShowSubMenu(false); }}
                  >
                    <Volume2 size={10} />
                    {tracks.audio[selectedAudio]?.language ?? "Audio"}
                    <ChevronUp size={9} className={cn("transition-transform", showAudioMenu ? "" : "rotate-180")} />
                  </button>
                  {showAudioMenu && (
                    <div className="absolute bottom-full right-0 mb-1.5 bg-bg-card border border-border rounded-xl overflow-hidden shadow-2xl z-50 min-w-48">
                      {tracks.audio.map((t) => (
                        <button key={t.index}
                          className={cn("w-full text-left px-3 py-2 text-xs hover:bg-bg-hover transition-colors",
                            t.index === selectedAudio ? "text-accent font-semibold bg-accent/10" : "text-text-secondary")}
                          onClick={() => { setSelectedAudio(t.index); setShowAudioMenu(false); }}>
                          {t.label}<span className="ml-1.5 text-[9px] opacity-40">{t.codec}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <button
                className={cn("flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 transition-colors",
                  extSubUrl ? "text-green-400" : "text-white/70 hover:text-white")}
                onClick={() => setShowSubPanel((v) => !v)}
                title="Subtítulos externos"
              >
                <Subtitles size={12} /> CC
              </button>

              <button
                className="text-white/70 hover:text-white transition-colors p-1"
                onClick={() => {
                  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
                  else videoRef.current?.requestFullscreen().catch(() => {});
                }}
              >
                <Maximize2 size={15} />
              </button>
            </div>
          </div>

          <SubtitlePanel
            show={showSubPanel} lang={subLang} results={subResults}
            loading={subLoading} downloading={subDownloading} error={subError}
            extSubUrl={extSubUrl}
            onClose={() => setShowSubPanel(false)}
            onLangChange={setSubLang}
            onSearch={handleSubSearch}
            onSelect={handleSubtitleSelect}
            onClear={() => { if (extSubUrl) URL.revokeObjectURL(extSubUrl); setExtSubUrl(null); }}
          />
        </div>
      </div>
    );
  }

  if (!media) return null;

  // ── Plex direct player ───────────────────────────────────────────────────────
  if (plexDirectUrl) {
    // Build transcoded URL via local ffmpeg proxy (same pipeline as torrent player)
    const plexQParams = startOffset > 0.5 ? `&start=${startOffset}` : "";
    const plexTranscodeUrl = `http://127.0.0.1:7777/play/plex?url=${encodeURIComponent(plexDirectUrl)}${plexQParams}`;

    const fmtTimePlex = (s: number) => {
      if (!isFinite(s) || s < 0) return "0:00";
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const sec = Math.floor(s % 60);
      return h > 0
        ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
        : `${m}:${String(sec).padStart(2, "0")}`;
    };

    const effectiveDuration = duration > 0 ? duration : plexDirectDuration;

    const doPlexSeek = (target: number) => {
      const t = Math.max(0, effectiveDuration > 0 ? Math.min(target, effectiveDuration) : target);
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
      // Not buffered → restart ffmpeg from new position
      setIsBuffering(true);
      setStartOffset(Math.floor(t));
      setCurrentTime(t);
    };
    seekFn.current = doPlexSeek;

    const displayTime = isSeeking ? seekValue : currentTime;
    const pct = effectiveDuration > 0 ? Math.min(displayTime / effectiveDuration, 1) : 0;

    return (
      <div className="flex-1 flex flex-col bg-black overflow-hidden">
        <div className="flex items-center gap-4 px-4 py-2 bg-bg-primary/90 border-b border-border text-xs text-text-secondary flex-shrink-0">
          <button
            onClick={() => { setPlexDirectUrl(null); setView("detail"); setStartOffset(0); }}
            className="btn-ghost py-1 px-2 text-xs"
          >
            <ArrowLeft size={13} /> Volver
          </button>
          <span className="text-white font-medium truncate flex-1">{title}</span>
          <span className="text-orange-400/70 text-[10px] flex items-center gap-1">
            <Server size={11} /> Plex
          </span>
        </div>

        <div className="flex-1 relative bg-black overflow-hidden">
          {resumeToast && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 bg-bg-card/95 border border-border rounded-xl px-4 py-2 flex items-center gap-3 shadow-xl backdrop-blur-sm">
              <Play size={13} className="text-accent flex-shrink-0" />
              <span className="text-white text-xs">Reanudando desde <strong>{fmtTimestamp(resumeToast.at)}</strong></span>
              <button onClick={() => { setStartOffset(0); setCurrentTime(0); setResumeToast(null); }} className="text-text-muted hover:text-white text-xs underline">Reiniciar</button>
              <button onClick={() => setResumeToast(null)} className="text-text-muted hover:text-white ml-1"><X size={12} /></button>
            </div>
          )}
          <video
            key={`plex-${startOffset}`}
            ref={videoRef}
            src={plexTranscodeUrl}
            autoPlay
            className="w-full h-full cursor-pointer"
            onClick={() => { const v = videoRef.current; if (!v) return; v.paused ? v.play() : v.pause(); }}
            onTimeUpdate={() => setCurrentTime(startOffset + (videoRef.current?.currentTime ?? 0))}
            onPlay={() => { setIsPlaying(true); setIsBuffering(false); }}
            onPause={() => setIsPlaying(false)}
            onWaiting={() => setIsBuffering(true)}
            onCanPlay={() => setIsBuffering(false)}
            onError={() => { setIsBuffering(false); setPlexVideoError(true); }}
            onVolumeChange={() => {
              if (!videoRef.current) return;
              setVolume(videoRef.current.volume);
              setIsMuted(videoRef.current.muted);
            }}
          >
            {extSubUrl && <track key={extSubUrl} src={extSubUrl} kind="subtitles" label="Externo" default />}
          </video>
          {(isBuffering || plexVideoError) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60 pointer-events-none">
              {plexVideoError ? (
                <>
                  <AlertCircle size={44} className="text-red-400" />
                  <p className="text-red-300 text-sm font-semibold">Servidor Plex no disponible</p>
                  <p className="text-red-400/70 text-xs">El servidor se ha caído o no es accesible</p>
                  <button
                    className="mt-1 px-4 py-1.5 rounded-lg text-xs font-medium bg-white/10 hover:bg-white/20 text-white transition-colors pointer-events-auto"
                    onClick={() => { setPlexVideoError(false); setIsBuffering(true); setStartOffset(0); setCurrentTime(0); }}
                  >
                    Reintentar
                  </button>
                </>
              ) : (
                <>
                  <Loader2 size={48} className="animate-spin text-orange-400" />
                  <p className="text-white/70 text-sm">Iniciando transcodificación…</p>
                </>
              )}
            </div>
          )}

          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 to-transparent pt-8 pb-2 px-3 flex flex-col gap-1.5">
            {/* Seek bar */}
            <div className="relative h-5 flex items-center group">
              <div className="absolute inset-x-0 h-1 bg-white/20 rounded-full" />
              <div
                className="absolute left-0 h-1 bg-orange-400 rounded-full pointer-events-none"
                style={{ width: `${Math.min(pct * 100, 100)}%` }}
              />
              <div
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 bg-white rounded-full shadow pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ left: `${Math.min(pct * 100, 100)}%` }}
              />
              <input
                type="range" min={0}
                max={effectiveDuration > 0 ? Math.ceil(effectiveDuration) : Math.max(Math.ceil(currentTime) + 300, 600)}
                step={1}
                value={Math.round(isSeeking ? seekValue : currentTime)}
                className="absolute inset-0 w-full opacity-0 cursor-pointer"
                onMouseDown={() => { setIsSeeking(true); setSeekValue(currentTime); }}
                onChange={(e) => setSeekValue(parseFloat(e.target.value))}
                onMouseUp={(e) => { doPlexSeek(parseFloat((e.target as HTMLInputElement).value)); setIsSeeking(false); }}
                onTouchEnd={(e) => { doPlexSeek(parseFloat((e.target as HTMLInputElement).value)); setIsSeeking(false); }}
              />
            </div>

            {/* Controls row */}
            <div className="flex items-center gap-2">
              <button
                className="text-white hover:text-orange-400 transition-colors p-1"
                onClick={() => { const v = videoRef.current; if (!v) return; v.paused ? v.play() : v.pause(); }}
              >
                {isPlaying ? <Pause size={18} /> : <Play size={18} />}
              </button>
              <button className="text-white/70 hover:text-white text-xs font-medium px-1.5 py-0.5 transition-colors"
                      onClick={() => doPlexSeek(currentTime - 30)}>−30s</button>
              <button className="text-white/70 hover:text-white text-xs font-medium px-1.5 py-0.5 transition-colors"
                      onClick={() => doPlexSeek(currentTime - 10)}>−10s</button>
              <button className="text-white/70 hover:text-white text-xs font-medium px-1.5 py-0.5 transition-colors"
                      onClick={() => doPlexSeek(currentTime + 10)}>+10s</button>
              <button className="text-white/70 hover:text-white text-xs font-medium px-1.5 py-0.5 transition-colors"
                      onClick={() => doPlexSeek(currentTime + 30)}>+30s</button>
              <span className="text-white/80 text-xs font-mono ml-1 tabular-nums">
                {fmtTimePlex(currentTime)}{effectiveDuration > 0 ? ` / ${fmtTimePlex(effectiveDuration)}` : ""}
              </span>

              <div className="flex-1" />

              <button
                className="text-white/70 hover:text-white transition-colors p-1"
                onClick={() => { const v = videoRef.current; if (!v) return; v.muted = !v.muted; }}
              >
                {isMuted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </button>
              <input
                type="range" min={0} max={1} step={0.05} value={isMuted ? 0 : volume}
                className="w-16 cursor-pointer"
                style={{ accentColor: "rgb(251 146 60)" }}
                onChange={(e) => {
                  const v = videoRef.current;
                  if (!v) return;
                  v.volume = parseFloat(e.target.value);
                  v.muted = parseFloat(e.target.value) === 0;
                }}
              />
              <button
                className={cn("flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 transition-colors",
                  extSubUrl ? "text-green-400" : "text-white/70 hover:text-white")}
                onClick={() => setShowSubPanel((v) => !v)}
                title="Subtítulos externos"
              >
                <Subtitles size={12} /> CC
              </button>
              <button
                className="text-white/70 hover:text-white transition-colors p-1"
                onClick={() => {
                  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
                  else videoRef.current?.requestFullscreen().catch(() => {});
                }}
              >
                <Maximize2 size={15} />
              </button>
            </div>
          </div>

          <SubtitlePanel
            show={showSubPanel} lang={subLang} results={subResults}
            loading={subLoading} downloading={subDownloading} error={subError}
            extSubUrl={extSubUrl}
            onClose={() => setShowSubPanel(false)}
            onLangChange={setSubLang}
            onSearch={handleSubSearch}
            onSelect={handleSubtitleSelect}
            onClear={() => { if (extSubUrl) URL.revokeObjectURL(extSubUrl); setExtSubUrl(null); }}
          />
        </div>
      </div>
    );
  }

  // ── Streaming view ───────────────────────────────────────────────────────────
  if (streamInfo) {
    return (
      <div className="flex-1 flex flex-col bg-black overflow-hidden">
        <div className="flex items-center gap-4 px-4 py-2 bg-bg-primary/90 border-b border-border text-xs text-text-secondary flex-shrink-0">
          <button onClick={handleBack} className="btn-ghost py-1 px-2 text-xs">
            <ArrowLeft size={13} /> Volver
          </button>
          <span className="text-white font-medium truncate flex-1">
            {selectedEpisode
              ? `${title} · S${String(selectedEpisode.season_number).padStart(2,"0")}E${String(selectedEpisode.episode_number).padStart(2,"0")} · ${selectedEpisode.name}`
              : title}
          </span>
          {stats && (
            <>
              <span className={cn("flex items-center gap-1", stats.download_speed_mbps > 0 ? "text-green-400" : "text-yellow-400")}>
                <Wifi size={11} /> {stats.download_speed_mbps.toFixed(2)} MB/s
              </span>
              <span className="flex items-center gap-1"><Users size={11} /> {stats.peers} peers</span>
              <span className="flex items-center gap-1">
                {formatBytes(stats.downloaded_bytes)} / {formatBytes(stats.total_bytes)}
              </span>
              <div className="w-24 h-1.5 rounded-full bg-border overflow-hidden">
                <div className="h-full bg-accent rounded-full transition-all duration-500"
                     style={{ width: `${Math.min(stats.progress_percent, 100)}%` }} />
              </div>
            </>
          )}
        </div>

        <div className="flex-1 relative bg-black overflow-hidden">
          {videoReady && tracksReady ? (
            (() => {
              const mpvTitle = selectedEpisode
                ? `${title} S${String(selectedEpisode.season_number).padStart(2,"0")}E${String(selectedEpisode.episode_number).padStart(2,"0")}`
                : title;
              const serverBase = streamInfo.play_url.replace(/\/play\/.*$/, "");
              // Use raw stream URL with correct MIME type — h_stream has Content-Length + Range
              // support which WebKit/GStreamer needs to buffer and seek correctly.
              const rawUrl  = streamInfo.stream_url.replace(/\/\d+$/, `/${videoFileIdx}`);
              const playUrl = `${serverBase}/play/${streamInfo.id}/${videoFileIdx}?audio=${selectedAudio}`;
              const subUrl  = (selectedSub >= 0 && tracks?.subtitles[selectedSub]?.is_text)
                ? `${serverBase}/subtitle/${streamInfo.id}/${videoFileIdx}/${selectedSub}`
                : null;

              const displayTime = isSeeking ? seekValue : currentTime;
              const pct = duration > 0 ? Math.min(displayTime / duration, 1) : 0;

              const doSeek = (target: number) => {
                const t = Math.max(0, duration > 0 ? Math.min(target, duration) : target);
                const videoEl = videoRef.current;
                if (!videoEl) return;
                // Native seek: browser sends Range request to h_stream, which handles it
                videoEl.currentTime = t;
                setCurrentTime(t);
                setIsStreamBuffering(true); // clears on canPlay
              };
              seekFn.current = doSeek;

              const fmtTime = (s: number) => {
                if (!isFinite(s) || s < 0) return "0:00";
                const h = Math.floor(s / 3600);
                const m = Math.floor((s % 3600) / 60);
                const sec = Math.floor(s % 60);
                return h > 0
                  ? `${h}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`
                  : `${m}:${String(sec).padStart(2,"0")}`;
              };

              return (
                <>
                  {resumeToast && (
                    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 bg-bg-card/95 border border-border rounded-xl px-4 py-2 flex items-center gap-3 shadow-xl backdrop-blur-sm">
                      <Play size={13} className="text-accent flex-shrink-0" />
                      <span className="text-white text-xs">Reanudando desde <strong>{fmtTimestamp(resumeToast.at)}</strong></span>
                      <button onClick={() => setResumeToast(null)} className="text-text-muted hover:text-white ml-1"><X size={12} /></button>
                    </div>
                  )}
                  <video
                    key={`${streamInfo.id}-${videoFileIdx}`}
                    ref={videoRef}
                    src={playUrl}
                    autoPlay
                    className="w-full h-full cursor-pointer"
                    onClick={() => {
                      const v = videoRef.current;
                      if (!v) return;
                      v.paused ? v.play() : v.pause();
                    }}
                    onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime ?? 0)}
                    onPlay={() => { setIsPlaying(true); setIsStreamBuffering(false); }}
                    onPause={() => setIsPlaying(false)}
                    onWaiting={() => setIsStreamBuffering(true)}
                    onCanPlay={() => setIsStreamBuffering(false)}
                    onVolumeChange={() => {
                      if (!videoRef.current) return;
                      setVolume(videoRef.current.volume);
                      setIsMuted(videoRef.current.muted);
                    }}
                    onError={() => {
                      invoke("open_in_mpv", { url: rawUrl, title: mpvTitle }).catch(() => {});
                      setMpvLaunched(true);
                    }}
                  >
                    {subUrl && (
                      <track key={selectedSub} src={subUrl} kind="subtitles"
                        label={tracks?.subtitles[selectedSub]?.label ?? "Subtítulos"} default />
                    )}
                  </video>

                  {/* Buffering overlay for torrent stream stalls */}
                  {isStreamBuffering && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/50 pointer-events-none">
                      <Loader2 size={40} className="animate-spin text-accent" />
                      <p className="text-white/70 text-sm">Buffering…</p>
                    </div>
                  )}

                  {/* MPV fallback button */}
                  {!mpvLaunched ? (
                    <button
                      onClick={() => invoke("open_in_mpv", { url: rawUrl, title: mpvTitle })
                        .then(() => setMpvLaunched(true)).catch(() => {})}
                      className="absolute top-3 right-3 btn-ghost text-xs py-1 px-2 opacity-40 hover:opacity-100"
                      title="Abrir en MPV"
                    >
                      <Play size={11} /> MPV
                    </button>
                  ) : (
                    <div className="absolute top-3 right-3 text-xs text-accent/70 px-2">MPV abierto ✓</div>
                  )}

                  {/* ── Custom playback control bar ─────────────────────────────── */}
                  <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 to-transparent pt-8 pb-2 px-3 flex flex-col gap-1.5">

                    {/* Seek bar */}
                    <div className="relative h-5 flex items-center group">
                      {/* Track */}
                      <div className="absolute inset-x-0 h-1 bg-white/20 rounded-full" />
                      {/* Filled */}
                      <div className="absolute left-0 h-1 bg-accent rounded-full pointer-events-none transition-none"
                           style={{ width: `${Math.min(pct * 100, 100)}%` }} />
                      {/* Thumb — visible on hover */}
                      <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 bg-white rounded-full shadow pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"
                           style={{ left: `${Math.min(pct * 100, 100)}%` }} />
                      {/* Invisible range input for interaction */}
                      <input
                        type="range" min={0}
                        max={duration > 0 ? Math.ceil(duration) : Math.max(Math.ceil(currentTime) + 300, 600)}
                        step={1}
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
                      {/* Play / Pause */}
                      <button
                        className="text-white hover:text-accent transition-colors p-1"
                        onClick={() => { const v = videoRef.current; if (!v) return; v.paused ? v.play() : v.pause(); }}
                      >
                        {isPlaying ? <Pause size={18} /> : <Play size={18} />}
                      </button>

                      {/* Skip buttons */}
                      <button className="text-white/70 hover:text-white text-xs font-medium px-1.5 py-0.5 transition-colors"
                              onClick={() => doSeek(currentTime - 30)}>−30s</button>
                      <button className="text-white/70 hover:text-white text-xs font-medium px-1.5 py-0.5 transition-colors"
                              onClick={() => doSeek(currentTime - 10)}>−10s</button>
                      <button className="text-white/70 hover:text-white text-xs font-medium px-1.5 py-0.5 transition-colors"
                              onClick={() => doSeek(currentTime + 10)}>+10s</button>
                      <button className="text-white/70 hover:text-white text-xs font-medium px-1.5 py-0.5 transition-colors"
                              onClick={() => doSeek(currentTime + 30)}>+30s</button>

                      {/* Time */}
                      <span className="text-white/80 text-xs font-mono ml-1 tabular-nums">
                        {fmtTime(currentTime)}{duration > 0 ? ` / ${fmtTime(duration)}` : ""}
                      </span>

                      <div className="flex-1" />

                      {/* Volume */}
                      <button
                        className="text-white/70 hover:text-white transition-colors p-1"
                        onClick={() => { const v = videoRef.current; if (!v) return; v.muted = !v.muted; }}
                      >
                        {isMuted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
                      </button>
                      <input
                        type="range" min={0} max={1} step={0.05} value={isMuted ? 0 : volume}
                        className="w-16 cursor-pointer"
                        style={{ accentColor: "rgb(var(--color-accent, 109 40 217))" }}
                        onChange={(e) => {
                          const v = videoRef.current;
                          if (!v) return;
                          v.volume = parseFloat(e.target.value);
                          v.muted  = parseFloat(e.target.value) === 0;
                        }}
                      />

                      {/* Track selectors */}
                      {tracks && tracks.audio.length > 1 && (
                        <div className="relative">
                          <button
                            className="flex items-center gap-1 text-[11px] text-white/70 hover:text-white px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 transition-colors"
                            onClick={() => { setShowAudioMenu((v) => !v); setShowSubMenu(false); }}
                          >
                            <Volume2 size={10} />
                            {tracks.audio[selectedAudio]?.language ?? "Audio"}
                            <ChevronUp size={9} className={cn("transition-transform", showAudioMenu ? "" : "rotate-180")} />
                          </button>
                          {showAudioMenu && (
                            <div className="absolute bottom-full right-0 mb-1.5 bg-bg-card border border-border rounded-xl overflow-hidden shadow-2xl z-50 min-w-48">
                              {tracks.audio.map((t) => (
                                <button key={t.index}
                                  className={cn("w-full text-left px-3 py-2 text-xs hover:bg-bg-hover transition-colors",
                                    t.index === selectedAudio ? "text-accent font-semibold bg-accent/10" : "text-text-secondary")}
                                  onClick={() => { setSelectedAudio(t.index); setShowAudioMenu(false); }}>
                                  {t.label}<span className="ml-1.5 text-[9px] opacity-40">{t.codec}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {tracks && tracks.subtitles.length > 0 && (
                        <div className="relative">
                          <button
                            className="flex items-center gap-1 text-[11px] text-white/70 hover:text-white px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 transition-colors"
                            onClick={() => { setShowSubMenu((v) => !v); setShowAudioMenu(false); }}
                          >
                            <FileText size={10} />
                            {selectedSub === -1 ? "CC" : (tracks.subtitles[selectedSub]?.language ?? "CC")}
                            <ChevronUp size={9} className={cn("transition-transform", showSubMenu ? "" : "rotate-180")} />
                          </button>
                          {showSubMenu && (
                            <div className="absolute bottom-full right-0 mb-1.5 bg-bg-card border border-border rounded-xl overflow-hidden shadow-2xl z-50 min-w-48">
                              <button
                                className={cn("w-full text-left px-3 py-2 text-xs hover:bg-bg-hover transition-colors",
                                  selectedSub === -1 ? "text-accent font-semibold bg-accent/10" : "text-text-secondary")}
                                onClick={() => { setSelectedSub(-1); setShowSubMenu(false); }}>
                                Sin subtítulos
                              </button>
                              {tracks.subtitles.map((t) => (
                                <button key={t.index} disabled={!t.is_text}
                                  className={cn("w-full text-left px-3 py-2 text-xs hover:bg-bg-hover transition-colors",
                                    !t.is_text && "opacity-40 cursor-not-allowed",
                                    t.index === selectedSub ? "text-accent font-semibold bg-accent/10" : "text-text-secondary")}
                                  title={!t.is_text ? `${t.codec} — gráfico, no compatible` : ""}
                                  onClick={() => { if (t.is_text) { setSelectedSub(t.index); setShowSubMenu(false); } }}>
                                  {t.label}<span className="ml-1.5 text-[9px] opacity-40">{t.is_text ? t.codec : `${t.codec} ✗`}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* External subtitles */}
                      <button
                        className={cn("flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 transition-colors",
                          extSubUrl ? "text-green-400" : "text-white/70 hover:text-white")}
                        onClick={() => setShowSubPanel((v) => !v)}
                        title="Subtítulos externos"
                      >
                        <Subtitles size={12} /> CC ext
                      </button>

                      {/* Fullscreen */}
                      <button
                        className="text-white/70 hover:text-white transition-colors p-1"
                        onClick={() => {
                          if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
                          else videoRef.current?.requestFullscreen().catch(() => {});
                        }}
                      >
                        <Maximize2 size={15} />
                      </button>
                    </div>
                  </div>

                  <SubtitlePanel
                    show={showSubPanel} lang={subLang} results={subResults}
                    loading={subLoading} downloading={subDownloading} error={subError}
                    extSubUrl={extSubUrl}
                    onClose={() => setShowSubPanel(false)}
                    onLangChange={setSubLang}
                    onSearch={handleSubSearch}
                    onSelect={handleSubtitleSelect}
                    onClear={() => { if (extSubUrl) URL.revokeObjectURL(extSubUrl); setExtSubUrl(null); }}
                  />
                </>
              );
            })()
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black">
              <Loader2 size={48} className="animate-spin text-accent" />
              <div className="text-center max-w-md px-6">
                <p className="text-white font-semibold text-lg">
                  {!stats || stats.total_bytes === 0
                    ? "Resolviendo metadata del torrent..."
                    : stats.download_speed_mbps > 0
                    ? "Descargando buffer inicial..."
                    : stats.peers > 0
                    ? "Peers conectados, esperando datos..."
                    : "Conectando con peers..."}
                </p>
                <p className="text-text-secondary text-sm mt-2">
                  {stats && stats.total_bytes > 0
                    ? `${stats.peers} peers · ${stats.download_speed_mbps.toFixed(2)} MB/s · ${formatBytes(stats.downloaded_bytes)} de ${formatBytes(stats.total_bytes)}`
                    : "Obteniendo info del torrent desde los peers..."}
                </p>
                {stats && stats.total_bytes > 0 && (
                  <div className="mt-3 w-64 h-1.5 rounded-full bg-border overflow-hidden mx-auto">
                    <div className="h-full bg-accent rounded-full transition-all duration-500"
                         style={{ width: `${Math.min((stats.downloaded_bytes / stats.total_bytes) * 100, 100)}%` }} />
                  </div>
                )}
              </div>
              <button onClick={handleCancelStream} className="btn-ghost flex items-center gap-2">
                <X size={14} /> Cancelar y elegir otra fuente
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Series: Season tabs + Episode list (when no episode selected yet) ───────
  if (isSeries && !selectedEpisode) {
    return (
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <button onClick={() => setView("detail")} className="btn-ghost mb-5 -ml-2">
          <ArrowLeft size={16} /> Volver
        </button>

        <h1 className="text-white text-xl font-bold mb-1">{title}</h1>
        <p className="text-text-secondary text-sm mb-5">Selecciona una temporada y un episodio</p>

        {bufferError && (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-sm max-w-4xl mb-4">
            <AlertCircle size={18} className="flex-shrink-0" />
            {bufferError}
          </div>
        )}

        {/* Season tabs */}
        {seasons.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-6">
            {seasons.map((s: any) => (
              <button
                key={s.id}
                onClick={() => setSelectedSeason(s.season_number)}
                className={cn(
                  "px-4 py-2 rounded-full text-sm font-medium transition-colors border",
                  s.season_number === selectedSeason
                    ? "bg-accent text-white border-accent"
                    : "bg-bg-card text-text-secondary border-border hover:bg-bg-hover"
                )}
              >
                Temporada {s.season_number}
                <span className="ml-2 text-[10px] opacity-70">({s.episode_count})</span>
              </button>
            ))}
          </div>
        )}

        {/* Episode list */}
        {loadingEpisodes && (
          <div className="flex justify-center py-10">
            <Loader2 size={32} className="animate-spin text-accent" />
          </div>
        )}

        {!loadingEpisodes && episodes.length > 0 && (
          <div className="space-y-2 max-w-4xl">
            {episodes.map((ep) => (
              <div
                key={ep.id}
                onClick={() => setSelectedEpisode(ep)}
                className="flex items-center gap-4 p-3 rounded-xl border bg-bg-card border-border hover:border-accent/50 hover:bg-bg-hover cursor-pointer transition-all"
              >
                {ep.still_path && (
                  <img
                    src={`${TMDB_IMAGE_BASE}/w300${ep.still_path}`}
                    alt=""
                    className="w-32 h-18 object-cover rounded-md flex-shrink-0"
                    style={{ aspectRatio: "16/9" }}
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-text-muted text-xs font-mono">
                      S{String(ep.season_number).padStart(2,"0")}E{String(ep.episode_number).padStart(2,"0")}
                    </span>
                    <h3 className="text-white text-sm font-medium truncate">{ep.name}</h3>
                  </div>
                  {ep.air_date && (
                    <p className="text-text-muted text-xs flex items-center gap-1 mt-1">
                      <Calendar size={10} /> {ep.air_date}
                    </p>
                  )}
                  {ep.overview && (
                    <p className="text-text-secondary text-xs mt-1 line-clamp-2">{ep.overview}</p>
                  )}
                </div>
                <button className="btn-primary py-1.5 px-3 text-xs flex-shrink-0">
                  <Play size={12} className="fill-white" /> Ver
                </button>
              </div>
            ))}
          </div>
        )}

        {!loadingEpisodes && episodes.length === 0 && selectedSeason != null && (
          <div className="flex flex-col items-center justify-center py-16 text-text-muted gap-3">
            <AlertCircle size={40} className="opacity-30" />
            <p className="text-sm">No hay episodios disponibles para esta temporada</p>
          </div>
        )}
      </div>
    );
  }

  // ── Source Selector (movies, or series with selected episode) ────────────────
  const subtitleLabel = isSeries && selectedEpisode
    ? `Temporada ${selectedEpisode.season_number} · Episodio ${selectedEpisode.episode_number} · ${selectedEpisode.name}`
    : "Selecciona una fuente para reproducir";

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5">
      <button onClick={handleBack} className="btn-ghost mb-5 -ml-2">
        <ArrowLeft size={16} /> {isSeries ? "Otros episodios" : "Volver"}
      </button>

      <h1 className="text-white text-xl font-bold mb-1">{title}</h1>
      <p className="text-text-secondary text-sm mb-6">{subtitleLabel}</p>

      {connecting && (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <Loader2 size={40} className="animate-spin text-accent" />
          <p className="text-white font-medium">Conectando al torrent...</p>
          <p className="text-text-secondary text-sm">Buscando peers y descargando piezas iniciales</p>
        </div>
      )}

      {!connecting && loadingSources && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Loader2 size={32} className="animate-spin text-accent" />
          <p className="text-text-secondary text-sm">Buscando fuentes...</p>
        </div>
      )}

      {bufferError && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-sm max-w-xl mb-4">
          <AlertCircle size={18} className="flex-shrink-0" />
          {bufferError}
        </div>
      )}

      {!connecting && !loadingSources && sourcesError && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm max-w-xl">
          <AlertCircle size={18} className="flex-shrink-0" />
          {sourcesError}
        </div>
      )}

      {!connecting && !loadingSources && !sourcesError && sources.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-text-muted gap-3">
          <AlertCircle size={40} className="opacity-30" />
          <p className="text-sm">No se encontraron fuentes para este episodio</p>
        </div>
      )}

      {!connecting && !loadingSources && sources.length > 0 && (
        <div className="space-y-2 max-w-2xl">
          {sources.map((s, i) => (
            <div
              key={i}
              className="flex items-center gap-4 p-4 rounded-xl border bg-bg-card border-border hover:border-accent/50 hover:bg-bg-hover cursor-pointer transition-all duration-150"
              onClick={() => handlePlay(s)}
            >
              <QualityBadge q={s.quality} />
              <LangBadge lang={s.language} />
              <CodecBadge codec={s.codec} />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-white text-sm font-medium truncate">{s.title}</p>
                  {s.seeds === 0 && (
                    <span className="flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-red-500/20 text-red-400 border-red-500/40">
                      muerto
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1">
                  <span className="flex items-center gap-1 text-text-muted text-xs">
                    <HardDrive size={11} /> {s.size}
                  </span>
                  <span className={cn(
                    "flex items-center gap-1 text-xs",
                    s.seeds === 0 ? "text-red-400" : s.seeds < 5 ? "text-yellow-400" : "text-green-400"
                  )}>
                    <Wifi size={11} /> {s.seeds} seeds
                  </span>
                  <span className="flex items-center gap-1 text-text-muted text-xs">
                    <Users size={11} /> {s.peers}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-[10px] font-medium text-text-muted bg-bg-secondary px-2 py-1 rounded border border-border">
                  {s.provider}
                </span>
                <button className="btn-primary py-1.5 px-3 text-xs">
                  <Play size={12} className="fill-white" /> Play
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
