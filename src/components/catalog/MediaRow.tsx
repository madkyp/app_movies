import { ChevronRight } from "lucide-react";
import { MediaCard } from "./MediaCard";
import { Spinner } from "../ui/Spinner";
import type { Media } from "../../types";

interface Props {
  title: string;
  items: Media[];
  loading?: boolean;
  onSelect: (m: Media) => void;
  onSeeAll?: () => void;
}

export function MediaRow({ title, items, loading, onSelect, onSeeAll }: Props) {
  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-3 px-1">
        <h2 className="text-white font-semibold text-base">{title}</h2>
        {onSeeAll && (
          <button onClick={onSeeAll} className="flex items-center gap-1 text-text-secondary hover:text-accent text-xs font-medium transition-colors">
            Ver todo <ChevronRight size={14} />
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Spinner />
        </div>
      ) : (
        <div className="row-scroll">
          {items.map((m) => (
            <MediaCard key={m.id} media={m} onClick={onSelect} />
          ))}
        </div>
      )}
    </section>
  );
}
