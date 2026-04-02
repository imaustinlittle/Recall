"use client";

import { Job } from "@/lib/types";
import { Spinner } from "./Spinner";

interface Props {
  job: Job | null;
}

const STATUS_LABELS: Record<string, string> = {
  queued:     "Waiting in queue…",
  processing: "Processing…",
  completed:  "Transcription complete",
  failed:     "Transcription failed",
};

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
  const isDone = job.status === "completed";

  return (
    <div
      className={`border rounded-2xl px-6 py-4 space-y-3 ${
        isFailed
          ? "bg-red-50 border-red-200"
          : isDone
          ? "bg-green-50 border-green-200"
          : "bg-white border-gray-200"
      }`}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          {!isDone && !isFailed && <Spinner size="sm" />}
          {isDone && <span className="text-green-600 text-lg">✓</span>}
          {isFailed && <span className="text-red-600 text-lg">✕</span>}
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-700">
              {STATUS_LABELS[job.status] ?? job.status}
            </p>
            {job.message && (
              <p className="text-xs text-gray-400 truncate">{job.message}</p>
            )}
          </div>
        </div>
        {!isDone && !isFailed && (
          <span className="text-sm font-mono text-gray-400 shrink-0">{pct}%</span>
        )}
      </div>

      {/* Progress bar — hide once done */}
      {!isDone && !isFailed && (
        <div className="w-full bg-gray-100 rounded-full h-1.5">
          <div
            className="bg-brand-500 h-1.5 rounded-full transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      {/* Error details */}
      {isFailed && job.error_info && (
        <p className="text-xs text-red-500 bg-red-100 rounded-lg px-3 py-2 font-mono">
          {job.error_info.type}: {job.error_info.error}
        </p>
      )}
    </div>
  );
}
