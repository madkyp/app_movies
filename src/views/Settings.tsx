import { Save, Key, Info, Server, ExternalLink } from "lucide-react";
import { useStore } from "../store/useStore";
import { useState } from "react";

export function Settings() {
  const { settings, updateSettings } = useStore();
  const [tmdbKey, setTmdbKey] = useState(settings.tmdbApiKey);
  const [plexUrl, setPlexUrl] = useState(settings.plexUrl);
  const [plexToken, setPlexToken] = useState(settings.plexToken);
  const [saved, setSaved] = useState<string | null>(null);

  function saveField(field: string, updates: Parameters<typeof updateSettings>[0]) {
    updateSettings(updates);
    setSaved(field);
    setTimeout(() => setSaved(null), 2000);
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5">
      <h1 className="text-white text-xl font-bold mb-1">Ajustes</h1>
      <p className="text-text-secondary text-sm mb-6">Configura TheFoundry:StreamDeck a tu gusto</p>

      <div className="max-w-lg space-y-6">
        {/* TMDB Key */}
        <div className="bg-bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <Key size={15} className="text-accent" />
            <h3 className="text-white font-semibold text-sm">TMDB API Key</h3>
          </div>
          <p className="text-text-muted text-xs mb-3">
            Necesaria para el catálogo. Consíguela gratis en themoviedb.org/settings/api
          </p>
          <input
            type="password"
            value={tmdbKey}
            onChange={(e) => setTmdbKey(e.target.value)}
            placeholder="eyJhbGci..."
            className="input-search mb-3 font-mono text-xs"
          />
          <button onClick={() => saveField("tmdb", { tmdbApiKey: tmdbKey })} className="btn-primary text-xs py-2">
            <Save size={13} /> {saved === "tmdb" ? "¡Guardado!" : "Guardar"}
          </button>
        </div>

        {/* Plex */}
        <div className="bg-bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <Server size={15} className="text-orange-400" />
            <h3 className="text-white font-semibold text-sm">Servidor Plex</h3>
          </div>
          <p className="text-text-muted text-xs mb-4">
            Conecta tu Plex Media Server para reproducir tu biblioteca directamente.
          </p>

          <label className="text-text-secondary text-xs font-medium mb-1 block">URL del servidor</label>
          <input
            type="text"
            value={plexUrl}
            onChange={(e) => setPlexUrl(e.target.value)}
            placeholder="http://192.168.1.100:32400"
            className="input-search mb-3 font-mono text-xs"
          />

          <label className="text-text-secondary text-xs font-medium mb-1 block">Token de Plex</label>
          <input
            type="password"
            value={plexToken}
            onChange={(e) => setPlexToken(e.target.value)}
            placeholder="xxxxxxxxxxxxxxxxxxxx"
            className="input-search mb-1 font-mono text-xs"
          />
          <p className="text-text-muted text-[11px] mb-3 flex items-center gap-1">
            Encuéntralo en{" "}
            <a
              href="https://www.plexopedia.com/plex-media-server/general/plex-token/"
              target="_blank"
              rel="noreferrer"
              className="text-accent hover:underline inline-flex items-center gap-0.5"
            >
              cómo obtener tu token <ExternalLink size={10} />
            </a>
          </p>
          <button
            onClick={() => saveField("plex", { plexUrl, plexToken })}
            className="btn-primary text-xs py-2"
          >
            <Save size={13} /> {saved === "plex" ? "¡Guardado!" : "Guardar"}
          </button>
        </div>

        {/* Info */}
        <div className="bg-bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Info size={15} className="text-accent" />
            <h3 className="text-white font-semibold text-sm">Sobre TheFoundry:StreamDeck</h3>
          </div>
          <div className="space-y-1.5 text-xs text-text-secondary">
            <p>Versión: 0.1.0</p>
            <p>Motor: Tauri 2 + librqbit</p>
            <p>Fuentes: YTS, EZTV, Torrentio y más</p>
            <p>Metadata: The Movie Database (TMDB)</p>
          </div>
        </div>
      </div>
    </div>
  );
}
