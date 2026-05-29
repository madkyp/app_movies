import { Save, Key, Info, Server, ExternalLink, HardDrive, Trash2, Languages } from "lucide-react";
import { useStore } from "../store/useStore";
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

export function Settings() {
  const { settings, updateSettings } = useStore();
  const [tmdbKey, setTmdbKey] = useState(settings.tmdbApiKey);
  const [plexUrl, setPlexUrl] = useState(settings.plexUrl);
  const [plexToken, setPlexToken] = useState(settings.plexToken);
  const [osKey, setOsKey] = useState(settings.openSubtitlesApiKey ?? "");
  const [saved, setSaved] = useState<string | null>(null);

  const [cacheBytes, setCacheBytes] = useState<number | null>(null);
  const [clearing, setClearing] = useState(false);

  function fmtBytes(b: number): string {
    if (b >= 1_073_741_824) return `${(b / 1_073_741_824).toFixed(2)} GB`;
    if (b >= 1_048_576) return `${(b / 1_048_576).toFixed(1)} MB`;
    if (b >= 1024) return `${(b / 1024).toFixed(0)} KB`;
    return `${b} B`;
  }

  async function refreshCacheSize() {
    try {
      const bytes = await invoke<number>("get_cache_size");
      setCacheBytes(bytes);
    } catch {
      setCacheBytes(0);
    }
  }

  useEffect(() => { refreshCacheSize(); }, []);

  async function handleClearCache() {
    setClearing(true);
    try {
      await invoke("clear_cache");
      await refreshCacheSize();
    } finally {
      setClearing(false);
    }
  }

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

        {/* OpenSubtitles */}
        <div className="bg-bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <Key size={15} className="text-green-400" />
            <h3 className="text-white font-semibold text-sm">OpenSubtitles API Key</h3>
          </div>
          <p className="text-text-muted text-xs mb-3">
            Necesaria para buscar subtítulos automáticos. Regístrate gratis en{" "}
            <a href="https://www.opensubtitles.com/en/consumers" target="_blank" rel="noreferrer"
               className="text-accent hover:underline inline-flex items-center gap-0.5">
              opensubtitles.com/en/consumers <ExternalLink size={10} />
            </a>
          </p>
          <input
            type="password"
            value={osKey}
            onChange={(e) => setOsKey(e.target.value)}
            placeholder="Tu API key de OpenSubtitles"
            className="input-search mb-3 font-mono text-xs"
          />
          <button onClick={() => saveField("os", { openSubtitlesApiKey: osKey })} className="btn-primary text-xs py-2">
            <Save size={13} /> {saved === "os" ? "¡Guardado!" : "Guardar"}
          </button>
        </div>

        {/* Preferencias de reproducción */}
        <div className="bg-bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <Languages size={15} className="text-accent" />
            <h3 className="text-white font-semibold text-sm">Idioma preferido</h3>
          </div>
          <p className="text-text-muted text-xs mb-4">
            Al reproducir, se seleccionará automáticamente la pista de audio y los subtítulos en el idioma elegido si están disponibles.
          </p>

          <label className="text-text-secondary text-xs font-medium mb-1 block">Audio</label>
          <select
            value={settings.preferredAudioLang ?? ""}
            onChange={(e) => saveField("audiolang", { preferredAudioLang: e.target.value })}
            style={{ colorScheme: "dark" }}
            className="input-search mb-3 text-xs cursor-pointer"
          >
            <option value="">Original / automático</option>
            <option value="es">Español</option>
            <option value="en">Inglés</option>
            <option value="fr">Francés</option>
            <option value="de">Alemán</option>
            <option value="it">Italiano</option>
            <option value="pt">Portugués</option>
            <option value="ja">Japonés</option>
          </select>

          <label className="text-text-secondary text-xs font-medium mb-1 block">Subtítulos</label>
          <select
            value={settings.preferredSubLang ?? ""}
            onChange={(e) => saveField("sublang", { preferredSubLang: e.target.value })}
            style={{ colorScheme: "dark" }}
            className="input-search text-xs cursor-pointer"
          >
            <option value="">Desactivados</option>
            <option value="es">Español</option>
            <option value="en">Inglés</option>
            <option value="fr">Francés</option>
            <option value="de">Alemán</option>
            <option value="it">Italiano</option>
            <option value="pt">Portugués</option>
            <option value="ja">Japonés</option>
          </select>
          {(saved === "audiolang" || saved === "sublang") && (
            <p className="text-green-400 text-xs mt-2">✓ Guardado</p>
          )}
        </div>

        {/* Cache */}
        <div className="bg-bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <HardDrive size={15} className="text-yellow-400" />
            <h3 className="text-white font-semibold text-sm">Caché local</h3>
          </div>
          <p className="text-text-muted text-xs mb-4">
            Archivos temporales en <code className="text-text-secondary">~/.cache/streamdeck</code> (descargas de NAS/SMB y otros).
          </p>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-text-secondary text-xs mb-0.5">Espacio usado</p>
              <p className="text-white font-semibold text-sm">
                {cacheBytes === null ? "Calculando..." : cacheBytes === 0 ? "Vacía" : fmtBytes(cacheBytes)}
              </p>
            </div>
            <button
              onClick={handleClearCache}
              disabled={clearing || cacheBytes === 0}
              className="btn-ghost text-xs py-1.5 px-3 text-red-400 hover:text-red-300 border border-red-500/30 hover:border-red-400/50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              <Trash2 size={13} />
              {clearing ? "Limpiando..." : "Limpiar caché"}
            </button>
          </div>
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
