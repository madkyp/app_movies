import { Bookmark } from "lucide-react";
import { useStore } from "../store/useStore";
import { MediaCard } from "../components/catalog/MediaCard";
import { useMediaDetail } from "../hooks/useTmdb";
import type { Media } from "../types";

export function Watchlist() {
  const { watchlist, setView } = useStore();
  const { fetchDetail } = useMediaDetail();

  async function handleSelect(m: Media) {
    await fetchDetail(m.id, m.media_type);
    setView("detail");
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5">
      <h1 className="text-white text-xl font-bold mb-1">Mi Lista</h1>
      <p className="text-text-secondary text-sm mb-6">{watchlist.length} título{watchlist.length !== 1 ? "s" : ""} guardado{watchlist.length !== 1 ? "s" : ""}</p>

      {watchlist.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-text-muted">
          <Bookmark size={48} className="mb-4 opacity-20" />
          <p className="text-sm">Tu lista está vacía</p>
          <p className="text-xs mt-1">Añade películas y series desde el catálogo</p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          {watchlist.map((m) => (
            <MediaCard key={m.id} media={m} onClick={handleSelect} />
          ))}
        </div>
      )}
    </div>
  );
}
