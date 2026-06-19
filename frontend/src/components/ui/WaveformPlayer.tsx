"use client";

import { useEffect, useRef, useState } from "react";
import { formatTime } from "@/lib/utils";
import { bars, seedFrom } from "@/lib/waveform";
import { PlayIcon, PauseIcon } from "./icons";

interface Props {
  src: string;
  audioRef: React.RefObject<HTMLAudioElement>;
  /** Stable seed (meeting id) so the waveform shape is consistent. */
  seed: string;
  onTimeUpdate: (t: number) => void;
}

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];
const BAR_COUNT = 84;

export function WaveformPlayer({ src, audioRef, seed, onTimeUpdate }: Props) {
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const waveRef = useRef<HTMLDivElement>(null);
  // Browser-recorded WebM reports duration=Infinity until it's been seeked to
  // the end. While we force that resolution, ignore the bogus time updates.
  const probingRef = useRef(false);

  const heights = bars(seedFrom(seed), BAR_COUNT, 12);
  const hasDuration = Number.isFinite(duration) && duration > 0;
  const pct = hasDuration ? (current / duration) * 100 : 0;

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed;
  }, [speed, audioRef]);

  const handleLoadedMetadata = (e: React.SyntheticEvent<HTMLAudioElement>) => {
    const el = e.currentTarget;
    if (!Number.isFinite(el.duration)) {
      // Force the browser to compute the real duration by seeking to the end.
      probingRef.current = true;
      el.currentTime = 1e101;
    } else {
      setDuration(el.duration);
    }
  };

  const handleDurationChange = (e: React.SyntheticEvent<HTMLAudioElement>) => {
    const el = e.currentTarget;
    if (Number.isFinite(el.duration)) setDuration(el.duration);
  };

  const handleTimeUpdate = (e: React.SyntheticEvent<HTMLAudioElement>) => {
    const el = e.currentTarget;
    if (probingRef.current) {
      // The probe seek landed; record the now-known duration and rewind.
      probingRef.current = false;
      if (Number.isFinite(el.duration)) setDuration(el.duration);
      el.currentTime = 0;
      return;
    }
    setCurrent(el.currentTime);
    onTimeUpdate(el.currentTime);
  };

  const togglePlay = () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) el.play().catch(() => {});
    else el.pause();
  };

  const seekFromEvent = (clientX: number) => {
    const el = audioRef.current;
    const rect = waveRef.current?.getBoundingClientRect();
    if (!el || !rect || !Number.isFinite(el.duration) || el.duration <= 0) return;
    const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    el.currentTime = frac * el.duration;
    setCurrent(el.currentTime);
    onTimeUpdate(el.currentTime);
  };

  return (
    <div className="rounded-[18px] border border-line bg-surface px-5 py-[18px] shadow-card">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={handleLoadedMetadata}
        onDurationChange={handleDurationChange}
        onTimeUpdate={handleTimeUpdate}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />

      <div className="flex items-center gap-4">
        <button
          onClick={togglePlay}
          title={playing ? "Pause" : "Play"}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent shadow-glow"
        >
          {playing ? <PauseIcon size={20} /> : <PlayIcon size={20} />}
        </button>

        <div className="min-w-0 flex-1">
          <div
            ref={waveRef}
            onClick={(e) => seekFromEvent(e.clientX)}
            className={`relative flex h-[46px] items-center gap-[1.5px] ${
              hasDuration ? "cursor-pointer" : "cursor-default"
            }`}
          >
            {heights.map((h, i) => {
              const barPct = (i / BAR_COUNT) * 100;
              return (
                <div
                  key={i}
                  className="min-h-[3px] flex-1 rounded-[1.5px]"
                  style={{
                    height: `${h}%`,
                    background: barPct <= pct ? "var(--accent)" : "var(--wave)",
                  }}
                />
              );
            })}
            <div
              className="absolute -top-[3px] -bottom-[3px] w-0.5 rounded-[2px] bg-ink"
              style={{ left: `${pct}%` }}
            />
          </div>

          <div className="mt-[7px] flex items-center justify-between font-mono text-[11.5px] text-ink-3">
            <span className="font-semibold text-accent">{formatTime(current)}</span>
            <div className="flex items-center gap-1">
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  onClick={() => setSpeed(s)}
                  className={`rounded px-1.5 py-0.5 transition-colors ${
                    speed === s ? "bg-accent-weak text-accent" : "hover:text-ink-2"
                  }`}
                >
                  {s}x
                </button>
              ))}
            </div>
            <span>{hasDuration ? formatTime(duration) : "--:--"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
