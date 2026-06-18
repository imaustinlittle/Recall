"use client";

import { useRecorder } from "@/lib/useRecorder";
import { Spinner } from "@/components/ui/Spinner";
import { MicIcon, StopIcon, CheckIcon } from "@/components/ui/icons";
import { Job } from "@/lib/types";

interface RecordingPanelProps {
  meetingId: string;
  onUploaded: (job: Job) => void;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
}

const METER_BARS = Array.from({ length: 22 }, (_, i) => -(i * 0.07));

function SourceRow({
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
    <label
      className={`flex cursor-pointer items-start gap-[13px] ${disabled ? "opacity-50" : ""}`}
    >
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
      />
      <span
        className={[
          "mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] transition-colors",
          checked ? "bg-accent text-on-accent" : "border border-line-strong bg-inset text-transparent",
        ].join(" ")}
      >
        <CheckIcon size={13} strokeWidth={3} />
      </span>
      <span>
        <span className="text-[14.5px] font-semibold text-ink">{label}</span>
        <p className="mt-px text-[13px] text-ink-2">{description}</p>
      </span>
    </label>
  );
}

export function RecordingPanel({ meetingId, onUploaded }: RecordingPanelProps) {
  const {
    state,
    duration,
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
    <div className="overflow-hidden rounded-[18px] border border-line bg-surface shadow-card">
      {/* Header */}
      <div className="flex items-center gap-[11px] border-b border-line px-[22px] py-[18px]">
        {isRecording && (
          <span className="relative flex h-[11px] w-[11px]">
            <span className="absolute inset-0 rounded-full bg-record" style={{ animation: "recpulse 1.6s ease-out infinite" }} />
            <span className="relative h-[11px] w-[11px] rounded-full bg-record" />
          </span>
        )}
        <h3 className="whitespace-nowrap text-[14.5px] font-semibold text-ink">
          {isIdle && "Record this meeting"}
          {isRequesting && "Waiting for permission…"}
          {isRecording && "Recording in progress"}
          {isProcessing && "Uploading recording…"}
        </h3>
        {isRecording && (
          <span className="ml-auto font-mono text-[15px] font-semibold tabular-nums text-record">
            {formatDuration(duration)}
          </span>
        )}
      </div>

      <div className="p-[22px]">
        {isIdle && (
          <div className="flex flex-col gap-4">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[.08em] text-ink-3">
              Audio sources
            </p>
            <SourceRow
              label="Microphone"
              description="Your voice — captures what you say during the call."
              checked={useMic}
              onChange={setUseMic}
              disabled={busy}
            />
            <SourceRow
              label="System audio"
              description="Audio from your machine — captures other participants. Chrome/Edge: enable “Share system audio” in the prompt. macOS may need a virtual audio device (e.g. BlackHole)."
              checked={useSystemAudio}
              onChange={setUseSystemAudio}
              disabled={busy}
            />

            {error && (
              <div
                className="rounded-[10px] px-4 py-3 text-sm"
                style={{ background: "color-mix(in srgb, #E0533A 10%, transparent)", color: "#E0533A" }}
              >
                {error}
              </div>
            )}

            <button
              onClick={start}
              className="mt-1 flex w-full items-center justify-center gap-[9px] rounded-[12px] bg-record p-[14px] text-[14.5px] font-bold text-white"
            >
              <MicIcon />
              Start recording
            </button>
          </div>
        )}

        {isRequesting && (
          <div className="flex items-center justify-center gap-2 py-1 text-sm text-ink-2">
            <Spinner size="sm" />
            <span>Allow access in your browser…</span>
          </div>
        )}

        {isRecording && (
          <div className="flex flex-col gap-5">
            <div className="flex h-[70px] items-center justify-center gap-[3px] rounded-[12px] bg-inset px-[18px]">
              {METER_BARS.map((delay, i) => (
                <div
                  key={i}
                  className="w-1 origin-center rounded-[2px] bg-accent"
                  style={{ height: 46, animation: "meter .9s ease-in-out infinite", animationDelay: `${delay}s` }}
                />
              ))}
            </div>
            <button
              onClick={stop}
              className="flex w-full items-center justify-center gap-[9px] rounded-[12px] bg-accent-weak p-[14px] text-[14.5px] font-bold text-record"
              style={{ border: "1px solid color-mix(in srgb, #E0533A 30%, transparent)" }}
            >
              <StopIcon />
              Stop &amp; transcribe
            </button>
          </div>
        )}

        {isProcessing && (
          <div className="flex items-center gap-3 text-sm text-ink-2">
            <Spinner size="sm" />
            <span>Uploading and queuing for transcription…</span>
          </div>
        )}
      </div>
    </div>
  );
}
