"use client";

import { Job } from "@/lib/types";
import { Spinner } from "./Spinner";

interface Props {
  job: Job | null;
}

// Steps match the progress ranges emitted by tasks.py
const STEPS = [
  { label: "Starting",           from: 0.00, to: 0.10 },
  { label: "Extracting audio",   from: 0.10, to: 0.20 },
  { label: "Transcribing",       from: 0.20, to: 0.65 },
  { label: "Identifying speakers", from: 0.65, to: 0.80 },
  { label: "Saving speakers",    from: 0.80, to: 0.88 },
  { label: "Saving transcript",  from: 0.88, to: 1.00 },
];

function getStepState(step: typeof STEPS[0], progress: number, isDone: boolean) {
  if (isDone || progress >= step.to) return "done";
  if (progress >= step.from)        return "active";
  return "pending";
}

export function JobProgressBar({ job }: Props) {
  if (!job) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl px-6 py-4 flex items-center gap-4">
        <Spinner size="sm" />
        <p className="text-sm text-gray-500">Waiting for worker…</p>
      </div>
    );
  }

  const pct = Math.round(job.progress * 100);
  const isFailed = job.status === "failed";
  const isDone   = job.status === "completed";

  return (
    <div className={`border rounded-2xl px-6 py-5 space-y-4 ${
      isFailed ? "bg-red-50 border-red-200"
      : isDone  ? "bg-green-50 border-green-200"
      : "bg-white border-gray-200"
    }`}>

      {/* ── Overall header ── */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          {!isDone && !isFailed && <Spinner size="sm" />}
          {isDone  && <span className="text-green-600 text-lg">✓</span>}
          {isFailed && <span className="text-red-600 text-lg">✕</span>}
          <p className="text-sm font-medium text-gray-700">
            {isDone   ? "Transcription complete"
            : isFailed ? "Transcription failed"
            : job.message ?? "Processing…"}
          </p>
        </div>
        {!isDone && !isFailed && (
          <span className="text-sm font-mono text-gray-400 shrink-0">{pct}%</span>
        )}
      </div>

      {/* ── Overall progress bar ── */}
      {!isDone && !isFailed && (
        <div className="w-full bg-gray-100 rounded-full h-2">
          <div
            className="bg-brand-500 h-2 rounded-full transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      {/* ── Per-step breakdown ── */}
      {!isFailed && (
        <div className="grid grid-cols-3 gap-x-4 gap-y-2 pt-1 sm:grid-cols-6">
          {STEPS.map((step) => {
            const state = getStepState(step, job.progress, isDone);
            return (
              <div key={step.label} className="flex flex-col items-center gap-1">
                {/* Step bar */}
                <div className="w-full bg-gray-100 rounded-full h-1">
                  <div className={`h-1 rounded-full transition-all duration-500 ${
                    state === "done"   ? "w-full bg-green-500"
                    : state === "active" ? "w-1/2 bg-brand-500 animate-pulse"
                    : "w-0"
                  }`} />
                </div>
                {/* Step label */}
                <span className={`text-xs text-center leading-tight ${
                  state === "done"   ? "text-green-600"
                  : state === "active" ? "text-brand-600 font-medium"
                  : "text-gray-300"
                }`}>
                  {state === "done" ? "✓ " : ""}{step.label}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Error details ── */}
      {isFailed && job.error_info && (
        <p className="text-xs text-red-500 bg-red-100 rounded-lg px-3 py-2 font-mono">
          {job.error_info.type}: {job.error_info.error}
        </p>
      )}
    </div>
  );
}
