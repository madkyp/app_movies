import { useTrending, usePopularMovies, usePopularSeries } from "../hooks/useTmdb";
import { HeroSection } from "../components/catalog/HeroSection";
import { MediaRow } from "../components/catalog/MediaRow";
import { useStore } from "../store/useStore";
import { useMediaDetail } from "../hooks/useTmdb";
import type { Media } from "../types";

export function Home() {
  const { data: trending, loading: trendingLoading } = useTrending();
  const { data: movies, loading: moviesLoading } = usePopularMovies();
  const { data: series, loading: seriesLoading } = usePopularSeries();
  const { setView } = useStore();
  const { fetchDetail } = useMediaDetail();

  const hero = trending[0] ?? null;

  async function handleSelect(m: Media) {
    await fetchDetail(m.id, m.media_type);
    setView("detail");
  }

  async function handlePlay(m: Media) {
    await fetchDetail(m.id, m.media_type);
    setView("detail");
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5">
      {hero && !trendingLoading && (
        <HeroSection media={hero} onPlay={handlePlay} onInfo={handleSelect} />
      )}

      <MediaRow
        title="Tendencias de la semana"
        items={trending.slice(1, 15)}
        loading={trendingLoading}
        onSelect={handleSelect}
        onSeeAll={() => setView("movies")}
      />
      <MediaRow
        title="Películas populares"
        items={movies.slice(0, 15)}
        loading={moviesLoading}
        onSelect={handleSelect}
        onSeeAll={() => setView("movies")}
      />
      <MediaRow
        title="Series populares"
        items={series.slice(0, 15)}
        loading={seriesLoading}
        onSelect={handleSelect}
        onSeeAll={() => setView("series")}
      />
    </div>
  );
}
