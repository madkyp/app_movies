import { Search, X } from "lucide-react";
import { useStore } from "../../store/useStore";

export function Navbar() {
  const { searchQuery, setSearchQuery, setView } = useStore();

  function handleChange(v: string) {
    setSearchQuery(v);
    if (v.trim()) setView("search");
    else setView("home");
  }

  return (
    <header className="h-14 flex-shrink-0 flex items-center gap-4 px-6 border-b border-border bg-bg-primary/80 backdrop-blur-sm">
      <div className="flex-1 max-w-md relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Buscar películas, series..."
          className="input-search pl-9 pr-8"
        />
        {searchQuery && (
          <button
            onClick={() => handleChange("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-white"
          >
            <X size={14} />
          </button>
        )}
      </div>
    </header>
  );
}
