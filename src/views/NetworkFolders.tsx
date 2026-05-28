import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  FolderOpen, FolderPlus, ChevronRight, Play, Trash2,
  ArrowLeft, Loader2, AlertCircle, HardDrive, Film, Music,
  Search, ArrowUpDown, LayoutGrid, List, Star, X, ImagePlus,
} from "lucide-react";
import { useStore } from "../store/useStore";
import { cn, getPosterUrl } from "../lib/utils";
import { TMDB_FALLBACK_KEY, useMediaDetail } from "../hooks/useTmdb";
import type { FolderEntry, SavedFolder } from "../types";
import type { Media } from "../types";

type SortKey = "name-asc" | "name-desc" | "ext" | "dirs-first" | "rating-desc" | "rating-asc";
type TypeFilter = "all" | "video" | "audio" | "dirs";

const VIDEO_EXTS = new Set(["mkv", "mp4", "avi", "m4v", "mov", "ts", "wmv", "webm", "m2ts", "mpg", "mpeg"]);
const AUDIO_EXTS = new Set(["flac", "mp3", "aac", "m4a", "ogg", "wav", "opus"]);
const TMDB_BASE = "https://api.themoviedb.org/3";
const LS_CACHE_KEY = "folders-poster-cache";
const LS_OVERRIDE_KEY = "folders-poster-overrides";

// ── Filename → title + year ──────────────────────────────────────────────────
function parseFilename(filename: string): { title: string; year?: number } {
  let s = filename.replace(/\.[a-z0-9]{2,5}$/i, "");

  const yearMatch = s.match(/\b((?:19|20)\d{2})\b/);
  const year = yearMatch ? parseInt(yearMatch[1]) : undefined;
  if (yearMatch?.index !== undefined) s = s.slice(0, yearMatch.index);

  s = s.replace(/\[.*?\]/g, " ").replace(/\(.*?\)/g, " ");
  s = s.replace(/[._]/g, " ");
  s = s.replace(/\b(?:4K|UHD|BluRay|BDRip|BRRip|DVDRip|HDRip|WEBRip|WEB[-.]DL|HDTV|x264|x265|HEVC|H\.?26[45]|AAC|AC3|DTS|HDR10?|SDR|Remux|REPACK|PROPER|EXTENDED|THEATRICAL|IMAX|2160p|1080p|720p|480p)\b.*/gi, "");
  s = s.replace(/^\d{4}\s*[-–]\s*/, "");
  s = s.trim().replace(/\s+/g, " ").replace(/^[-–\s]+|[-–\s]+$/g, "").trim();
  return { title: s || filename.replace(/\.[^.]+$/, ""), year };
}

// ── LocalStorage helpers ─────────────────────────────────────────────────────
function lsLoad<T>(key: string): Map<string, T | null> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Map();
    return new Map(Object.entries(JSON.parse(raw) as Record<string, T | null>));
  } catch { return new Map(); }
}

function lsSave(key: string, map: Map<string, unknown>) {
  try {
    localStorage.setItem(key, JSON.stringify(Object.fromEntries(map)));
  } catch {}
}

// ── Module-level caches (persist across folder navigations + app restarts) ───
const tmdbCache: Map<string, Media | null> = lsLoad<Media>(LS_CACHE_KEY);
const posterOverrides: Map<string, Media> = new Map(
  [...lsLoad<Media>(LS_OVERRIDE_KEY).entries()].filter(([, v]) => v !== null) as [string, Media][]
);

// ── TMDB search helpers ───────────────────────────────────────────────────────
async function searchTmdb(
  title: string,
  year: number | undefined,
  apiKey: string,
  signal?: AbortSignal,
): Promise<Media | null> {
  if (!title.trim()) return null;
  const yearParam = year ? `&year=${year}` : "";
  const url = `${TMDB_BASE}/search/movie?query=${encodeURIComponent(title)}${yearParam}&language=es-ES&api_key=${apiKey}`;
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const data: { results: Media[] } = await res.json();
    return data.results.find((m) => m.poster_path) ?? data.results[0] ?? null;
  } catch {
    return null;
  }
}

async function searchTmdbMulti(
  title: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<Media[]> {
  if (!title.trim()) return [];
  try {
    const res = await fetch(
      `${TMDB_BASE}/search/movie?query=${encodeURIComponent(title)}&language=es-ES&api_key=${apiKey}`,
      { signal }
    );
    if (!res.ok) return [];
    const data: { results: Media[] } = await res.json();
    return data.results.filter((m) => m.poster_path).slice(0, 8);
  } catch {
    return [];
  }
}

// ── Poster picker modal ───────────────────────────────────────────────────────
function PosterPickerModal({
  entry, apiKey, onPick, onClose,
}: {
  entry: FolderEntry;
  apiKey: string;
  onPick: (media: Media) => void;
  onClose: () => void;
}) {
  const parsed = parseFilename(entry.name);
  const [query, setQuery] = useState(parsed.title);
  const [results, setResults] = useState<Media[]>([]);
  const [searching, setSearching] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setSearching(true);
    try {
      const res = await searchTmdbMulti(q, apiKey, ctrl.signal);
      if (!ctrl.signal.aborted) setResults(res);
    } finally {
      if (!ctrl.signal.aborted) setSearching(false);
    }
  }, [apiKey]);

  useEffect(() => {
    doSearch(parsed.title);
    return () => abortRef.current?.abort();
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-bg-card border border-border rounded-2xl p-5 w-[500px] max-h-[80vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <div>
            <p className="text-white font-semibold text-sm">Cambiar carátula</p>
            <p className="text-text-muted text-[11px] truncate max-w-[360px]">{entry.name}</p>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-white transition-colors p-1">
            <X size={16} />
          </button>
        </div>

        <div className="flex gap-2 mb-4 flex-shrink-0">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") doSearch(query); }}
            className="flex-1 bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-text-muted focus:outline-none focus:border-accent"
            placeholder="Buscar en TMDB..."
            autoFocus
          />
          <button
            onClick={() => doSearch(query)}
            disabled={searching}
            className="btn-primary px-3 py-2 text-xs flex items-center gap-1.5 disabled:opacity-50"
          >
            {searching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {searching && (
            <div className="flex justify-center py-10">
              <Loader2 size={28} className="animate-spin text-accent" />
            </div>
          )}
          {!searching && results.length === 0 && (
            <p className="text-text-muted text-sm text-center py-10">Sin resultados</p>
          )}
          {!searching && results.length > 0 && (
            <div className="grid grid-cols-4 gap-2.5">
              {results.map((m) => (
                <button
                  key={m.id}
                  onClick={() => onPick(m)}
                  className="group text-left"
                >
                  <div className="aspect-[2/3] rounded-lg overflow-hidden bg-bg-secondary relative">
                    {m.poster_path ? (
                      <img
                        src={getPosterUrl(m.poster_path, "w185") ?? undefined}
                        alt={m.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Film size={24} className="text-text-muted" />
                      </div>
                    )}
                    <div className="absolute inset-0 ring-2 ring-accent ring-offset-0 opacity-0 group-hover:opacity-100 rounded-lg transition-opacity" />
                  </div>
                  <p className="text-text-primary text-[10px] mt-1 truncate leading-tight">{m.title}</p>
                  {m.release_date && (
                    <p className="text-text-muted text-[9px]">{m.release_date.slice(0, 4)}</p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Local poster card ────────────────────────────────────────────────────────
function LocalPosterCard({
  entry, media, onPlay, onChangePoster,
}: {
  entry: FolderEntry;
  media: Media | null | undefined;
  onPlay: () => void;
  onChangePoster: () => void;
}) {
  const parsed = parseFilename(entry.name);
  const title = media?.title ?? parsed.title;
  const year = media?.release_date
    ? media.release_date.slice(0, 4)
    : parsed.year ? String(parsed.year) : "";
  const poster = media?.poster_path ? getPosterUrl(media.poster_path) : null;
  const rating = media?.vote_average ?? 0;

  return (
    <div className="media-card group w-[140px] flex-shrink-0 cursor-pointer" onClick={onPlay}>
      <div className="relative w-full aspect-[2/3]">
        {poster ? (
          <img src={poster} alt={title} className="w-full h-full object-cover" loading="lazy" />
        ) : media === undefined ? (
          <div className="w-full h-full flex items-center justify-center bg-bg-secondary">
            <Loader2 size={20} className="animate-spin text-text-muted/50" />
          </div>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-bg-secondary px-2">
            <Film size={28} className="text-text-muted" />
            <p className="text-text-muted text-[9px] text-center leading-tight line-clamp-3">{title}</p>
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-card opacity-0 group-hover:opacity-100 transition-opacity duration-200" />

        {rating > 0 && (
          <div className="absolute bottom-2 left-2 flex items-center gap-1">
            <Star size={10} className="text-yellow-400 fill-yellow-400" />
            <span className="text-[11px] font-semibold text-yellow-400">{rating.toFixed(1)}</span>
          </div>
        )}

        {/* Change poster button */}
        <button
          onClick={(e) => { e.stopPropagation(); onChangePoster(); }}
          title="Cambiar carátula"
          className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity bg-black/70 rounded-md p-1 hover:bg-black/90 z-10"
        >
          <ImagePlus size={11} className="text-white" />
        </button>

        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <div className="bg-accent/90 rounded-full p-2.5 shadow-lg">
            <Play size={16} className="fill-white text-white" />
          </div>
        </div>
      </div>

      <div className="p-2">
        <p className="text-text-primary text-xs font-medium truncate">{title}</p>
        {year && <p className="text-text-muted text-[10px] mt-0.5">{year}</p>}
      </div>
    </div>
  );
}

function fileIcon(ext: string) {
  if (VIDEO_EXTS.has(ext)) return <Film size={14} className="text-accent flex-shrink-0" />;
  if (AUDIO_EXTS.has(ext)) return <Music size={14} className="text-green-400 flex-shrink-0" />;
  return <HardDrive size={14} className="text-text-muted flex-shrink-0" />;
}

function maskSmbPath(path: string): string {
  if (!path.startsWith("smb://")) return path;
  const withoutScheme = path.slice(6);
  const at = withoutScheme.indexOf("@");
  if (at < 0) return path;
  const creds = withoutScheme.slice(0, at);
  const colon = creds.indexOf(":");
  const user = colon >= 0 ? creds.slice(0, colon) : creds;
  return `smb://${user}@${withoutScheme.slice(at + 1)}`;
}

export function NetworkFolders() {
  const { setView, setLocalFileUrl, settings, folderBrowseStack: browseStack, setFolderBrowseStack, setDetailReturnView } = useStore();
  const { fetchDetail } = useMediaDetail();
  const apiKey = settings.tmdbApiKey || TMDB_FALLBACK_KEY;

  const [savedFolders, setSavedFolders] = useState<SavedFolder[]>([]);
  const [entries, setEntries] = useState<FolderEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("dirs-first");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [viewMode, setViewMode] = useState<"list" | "gallery">(() =>
    (localStorage.getItem("folders-view-mode") as "list" | "gallery") ?? "list"
  );
  const [minRating, setMinRating] = useState(0);
  const [tmdbMap, setTmdbMap] = useState<Map<string, Media | null>>(new Map());
  const [pickerEntry, setPickerEntry] = useState<FolderEntry | null>(null);

  const tmdbCacheRef = useRef(tmdbCache);
  const posterOverridesRef = useRef(posterOverrides);

  const visibleEntries = useMemo(() => {
    let list = entries;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((e) => e.name.toLowerCase().includes(q));
    }
    if (typeFilter === "video") list = list.filter((e) => !e.is_dir && VIDEO_EXTS.has(e.extension));
    else if (typeFilter === "audio") list = list.filter((e) => !e.is_dir && AUDIO_EXTS.has(e.extension));
    else if (typeFilter === "dirs") list = list.filter((e) => e.is_dir);

    const getRating = (e: FolderEntry) =>
      posterOverridesRef.current.get(e.path)?.vote_average ??
      tmdbMap.get(e.path)?.vote_average ?? 0;

    list = [...list].sort((a, b) => {
      if (sortKey === "dirs-first") {
        if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
        return a.name.localeCompare(b.name);
      }
      if (sortKey === "name-asc") return a.name.localeCompare(b.name);
      if (sortKey === "name-desc") return b.name.localeCompare(a.name);
      if (sortKey === "ext") {
        if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
        return a.extension.localeCompare(b.extension) || a.name.localeCompare(b.name);
      }
      if (sortKey === "rating-desc") {
        if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
        return getRating(b) - getRating(a) || a.name.localeCompare(b.name);
      }
      if (sortKey === "rating-asc") {
        if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
        return getRating(a) - getRating(b) || a.name.localeCompare(b.name);
      }
      return 0;
    });
    return list;
  }, [entries, search, sortKey, typeFilter, tmdbMap]);

  const dirEntries = useMemo(() => visibleEntries.filter((e) => e.is_dir), [visibleEntries]);
  const videoEntries = useMemo(() => {
    let list = visibleEntries.filter((e) => !e.is_dir && VIDEO_EXTS.has(e.extension));
    if (minRating > 0) {
      list = list.filter((e) => {
        const override = posterOverridesRef.current.get(e.path);
        const rating = (override ?? tmdbMap.get(e.path))?.vote_average ?? 0;
        return rating >= minRating;
      });
    }
    return list;
  }, [visibleEntries, minRating, tmdbMap]);

  // Fetch TMDB posters when gallery mode is active
  useEffect(() => {
    if (viewMode !== "gallery") return;
    const vids = entries.filter((e) => !e.is_dir && VIDEO_EXTS.has(e.extension));
    if (vids.length === 0) return;

    // Seed map from persistent cache (localStorage was loaded at module init)
    setTmdbMap(new Map(tmdbCacheRef.current));

    const controller = new AbortController();
    const uncached = vids.filter((e) => !tmdbCacheRef.current.has(e.path));

    if (uncached.length === 0) return;

    (async () => {
      const BATCH = 8;
      for (let i = 0; i < uncached.length; i += BATCH) {
        if (controller.signal.aborted) break;
        await Promise.all(
          uncached.slice(i, i + BATCH).map(async (entry) => {
            const { title, year } = parseFilename(entry.name);
            const result = await searchTmdb(title, year, apiKey, controller.signal);
            if (!controller.signal.aborted) {
              tmdbCacheRef.current.set(entry.path, result ?? null);
            }
          })
        );
        if (!controller.signal.aborted) {
          // Persist new entries to localStorage after each batch
          lsSave(LS_CACHE_KEY, tmdbCacheRef.current);
          setTmdbMap(new Map(tmdbCacheRef.current));
        }
      }
    })();

    return () => controller.abort();
  }, [viewMode, entries, apiKey]);

  // Handle manual poster pick
  const handlePickPoster = useCallback((media: Media) => {
    if (!pickerEntry) return;
    posterOverridesRef.current.set(pickerEntry.path, media);
    lsSave(LS_OVERRIDE_KEY, posterOverridesRef.current as unknown as Map<string, unknown>);
    // Also update tmdbMap so it renders immediately
    setTmdbMap((prev) => {
      const next = new Map(prev);
      next.set(pickerEntry.path, media);
      return next;
    });
    setPickerEntry(null);
  }, [pickerEntry]);

  // Add-folder form
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState("");
  const [addPath, setAddPath] = useState("");
  const [addSmbUser, setAddSmbUser] = useState("");
  const [addSmbPass, setAddSmbPass] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkOk, setCheckOk] = useState(false);
  const pathInputRef = useRef<HTMLInputElement>(null);

  const isSmb = addPath.trimStart().startsWith("smb://");
  const isWindows = navigator.userAgent.includes("Windows");

  useEffect(() => {
    invoke<SavedFolder[]>("get_saved_folders")
      .then(setSavedFolders)
      .catch(() => {});
  }, []);

  // Restore folder contents when returning from player
  useEffect(() => {
    if (browseStack.length > 0 && entries.length === 0) {
      const top = browseStack[browseStack.length - 1];
      openFolder(top.path, top.name, false);
    }
  }, []);

  const openFolder = async (path: string, name: string, push = true) => {
    setError(null);
    setLoading(true);
    setSearch("");
    setTypeFilter("all");
    setMinRating(0);
    try {
      const result = await invoke<FolderEntry[]>("browse_folder", { path });
      setEntries(result);
      if (push) setFolderBrowseStack([...browseStack, { path, name }]);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const goBack = () => {
    if (browseStack.length <= 1) {
      setFolderBrowseStack([]);
      setEntries([]);
      return;
    }
    const newStack = browseStack.slice(0, -1);
    setFolderBrowseStack(newStack);
    const prev = newStack[newStack.length - 1];
    openFolder(prev.path, prev.name, false);
  };

  const buildFullPath = () => {
    const base = addPath.trim();
    if (!base.startsWith("smb://")) return base;
    const withoutScheme = base.slice(6).replace(/^[^@]*@/, "");
    const user = addSmbUser.trim();
    const pass = addSmbPass;
    if (!user) return `smb://${withoutScheme}`;
    if (!pass) return `smb://${user}@${withoutScheme}`;
    return `smb://${user}:${pass}@${withoutScheme}`;
  };

  const handleAddFolder = async () => {
    const fullPath = buildFullPath();
    if (!fullPath) return;
    setChecking(true);
    setAddError(null);
    setCheckOk(false);
    try {
      await invoke("add_folder", {
        path: fullPath,
        name: addName.trim() || fullPath.split(/[/\\]/).filter(Boolean).pop() || fullPath,
      });
      const folders = await invoke<SavedFolder[]>("get_saved_folders");
      setSavedFolders(folders);
      setCheckOk(true);
      setTimeout(() => {
        setShowAdd(false);
        setAddName("");
        setAddPath("");
        setAddSmbUser("");
        setAddSmbPass("");
        setCheckOk(false);
      }, 800);
    } catch (e) {
      setCheckOk(false);
      setAddError(String(e));
    } finally {
      setChecking(false);
    }
  };

  const handleRemoveFolder = async (path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await invoke("remove_folder", { path }).catch(() => {});
    setSavedFolders((prev) => prev.filter((f) => f.path !== path));
  };

  const playFile = (entry: FolderEntry) => {
    setLocalFileUrl(entry.path, entry.name);
    setView("player");
  };

  const openEntry = async (entry: FolderEntry) => {
    const override = posterOverridesRef.current.get(entry.path);
    const tmdb = override ?? tmdbMap.get(entry.path) ?? null;
    if (tmdb?.id && VIDEO_EXTS.has(entry.extension)) {
      setLocalFileUrl(entry.path, entry.name);
      setDetailReturnView("folders");
      await fetchDetail(tmdb.id, "movie");
      setView("detail");
    } else {
      playFile(entry);
    }
  };

  const toggleView = () => {
    setViewMode((v) => {
      const next = v === "list" ? "gallery" : "list";
      localStorage.setItem("folders-view-mode", next);
      return next;
    });
  };

  const Breadcrumb = () => (
    <div className="flex items-center gap-1 text-xs text-text-muted min-w-0 overflow-hidden">
      <button
        onClick={() => { setFolderBrowseStack([]); setEntries([]); }}
        className="hover:text-white transition-colors flex-shrink-0"
      >
        Mis Carpetas
      </button>
      {browseStack.map((seg, i) => (
        <span key={i} className="flex items-center gap-1 min-w-0">
          <ChevronRight size={11} className="flex-shrink-0" />
          <button
            className={cn(
              "truncate hover:text-white transition-colors",
              i === browseStack.length - 1 ? "text-white" : ""
            )}
            onClick={() => {
              const newStack = browseStack.slice(0, i + 1);
              setFolderBrowseStack(newStack);
              openFolder(newStack[newStack.length - 1].path, newStack[newStack.length - 1].name, false);
            }}
          >
            {seg.name}
          </button>
        </span>
      ))}
    </div>
  );

  // ── Root: list saved folders ─────────────────────────────────────────────────
  if (browseStack.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-white text-xl font-bold">Mis Carpetas</h1>
            <p className="text-text-secondary text-sm mt-0.5">Carpetas de red y locales con contenido multimedia</p>
          </div>
          <button
            onClick={() => { setShowAdd((v) => !v); setTimeout(() => pathInputRef.current?.focus(), 50); }}
            className="btn-primary py-1.5 px-3 text-xs flex items-center gap-1.5"
          >
            <FolderPlus size={14} /> Añadir carpeta
          </button>
        </div>

        {showAdd && (
          <div className="bg-bg-card border border-border rounded-xl p-4 mb-4 space-y-3">
            <p className="text-white text-sm font-semibold">Añadir carpeta</p>
            <div className="space-y-2">
              <input
                ref={pathInputRef}
                type="text"
                placeholder={isWindows
                  ? "C:\\Videos  |  \\\\192.168.1.10\\Peliculas  |  Z:\\"
                  : "/mnt/nas/Peliculas  |  smb://192.168.1.10"
                }
                value={addPath}
                onChange={(e) => { setAddPath(e.target.value); setCheckOk(false); setAddError(null); }}
                onKeyDown={(e) => { if (e.key === "Enter") handleAddFolder(); }}
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="none"
                autoComplete="off"
                data-form-type="other"
                className="w-full bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-text-muted focus:outline-none focus:border-accent font-mono"
              />
              {isSmb && (
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Usuario (vacío = invitado)"
                    value={addSmbUser}
                    onChange={(e) => { setAddSmbUser(e.target.value); setCheckOk(false); setAddError(null); }}
                    onKeyDown={(e) => { if (e.key === "Enter") handleAddFolder(); }}
                    spellCheck={false}
                    autoComplete="off"
                    data-form-type="other"
                    className="flex-1 bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-text-muted focus:outline-none focus:border-accent"
                  />
                  <input
                    type="password"
                    placeholder="Contraseña"
                    value={addSmbPass}
                    onChange={(e) => { setAddSmbPass(e.target.value); setCheckOk(false); setAddError(null); }}
                    onKeyDown={(e) => { if (e.key === "Enter") handleAddFolder(); }}
                    autoComplete="new-password"
                    data-form-type="other"
                    className="flex-1 bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-text-muted focus:outline-none focus:border-accent"
                  />
                </div>
              )}
              <input
                type="text"
                placeholder="Nombre para mostrar (opcional)"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAddFolder(); }}
                spellCheck={false}
                autoComplete="off"
                data-form-type="other"
                className="w-full bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-text-muted focus:outline-none focus:border-accent"
              />
            </div>
            {addError && (
              <p className="text-red-400 text-xs flex items-center gap-1">
                <AlertCircle size={12} /> {addError}
              </p>
            )}
            {checkOk && (
              <p className="text-green-400 text-xs flex items-center gap-1">
                ✓ Carpeta accesible — guardando…
              </p>
            )}
            <div className="flex gap-2 items-center">
              <button
                onClick={handleAddFolder}
                disabled={checking}
                className="btn-primary py-1.5 px-4 text-xs flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {checking ? (
                  <><Loader2 size={12} className="animate-spin" /> Comprobando…</>
                ) : (
                  "Guardar"
                )}
              </button>
              <button
                onClick={() => { setShowAdd(false); setAddError(null); setCheckOk(false); }}
                disabled={checking}
                className="btn-ghost py-1.5 px-3 text-xs disabled:opacity-50"
              >
                Cancelar
              </button>
            </div>
            {isWindows ? (
              <p className="text-text-muted text-[10px] leading-relaxed">
                <strong className="text-text-secondary">Local:</strong> <code className="bg-bg-secondary px-1 rounded">C:\Videos</code> —{" "}
                <strong className="text-text-secondary">Red UNC:</strong> <code className="bg-bg-secondary px-1 rounded">\\192.168.1.10\Peliculas</code> —{" "}
                <strong className="text-text-secondary">Unidad mapeada:</strong> <code className="bg-bg-secondary px-1 rounded">Z:\</code>.{" "}
                Para NAS con contraseña usa <code className="bg-bg-secondary px-1 rounded">smb://usuario:pass@ip/share</code>.
              </p>
            ) : (
              <p className="text-text-muted text-[10px] leading-relaxed">
                <strong className="text-text-secondary">Local/montada:</strong> <code className="bg-bg-secondary px-1 rounded">/mnt/nas/Peliculas</code> —{" "}
                <strong className="text-text-secondary">Red (SMB):</strong> <code className="bg-bg-secondary px-1 rounded">smb://192.168.1.10/Peliculas</code>.{" "}
                Requiere <code className="bg-bg-secondary px-1 rounded">smbclient</code> (paquete <code className="bg-bg-secondary px-1 rounded">samba</code>). Deja usuario vacío para invitado.
              </p>
            )}
          </div>
        )}

        {savedFolders.length === 0 && !showAdd && (
          <div className="flex flex-col items-center justify-center py-20 text-text-muted gap-4">
            <FolderOpen size={52} className="opacity-20" />
            <p className="text-sm">No hay carpetas guardadas</p>
            <button
              onClick={() => { setShowAdd(true); setTimeout(() => pathInputRef.current?.focus(), 50); }}
              className="btn-primary py-1.5 px-4 text-sm"
            >
              <FolderPlus size={14} /> Añadir primera carpeta
            </button>
          </div>
        )}

        <div className="space-y-2 max-w-2xl">
          {savedFolders.map((f) => (
            <div
              key={f.path}
              onClick={() => openFolder(f.path, f.name)}
              className="flex items-center gap-3 p-4 rounded-xl border bg-bg-card border-border hover:border-accent/50 hover:bg-bg-hover cursor-pointer transition-all group"
            >
              <FolderOpen size={22} className="text-accent flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium truncate">{f.name}</p>
                <p className="text-text-muted text-xs truncate mt-0.5">{maskSmbPath(f.path)}</p>
              </div>
              <button
                onClick={(e) => handleRemoveFolder(f.path, e)}
                className="text-text-muted hover:text-red-400 transition-colors p-1.5 opacity-0 group-hover:opacity-100"
                title="Eliminar"
              >
                <Trash2 size={14} />
              </button>
              <ChevronRight size={16} className="text-text-muted flex-shrink-0" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Browsing a folder ────────────────────────────────────────────────────────
  return (
    <>
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex flex-col gap-2 px-6 py-3 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={goBack} className="btn-ghost py-1 px-2 text-xs flex-shrink-0">
              <ArrowLeft size={13} /> Volver
            </button>
            <Breadcrumb />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Search */}
            <div className="relative flex-1 min-w-[140px] max-w-xs">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
              <input
                type="text"
                placeholder="Buscar..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-bg-secondary border border-border rounded-lg pl-7 pr-3 py-1.5 text-xs text-white placeholder:text-text-muted focus:outline-none focus:border-accent"
              />
            </div>

            {/* Type filter */}
            <div className="flex gap-1">
              {(["all", "dirs", "video", "audio"] as TypeFilter[]).map((f) => {
                const label = f === "all" ? "Todo" : f === "dirs" ? "Carpetas" : f === "video" ? "Vídeo" : "Audio";
                return (
                  <button
                    key={f}
                    onClick={() => setTypeFilter(f)}
                    className={cn(
                      "px-2.5 py-1 rounded-full text-xs font-medium border transition-all",
                      typeFilter === f
                        ? "bg-accent text-white border-accent"
                        : "bg-bg-card text-text-secondary border-border hover:border-accent/50 hover:text-white"
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Rating filter — only in gallery mode */}
            {viewMode === "gallery" && (
              <div className="flex items-center gap-1">
                <Star size={12} className="text-yellow-400 fill-yellow-400 flex-shrink-0" />
                {[0, 6, 7, 8, 9].map((r) => (
                  <button
                    key={r}
                    onClick={() => setMinRating(r)}
                    className={cn(
                      "px-2 py-1 rounded-full text-xs font-medium border transition-all",
                      minRating === r
                        ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/50"
                        : "bg-bg-card text-text-secondary border-border hover:border-yellow-500/40 hover:text-yellow-400"
                    )}
                  >
                    {r === 0 ? "Todas" : `${r}+`}
                  </button>
                ))}
              </div>
            )}

            {/* Sort + view toggle */}
            <div className="flex items-center gap-1 ml-auto">
              <ArrowUpDown size={13} className="text-text-muted" />
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
                style={{ colorScheme: "dark" }}
                className="bg-bg-secondary border border-border rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-accent cursor-pointer"
              >
                <option value="dirs-first">Carpetas primero</option>
                <option value="name-asc">Nombre A→Z</option>
                <option value="name-desc">Nombre Z→A</option>
                <option value="ext">Por extensión</option>
                <option value="rating-desc">Nota ↓ (mayor primero)</option>
                <option value="rating-asc">Nota ↑ (menor primero)</option>
              </select>

              <button
                onClick={toggleView}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all",
                  viewMode === "gallery"
                    ? "bg-accent border-accent text-white"
                    : "bg-bg-card border-border text-text-secondary hover:border-accent/50 hover:text-white"
                )}
              >
                {viewMode === "gallery"
                  ? <><List size={13} /> Lista</>
                  : <><LayoutGrid size={13} /> Galería</>
                }
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading && (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={32} className="animate-spin text-accent" />
            </div>
          )}

          {error && (
            <div className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm max-w-xl">
              <AlertCircle size={18} className="flex-shrink-0" />
              {error}
            </div>
          )}

          {!loading && !error && entries.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-text-muted gap-3">
              <FolderOpen size={40} className="opacity-20" />
              <p className="text-sm">Carpeta vacía o sin archivos multimedia</p>
            </div>
          )}

          {!loading && !error && entries.length > 0 && visibleEntries.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-text-muted gap-3">
              <Search size={40} className="opacity-20" />
              <p className="text-sm">Sin resultados para los filtros actuales</p>
            </div>
          )}

          {/* ── Gallery view ──────────────────────────────────────────────── */}
          {!loading && !error && viewMode === "gallery" && visibleEntries.length > 0 && (
            <div>
              {dirEntries.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-5">
                  {dirEntries.map((entry) => (
                    <button
                      key={entry.path}
                      onClick={() => openFolder(entry.path, entry.name)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border bg-bg-card border-border hover:border-accent/50 hover:bg-bg-hover text-xs text-text-secondary hover:text-white transition-all"
                    >
                      <FolderOpen size={13} className="text-accent/70" />
                      {entry.name}
                    </button>
                  ))}
                </div>
              )}

              {videoEntries.length > 0 && (
                <div className="flex flex-wrap gap-3">
                  {videoEntries.map((entry) => {
                    const override = posterOverridesRef.current.get(entry.path);
                    const fetched = tmdbMap.has(entry.path) ? tmdbMap.get(entry.path)! : undefined;
                    const effectiveMedia = override ?? fetched;
                    return (
                      <LocalPosterCard
                        key={entry.path}
                        entry={entry}
                        media={effectiveMedia}
                        onPlay={() => openEntry(entry)}
                        onChangePoster={() => setPickerEntry(entry)}
                      />
                    );
                  })}
                </div>
              )}

              {visibleEntries.filter((e) => !e.is_dir && !VIDEO_EXTS.has(e.extension)).length > 0 && (
                <div className="mt-5 space-y-1 max-w-3xl">
                  {visibleEntries
                    .filter((e) => !e.is_dir && !VIDEO_EXTS.has(e.extension))
                    .map((entry) => (
                      <div
                        key={entry.path}
                        onClick={() => playFile(entry)}
                        className="flex items-center gap-3 px-4 py-2.5 rounded-xl border bg-bg-card border-border hover:border-accent/60 hover:bg-accent/5 cursor-pointer transition-all"
                      >
                        {fileIcon(entry.extension)}
                        <span className="flex-1 text-sm text-white truncate">{entry.name}</span>
                        {entry.size && <span className="text-text-muted text-xs">{entry.size}</span>}
                        <button
                          onClick={(e) => { e.stopPropagation(); playFile(entry); }}
                          className="btn-primary py-1 px-3 text-xs flex-shrink-0 flex items-center gap-1"
                        >
                          <Play size={11} className="fill-white" /> Play
                        </button>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}

          {/* ── List view ─────────────────────────────────────────────────── */}
          {!loading && !error && viewMode === "list" && (
            <div className="space-y-1 max-w-3xl">
              {visibleEntries.map((entry) => (
                <div
                  key={entry.path}
                  onClick={() => entry.is_dir ? openFolder(entry.path, entry.name) : openEntry(entry)}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-xl border transition-all cursor-pointer",
                    entry.is_dir
                      ? "bg-bg-card border-border hover:border-accent/40 hover:bg-bg-hover"
                      : "bg-bg-card border-border hover:border-accent/60 hover:bg-accent/5"
                  )}
                >
                  {entry.is_dir ? (
                    <FolderOpen size={18} className="text-accent/70 flex-shrink-0" />
                  ) : (
                    fileIcon(entry.extension)
                  )}

                  <span className="flex-1 text-sm text-white truncate">{entry.name}</span>

                  {entry.size && (
                    <span className="text-text-muted text-xs flex-shrink-0">{entry.size}</span>
                  )}

                  {entry.is_dir ? (
                    <ChevronRight size={15} className="text-text-muted flex-shrink-0" />
                  ) : (
                    <button
                      onClick={(e) => { e.stopPropagation(); openEntry(entry); }}
                      className="btn-primary py-1 px-3 text-xs flex-shrink-0 flex items-center gap-1"
                    >
                      <Play size={11} className="fill-white" /> Play
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Poster picker modal */}
      {pickerEntry && (
        <PosterPickerModal
          entry={pickerEntry}
          apiKey={apiKey}
          onPick={handlePickPoster}
          onClose={() => setPickerEntry(null)}
        />
      )}
    </>
  );
}
