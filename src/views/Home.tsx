import { useEffect, useState } from "react";
import { useTrending, usePopularMovies, usePopularSeries } from "../hooks/useTmdb";
import { HeroSection } from "../components/catalog/HeroSection";
import { MediaRow } from "../components/catalog/MediaRow";
import { useStore } from "../store/useStore";
import { useMediaDetail } from "../hooks/useTmdb";
import { TMDB_IMAGE_BASE, TMDB_BASE_URL } from "../lib/utils";
import { TMDB_FALLBACK_KEY } from "../hooks/useTmdb";
import type { Media, HistoryEntry } from "../types";
import { Play, Clock } from "lucide-react";

function fmtRemaining(progressSecs: number, durationSecs: number): string {
  const rem = Math.max(0, durationSecs - progressSecs);
  const h = Math.floor(rem / 3600);
  const m = Math.floor((rem % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// Strip quality/format tags to get a clean search query + optional year
function parseTitleForSearch(title: string): { query: string; year?: number } {
  let s = title.replace(/\.[a-z0-9]{2,5}$/i, "");
  const yearMatch = s.match(/\b((?:19|20)\d{2})\b/);
  const year = yearMatch ? parseInt(yearMatch[1]) : undefined;
  if (yearMatch?.index !== undefined) s = s.slice(0, yearMatch.index);
  s = s.replace(/\[.*?\]/g, " ").replace(/\(.*?\)/g, " ");
  s = s.replace(/[._]/g, " ");
  s = s.replace(/\b(?:S\d{2}E\d{2}|4K|UHD|BluRay|BDRip|BRRip|WEBRip|WEB[-.]DL|HEVC|x26[45]|AAC|AC3|DTS|HDR|Remux|1080p|2160p|720p|480p|AMZN|MA)\b.*/gi, "");
  s = s.trim().replace(/\s+/g, " ").replace(/^[-–\s]+|[-–\s]+$/g, "").trim();
  return { query: s, year };
}

// Module-level poster cache (id → poster_path or null)
const posterCache = new Map<string, string | null>();

async function fetchMissingPoster(title: string, apiKey: string, signal: AbortSignal): Promise<string | null> {
  const { query, year } = parseTitleForSearch(title);
  if (!query.trim()) return null;
  const yp = year ? `&year=${year}` : "";
  try {
    // Try movie first
    const r = await fetch(`${TMDB_BASE_URL}/search/movie?query=${encodeURIComponent(query)}${yp}&language=es-ES&api_key=${apiKey}`, { signal });
    if (r.ok) {
      const d: { results: Array<{ poster_path: string | null }> } = await r.json();
      const hit = d.results.find((m) => m.poster_path);
      if (hit?.poster_path) return hit.poster_path;
    }
    // Fallback: TV search
    const r2 = await fetch(`${TMDB_BASE_URL}/search/tv?query=${encodeURIComponent(query)}&language=es-ES&api_key=${apiKey}`, { signal });
    if (r2.ok) {
      const d2: { results: Array<{ poster_path: string | null }> } = await r2.json();
      return d2.results.find((m) => m.poster_path)?.poster_path ?? null;
    }
  } catch {
    // aborted or network error
  }
  return null;
}

function ContinueWatchingRow({
  items, onSelect, apiKey,
}: {
  items: HistoryEntry[];
  onSelect: (e: HistoryEntry) => void;
  apiKey: string;
}) {
  const [posterMap, setPosterMap] = useState<Map<string, string | null>>(new Map(posterCache));

  useEffect(() => {
    const needsLookup = items.filter((e) => !e.poster && !posterCache.has(e.id));
    if (needsLookup.length === 0) return;

    const controller = new AbortController();
    (async () => {
      for (const entry of needsLookup) {
        if (controller.signal.aborted) break;
        const poster = await fetchMissingPoster(entry.title, apiKey, controller.signal);
        posterCache.set(entry.id, poster);
        if (!controller.signal.aborted) setPosterMap(new Map(posterCache));
      }
    })();
    return () => controller.abort();
  }, [items, apiKey]);

  if (items.length === 0) return null;

  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-3">
        <Play size={15} className="text-accent" />
        <h2 className="text-white font-bold text-base">Continuar viendo</h2>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
        {items.map((entry) => {
          const pct = entry.durationSecs ? Math.min(entry.progressSecs! / entry.durationSecs, 1) : 0;
          const rawPoster = entry.poster ?? posterMap.get(entry.id) ?? null;
          const poster = rawPoster ? `${TMDB_IMAGE_BASE}/w185${rawPoster}` : null;
          return (
            <button
              key={entry.id}
              onClick={() => onSelect(entry)}
              className="flex-shrink-0 w-28 group text-left"
            >
              <div className="relative rounded-lg overflow-hidden bg-bg-card aspect-[2/3] mb-1.5">
                {poster
                  ? <img src={poster} alt={entry.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" />
                  : <div className="w-full h-full flex items-center justify-center bg-bg-secondary"><Play size={24} className="text-text-muted" /></div>
                }
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
                  <div className="h-full bg-accent" style={{ width: `${pct * 100}%` }} />
                </div>
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Play size={28} className="text-white fill-white" />
                </div>
              </div>
              <p className="text-white text-[11px] font-medium truncate leading-tight">{entry.title}</p>
              {entry.durationSecs && (
                <p className="text-text-muted text-[10px] flex items-center gap-0.5 mt-0.5">
                  <Clock size={9} /> {fmtRemaining(entry.progressSecs!, entry.durationSecs)} restante
                </p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function Home() {
  const { data: trending, loading: trendingLoading } = useTrending();
  const { data: movies, loading: moviesLoading } = usePopularMovies();
  const { data: series, loading: seriesLoading } = usePopularSeries();
  const { setView, history, setLocalFileUrl, setPendingTorrentResume, settings } = useStore();
  const { fetchDetail } = useMediaDetail();
  const apiKey = settings.tmdbApiKey || TMDB_FALLBACK_KEY;

  const hero = trending[0] ?? null;

  const continueWatching = history.filter(
    (h) => h.progressSecs && h.progressSecs > 30 &&
            h.durationSecs && h.progressSecs < h.durationSecs * 0.9
  ).slice(0, 12);

  async function handleSelect(m: Media) {
    await fetchDetail(m.id, m.media_type);
    setView("detail");
  }

  async function handlePlay(m: Media) {
    await fetchDetail(m.id, m.media_type);
    setView("detail");
  }

  async function handleContinue(entry: HistoryEntry) {
    if (entry.media_type === "file" && entry.path) {
      setLocalFileUrl(entry.path, entry.title);
      setView("player");
    } else if (entry.source === "torrent" && entry.magnet && entry.tmdb_id) {
      setPendingTorrentResume({ magnet: entry.magnet, episode: entry.episode });
      await fetchDetail(entry.tmdb_id, entry.media_type as "movie" | "tv");
      setView("player");
    } else if (entry.tmdb_id) {
      await fetchDetail(entry.tmdb_id, entry.media_type as "movie" | "tv");
      setView("detail");
    }
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5">
      {hero && !trendingLoading && (
        <HeroSection media={hero} onPlay={handlePlay} onInfo={handleSelect} />
      )}

      <ContinueWatchingRow items={continueWatching} onSelect={handleContinue} apiKey={apiKey} />

      <MediaRow
        title="Tendencias de la semana"
        items={trending.slice(1, 15)}
        loading={trendingLoading}
        onSelect={handleSelect}
        onSeeAll={() => setView("movies")}
      />
      <MediaRow
        title="Películas populares"
        items={movies.slice(0, 15)}
        loading={moviesLoading}
        onSelect={handleSelect}
        onSeeAll={() => setView("movies")}
      />
      <MediaRow
        title="Series populares"
        items={series.slice(0, 15)}
        loading={seriesLoading}
        onSelect={handleSelect}
        onSeeAll={() => setView("series")}
      />
    </div>
  );
}
