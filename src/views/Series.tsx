import { useState, useEffect, useRef, useCallback } from "react";
import { useStore } from "../store/useStore";
import { useMediaDetail, TMDB_FALLBACK_KEY } from "../hooks/useTmdb";
import { MediaCard } from "../components/catalog/MediaCard";
import { Spinner } from "../components/ui/Spinner";
import { TMDB_BASE_URL } from "../lib/utils";
import type { Media } from "../types";

const GENRES = [
  { id: 0, name: "Todos" },
  { id: 10759, name: "Acción" },
  { id: 35, name: "Comedia" },
  { id: 18, name: "Drama" },
  { id: 9648, name: "Misterio" },
  { id: 10765, name: "Sci-Fi" },
  { id: 10768, name: "Documental" },
  { id: 16, name: "Animación" },
  { id: 10767, name: "Talk Show" },
];

const RATINGS = [
  { value: 0, label: "Todas" },
  { value: 6, label: "6+" },
  { value: 7, label: "7+" },
  { value: 8, label: "8+" },
  { value: 9, label: "9+" },
];

const currentYear = new Date().getFullYear();
const YEARS: { value: number; label: string }[] = [
  { value: 0, label: "Todos los años" },
  ...Array.from({ length: currentYear - 1979 }, (_, i) => {
    const y = currentYear - i;
    return { value: y, label: String(y) };
  }),
];

const SORT_OPTIONS = [
  { value: "popularity.desc", label: "Más populares" },
  { value: "vote_average.desc", label: "Mejor puntuadas" },
  { value: "first_air_date.desc", label: "Más recientes" },
];

export function Series() {
  const { settings, setView } = useStore();
  const { fetchDetail } = useMediaDetail();
  const [series, setSeries] = useState<Media[]>([]);
  const [loading, setLoading] = useState(false);
  const [genre, setGenre] = useState(0);
  const [year, setYear] = useState(0);
  const [minRating, setMinRating] = useState(0);
  const [sortBy, setSortBy] = useState("popularity.desc");
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

  const loadPage = useCallback((pg: number, gn: number, yr: number, rt: number, sb: string, append: boolean) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    const apiKey = settings.tmdbApiKey || TMDB_FALLBACK_KEY;
    const params = new URLSearchParams({
      api_key: apiKey,
      language: "es-ES",
      sort_by: sb,
      page: String(pg),
    });
    if (gn) params.set("with_genres", String(gn));
    if (yr) params.set("first_air_date_year", String(yr));
    if (rt) { params.set("vote_average.gte", String(rt)); params.set("vote_count.gte", "50"); }
    if (sb === "vote_average.desc" && !rt) params.set("vote_count.gte", "100");

    fetch(`${TMDB_BASE_URL}/discover/tv?${params}`)
      .then((r) => r.json())
      .then((d) => {
        const results: Media[] = d.results.map((m: Media) => ({ ...m, media_type: "tv" as const }));
        setSeries((prev) => append ? [...prev, ...results] : results);
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

  useEffect(() => {
    hasMoreRef.current = true;
    setSeries([]);
    setPage(1);
    setHasMore(true);
    loadPage(1, genre, year, minRating, sortBy, false);
  }, [genre, year, minRating, sortBy, settings.tmdbApiKey]);

  useEffect(() => {
    if (page === 1) return;
    loadPage(page, genre, year, minRating, sortBy, true);
  }, [page]);

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
    await fetchDetail(m.id, "tv");
    setView("detail");
  }

  const pillCls = (active: boolean) =>
    `px-3 py-1 rounded-full text-xs font-medium transition-all border ${
      active
        ? "bg-accent text-white border-accent"
        : "bg-bg-card text-text-secondary border-border hover:border-accent/50 hover:text-white"
    }`;

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5">
      <h1 className="text-white text-xl font-bold mb-4">Series</h1>

      {/* Género */}
      <div className="flex gap-2 flex-wrap mb-3">
        {GENRES.map((g) => (
          <button key={g.id} onClick={() => setGenre(g.id)} className={pillCls(genre === g.id)}>
            {g.name}
          </button>
        ))}
      </div>

      {/* Ordenar + Año + Puntuación mínima */}
      <div className="flex items-center gap-4 mb-5 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-text-muted text-xs">Ordenar</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            style={{ colorScheme: "dark" }}
            className="bg-bg-card border border-border text-text-secondary text-xs rounded-lg px-2 py-1 focus:outline-none focus:border-accent/50 hover:border-accent/30 transition-colors"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-text-muted text-xs">Año</span>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            style={{ colorScheme: "dark" }}
            className="bg-bg-card border border-border text-text-secondary text-xs rounded-lg px-2 py-1 focus:outline-none focus:border-accent/50 hover:border-accent/30 transition-colors"
          >
            {YEARS.map((y) => (
              <option key={y.value} value={y.value}>{y.label}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-text-muted text-xs">Puntuación</span>
          <div className="flex gap-1">
            {RATINGS.map((r) => (
              <button key={r.value} onClick={() => setMinRating(r.value)} className={pillCls(minRating === r.value)}>
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {series.length === 0 && loading ? (
        <div className="flex justify-center py-20"><Spinner size={32} /></div>
      ) : (
        <div className="flex flex-wrap gap-3">
          {series.map((m) => (
            <MediaCard key={m.id} media={m} onClick={handleSelect} />
          ))}
        </div>
      )}

      <div ref={sentinelRef} className="flex justify-center py-6">
        {loading && series.length > 0 && <Spinner size={24} />}
      </div>
    </div>
  );
}
