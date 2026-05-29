import { useEffect, useRef, useState } from "react";
import { Play, X, SkipForward } from "lucide-react";

interface NextEpisodeOverlayProps {
  title: string;            // label of the next episode
  onPlay: () => void;       // called when countdown reaches 0 or user clicks play
  onCancel: () => void;     // user dismissed the popup
  seconds?: number;         // countdown length (default 5)
  accentColor?: string;     // hex/css color for the ring + button (default accent purple)
}

export function NextEpisodeOverlay({
  title, onPlay, onCancel, seconds = 5, accentColor = "rgb(109 40 217)",
}: NextEpisodeOverlayProps) {
  const [remaining, setRemaining] = useState(seconds);
  const firedRef = useRef(false);

  useEffect(() => {
    const id = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(id);
          if (!firedRef.current) { firedRef.current = true; onPlay(); }
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [onPlay]);

  const pct = seconds > 0 ? (seconds - remaining) / seconds : 1;
  const circ = 2 * Math.PI * 16; // r=16

  return (
    <div className="absolute bottom-24 right-4 z-50 w-72 bg-bg-card/95 border border-border rounded-2xl shadow-2xl backdrop-blur-sm p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-text-muted text-[11px] font-semibold uppercase tracking-wide flex items-center gap-1.5">
          <SkipForward size={12} /> Siguiente episodio
        </span>
        <button onClick={onCancel} className="text-text-muted hover:text-white transition-colors" title="Cancelar">
          <X size={14} />
        </button>
      </div>

      <p className="text-white text-sm font-medium leading-tight mb-3 line-clamp-2">{title}</p>

      <div className="flex items-center gap-3">
        <button
          onClick={() => { if (!firedRef.current) { firedRef.current = true; onPlay(); } }}
          className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-semibold text-white transition-transform hover:scale-[1.02]"
          style={{ backgroundColor: accentColor }}
        >
          <Play size={14} className="fill-white" /> Reproducir
        </button>

        {/* Countdown ring */}
        <div className="relative w-10 h-10 flex-shrink-0">
          <svg className="w-10 h-10 -rotate-90" viewBox="0 0 40 40">
            <circle cx="20" cy="20" r="16" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="3" />
            <circle
              cx="20" cy="20" r="16" fill="none" stroke={accentColor} strokeWidth="3"
              strokeLinecap="round" strokeDasharray={circ}
              strokeDashoffset={circ * (1 - pct)}
              style={{ transition: "stroke-dashoffset 1s linear" }}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-white text-sm font-bold tabular-nums">
            {remaining}
          </span>
        </div>
      </div>
    </div>
  );
}
