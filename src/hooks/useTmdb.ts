import { useState, useEffect, useCallback } from "react";
import { TMDB_BASE_URL } from "../lib/utils";
import { useStore } from "../store/useStore";
import type { Media, MediaDetail, Episode, Review } from "../types";

export const TMDB_FALLBACK_KEY = import.meta.env.VITE_TMDB_KEY ?? "14aa1963b6c809078a17bd39f37a08e8";
const FALLBACK_KEY = TMDB_FALLBACK_KEY;

function useApiKey() {
  const stored = useStore((s) => s.settings.tmdbApiKey);
  return stored || FALLBACK_KEY;
}

async function tmdbFetch<T>(path: string, apiKey: string): Promise<T> {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${TMDB_BASE_URL}${path}${sep}api_key=${apiKey}&language=es-ES`);
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  return res.json();
}

export function useTrending() {
  const apiKey = useApiKey();
  const [data, setData] = useState<Media[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!apiKey) return;
    setLoading(true);
    tmdbFetch<{ results: Media[] }>("/trending/all/week", apiKey)
      .then((r) => setData(r.results.map((m) => ({ ...m, media_type: m.media_type || "movie" }))))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [apiKey]);

  return { data, loading };
}

export function usePopularMovies() {
  const apiKey = useApiKey();
  const [data, setData] = useState<Media[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!apiKey) return;
    setLoading(true);
    tmdbFetch<{ results: Media[] }>("/movie/popular", apiKey)
      .then((r) => setData(r.results.map((m) => ({ ...m, media_type: "movie" as const }))))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [apiKey]);

  return { data, loading };
}

export function usePopularSeries() {
  const apiKey = useApiKey();
  const [data, setData] = useState<Media[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!apiKey) return;
    setLoading(true);
    tmdbFetch<{ results: Media[] }>("/tv/popular", apiKey)
      .then((r) => setData(r.results.map((m) => ({ ...m, media_type: "tv" as const }))))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [apiKey]);

  return { data, loading };
}

export function useSearch(query: string) {
  const apiKey = useApiKey();
  const [data, setData] = useState<Media[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query || !apiKey) { setData([]); return; }
    setLoading(true);
    const t = setTimeout(() => {
      tmdbFetch<{ results: Media[] }>(`/search/multi?query=${encodeURIComponent(query)}`, apiKey)
        .then((r) => setData(r.results.filter((m) => m.media_type === "movie" || m.media_type === "tv")))
        .catch(console.error)
        .finally(() => setLoading(false));
    }, 350);
    return () => clearTimeout(t);
  }, [query, apiKey]);

  return { data, loading };
}

export function useSeasonEpisodes(tvId: number | null, seasonNumber: number | null) {
  const apiKey = useApiKey();
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!apiKey || tvId == null || seasonNumber == null) {
      setEpisodes([]);
      return;
    }
    setLoading(true);
    tmdbFetch<{ episodes: Episode[] }>(`/tv/${tvId}/season/${seasonNumber}`, apiKey)
      .then((r) => setEpisodes(r.episodes ?? []))
      .catch((e) => { console.error(e); setEpisodes([]); })
      .finally(() => setLoading(false));
  }, [apiKey, tvId, seasonNumber]);

  return { episodes, loading };
}

export function useMediaReviews(id: number | null, type: "movie" | "tv") {
  const apiKey = useApiKey();
  const [reviews, setReviews] = useState<Review[]>([]);

  useEffect(() => {
    if (!apiKey || !id) { setReviews([]); return; }
    tmdbFetch<{ results: Review[] }>(`/${type}/${id}/reviews`, apiKey)
      .then((r) => setReviews(r.results.slice(0, 4)))
      .catch(() => setReviews([]));
  }, [apiKey, id, type]);

  return { reviews };
}

export function useMediaDetail() {
  const apiKey = useApiKey();
  const setSelectedMedia = useStore((s) => s.setSelectedMedia);
  const [loading, setLoading] = useState(false);

  const fetchDetail = useCallback(async (id: number, type: "movie" | "tv") => {
    if (!apiKey) return;
    setLoading(true);
    try {
      const append = "credits,videos,external_ids";
      const data = await tmdbFetch<MediaDetail>(
        `/${type}/${id}?append_to_response=${append}`,
        apiKey
      );
      const detail = { ...data, media_type: type };
      // Flatten imdb_id from external_ids so Player can access it directly
      if (data.external_ids?.imdb_id) {
        (detail as any).imdb_id = data.external_ids.imdb_id;
      }
      setSelectedMedia(detail);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [apiKey, setSelectedMedia]);

  return { loading, fetchDetail };
}
