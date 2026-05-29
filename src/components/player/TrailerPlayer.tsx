import { useRef, useState } from "react";
import { Play, Pause, Volume2, VolumeX, Maximize2, Loader2 } from "lucide-react";

function fmt(s: number): string {
  if (!isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

interface TrailerPlayerProps {
  url: string;          // mux endpoint (when muxed) or direct progressive URL
  durationSecs: number; // from yt-dlp (0 if unknown)
  muxed: boolean;       // true → supports ?start= HTTP-seek + needs reconnect handling
  onError: () => void;  // fall back to the YouTube embed
}

export function TrailerPlayer({ url, durationSecs, muxed, onError }: TrailerPlayerProps) {
  // Direct progressive stream is a complete MP4 — native controls handle it fine.
  if (!muxed) {
    return (
      <video
        className="absolute inset-0 w-full h-full"
        src={url}
        autoPlay
        controls
        onError={onError}
      />
    );
  }
  return <MuxedTrailer url={url} durationSecs={durationSecs} onError={onError} />;
}

function MuxedTrailer({ url, durationSecs, onError }: Omit<TrailerPlayerProps, "muxed">) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [startOffset, setStartOffset] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(true);
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekValue, setSeekValue] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const startOffsetRef = useRef(0);
  const stallTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  startOffsetRef.current = startOffset;

  const duration = durationSecs;
  const src = `${url}${startOffset > 0.5 ? `&start=${Math.floor(startOffset)}` : ""}`;
  const displayTime = isSeeking ? seekValue : currentTime;
  const pct = duration > 0 ? Math.min(displayTime / duration, 1) : 0;

  const reconnectAt = (pos: number) => {
    if (stallTimer.current) { clearTimeout(stallTimer.current); stallTimer.current = null; }
    setIsBuffering(true);
    setStartOffset(Math.floor(Math.max(0, pos)));
    setCurrentTime(Math.max(0, pos));
  };

  const doSeek = (target: number) => {
    const t = Math.max(0, duration > 0 ? Math.min(target, duration) : target);
    const v = videoRef.current;
    if (v) {
      const rel = t - startOffset;
      const buf = v.buffered;
      for (let i = 0; i < buf.length; i++) {
        if (rel >= buf.start(i) && rel <= buf.end(i) + 2) {
          v.currentTime = rel;
          setCurrentTime(t);
          return;
        }
      }
    }
    reconnectAt(t);
  };

  return (
    <div className="absolute inset-0 bg-black">
      <video
        key={startOffset}
        ref={videoRef}
        src={src}
        autoPlay
        className="w-full h-full cursor-pointer"
        onClick={() => { const v = videoRef.current; if (!v) return; v.paused ? v.play() : v.pause(); }}
        onTimeUpdate={() => setCurrentTime(startOffset + (videoRef.current?.currentTime ?? 0))}
        onPlay={() => {
          setIsPlaying(true);
          setIsBuffering(false);
          if (stallTimer.current) { clearTimeout(stallTimer.current); stallTimer.current = null; }
        }}
        onPause={() => setIsPlaying(false)}
        onWaiting={() => {
          setIsBuffering(true);
          if (!stallTimer.current) {
            stallTimer.current = setTimeout(() => {
              stallTimer.current = null;
              const v = videoRef.current;
              reconnectAt(startOffsetRef.current + (v?.currentTime ?? 0));
            }, 8000);
          }
        }}
        onCanPlay={() => {
          setIsBuffering(false);
          if (stallTimer.current) { clearTimeout(stallTimer.current); stallTimer.current = null; }
        }}
        onEnded={() => {
          // Premature end (mux pipe died) → reconnect; real end → stop.
          const pos = startOffset + (videoRef.current?.currentTime ?? 0);
          if (duration > 0 && pos < duration - 2) reconnectAt(pos);
          else setIsPlaying(false);
        }}
        onError={onError}
        onVolumeChange={() => {
          if (!videoRef.current) return;
          setVolume(videoRef.current.volume);
          setIsMuted(videoRef.current.muted);
        }}
      />

      {isBuffering && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 pointer-events-none">
          <Loader2 size={36} className="animate-spin text-red-500" />
        </div>
      )}

      {/* Controls */}
      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 to-transparent pt-8 pb-2 px-3 flex flex-col gap-1.5">
        {/* Seek bar */}
        <div className="relative h-4 flex items-center group">
          <div className="absolute inset-x-0 h-1 bg-white/20 rounded-full" />
          <div className="absolute left-0 h-1 bg-red-500 rounded-full pointer-events-none"
               style={{ width: `${pct * 100}%` }} />
          <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 bg-white rounded-full shadow pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"
               style={{ left: `${pct * 100}%` }} />
          <input
            type="range" min={0} max={duration > 0 ? Math.ceil(duration) : Math.max(Math.ceil(currentTime) + 60, 120)} step={1}
            value={Math.round(displayTime)}
            className="absolute inset-0 w-full opacity-0 cursor-pointer"
            onMouseDown={() => { setIsSeeking(true); setSeekValue(currentTime); }}
            onChange={(e) => setSeekValue(parseFloat(e.target.value))}
            onMouseUp={(e) => { doSeek(parseFloat((e.target as HTMLInputElement).value)); setIsSeeking(false); }}
          />
        </div>

        <div className="flex items-center gap-2">
          <button className="text-white hover:text-red-400 transition-colors p-1"
                  onClick={() => { const v = videoRef.current; if (!v) return; v.paused ? v.play() : v.pause(); }}>
            {isPlaying ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <button className="text-white/70 hover:text-white text-xs font-medium px-1 transition-colors"
                  onClick={() => doSeek(currentTime - 10)}>−10s</button>
          <button className="text-white/70 hover:text-white text-xs font-medium px-1 transition-colors"
                  onClick={() => doSeek(currentTime + 10)}>+10s</button>
          <span className="text-white/80 text-xs font-mono ml-1 tabular-nums">
            {fmt(currentTime)}{duration > 0 ? ` / ${fmt(duration)}` : ""}
          </span>
          <div className="flex-1" />
          <button className="text-white/70 hover:text-white p-1 transition-colors"
                  onClick={() => { const v = videoRef.current; if (!v) return; v.muted = !v.muted; }}>
            {isMuted || volume === 0 ? <VolumeX size={15} /> : <Volume2 size={15} />}
          </button>
          <input type="range" min={0} max={1} step={0.05} value={isMuted ? 0 : volume}
                 className="w-14 cursor-pointer" style={{ accentColor: "#ef4444" }}
                 onChange={(e) => { const v = videoRef.current; if (!v) return; v.volume = parseFloat(e.target.value); v.muted = parseFloat(e.target.value) === 0; }} />
          <button className="text-white/70 hover:text-white p-1 transition-colors"
                  onClick={() => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else videoRef.current?.requestFullscreen().catch(() => {}); }}>
            <Maximize2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
