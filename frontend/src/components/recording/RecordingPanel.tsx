"use client";

import { useRecorder, RecorderState } from "@/lib/useRecorder";
import { Spinner } from "@/components/ui/Spinner";
import { Job } from "@/lib/types";

interface RecordingPanelProps {
  meetingId: string;
  onUploaded: (job: Job) => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
}

// ── Level Meter ───────────────────────────────────────────────────────────────

function LevelMeter({ level }: { level: number }) {
  const bars = 12;
  return (
    <div className="flex items-end gap-0.5 h-6">
      {Array.from({ length: bars }).map((_, i) => {
        const threshold = i / bars;
        const active = level > threshold;
        const color =
          i < bars * 0.6
            ? active ? "bg-green-400" : "bg-gray-200"
            : i < bars * 0.85
            ? active ? "bg-yellow-400" : "bg-gray-200"
            : active ? "bg-red-500" : "bg-gray-200";
        const height = `${40 + (i / bars) * 60}%`;
        return (
          <div
            key={i}
            className={`w-1.5 rounded-sm transition-colors duration-75 ${color}`}
            style={{ height }}
          />
        );
      })}
    </div>
  );
}

// ── Source Toggle ─────────────────────────────────────────────────────────────

function SourceToggle({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled: boolean;
}) {
  return (
    <label className={`flex items-start gap-3 cursor-pointer ${disabled ? "opacity-50" : ""}`}>
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
      />
      <div>
        <span className="text-sm font-medium text-gray-900">{label}</span>
        <p className="text-xs text-gray-500">{description}</p>
      </div>
    </label>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function RecordingPanel({ meetingId, onUploaded }: RecordingPanelProps) {
  const {
    state,
    duration,
    audioLevel,
    useMic,
    useSystemAudio,
    setUseMic,
    setUseSystemAudio,
    start,
    stop,
    error,
  } = useRecorder({ meetingId, onUploaded });

  const isIdle = state === "idle";
  const isRequesting = state === "requesting";
  const isRecording = state === "recording";
  const isProcessing = state === "processing";
  const busy = !isIdle;

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
        {isRecording && (
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
          </span>
        )}
        <h3 className="text-sm font-semibold text-gray-800">
          {isIdle && "Record this meeting"}
          {isRequesting && "Waiting for permission…"}
          {isRecording && "Recording in progress"}
          {isProcessing && "Uploading recording…"}
        </h3>
        {isRecording && (
          <span className="ml-auto font-mono text-sm font-medium text-red-600 tabular-nums">
            {formatDuration(duration)}
          </span>
        )}
      </div>

      <div className="px-6 py-5 space-y-5">
        {/* Source selection — shown when idle */}
        {isIdle && (
          <div className="space-y-3">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Audio sources
            </p>
            <SourceToggle
              label="Microphone"
              description="Your voice — captures what you say during the call."
              checked={useMic}
              onChange={setUseMic}
              disabled={busy}
            />
            <SourceToggle
              label="System audio"
              description={
                "Audio playing from your PC — captures other participants. " +
                "Chrome/Edge: check 'Share system audio' in the browser prompt. " +
                "macOS: may require a virtual audio device (e.g. BlackHole)."
              }
              checked={useSystemAudio}
              onChange={setUseSystemAudio}
              disabled={busy}
            />
          </div>
        )}

        {/* Live level meter — shown while recording */}
        {isRecording && (
          <div className="flex items-center gap-4">
            <span className="text-xs text-gray-500 w-20 shrink-0">Audio level</span>
            <LevelMeter level={audioLevel} />
          </div>
        )}

        {/* Processing spinner */}
        {isProcessing && (
          <div className="flex items-center gap-3 text-sm text-gray-600">
            <Spinner size="sm" />
            <span>Uploading and queuing for transcription…</span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Actions */}
        {isIdle && (
          <button
            onClick={start}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-2.5 transition-colors"
          >
            <MicIcon />
            Start recording
          </button>
        )}

        {isRequesting && (
          <div className="flex items-center justify-center gap-2 text-sm text-gray-500 py-1">
            <Spinner size="sm" />
            <span>Allow access in your browser…</span>
          </div>
        )}

        {isRecording && (
          <button
            onClick={stop}
            className="w-full flex items-center justify-center gap-2 rounded-lg border border-red-300 bg-red-50 hover:bg-red-100 text-red-700 text-sm font-medium px-4 py-2.5 transition-colors"
          >
            <StopIcon />
            Stop &amp; transcribe
          </button>
        )}
      </div>
    </div>
  );
}

// ── Inline SVG icons ──────────────────────────────────────────────────────────

function MicIcon() {
  return (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4zm6.364 9.636a.75.75 0 0 1 .75.75 7.003 7.003 0 0 1-6.364 6.962V21h2.5a.75.75 0 0 1 0 1.5h-6.5a.75.75 0 0 1 0-1.5h2.5v-2.652A7.003 7.003 0 0 1 4.886 11.386a.75.75 0 0 1 1.5 0 5.5 5.5 0 0 0 11 0 .75.75 0 0 1 .978-.714z" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
      <rect x="4" y="4" width="16" height="16" rx="2" />
    </svg>
  );
}
