"use client";

import { useEffect, useRef, useState } from "react";
import { formatTime } from "@/lib/utils";

interface Props {
  src: string;
  audioRef: React.RefObject<HTMLAudioElement>;
  onTimeUpdate: (t: number) => void;
}

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

export function AudioPlayer({ src, audioRef, onTimeUpdate }: Props) {
  const [playing, setPlaying]   = useState(false);
  const [current, setCurrent]   = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed]       = useState(1);
  const [dragging, setDragging] = useState(false);
  const [dragVal, setDragVal]   = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);

  // Keep audio in sync with speed
  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed;
  }, [speed]);

  const handleTimeUpdate = () => {
    const el = audioRef.current;
    if (!el || dragging) return;
    setCurrent(el.currentTime);
    onTimeUpdate(el.currentTime);
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) setDuration(audioRef.current.duration);
  };

  const togglePlay = () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) { el.play().catch(() => {}); setPlaying(true); }
    else           { el.pause();                 setPlaying(false); }
  };

  const skip = (secs: number) => {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = Math.max(0, Math.min(el.duration, el.currentTime + secs));
  };

  // Scrubber interaction
  const posToTime = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || !duration) return 0;
    const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return frac * duration;
  };

  const onTrackClick = (e: React.MouseEvent) => {
    const t = posToTime(e.clientX);
    if (audioRef.current) audioRef.current.currentTime = t;
    setCurrent(t);
    onTimeUpdate(t);
  };

  const onDragStart = (e: React.MouseEvent) => {
    setDragging(true);
    setDragVal(posToTime(e.clientX));
    const onMove = (ev: MouseEvent) => setDragVal(posToTime(ev.clientX));
    const onUp   = (ev: MouseEvent) => {
      const t = posToTime(ev.clientX);
      if (audioRef.current) audioRef.current.currentTime = t;
      setCurrent(t);
      onTimeUpdate(t);
      setDragging(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup",   onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup",   onUp);
  };

  const displayTime = dragging ? dragVal : current;
  const pct = duration ? (displayTime / duration) * 100 : 0;

  return (
    <>
      {/* Hidden audio element — controlled via ref */}
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />

      {/* Sticky bar */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 shadow-lg px-6 py-3">
        <div className="max-w-4xl mx-auto flex items-center gap-4">

          {/* Skip back */}
          <button
            onClick={() => skip(-10)}
            className="text-gray-500 hover:text-gray-800 transition-colors"
            title="Back 10s"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>
              <text x="7" y="15" fontSize="5" fontWeight="bold" fill="currentColor">10</text>
            </svg>
          </button>

          {/* Play/pause */}
          <button
            onClick={togglePlay}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-brand-600 hover:bg-brand-700 text-white transition-colors shrink-0"
            title={playing ? "Pause" : "Play"}
          >
            {playing ? (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
              </svg>
            ) : (
              <svg className="w-4 h-4 ml-0.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z"/>
              </svg>
            )}
          </button>

          {/* Skip forward */}
          <button
            onClick={() => skip(10)}
            className="text-gray-500 hover:text-gray-800 transition-colors"
            title="Forward 10s"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z"/>
              <text x="7" y="15" fontSize="5" fontWeight="bold" fill="currentColor">10</text>
            </svg>
          </button>

          {/* Current time */}
          <span className="font-mono text-xs text-gray-500 shrink-0 w-24 text-right">
            {formatTime(displayTime)} / {formatTime(duration)}
          </span>

          {/* Scrubber */}
          <div
            ref={trackRef}
            className="flex-1 h-1.5 bg-gray-200 rounded-full relative cursor-pointer group"
            onClick={onTrackClick}
            onMouseDown={onDragStart}
          >
            {/* Filled portion */}
            <div
              className="absolute left-0 top-0 h-full bg-brand-500 rounded-full pointer-events-none"
              style={{ width: `${pct}%` }}
            />
            {/* Thumb */}
            <div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 bg-brand-600 rounded-full shadow pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ left: `${pct}%` }}
            />
          </div>

          {/* Speed selector */}
          <div className="flex items-center gap-1 shrink-0">
            {SPEEDS.map((s) => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                className={`text-xs px-2 py-0.5 rounded transition-colors ${
                  speed === s
                    ? "bg-brand-600 text-white"
                    : "text-gray-500 hover:text-gray-800"
                }`}
              >
                {s}x
              </button>
            ))}
          </div>

        </div>
      </div>

      {/* Bottom padding so content isn't hidden behind the bar */}
      <div className="h-16" />
    </>
  );
}
