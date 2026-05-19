import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Media, MediaDetail, AppSettings, ViewType, HistoryEntry } from "../types";

interface AppState {
  view: ViewType;
  selectedMedia: MediaDetail | null;
  searchQuery: string;
  settings: AppSettings;
  watchlist: Media[];
  history: HistoryEntry[];
  continueWatching: { media: Media; progress: number; timestamp: number }[];
  plexDirectUrl: string | null;
  plexDirectDuration: number;
  localFileUrl: string | null;
  localFileTitle: string;
  pendingTorrentResume: { magnet: string; episode?: { id?: number; season: number; episode: number; name: string } } | null;

  setView: (view: ViewType) => void;
  setSelectedMedia: (media: MediaDetail | null) => void;
  setSearchQuery: (q: string) => void;
  updateSettings: (s: Partial<AppSettings>) => void;
  addToWatchlist: (m: Media) => void;
  removeFromWatchlist: (id: number) => void;
  isInWatchlist: (id: number) => boolean;
  addToHistory: (entry: HistoryEntry) => void;
  updateHistoryProgress: (id: string, progressSecs: number, durationSecs: number) => void;
  removeFromHistory: (id: string) => void;
  clearHistory: () => void;
  setPlexDirectUrl: (url: string | null, durationSecs?: number) => void;
  setLocalFileUrl: (url: string | null, title?: string) => void;
  setPendingTorrentResume: (r: { magnet: string; episode?: { id?: number; season: number; episode: number; name: string } } | null) => void;
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      view: "home",
      selectedMedia: null,
      searchQuery: "",
      settings: {
        tmdbApiKey: "",
        downloadPath: "",
        plexUrl: "",
        plexToken: "",
        openSubtitlesApiKey: "",
      },
      watchlist: [],
      history: [],
      continueWatching: [],
      plexDirectUrl: null,
      plexDirectDuration: 0,
      localFileUrl: null,
      localFileTitle: "",
      pendingTorrentResume: null,

      setView: (view) => set({ view }),
      setSelectedMedia: (media) => set({ selectedMedia: media }),
      setSearchQuery: (searchQuery) => set({ searchQuery }),
      updateSettings: (s) =>
        set((state) => ({ settings: { ...state.settings, ...s } })),
      addToWatchlist: (m) =>
        set((state) => ({
          watchlist: state.watchlist.find((x) => x.id === m.id)
            ? state.watchlist
            : [m, ...state.watchlist],
        })),
      removeFromWatchlist: (id) =>
        set((state) => ({ watchlist: state.watchlist.filter((x) => x.id !== id) })),
      isInWatchlist: (id) => get().watchlist.some((x) => x.id === id),
      addToHistory: (entry) =>
        set((state) => {
          // Dedup: same tmdb_id or same local path → update timestamp
          const filtered = state.history.filter((h) => {
            if (entry.tmdb_id && h.tmdb_id === entry.tmdb_id) {
              // For series, also match episode
              if (entry.episode && h.episode) {
                return !(h.episode.season === entry.episode.season && h.episode.episode === entry.episode.episode);
              }
              return entry.media_type !== "movie";
            }
            if (entry.path && h.path === entry.path) return false;
            return true;
          });
          return { history: [entry, ...filtered].slice(0, 100) };
        }),
      updateHistoryProgress: (id, progressSecs, durationSecs) =>
        set((state) => ({
          history: state.history.map((h) =>
            h.id === id ? { ...h, progressSecs, durationSecs } : h
          ),
        })),
      removeFromHistory: (id) =>
        set((state) => ({ history: state.history.filter((h) => h.id !== id) })),
      clearHistory: () => set({ history: [] }),
      setPlexDirectUrl: (url, durationSecs = 0) => set({ plexDirectUrl: url, plexDirectDuration: durationSecs }),
      setLocalFileUrl: (url, title = "") => set({ localFileUrl: url, localFileTitle: title }),
      setPendingTorrentResume: (r) => set({ pendingTorrentResume: r }),
    }),
    {
      name: "streamdeck-store",
      partialize: (s) => ({ settings: s.settings, watchlist: s.watchlist, history: s.history }),
    }
  )
);
