import { useState, useEffect } from "react";
import { useStore } from "../store/useStore";
import { useMediaDetail } from "../hooks/useTmdb";
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

export function Series() {
  const { settings, setView } = useStore();
  const { fetchDetail } = useMediaDetail();
  const [series, setSeries] = useState<Media[]>([]);
  const [loading, setLoading] = useState(true);
  const [genre, setGenre] = useState(0);
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!settings.tmdbApiKey) return;
    setLoading(true);
    const genreParam = genre ? `&with_genres=${genre}` : "";
    fetch(
      `${TMDB_BASE_URL}/discover/tv?api_key=${settings.tmdbApiKey}&language=es-ES&sort_by=popularity.desc&page=${page}${genreParam}`
    )
      .then((r) => r.json())
      .then((d) => setSeries(d.results.map((m: Media) => ({ ...m, media_type: "tv" as const }))))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [settings.tmdbApiKey, genre, page]);

  async function handleSelect(m: Media) {
    await fetchDetail(m.id, "tv");
    setView("detail");
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-white text-xl font-bold">Series</h1>
      </div>

      <div className="flex gap-2 flex-wrap mb-5">
        {GENRES.map((g) => (
          <button
            key={g.id}
            onClick={() => { setGenre(g.id); setPage(1); }}
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

      {loading ? (
        <div className="flex justify-center py-20"><Spinner size={32} /></div>
      ) : (
        <>
          <div className="flex flex-wrap gap-3">
            {series.map((m) => (
              <MediaCard key={m.id} media={m} onClick={handleSelect} />
            ))}
          </div>
          <div className="flex justify-center gap-3 mt-6 pb-4">
            <button
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
              className="btn-ghost border border-border disabled:opacity-30 disabled:cursor-not-allowed"
            >
              ← Anterior
            </button>
            <span className="flex items-center text-text-secondary text-sm px-2">Página {page}</span>
            <button
              onClick={() => setPage((p) => p + 1)}
              className="btn-ghost border border-border"
            >
              Siguiente →
            </button>
          </div>
        </>
      )}
    </div>
  );
}
