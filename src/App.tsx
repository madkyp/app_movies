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

function MainContent() {
  const view = useStore((s) => s.view);

  switch (view) {
    case "home":
      return <Home />;
    case "movies":
      return <Movies />;
    case "series":
      return <Series />;
    case "search":
      return <Search />;
    case "detail":
      return <Detail />;
    case "player":
      return <Player />;
    case "settings":
      return <Settings />;
    case "watchlist":
      return <Watchlist />;
    case "plex":
      return <PlexBrowser />;
    case "folders":
      return <NetworkFolders />;
    case "history":
      return <History />;
    default:
      return <Home />;
  }
}

export default function App() {
  const { view, setView } = useStore();

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg-primary">
      <Sidebar current={view} onNavigate={setView} />
      <div className="flex flex-col flex-1 overflow-hidden">
        <Navbar />
        <main className="flex flex-1 overflow-hidden">
          <MainContent />
        </main>
      </div>
    </div>
  );
}
