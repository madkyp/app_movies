import { useEffect, useRef, useState, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  FolderOpen, FolderPlus, ChevronRight, Play, Trash2,
  ArrowLeft, Loader2, AlertCircle, HardDrive, Film, Music,
  Search, ArrowUpDown,
} from "lucide-react";
import { useStore } from "../store/useStore";
import { cn } from "../lib/utils";
import type { FolderEntry, SavedFolder } from "../types";

type SortKey = "name-asc" | "name-desc" | "ext" | "dirs-first";
type TypeFilter = "all" | "video" | "audio" | "dirs";

const VIDEO_EXTS = new Set(["mkv", "mp4", "avi", "m4v", "mov", "ts", "wmv", "webm", "m2ts", "mpg", "mpeg"]);
const AUDIO_EXTS = new Set(["flac", "mp3", "aac", "m4a", "ogg", "wav", "opus"]);

function fileIcon(ext: string) {
  if (VIDEO_EXTS.has(ext)) return <Film size={14} className="text-accent flex-shrink-0" />;
  if (AUDIO_EXTS.has(ext)) return <Music size={14} className="text-green-400 flex-shrink-0" />;
  return <HardDrive size={14} className="text-text-muted flex-shrink-0" />;
}

// Strip password from smb://user:pass@host/... for display
function maskSmbPath(path: string): string {
  if (!path.startsWith("smb://")) return path;
  const withoutScheme = path.slice(6);
  const at = withoutScheme.indexOf("@");
  if (at < 0) return path;
  const creds = withoutScheme.slice(0, at);
  const colon = creds.indexOf(":");
  const user = colon >= 0 ? creds.slice(0, colon) : creds;
  return `smb://${user}@${withoutScheme.slice(at + 1)}`;
}

export function NetworkFolders() {
  const { setView, setLocalFileUrl } = useStore();

  const [savedFolders, setSavedFolders] = useState<SavedFolder[]>([]);
  const [browseStack, setBrowseStack] = useState<{ path: string; name: string }[]>([]);
  const [entries, setEntries] = useState<FolderEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("dirs-first");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");

  const visibleEntries = useMemo(() => {
    let list = entries;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((e) => e.name.toLowerCase().includes(q));
    }
    if (typeFilter === "video") list = list.filter((e) => !e.is_dir && VIDEO_EXTS.has(e.extension));
    else if (typeFilter === "audio") list = list.filter((e) => !e.is_dir && AUDIO_EXTS.has(e.extension));
    else if (typeFilter === "dirs") list = list.filter((e) => e.is_dir);

    list = [...list].sort((a, b) => {
      if (sortKey === "dirs-first") {
        if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
        return a.name.localeCompare(b.name);
      }
      if (sortKey === "name-asc") return a.name.localeCompare(b.name);
      if (sortKey === "name-desc") return b.name.localeCompare(a.name);
      if (sortKey === "ext") {
        if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
        return a.extension.localeCompare(b.extension) || a.name.localeCompare(b.name);
      }
      return 0;
    });
    return list;
  }, [entries, search, sortKey, typeFilter]);

  // Add-folder form
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState("");
  const [addPath, setAddPath] = useState("");
  const [addSmbUser, setAddSmbUser] = useState("");
  const [addSmbPass, setAddSmbPass] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkOk, setCheckOk] = useState(false);
  const pathInputRef = useRef<HTMLInputElement>(null);

  const isSmb = addPath.trimStart().startsWith("smb://");
  const isWindows = navigator.userAgent.includes("Windows");

  // Load saved folders on mount
  useEffect(() => {
    invoke<SavedFolder[]>("get_saved_folders")
      .then(setSavedFolders)
      .catch(() => {});
  }, []);

  // Browse a folder
  const openFolder = async (path: string, name: string, push = true) => {
    setError(null);
    setLoading(true);
    setSearch("");
    setTypeFilter("all");
    try {
      const result = await invoke<FolderEntry[]>("browse_folder", { path });
      setEntries(result);
      if (push) setBrowseStack((s) => [...s, { path, name }]);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const goBack = () => {
    if (browseStack.length <= 1) {
      setBrowseStack([]);
      setEntries([]);
      return;
    }
    const newStack = browseStack.slice(0, -1);
    setBrowseStack(newStack);
    const prev = newStack[newStack.length - 1];
    openFolder(prev.path, prev.name, false);
  };

  // Build the full path, embedding SMB credentials if provided
  const buildFullPath = () => {
    const base = addPath.trim();
    if (!base.startsWith("smb://")) return base;
    const withoutScheme = base.slice(6).replace(/^[^@]*@/, ""); // strip any existing creds
    const user = addSmbUser.trim();
    const pass = addSmbPass;
    if (!user) return `smb://${withoutScheme}`;
    const creds = pass ? `${user}:${pass}` : user;
    return `smb://${creds}@${withoutScheme}`;
  };

  const handleAddFolder = async () => {
    const path = buildFullPath();
    if (!path) { setAddError("Introduce una ruta o URL"); return; }
    setAddError(null);
    setCheckOk(false);
    setChecking(true);
    try {
      await invoke<FolderEntry[]>("browse_folder", { path });
    } catch (e) {
      setChecking(false);
      setAddError(String(e));
      return;
    }
    setChecking(false);
    setCheckOk(true);
    const displayPath = addPath.trim();
    const name = addName.trim() || displayPath.split("/").filter(Boolean).pop() || displayPath;
    try {
      await invoke("save_folder", { name, path });
      const updated = await invoke<SavedFolder[]>("get_saved_folders");
      setSavedFolders(updated);
      setShowAdd(false);
      setAddName(""); setAddPath(""); setAddSmbUser(""); setAddSmbPass("");
      setCheckOk(false);
    } catch (e) {
      setCheckOk(false);
      setAddError(String(e));
    }
  };

  const handleRemoveFolder = async (path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await invoke("remove_folder", { path }).catch(() => {});
    setSavedFolders((prev) => prev.filter((f) => f.path !== path));
  };

  const playFile = (entry: FolderEntry) => {
    setLocalFileUrl(entry.path, entry.name);
    setView("player");
  };

  // ── Breadcrumb ───────────────────────────────────────────────────────────────
  const Breadcrumb = () => (
    <div className="flex items-center gap-1 text-xs text-text-muted min-w-0 overflow-hidden">
      <button
        onClick={() => { setBrowseStack([]); setEntries([]); }}
        className="hover:text-white transition-colors flex-shrink-0"
      >
        Mis Carpetas
      </button>
      {browseStack.map((seg, i) => (
        <span key={i} className="flex items-center gap-1 min-w-0">
          <ChevronRight size={11} className="flex-shrink-0" />
          <button
            className={cn(
              "truncate hover:text-white transition-colors",
              i === browseStack.length - 1 ? "text-white" : ""
            )}
            onClick={() => {
              const newStack = browseStack.slice(0, i + 1);
              setBrowseStack(newStack);
              openFolder(newStack[newStack.length - 1].path, newStack[newStack.length - 1].name, false);
            }}
          >
            {seg.name}
          </button>
        </span>
      ))}
    </div>
  );

  // ── Root: list saved folders ─────────────────────────────────────────────────
  if (browseStack.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-white text-xl font-bold">Mis Carpetas</h1>
            <p className="text-text-secondary text-sm mt-0.5">Carpetas de red y locales con contenido multimedia</p>
          </div>
          <button
            onClick={() => { setShowAdd((v) => !v); setTimeout(() => pathInputRef.current?.focus(), 50); }}
            className="btn-primary py-1.5 px-3 text-xs flex items-center gap-1.5"
          >
            <FolderPlus size={14} /> Añadir carpeta
          </button>
        </div>

        {showAdd && (
          <div className="bg-bg-card border border-border rounded-xl p-4 mb-4 space-y-3">
            <p className="text-white text-sm font-semibold">Añadir carpeta</p>
            <div className="space-y-2">
              <input
                ref={pathInputRef}
                type="text"
                placeholder={isWindows
                  ? "C:\\Videos  |  \\\\192.168.1.10\\Peliculas  |  Z:\\"
                  : "/mnt/nas/Peliculas  |  smb://192.168.1.10"
                }
                value={addPath}
                onChange={(e) => { setAddPath(e.target.value); setCheckOk(false); setAddError(null); }}
                onKeyDown={(e) => { if (e.key === "Enter") handleAddFolder(); }}
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="none"
                autoComplete="off"
                data-form-type="other"
                className="w-full bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-text-muted focus:outline-none focus:border-accent font-mono"
              />
              {isSmb && (
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Usuario (vacío = invitado)"
                    value={addSmbUser}
                    onChange={(e) => { setAddSmbUser(e.target.value); setCheckOk(false); setAddError(null); }}
                    onKeyDown={(e) => { if (e.key === "Enter") handleAddFolder(); }}
                    spellCheck={false}
                    autoComplete="off"
                    data-form-type="other"
                    className="flex-1 bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-text-muted focus:outline-none focus:border-accent"
                  />
                  <input
                    type="password"
                    placeholder="Contraseña"
                    value={addSmbPass}
                    onChange={(e) => { setAddSmbPass(e.target.value); setCheckOk(false); setAddError(null); }}
                    onKeyDown={(e) => { if (e.key === "Enter") handleAddFolder(); }}
                    autoComplete="new-password"
                    data-form-type="other"
                    className="flex-1 bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-text-muted focus:outline-none focus:border-accent"
                  />
                </div>
              )}
              <input
                type="text"
                placeholder="Nombre para mostrar (opcional)"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAddFolder(); }}
                spellCheck={false}
                autoComplete="off"
                data-form-type="other"
                className="w-full bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-text-muted focus:outline-none focus:border-accent"
              />
            </div>
            {addError && (
              <p className="text-red-400 text-xs flex items-center gap-1">
                <AlertCircle size={12} /> {addError}
              </p>
            )}
            {checkOk && (
              <p className="text-green-400 text-xs flex items-center gap-1">
                ✓ Carpeta accesible — guardando…
              </p>
            )}
            <div className="flex gap-2 items-center">
              <button
                onClick={handleAddFolder}
                disabled={checking}
                className="btn-primary py-1.5 px-4 text-xs flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {checking ? (
                  <><Loader2 size={12} className="animate-spin" /> Comprobando…</>
                ) : (
                  "Guardar"
                )}
              </button>
              <button
                onClick={() => { setShowAdd(false); setAddError(null); setCheckOk(false); }}
                disabled={checking}
                className="btn-ghost py-1.5 px-3 text-xs disabled:opacity-50"
              >
                Cancelar
              </button>
            </div>
            {isWindows ? (
              <p className="text-text-muted text-[10px] leading-relaxed">
                <strong className="text-text-secondary">Local:</strong> <code className="bg-bg-secondary px-1 rounded">C:\Videos</code> —{" "}
                <strong className="text-text-secondary">Red UNC:</strong> <code className="bg-bg-secondary px-1 rounded">\\192.168.1.10\Peliculas</code> —{" "}
                <strong className="text-text-secondary">Unidad mapeada:</strong> <code className="bg-bg-secondary px-1 rounded">Z:\</code>.{" "}
                Para NAS con contraseña usa <code className="bg-bg-secondary px-1 rounded">smb://usuario:pass@ip/share</code>.
              </p>
            ) : (
              <p className="text-text-muted text-[10px] leading-relaxed">
                <strong className="text-text-secondary">Local/montada:</strong> <code className="bg-bg-secondary px-1 rounded">/mnt/nas/Peliculas</code> —{" "}
                <strong className="text-text-secondary">Red (SMB):</strong> <code className="bg-bg-secondary px-1 rounded">smb://192.168.1.10/Peliculas</code>.{" "}
                Requiere <code className="bg-bg-secondary px-1 rounded">smbclient</code> (paquete <code className="bg-bg-secondary px-1 rounded">samba</code>). Deja usuario vacío para invitado.
              </p>
            )}
          </div>
        )}

        {savedFolders.length === 0 && !showAdd && (
          <div className="flex flex-col items-center justify-center py-20 text-text-muted gap-4">
            <FolderOpen size={52} className="opacity-20" />
            <p className="text-sm">No hay carpetas guardadas</p>
            <button
              onClick={() => { setShowAdd(true); setTimeout(() => pathInputRef.current?.focus(), 50); }}
              className="btn-primary py-1.5 px-4 text-sm"
            >
              <FolderPlus size={14} /> Añadir primera carpeta
            </button>
          </div>
        )}

        <div className="space-y-2 max-w-2xl">
          {savedFolders.map((f) => (
            <div
              key={f.path}
              onClick={() => openFolder(f.path, f.name)}
              className="flex items-center gap-3 p-4 rounded-xl border bg-bg-card border-border hover:border-accent/50 hover:bg-bg-hover cursor-pointer transition-all group"
            >
              <FolderOpen size={22} className="text-accent flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium truncate">{f.name}</p>
                <p className="text-text-muted text-xs truncate mt-0.5">{maskSmbPath(f.path)}</p>
              </div>
              <button
                onClick={(e) => handleRemoveFolder(f.path, e)}
                className="text-text-muted hover:text-red-400 transition-colors p-1.5 opacity-0 group-hover:opacity-100"
                title="Eliminar"
              >
                <Trash2 size={14} />
              </button>
              <ChevronRight size={16} className="text-text-muted flex-shrink-0" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Browsing a folder ────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex flex-col gap-2 px-6 py-3 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={goBack} className="btn-ghost py-1 px-2 text-xs flex-shrink-0">
            <ArrowLeft size={13} /> Volver
          </button>
          <Breadcrumb />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[140px] max-w-xs">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-bg-secondary border border-border rounded-lg pl-7 pr-3 py-1.5 text-xs text-white placeholder:text-text-muted focus:outline-none focus:border-accent"
            />
          </div>

          {/* Type filter */}
          <div className="flex gap-1">
            {(["all", "dirs", "video", "audio"] as TypeFilter[]).map((f) => {
              const label = f === "all" ? "Todo" : f === "dirs" ? "Carpetas" : f === "video" ? "Vídeo" : "Audio";
              return (
                <button
                  key={f}
                  onClick={() => setTypeFilter(f)}
                  className={cn(
                    "px-2.5 py-1 rounded-full text-xs font-medium border transition-all",
                    typeFilter === f
                      ? "bg-accent text-white border-accent"
                      : "bg-bg-card text-text-secondary border-border hover:border-accent/50 hover:text-white"
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Sort */}
          <div className="flex items-center gap-1 ml-auto">
            <ArrowUpDown size={13} className="text-text-muted" />
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="bg-bg-secondary border border-border rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-accent cursor-pointer"
            >
              <option value="dirs-first">Carpetas primero</option>
              <option value="name-asc">Nombre A→Z</option>
              <option value="name-desc">Nombre Z→A</option>
              <option value="ext">Por extensión</option>
            </select>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={32} className="animate-spin text-accent" />
          </div>
        )}

        {error && (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm max-w-xl">
            <AlertCircle size={18} className="flex-shrink-0" />
            {error}
          </div>
        )}

        {!loading && !error && entries.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-text-muted gap-3">
            <FolderOpen size={40} className="opacity-20" />
            <p className="text-sm">Carpeta vacía o sin archivos multimedia</p>
          </div>
        )}

        {!loading && !error && entries.length > 0 && visibleEntries.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-text-muted gap-3">
            <Search size={40} className="opacity-20" />
            <p className="text-sm">Sin resultados para los filtros actuales</p>
          </div>
        )}

        {!loading && !error && (
          <div className="space-y-1 max-w-3xl">
            {visibleEntries.map((entry) => (
              <div
                key={entry.path}
                onClick={() => entry.is_dir ? openFolder(entry.path, entry.name) : playFile(entry)}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl border transition-all cursor-pointer",
                  entry.is_dir
                    ? "bg-bg-card border-border hover:border-accent/40 hover:bg-bg-hover"
                    : "bg-bg-card border-border hover:border-accent/60 hover:bg-accent/5"
                )}
              >
                {entry.is_dir ? (
                  <FolderOpen size={18} className="text-accent/70 flex-shrink-0" />
                ) : (
                  fileIcon(entry.extension)
                )}

                <span className="flex-1 text-sm text-white truncate">{entry.name}</span>

                {entry.size && (
                  <span className="text-text-muted text-xs flex-shrink-0">{entry.size}</span>
                )}

                {entry.is_dir ? (
                  <ChevronRight size={15} className="text-text-muted flex-shrink-0" />
                ) : (
                  <button
                    onClick={(e) => { e.stopPropagation(); playFile(entry); }}
                    className="btn-primary py-1 px-3 text-xs flex-shrink-0 flex items-center gap-1"
                  >
                    <Play size={11} className="fill-white" /> Play
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
