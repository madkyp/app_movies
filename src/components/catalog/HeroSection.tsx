import { Play, Info, Star } from "lucide-react";
import { getBackdropUrl, getYear, getRatingColor } from "../../lib/utils";
import type { Media } from "../../types";

interface Props {
  media: Media;
  onPlay: (m: Media) => void;
  onInfo: (m: Media) => void;
}

export function HeroSection({ media, onPlay, onInfo }: Props) {
  const backdrop = getBackdropUrl(media.backdrop_path);
  const title = media.title || media.name || "";
  const year = getYear(media.release_date || media.first_air_date);

  return (
    <div className="relative w-full h-[400px] rounded-2xl overflow-hidden mb-8 flex-shrink-0">
      {backdrop ? (
        <img src={backdrop} alt={title} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full bg-bg-secondary" />
      )}

      <div className="absolute inset-0 bg-gradient-to-r from-bg-primary via-bg-primary/70 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-bg-primary/80 via-transparent to-transparent" />

      <div className="absolute bottom-0 left-0 p-8 max-w-xl">
        <div className="flex items-center gap-3 mb-3">
          {media.media_type === "tv" && <span className="badge">Serie</span>}
          {year && <span className="text-text-secondary text-sm">{year}</span>}
          {media.vote_average > 0 && (
            <span className={`flex items-center gap-1 text-sm font-semibold ${getRatingColor(media.vote_average)}`}>
              <Star size={12} className="fill-current" />
              {media.vote_average.toFixed(1)}
            </span>
          )}
        </div>

        <h1 className="text-white text-4xl font-bold mb-3 leading-tight">{title}</h1>

        {media.overview && (
          <p className="text-text-secondary text-sm leading-relaxed mb-5 line-clamp-2">
            {media.overview}
          </p>
        )}

        <div className="flex gap-3">
          <button className="btn-primary" onClick={() => onPlay(media)}>
            <Play size={16} className="fill-white" /> Reproducir
          </button>
          <button className="btn-ghost border border-border" onClick={() => onInfo(media)}>
            <Info size={16} /> Más info
          </button>
        </div>
      </div>
    </div>
  );
}
