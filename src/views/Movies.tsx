import { useState, useEffect, useRef, useCallback } from "react";
import { useStore } from "../store/useStore";
import { useMediaDetail, TMDB_FALLBACK_KEY } from "../hooks/useTmdb";
import { MediaCard } from "../components/catalog/MediaCard";
import { Spinner } from "../components/ui/Spinner";
import { TMDB_BASE_URL } from "../lib/utils";
import type { Media } from "../types";

const GENRES = [
  { id: 0, name: "Todos" },
  { id: 28, name: "Acción" },
  { id: 35, name: "Comedia" },
  { id: 18, name: "Drama" },
  { id: 27, name: "Terror" },
  { id: 878, name: "Ciencia ficción" },
  { id: 10749, name: "Romance" },
  { id: 53, name: "Thriller" },
  { id: 16, name: "Animación" },
];

export function Movies() {
  const { settings, setView } = useStore();
  const { fetchDetail } = useMediaDetail();
  const [movies, setMovies] = useState<Media[]>([]);
  const [loading, setLoading] = useState(false);
  const [genre, setGenre] = useState(0);
  const [page, setPage] = useState(1);
  const [, setHasMore] = useState(true);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);
  const hasMoreRef = useRef(true);

  const isSentinelVisible = () => {
    const el = sentinelRef.current;
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    return rect.top < window.innerHeight + 200;
  };

  const loadPage = useCallback((pg: number, gn: number, append: boolean) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    const apiKey = settings.tmdbApiKey || TMDB_FALLBACK_KEY;
    const genreParam = gn ? `&with_genres=${gn}` : "";
    fetch(`${TMDB_BASE_URL}/discover/movie?api_key=${apiKey}&language=es-ES&sort_by=popularity.desc&page=${pg}${genreParam}`)
      .then((r) => r.json())
      .then((d) => {
        const results: Media[] = d.results.map((m: Media) => ({ ...m, media_type: "movie" as const }));
        setMovies((prev) => append ? [...prev, ...results] : results);
        const more = pg < (d.total_pages ?? 1);
        setHasMore(more);
        hasMoreRef.current = more;
      })
      .catch(console.error)
      .finally(() => {
        setLoading(false);
        loadingRef.current = false;
        if (hasMoreRef.current && isSentinelVisible()) {
          setPage((p) => p + 1);
        }
      });
  }, [settings.tmdbApiKey]);

  // Reset when genre changes
  useEffect(() => {
    hasMoreRef.current = true;
    setMovies([]);
    setPage(1);
    setHasMore(true);
    loadPage(1, genre, false);
  }, [genre, settings.tmdbApiKey]);

  // Load next page when page increments
  useEffect(() => {
    if (page === 1) return;
    loadPage(page, genre, true);
  }, [page]);

  // IntersectionObserver for manual scroll
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMoreRef.current && !loadingRef.current) {
          setPage((p) => p + 1);
        }
      },
      { rootMargin: "200px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  async function handleSelect(m: Media) {
    await fetchDetail(m.id, "movie");
    setView("detail");
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5">
      <h1 className="text-white text-xl font-bold mb-4">Películas</h1>

      <div className="flex gap-2 flex-wrap mb-5">
        {GENRES.map((g) => (
          <button
            key={g.id}
            onClick={() => setGenre(g.id)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-all border ${
              genre === g.id
                ? "bg-accent text-white border-accent"
                : "bg-bg-card text-text-secondary border-border hover:border-accent/50 hover:text-white"
            }`}
          >
            {g.name}
          </button>
        ))}
      </div>

      {movies.length === 0 && loading ? (
        <div className="flex justify-center py-20"><Spinner size={32} /></div>
      ) : (
        <div className="flex flex-wrap gap-3">
          {movies.map((m) => (
            <MediaCard key={m.id} media={m} onClick={handleSelect} />
          ))}
        </div>
      )}

      <div ref={sentinelRef} className="flex justify-center py-6">
        {loading && movies.length > 0 && <Spinner size={24} />}
      </div>
    </div>
  );
}
