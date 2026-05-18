import { Star, Tv, Film } from "lucide-react";
import { getPosterUrl, getYear, getRatingColor, cn } from "../../lib/utils";
import type { Media } from "../../types";

interface Props {
  media: Media;
  onClick: (m: Media) => void;
  className?: string;
}

export function MediaCard({ media, onClick, className }: Props) {
  const poster = getPosterUrl(media.poster_path);
  const title = media.title || media.name || "Sin título";
  const year = getYear(media.release_date || media.first_air_date);
  const rating = media.vote_average;

  return (
    <div className={cn("media-card group w-[140px] flex-shrink-0", className)} onClick={() => onClick(media)}>
      <div className="relative w-full aspect-[2/3]">
        {poster ? (
          <img src={poster} alt={title} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-bg-secondary">
            {media.media_type === "tv" ? (
              <Tv size={32} className="text-text-muted" />
            ) : (
              <Film size={32} className="text-text-muted" />
            )}
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-card opacity-0 group-hover:opacity-100 transition-opacity duration-200" />

        <div className="absolute top-2 left-2 flex gap-1">
          {media.media_type === "tv" && (
            <span className="badge text-[9px]">Serie</span>
          )}
        </div>

        {rating > 0 && (
          <div className="absolute bottom-2 left-2 flex items-center gap-1">
            <Star size={10} className="text-yellow-400 fill-yellow-400" />
            <span className={cn("text-[11px] font-semibold", getRatingColor(rating))}>
              {rating.toFixed(1)}
            </span>
          </div>
        )}
      </div>

      <div className="p-2">
        <p className="text-text-primary text-xs font-medium truncate">{title}</p>
        {year && <p className="text-text-muted text-[10px] mt-0.5">{year}</p>}
      </div>
    </div>
  );
}
