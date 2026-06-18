"use client";

import { Job } from "@/lib/types";
import { Spinner } from "./Spinner";

interface Props {
  job: Job | null;
}

const PROC_BARS = Array.from({ length: 28 }, (_, i) => -(i * 0.05));

function StatusMessage(job: Job): string {
  if (job.message) return job.message;
  const p = job.progress;
  if (p < 0.12) return "Waiting in queue…";
  if (p < 0.9) return "Transcribing audio…";
  return "Finalizing transcript…";
}

export function JobProgressBar({ job }: Props) {
  const pct = job ? Math.round(job.progress * 100) : 0;
  const isFailed = job?.status === "failed";
  const isDone = job?.status === "completed";

  // ── Failure state ──
  if (isFailed) {
    return (
      <div
        className="rounded-[18px] border p-[22px]"
        style={{
          background: "color-mix(in srgb, #E0533A 9%, var(--surface))",
          borderColor: "color-mix(in srgb, #E0533A 26%, transparent)",
        }}
      >
        <p className="text-[14.5px] font-semibold" style={{ color: "#E0533A" }}>
          Transcription failed
        </p>
        {job?.error_info && (
          <p className="mt-2 rounded-lg bg-inset px-3 py-2 font-mono text-[12px] text-ink-2">
            {job.error_info.type}: {job.error_info.error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-[18px] border border-line bg-surface p-[34px] shadow-card">
      {/* Animated waveform */}
      <div className="mb-[26px] flex h-[84px] items-center justify-center gap-1">
        {PROC_BARS.map((delay, i) => (
          <div
            key={i}
            className="w-[5px] origin-center rounded-[3px] bg-accent opacity-85"
            style={{
              height: 60,
              animation: "meter 1.1s ease-in-out infinite",
              animationDelay: `${delay}s`,
            }}
          />
        ))}
      </div>

      <div className="mb-2.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-[11px]">
          {isDone ? (
            <span className="text-status-green">✓</span>
          ) : (
            <span
              className="inline-block h-[18px] w-[18px] rounded-full border-2 border-accent-line border-t-accent"
              style={{ animation: "spin .8s linear infinite" }}
            />
          )}
          <div>
            <p className="text-[14.5px] font-semibold text-ink">
              {isDone ? "Transcription complete" : job ? StatusMessage(job) : "Waiting for worker…"}
            </p>
            <p className="mt-0.5 font-mono text-[12px] text-ink-3">
              {job ? `faster-whisper · base · ${pct}%` : "queued"}
            </p>
          </div>
        </div>
        <span className="font-mono text-[22px] font-semibold tabular-nums text-accent">
          {pct}%
        </span>
      </div>

      <div className="h-1.5 overflow-hidden rounded-[6px] bg-inset">
        <div
          className="h-full rounded-[6px] bg-accent transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      {!job && (
        <div className="mt-4 flex items-center gap-3 text-sm text-ink-2">
          <Spinner size="sm" />
          Waiting for the worker to pick up the job…
        </div>
      )}
    </div>
  );
}
