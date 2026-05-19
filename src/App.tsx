import { useState } from "react";
import { Play, X } from "lucide-react";
import { useStore } from "./store/useStore";
import { Sidebar } from "./components/layout/Sidebar";
import { Navbar } from "./components/layout/Navbar";
import { Home } from "./views/Home";
import { Movies } from "./views/Movies";
import { Series } from "./views/Series";
import { Search } from "./views/Search";
import { Detail } from "./views/Detail";
import { Player } from "./views/Player";
import { Settings } from "./views/Settings";
import { Watchlist } from "./views/Watchlist";
import { PlexBrowser } from "./views/PlexBrowser";
import { NetworkFolders } from "./views/NetworkFolders";
import { History } from "./views/History";
import type { ViewType } from "./types";

function MainContent() {
  const view = useStore((s) => s.view);

  switch (view) {
    case "home":      return <Home />;
    case "movies":    return <Movies />;
    case "series":    return <Series />;
    case "search":    return <Search />;
    case "detail":    return <Detail />;
    case "player":    return <Player />;
    case "settings":  return <Settings />;
    case "watchlist": return <Watchlist />;
    case "plex":      return <PlexBrowser />;
    case "folders":   return <NetworkFolders />;
    case "history":   return <History />;
    default:          return <Home />;
  }
}

function LeavePlayerModal({ onConfirm, onCancel }: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="bg-bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
            <Play size={18} className="text-accent fill-accent" />
          </div>
          <div>
            <h2 className="text-white font-semibold text-base">¿Salir de la reproducción?</h2>
            <p className="text-text-muted text-xs mt-0.5">Se interrumpirá la reproducción actual</p>
          </div>
        </div>

        <p className="text-text-secondary text-sm mb-6">
          Tu progreso se ha guardado automáticamente. Puedes reanudar desde el Historial o desde "Continuar viendo".
        </p>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 btn-ghost text-sm py-2.5"
          >
            <X size={14} /> Continuar viendo
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 btn-primary text-sm py-2.5 bg-red-600 hover:bg-red-500 border-red-600 hover:border-red-500"
          >
            Salir
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const { view, setView } = useStore();
  const [pendingNav, setPendingNav] = useState<ViewType | null>(null);

  function handleNavigate(target: ViewType) {
    if (view === "player" && target !== "player") {
      setPendingNav(target);
    } else {
      setView(target);
    }
  }

  function confirmLeave() {
    if (pendingNav) setView(pendingNav);
    setPendingNav(null);
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg-primary">
      <Sidebar current={view} onNavigate={handleNavigate} />
      <div className="flex flex-col flex-1 overflow-hidden">
        <Navbar />
        <main className="flex flex-1 overflow-hidden">
          <MainContent />
        </main>
      </div>

      {pendingNav && (
        <LeavePlayerModal
          onConfirm={confirmLeave}
          onCancel={() => setPendingNav(null)}
        />
      )}
    </div>
  );
}
