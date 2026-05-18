import { useState } from "react";
import { Play, Star, Clock, Calendar, Bookmark, BookmarkCheck, ArrowLeft, Server, ChevronDown, ChevronUp } from "lucide-react";
import { useStore } from "../store/useStore";
import { usePlexMatch, plexStreamUrl } from "../hooks/usePlex";
import { useMediaReviews } from "../hooks/useTmdb";
import { getBackdropUrl, getPosterUrl, getYear, formatRuntime, getRatingColor, cn } from "../lib/utils";
import type { MediaDetail } from "../types";

// Isolated so the Plex hook only runs when media is guaranteed non-null
function PlexButton({ media }: { media: MediaDetail }) {
  const { settings, setPlexDirectUrl, setView } = useStore();
  const imdbId = (media as any).imdb_id ?? (media as any).external_ids?.imdb_id ?? null;
  const { match } = usePlexMatch({
    imdbId,
    tmdbId: media.id,
    title: media.title || media.name || "",
    type: (media as any).media_type as "movie" | "tv",
  });

  if (!match) return null;

  if ((media as any).media_type === "movie") {
    return (
      <button
        onClick={() => {
          const url = plexStreamUrl(settings.plexUrl, settings.plexToken, match);
          if (url) {
            setPlexDirectUrl(url, match.duration ? match.duration / 1000 : 0);
            setView("player");
          }
        }}
        className="btn-ghost border border-orange-400/40 text-orange-400 hover:border-orange-400"
      >
        <Server size={16} /> Reproducir en Plex
      </button>
    );
  }

  return (
    <button
      onClick={() => setView("plex")}
      className="btn-ghost border border-orange-400/40 text-orange-400 hover:border-orange-400"
    >
      <Server size={16} /> Ver en Plex
    </button>
  );
}

function ReviewCard({ review }: { review: { id: string; author: string; content: string; created_at: string; author_details?: { rating?: number | null } } }) {
  const [expanded, setExpanded] = useState(false);
  const long = review.content.length > 300;
  const text = expanded || !long ? review.content : review.content.slice(0, 300) + "…";
  const date = new Date(review.created_at).toLocaleDateString("es-ES", { year: "numeric", month: "short", day: "numeric" });

  return (
    <div className="bg-bg-card border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center text-accent text-sm font-bold">
            {review.author[0].toUpperCase()}
          </div>
          <div>
            <p className="text-white text-sm font-medium">{review.author}</p>
            <p className="text-text-muted text-[11px]">{date}</p>
          </div>
        </div>
        {review.author_details?.rating != null && (
          <span className="flex items-center gap-1 text-yellow-400 text-sm font-bold">
            <Star size={12} className="fill-current" /> {review.author_details.rating}/10
          </span>
        )}
      </div>
      <p className="text-text-secondary text-sm leading-relaxed whitespace-pre-line">{text}</p>
      {long && (
        <button
          onClick={() => setExpanded((e) => !e)}
          className="flex items-center gap-1 text-accent text-xs mt-2 hover:underline"
        >
          {expanded ? <><ChevronUp size={12} /> Ver menos</> : <><ChevronDown size={12} /> Ver más</>}
        </button>
      )}
    </div>
  );
}

export function Detail() {
  const { selectedMedia: media, setView, addToWatchlist, removeFromWatchlist, isInWatchlist } = useStore();
  const mediaType = (media as any)?.media_type as "movie" | "tv" | undefined;
  const { reviews } = useMediaReviews(media?.id ?? null, mediaType ?? "movie");

  if (!media) return null;

  const trailer = media.videos?.results?.find(
    (v) => v.site === "YouTube" && (v.type === "Trailer" || v.type === "Teaser")
  );

  const backdrop = getBackdropUrl(media.backdrop_path, "original");
  const poster = getPosterUrl(media.poster_path, "w500");
  const title = media.title || media.name || "";
  const year = getYear(media.release_date || media.first_air_date);
  const inList = isInWatchlist(media.id);

  return (
    <div className="flex-1 overflow-y-auto relative">
      {/* Backdrop */}
      <div className="absolute inset-0 h-[320px] overflow-hidden">
        {backdrop && (
          <img src={backdrop} alt="" className="w-full h-full object-cover object-top opacity-40" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-bg-primary/80 to-bg-primary" />
      </div>

      <div className="relative z-10 px-6 pt-5">
        <button onClick={() => setView("home")} className="btn-ghost mb-6 -ml-2">
          <ArrowLeft size={16} /> Volver
        </button>

        <div className="flex gap-6 mb-6">
          {/* Poster */}
          <div className="w-[160px] flex-shrink-0 rounded-xl overflow-hidden border border-border shadow-2xl">
            {poster ? (
              <img src={poster} alt={title} className="w-full aspect-[2/3] object-cover" />
            ) : (
              <div className="w-full aspect-[2/3] bg-bg-card" />
            )}
          </div>

          {/* Info */}
          <div className="flex-1 pt-2">
            <h1 className="text-white text-3xl font-bold mb-2 leading-tight">{title}</h1>

            {media.tagline && (
              <p className="text-text-muted text-sm italic mb-3">"{media.tagline}"</p>
            )}

            <div className="flex flex-wrap items-center gap-3 mb-4">
              {media.vote_average > 0 && (
                <span className={cn("flex items-center gap-1 font-bold text-sm", getRatingColor(media.vote_average))}>
                  <Star size={14} className="fill-current" /> {media.vote_average.toFixed(1)}
                </span>
              )}
              {year && (
                <span className="flex items-center gap-1 text-text-secondary text-sm">
                  <Calendar size={13} /> {year}
                </span>
              )}
              {media.runtime && (
                <span className="flex items-center gap-1 text-text-secondary text-sm">
                  <Clock size={13} /> {formatRuntime(media.runtime)}
                </span>
              )}
              {media.number_of_seasons && (
                <span className="text-text-secondary text-sm">
                  {media.number_of_seasons} temporada{media.number_of_seasons > 1 ? "s" : ""}
                </span>
              )}
            </div>

            {media.genres?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-4">
                {media.genres.map((g) => (
                  <span key={g.id} className="px-2.5 py-0.5 rounded-full text-xs bg-bg-card border border-border text-text-secondary">
                    {g.name}
                  </span>
                ))}
              </div>
            )}

            <div className="flex gap-3 mt-2 flex-wrap">
              <button className="btn-primary" onClick={() => setView("player")}>
                <Play size={16} className="fill-white" /> Reproducir
              </button>
              <PlexButton media={media} />
              <button
                onClick={() => inList ? removeFromWatchlist(media.id) : addToWatchlist({ ...media })}
                className={cn("btn-ghost border border-border", inList && "text-accent border-accent/40")}
              >
                {inList ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
                {inList ? "En mi lista" : "Mi lista"}
              </button>
            </div>
          </div>
        </div>

        {/* Overview */}
        {media.overview && (
          <div className="mb-6">
            <h3 className="text-white font-semibold mb-2">Sinopsis</h3>
            <p className="text-text-secondary text-sm leading-relaxed">{media.overview}</p>
          </div>
        )}

        {/* Cast */}
        {media.credits?.cast && media.credits.cast.length > 0 && (
          <div className="mb-6">
            <h3 className="text-white font-semibold mb-3">Reparto principal</h3>
            <div className="row-scroll">
              {media.credits.cast.slice(0, 12).map((actor) => (
                <div key={actor.id} className="flex-shrink-0 w-[80px] text-center">
                  <div className="w-[80px] h-[80px] rounded-full overflow-hidden bg-bg-card border border-border mx-auto mb-1.5">
                    {actor.profile_path ? (
                      <img
                        src={`https://image.tmdb.org/t/p/w185${actor.profile_path}`}
                        alt={actor.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-text-muted text-lg font-bold">
                        {actor.name[0]}
                      </div>
                    )}
                  </div>
                  <p className="text-white text-[10px] font-medium leading-tight">{actor.name}</p>
                  <p className="text-text-muted text-[9px] truncate">{actor.character}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Trailer */}
        {trailer && (
          <div className="mb-6">
            <h3 className="text-white font-semibold mb-3">Trailer</h3>
            <div className="relative w-full max-w-2xl rounded-xl overflow-hidden" style={{ paddingBottom: "min(56.25%, 360px)" }}>
              <iframe
                className="absolute inset-0 w-full h-full"
                src={`https://www.youtube-nocookie.com/embed/${trailer.key}?rel=0&modestbranding=1`}
                allow="autoplay; encrypted-media; fullscreen"
                allowFullScreen
                title="Trailer"
              />
            </div>
          </div>
        )}

        {/* Reviews */}
        {reviews.length > 0 && (
          <div className="mb-8">
            <h3 className="text-white font-semibold mb-3">Reseñas</h3>
            <div className="flex flex-col gap-3 max-w-2xl">
              {reviews.map((r) => (
                <ReviewCard key={r.id} review={r} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
