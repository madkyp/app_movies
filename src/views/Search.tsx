import { useStore } from "../store/useStore";
import { useSearch } from "../hooks/useTmdb";
import { useMediaDetail } from "../hooks/useTmdb";
import { MediaCard } from "../components/catalog/MediaCard";
import { Spinner } from "../components/ui/Spinner";
import { SearchIcon } from "lucide-react";
import type { Media } from "../types";

export function Search() {
  const { searchQuery, setView } = useStore();
  const { data, loading } = useSearch(searchQuery);
  const { fetchDetail } = useMediaDetail();

  async function handleSelect(m: Media) {
    await fetchDetail(m.id, m.media_type);
    setView("detail");
  }

  if (!searchQuery) return null;

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5">
      <div className="flex items-center gap-2 mb-5">
        <SearchIcon size={18} className="text-text-secondary" />
        <h1 className="text-white font-semibold">Resultados para "{searchQuery}"</h1>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size={32} /></div>
      ) : data.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-text-muted">
          <SearchIcon size={48} className="mb-4 opacity-30" />
          <p className="text-sm">No se encontraron resultados</p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          {data.map((m) => (
            <MediaCard key={m.id} media={m} onClick={handleSelect} />
          ))}
        </div>
      )}
    </div>
  );
}
