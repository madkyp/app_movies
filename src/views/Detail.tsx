import { useState } from "react";
import { open } from "@tauri-apps/plugin-shell";
import { invoke } from "@tauri-apps/api/core";
import { Play, Star, Clock, Calendar, Bookmark, BookmarkCheck, ArrowLeft, Server, ChevronDown, ChevronUp, PlayCircle, Loader2 } from "lucide-react";
import { useStore } from "../store/useStore";
import { usePlexMatch, usePlexConfig, plexStreamUrl } from "../hooks/usePlex";
import { useMediaReviews } from "../hooks/useTmdb";
import { getBackdropUrl, getPosterUrl, getYear, formatRuntime, getRatingColor, cn } from "../lib/utils";
import type { MediaDetail } from "../types";

// Isolated so the Plex hook only runs when media is guaranteed non-null
function PlexButton({ media }: { media: MediaDetail }) {
  const { setPlexDirectUrl, setView } = useStore();
  const { plexUrl, plexToken } = usePlexConfig();
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
          const url = plexStreamUrl(plexUrl, plexToken, match);
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
  const [trailerState, setTrailerState] = useState<'idle' | 'loading' | 'video' | 'iframe'>('idle');
  const [trailerUrl, setTrailerUrl]       = useState<string | null>(null);
  const { selectedMedia: media, setView, addToWatchlist, removeFromWatchlist, isInWatchlist, detailReturnView, setDetailReturnView, setLocalFileUrl } = useStore();
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
      <div className="absolute inset-0 h-[420px] overflow-hidden">
        {backdrop && (
          <img src={backdrop} alt="" className="w-full h-full object-cover object-top opacity-30" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-bg-primary/70 to-bg-primary" />
      </div>

      <div className="relative z-10 px-8 pt-5 pb-8">
        <button
          onClick={() => {
            const back = detailReturnView ?? "home";
            if (detailReturnView) { setDetailReturnView(null); setLocalFileUrl(null); }
            setView(back);
          }}
          className="btn-ghost mb-8 -ml-2"
        >
          <ArrowLeft size={16} /> Volver
        </button>

        {/* Header: poster + info */}
        <div className="flex gap-8 mb-8">
          <div className="w-[190px] flex-shrink-0 rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
            {poster ? (
              <img src={poster} alt={title} className="w-full aspect-[2/3] object-cover" />
            ) : (
              <div className="w-full aspect-[2/3] bg-bg-card" />
            )}
          </div>

          <div className="flex-1 pt-4">
            <h1 className="text-white text-4xl font-bold mb-2 leading-tight">{title}</h1>

            {media.tagline && (
              <p className="text-text-muted text-sm italic mb-4">"{media.tagline}"</p>
            )}

            <div className="flex flex-wrap items-center gap-4 mb-4">
              {media.vote_average > 0 && (
                <span className={cn("flex items-center gap-1.5 font-bold", getRatingColor(media.vote_average))}>
                  <Star size={15} className="fill-current" /> {media.vote_average.toFixed(1)}
                </span>
              )}
              {year && (
                <span className="flex items-center gap-1.5 text-text-secondary text-sm">
                  <Calendar size={13} /> {year}
                </span>
              )}
              {media.runtime && (
                <span className="flex items-center gap-1.5 text-text-secondary text-sm">
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
              <div className="flex flex-wrap gap-1.5 mb-5">
                {media.genres.map((g) => (
                  <span key={g.id} className="px-3 py-0.5 rounded-full text-xs bg-white/5 border border-white/10 text-text-secondary">
                    {g.name}
                  </span>
                ))}
              </div>
            )}

            {media.overview && (
              <p className="text-text-secondary text-sm leading-relaxed mb-5 max-w-2xl">{media.overview}</p>
            )}

            <div className="flex gap-3 flex-wrap">
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

        {/* Cast */}
        {media.credits?.cast && media.credits.cast.length > 0 && (
          <div className="mb-8">
            <h3 className="text-white font-semibold mb-4">Reparto principal</h3>
            <div className="row-scroll">
              {media.credits.cast.slice(0, 12).map((actor) => (
                <div key={actor.id} className="flex-shrink-0 w-[80px] text-center">
                  <div className="w-[80px] h-[80px] rounded-full overflow-hidden bg-bg-card border border-border mx-auto mb-1.5">
                    {actor.profile_path ? (
                      <img src={`https://image.tmdb.org/t/p/w185${actor.profile_path}`} alt={actor.name} className="w-full h-full object-cover" />
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

        {/* Trailer + Reviews: two-column layout */}
        {(trailer || reviews.length > 0) && (
          <div className={cn("gap-6 mb-8", trailer && reviews.length > 0 ? "grid grid-cols-[3fr_2fr]" : "flex flex-col")}>
            {/* Trailer */}
            {trailer && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-white font-semibold">Trailer</h3>
                  {trailerState !== 'idle' && (
                    <button
                      onClick={() => open(`https://www.youtube.com/watch?v=${trailer.key}`)}
                      className="text-xs text-text-secondary hover:text-white flex items-center gap-1 transition-colors"
                    >
                      <PlayCircle size={12} /> Ver en YouTube
                    </button>
                  )}
                </div>
                <div className="relative w-full rounded-2xl overflow-hidden border border-white/10 bg-black" style={{ paddingTop: "56.25%" }}>

                  {/* Miniatura + botón play */}
                  {trailerState === 'idle' && (
                    <button
                      onClick={async () => {
                        setTrailerState('loading');
                        try {
                          const url = await invoke<string>('get_youtube_stream_url', { videoId: trailer.key });
                          setTrailerUrl(url);
                          setTrailerState('video');
                        } catch {
                          setTrailerState('iframe');
                        }
                      }}
                      className="absolute inset-0 w-full h-full group"
                    >
                      <img
                        src={`https://img.youtube.com/vi/${trailer.key}/maxresdefault.jpg`}
                        onError={(e) => { (e.target as HTMLImageElement).src = `https://img.youtube.com/vi/${trailer.key}/hqdefault.jpg`; }}
                        alt="Trailer"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/30 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                        <div className="w-16 h-16 rounded-full bg-red-600 flex items-center justify-center shadow-2xl group-hover:scale-110 transition-transform">
                          <PlayCircle size={36} className="text-white fill-white" />
                        </div>
                      </div>
                    </button>
                  )}

                  {/* Cargando con yt-dlp */}
                  {trailerState === 'loading' && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                      <Loader2 size={36} className="animate-spin text-red-500" />
                      <span className="text-text-secondary text-sm">Obteniendo tráiler…</span>
                    </div>
                  )}

                  {/* Reproducción directa vía yt-dlp */}
                  {trailerState === 'video' && trailerUrl && (
                    <video
                      className="absolute inset-0 w-full h-full"
                      src={trailerUrl}
                      autoPlay
                      controls
                    />
                  )}

                  {/* Fallback iframe si yt-dlp falla */}
                  {trailerState === 'iframe' && (
                    <iframe
                      className="absolute inset-0 w-full h-full"
                      src={`https://www.youtube-nocookie.com/embed/${trailer.key}?autoplay=1&rel=0`}
                      allow="autoplay; fullscreen"
                      allowFullScreen
                    />
                  )}

                </div>
              </div>
            )}

            {/* Reviews */}
            {reviews.length > 0 && (
              <div className="flex flex-col min-h-0">
                <h3 className="text-white font-semibold mb-3">Reseñas</h3>
                <div className="flex flex-col gap-3 overflow-y-auto" style={{ maxHeight: "340px" }}>
                  {reviews.map((r) => (
                    <ReviewCard key={r.id} review={r} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
