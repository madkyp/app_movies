import { useTrending, usePopularMovies, usePopularSeries } from "../hooks/useTmdb";
import { HeroSection } from "../components/catalog/HeroSection";
import { MediaRow } from "../components/catalog/MediaRow";
import { useStore } from "../store/useStore";
import { useMediaDetail } from "../hooks/useTmdb";
import { TMDB_IMAGE_BASE } from "../lib/utils";
import type { Media, HistoryEntry } from "../types";
import { Play, Clock } from "lucide-react";

function fmtRemaining(progressSecs: number, durationSecs: number): string {
  const rem = Math.max(0, durationSecs - progressSecs);
  const h = Math.floor(rem / 3600);
  const m = Math.floor((rem % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function ContinueWatchingRow({ items, onSelect }: { items: HistoryEntry[]; onSelect: (e: HistoryEntry) => void }) {
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
          const poster = entry.poster
            ? `${TMDB_IMAGE_BASE}/w185${entry.poster}`
            : null;
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
                {/* Progress bar */}
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
                  <div className="h-full bg-accent" style={{ width: `${pct * 100}%` }} />
                </div>
                {/* Play overlay */}
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
  const { setView, history, setLocalFileUrl, setPendingTorrentResume } = useStore();
  const { fetchDetail } = useMediaDetail();

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
      // Torrent con magnet guardado: auto-arranca y reanuda desde el minuto guardado
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

      <ContinueWatchingRow items={continueWatching} onSelect={handleContinue} />

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
