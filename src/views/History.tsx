import { useStore } from "../store/useStore";
import { useMediaDetail } from "../hooks/useTmdb";
import { TMDB_IMAGE_BASE } from "../lib/utils";
import { History as HistoryIcon, Trash2, Play, Film, Tv, FolderOpen, Server, Wifi } from "lucide-react";
import type { HistoryEntry } from "../types";

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "ahora mismo";
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `hace ${d}d`;
  return new Date(ts).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}

function SourceBadge({ source }: { source: HistoryEntry["source"] }) {
  if (source === "torrent") return (
    <span className="flex items-center gap-0.5 text-[10px] text-accent/80">
      <Wifi size={9} /> Torrent
    </span>
  );
  if (source === "plex") return (
    <span className="flex items-center gap-0.5 text-[10px] text-orange-400/80">
      <Server size={9} /> Plex
    </span>
  );
  return (
    <span className="flex items-center gap-0.5 text-[10px] text-green-400/80">
      <FolderOpen size={9} /> Local
    </span>
  );
}

function TypeIcon({ type }: { type: HistoryEntry["media_type"] }) {
  if (type === "movie") return <Film size={11} className="text-text-muted" />;
  if (type === "tv") return <Tv size={11} className="text-text-muted" />;
  return <FolderOpen size={11} className="text-text-muted" />;
}

export function History() {
  const { history, removeFromHistory, clearHistory, setView, setLocalFileUrl, setPendingTorrentResume } = useStore();
  const { fetchDetail } = useMediaDetail();

  async function handleOpen(entry: HistoryEntry) {
    if (entry.media_type === "file" && entry.path) {
      setLocalFileUrl(entry.path, entry.title);
      setView("player");
      return;
    }
    if (entry.source === "torrent" && entry.magnet && entry.tmdb_id) {
      setPendingTorrentResume({ magnet: entry.magnet, episode: entry.episode });
      await fetchDetail(entry.tmdb_id, entry.media_type as "movie" | "tv");
      setView("player");
      return;
    }
    if (entry.tmdb_id) {
      await fetchDetail(entry.tmdb_id, entry.media_type as "movie" | "tv");
      setView("detail");
    }
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-white text-xl font-bold">Historial</h1>
          <p className="text-text-secondary text-sm mt-0.5">Últimas reproducciones</p>
        </div>
        {history.length > 0 && (
          <button
            onClick={() => { if (confirm("¿Borrar todo el historial?")) clearHistory(); }}
            className="btn-ghost text-xs py-1.5 px-3 text-red-400 hover:text-red-300 border border-red-500/30 hover:border-red-400/50"
          >
            <Trash2 size={13} /> Borrar todo
          </button>
        )}
      </div>

      {history.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-text-muted gap-4">
          <HistoryIcon size={52} className="opacity-20" />
          <p className="text-sm">Aún no has reproducido nada</p>
        </div>
      )}

      <div className="space-y-2 max-w-3xl">
        {history.map((entry) => (
          <div
            key={entry.id}
            className="flex items-center gap-4 p-3 rounded-xl border bg-bg-card border-border hover:border-accent/40 hover:bg-bg-hover transition-all group cursor-pointer"
            onClick={() => handleOpen(entry)}
          >
            {/* Poster */}
            <div className="w-14 h-20 flex-shrink-0 rounded-lg overflow-hidden bg-bg-secondary relative">
              {entry.poster ? (
                <img
                  src={`${TMDB_IMAGE_BASE}/w92${entry.poster}`}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <TypeIcon type={entry.media_type} />
                </div>
              )}
              {entry.progressSecs && entry.durationSecs && entry.durationSecs > 0 && (
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
                  <div
                    className="h-full bg-accent"
                    style={{ width: `${Math.min(entry.progressSecs / entry.durationSecs, 1) * 100}%` }}
                  />
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium truncate">{entry.title}</p>
              {entry.episode && (
                <p className="text-text-secondary text-xs mt-0.5">
                  T{String(entry.episode.season).padStart(2, "0")}E{String(entry.episode.episode).padStart(2, "0")} · {entry.episode.name}
                </p>
              )}
              <div className="flex items-center gap-2 mt-1">
                <TypeIcon type={entry.media_type} />
                <SourceBadge source={entry.source} />
                <span className="text-text-muted text-[10px]">{timeAgo(entry.playedAt)}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                className="btn-primary py-1 px-3 text-xs"
                onClick={(e) => { e.stopPropagation(); handleOpen(entry); }}
              >
                <Play size={11} className="fill-white" /> Ver
              </button>
              <button
                className="text-text-muted hover:text-red-400 transition-colors p-1.5"
                onClick={(e) => { e.stopPropagation(); removeFromHistory(entry.id); }}
                title="Eliminar del historial"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
