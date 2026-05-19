export interface Media {
  id: number;
  title?: string;
  name?: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  release_date?: string;
  first_air_date?: string;
  media_type: "movie" | "tv";
  genre_ids?: number[];
}

export interface Season {
  id: number;
  season_number: number;
  episode_count: number;
  name: string;
  poster_path: string | null;
  air_date: string | null;
  overview: string;
}

export interface Episode {
  id: number;
  episode_number: number;
  season_number: number;
  name: string;
  overview: string;
  still_path: string | null;
  air_date: string | null;
  runtime: number | null;
  vote_average?: number;
}

export interface MediaDetail extends Media {
  genres: { id: number; name: string }[];
  runtime?: number;
  number_of_seasons?: number;
  number_of_episodes?: number;
  status: string;
  tagline?: string;
  imdb_id?: string;
  external_ids?: { imdb_id?: string };
  seasons?: Season[];
  credits?: {
    cast: { id: number; name: string; character: string; profile_path: string | null }[];
  };
  videos?: { results: { key: string; site: string; type: string }[] };
}

export interface Review {
  id: string;
  author: string;
  content: string;
  created_at: string;
  author_details?: { rating?: number | null; avatar_path?: string | null };
}

export type TorrentLanguage = "es" | "es-lat" | "dual" | "en" | "multi" | "unknown";

export interface TorrentSource {
  title: string;
  magnet: string;
  quality: string;
  codec: string;
  size: string;
  seeds: number;
  peers: number;
  provider: string;
  language: TorrentLanguage;
}

export interface AppSettings {
  tmdbApiKey: string;
  downloadPath: string;
  plexUrl: string;
  plexToken: string;
  openSubtitlesApiKey: string;
}

export interface HistoryEntry {
  id: string;
  title: string;
  poster: string | null;
  media_type: "movie" | "tv" | "file";
  tmdb_id?: number;
  imdb_id?: string;
  source: "torrent" | "plex" | "local";
  playedAt: number;
  path?: string;
  magnet?: string;
  episode?: { id?: number; season: number; episode: number; name: string };
  progressSecs?: number;
  durationSecs?: number;
}

export interface SubtitleResult {
  file_id: number;
  file_name: string;
  language: string;
  release: string;
  download_count: number;
}

export type ViewType = "home" | "movies" | "series" | "detail" | "player" | "settings" | "search" | "watchlist" | "plex" | "folders" | "history";

export interface FolderEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: string;
  extension: string;
}

export interface SavedFolder {
  name: string;
  path: string;
}

// ── Plex types ────────────────────────────────────────────────────────────────

export interface PlexLibrary {
  key: string;
  type: "movie" | "show" | "music" | "photo" | string;
  title: string;
  thumb?: string;
  art?: string;
}

export interface PlexItem {
  ratingKey: string;
  key: string;
  title: string;
  originalTitle?: string;
  year?: number;
  type: "movie" | "show" | "season" | "episode" | string;
  thumb?: string;
  art?: string;
  summary?: string;
  duration?: number;       // ms
  index?: number;          // season or episode number
  parentIndex?: number;    // season number (on episodes)
  parentTitle?: string;    // show title (on seasons/episodes)
  grandparentTitle?: string;
  viewCount?: number;
  viewOffset?: number;     // ms — resume position
  leafCount?: number;      // total episodes in show/season
  childCount?: number;     // season count on shows
  Guid?: { id: string }[];
  Media?: PlexMedia[];
}

export interface PlexMedia {
  id: number;
  bitrate?: number;
  width?: number;
  height?: number;
  videoCodec?: string;
  audioCodec?: string;
  Part: PlexPart[];
}

export interface PlexPart {
  key: string;   // e.g. "/library/parts/67890/file.mkv"
  id: number;
  file?: string;
  size?: number;
  duration?: number;
}
