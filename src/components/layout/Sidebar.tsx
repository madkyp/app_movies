import { Home, Film, Tv, Bookmark, Settings, Server, FolderOpen, History } from "lucide-react";
import logo from "../../assets/logo.png";
import { cn } from "../../lib/utils";
import type { ViewType } from "../../types";

interface Props {
  current: ViewType;
  onNavigate: (v: ViewType) => void;
}

const nav = [
  { id: "home" as ViewType, icon: Home, label: "Inicio" },
  { id: "movies" as ViewType, icon: Film, label: "Películas" },
  { id: "series" as ViewType, icon: Tv, label: "Series" },
  { id: "watchlist" as ViewType, icon: Bookmark, label: "Mi Lista" },
  { id: "plex" as ViewType, icon: Server, label: "Plex" },
  { id: "folders" as ViewType, icon: FolderOpen, label: "Mis Carpetas" },
  { id: "history" as ViewType, icon: History, label: "Historial" },
];

export function Sidebar({ current, onNavigate }: Props) {
  return (
    <aside className="w-[200px] flex-shrink-0 flex flex-col border-r border-border bg-bg-primary h-full">
      <div className="p-5 mb-2">
        <div className="flex items-center gap-3">
          <img src={logo} alt="logo" className="w-10 h-10 rounded-xl object-contain" />
          <div className="flex flex-col leading-tight">
            <span className="text-accent font-bold text-sm tracking-wide">TheFoundry</span>
            <span className="text-white font-semibold text-sm tracking-tight">StreamDeck</span>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 space-y-1">
        <p className="text-text-muted text-[10px] font-semibold uppercase tracking-widest px-3 mb-2 mt-1">Explorar</p>
        {nav.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => onNavigate(id)}
            className={cn("sidebar-item w-full", current === id && "active")}
          >
            <Icon size={17} />
            {label}
          </button>
        ))}
      </nav>

      <div className="px-3 pb-4 border-t border-border pt-4">
        <button
          onClick={() => onNavigate("settings")}
          className={cn("sidebar-item w-full", current === "settings" && "active")}
        >
          <Settings size={17} />
          Ajustes
        </button>
      </div>
    </aside>
  );
}
