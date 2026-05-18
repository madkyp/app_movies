import { useState, useEffect, useCallback } from "react";
import { useStore } from "../store/useStore";
import type { PlexLibrary, PlexItem } from "../types";

const DEFAULT_PLEX_URL   = "http://thefoundryplex.duckdns.org:32400";
const DEFAULT_PLEX_TOKEN = "WJcJdsyCc68r29CCvRtP";

function usePlexConfig() {
  const settings = useStore((s) => s.settings);
  const plexUrl   = settings?.plexUrl   || DEFAULT_PLEX_URL;
  const plexToken = settings?.plexToken || DEFAULT_PLEX_TOKEN;
  return { plexUrl: plexUrl.replace(/\/$/, ""), plexToken };
}

async function plexFetch<T>(path: string, plexUrl: string, token: string): Promise<T> {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${plexUrl}${path}${sep}X-Plex-Token=${token}`, {
    headers: {
      Accept: "application/json",
      "X-Plex-Product": "StreamDeck",
      "X-Plex-Version": "1.0",
      "X-Plex-Client-Identifier": "streamdeck-app",
    },
  });
  if (!res.ok) throw new Error(`Plex ${res.status}: ${path}`);
  return res.json();
}

interface PlexContainer<T> {
  MediaContainer: T;
}

// Returns the full URL for a Plex image or stream part
export function plexAssetUrl(plexUrl: string, token: string, path?: string): string | null {
  if (!path || !plexUrl || !token) return null;
  return `${plexUrl.replace(/\/$/, "")}${path}?X-Plex-Token=${token}`;
}

// Returns the direct-stream URL for the first part of a Plex item
export function plexStreamUrl(plexUrl: string, token: string, item: PlexItem): string | null {
  const part = item.Media?.[0]?.Part?.[0];
  if (!part) return null;
  return plexAssetUrl(plexUrl, token, part.key);
}

// ── Library sections ─────────────────────────────────────────────────────────

export function usePlexLibraries() {
  const { plexUrl, plexToken } = usePlexConfig();
  const [libraries, setLibraries] = useState<PlexLibrary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rev, setRev] = useState(0);

  useEffect(() => {
    if (!plexUrl || !plexToken) return;
    setLoading(true);
    setError(null);
    plexFetch<PlexContainer<{ Directory: PlexLibrary[] }>>("/library/sections", plexUrl, plexToken)
      .then((r) => setLibraries((r.MediaContainer.Directory ?? []).filter((l) => l.type === "movie" || l.type === "show")))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [plexUrl, plexToken, rev]);

  const refetch = useCallback(() => setRev((r) => r + 1), []);

  return { libraries, loading, error, refetch };
}

// ── Items in a library section ────────────────────────────────────────────────

export function usePlexLibraryItems(sectionKey: string | null) {
  const { plexUrl, plexToken } = usePlexConfig();
  const [items, setItems] = useState<PlexItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!sectionKey || !plexUrl || !plexToken) { setItems([]); return; }
    setLoading(true);
    plexFetch<PlexContainer<{ Metadata?: PlexItem[] }>>(
      `/library/sections/${sectionKey}/all`,
      plexUrl,
      plexToken,
    )
      .then((r) => setItems(r.MediaContainer.Metadata ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [sectionKey, plexUrl, plexToken]);

  return { items, loading };
}

// ── Children of an item (seasons of a show, episodes of a season) ─────────────

export function usePlexChildren(ratingKey: string | null) {
  const { plexUrl, plexToken } = usePlexConfig();
  const [children, setChildren] = useState<PlexItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ratingKey || !plexUrl || !plexToken) { setChildren([]); return; }
    setLoading(true);
    plexFetch<PlexContainer<{ Metadata?: PlexItem[] }>>(
      `/library/metadata/${ratingKey}/children`,
      plexUrl,
      plexToken,
    )
      .then((r) => setChildren(r.MediaContainer.Metadata ?? []))
      .catch(() => setChildren([]))
      .finally(() => setLoading(false));
  }, [ratingKey, plexUrl, plexToken]);

  return { children, loading };
}

// ── Search ────────────────────────────────────────────────────────────────────

export function usePlexSearch(query: string) {
  const { plexUrl, plexToken } = usePlexConfig();
  const [results, setResults] = useState<PlexItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query || !plexUrl || !plexToken) { setResults([]); return; }
    setLoading(true);
    const t = setTimeout(() => {
      plexFetch<PlexContainer<{ Metadata?: PlexItem[]; Hub?: { Metadata?: PlexItem[] }[] }>>(
        `/search?query=${encodeURIComponent(query)}&limit=50`,
        plexUrl,
        plexToken,
      )
        .then((r) => {
          const direct = r.MediaContainer.Metadata ?? [];
          const hub = (r.MediaContainer.Hub ?? []).flatMap((h) => h.Metadata ?? []);
          setResults([...direct, ...hub].filter((m) => m.type === "movie" || m.type === "show" || m.type === "episode"));
        })
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 350);
    return () => clearTimeout(t);
  }, [query, plexUrl, plexToken]);

  return { results, loading };
}

// ── Match a TMDB item to Plex by IMDB/TMDB ID or title ───────────────────────

export function usePlexMatch(params: {
  imdbId?: string | null;
  tmdbId?: number | null;
  title: string;
  type: "movie" | "tv";
}) {
  const { plexUrl, plexToken } = usePlexConfig();
  const [match, setMatch] = useState<PlexItem | null>(null);
  const [loading, setLoading] = useState(false);

  const { imdbId, tmdbId, title, type } = params;

  const findMatch = useCallback(async () => {
    if (!plexUrl || !plexToken || !title) return;
    setLoading(true);
    try {
      const r = await plexFetch<PlexContainer<{ Metadata?: PlexItem[]; Hub?: { Metadata?: PlexItem[] }[] }>>(
        `/search?query=${encodeURIComponent(title)}&limit=30`,
        plexUrl,
        plexToken,
      );
      const direct = r.MediaContainer.Metadata ?? [];
      const hub = (r.MediaContainer.Hub ?? []).flatMap((h) => h.Metadata ?? []);
      const all = [...direct, ...hub];

      const plexType = type === "tv" ? "show" : "movie";
      const candidates = all.filter((m) => m.type === plexType);

      // Priority 1: match by external ID
      if (imdbId || tmdbId) {
        const byId = candidates.find((m) =>
          m.Guid?.some(
            (g) =>
              (imdbId && g.id === `imdb://${imdbId}`) ||
              (tmdbId && g.id === `tmdb://${tmdbId}`),
          ),
        );
        if (byId) { setMatch(byId); return; }
      }

      // Priority 2: exact title match
      const byTitle = candidates.find(
        (m) => m.title.toLowerCase() === title.toLowerCase(),
      );
      setMatch(byTitle ?? null);
    } catch {
      setMatch(null);
    } finally {
      setLoading(false);
    }
  }, [plexUrl, plexToken, imdbId, tmdbId, title, type]);

  useEffect(() => { findMatch(); }, [findMatch]);

  return { match, loading };
}
