import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Media, MediaDetail, AppSettings, ViewType } from "../types";

interface AppState {
  view: ViewType;
  selectedMedia: MediaDetail | null;
  searchQuery: string;
  settings: AppSettings;
  watchlist: Media[];
  continueWatching: { media: Media; progress: number; timestamp: number }[];
  plexDirectUrl: string | null;
  plexDirectDuration: number;
  localFileUrl: string | null;       // filesystem/smb:// path of file being played from network folders
  localFileTitle: string;

  setView: (view: ViewType) => void;
  setSelectedMedia: (media: MediaDetail | null) => void;
  setSearchQuery: (q: string) => void;
  updateSettings: (s: Partial<AppSettings>) => void;
  addToWatchlist: (m: Media) => void;
  removeFromWatchlist: (id: number) => void;
  isInWatchlist: (id: number) => boolean;
  setPlexDirectUrl: (url: string | null, durationSecs?: number) => void;
  setLocalFileUrl: (url: string | null, title?: string) => void;
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
      },
      watchlist: [],
      continueWatching: [],
      plexDirectUrl: null,
      plexDirectDuration: 0,
      localFileUrl: null,
      localFileTitle: "",

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
      setPlexDirectUrl: (url, durationSecs = 0) => set({ plexDirectUrl: url, plexDirectDuration: durationSecs }),
      setLocalFileUrl: (url, title = "") => set({ localFileUrl: url, localFileTitle: title }),
    }),
    { name: "streamdeck-store", partialize: (s) => ({ settings: s.settings, watchlist: s.watchlist }) }
  )
);
