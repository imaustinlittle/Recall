"use client";

import { useCallback, useState, useRef } from "react";
import { uploadMedia } from "@/lib/api";
import { Job } from "@/lib/types";
import { Spinner } from "@/components/ui/Spinner";
import { UploadIcon } from "@/components/ui/icons";

interface Props {
  meetingId: string;
  onUploaded: (job: Job) => void;
}

const ACCEPTED = ".mp3,.wav,.m4a,.mp4,.mov,.webm,.ogg,.flac";

export function DropZone({ meetingId, onUploaded }: Props) {
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = useCallback(
    async (file: File) => {
      setError(null);
      setProgress(0);
      try {
        const job = await uploadMedia(meetingId, file, (pct) => setProgress(pct));
        onUploaded(job as Job);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Upload failed");
        setProgress(null);
      }
    },
    [meetingId, onUploaded]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) upload(file);
    },
    [upload]
  );

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) upload(file);
  };

  const isUploading = progress !== null;

  return (
    <div
      onDrop={onDrop}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onClick={() => !isUploading && inputRef.current?.click()}
      className={[
        "flex flex-col items-center gap-2.5 rounded-[18px] border-2 border-dashed bg-surface-2 px-6 py-[46px] text-center transition-colors",
        isUploading ? "cursor-default" : "cursor-pointer",
        dragging ? "border-accent" : "border-line-strong hover:border-accent",
      ].join(" ")}
    >
      <input ref={inputRef} type="file" accept={ACCEPTED} className="hidden" onChange={onFileChange} />

      {isUploading ? (
        <div className="flex w-full flex-col items-center gap-4">
          <Spinner size="lg" />
          <p className="text-sm text-ink-2">Uploading… {Math.round((progress ?? 0) * 100)}%</p>
          <div className="h-1.5 w-64 overflow-hidden rounded-full bg-inset">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-200"
              style={{ width: `${(progress ?? 0) * 100}%` }}
            />
          </div>
        </div>
      ) : (
        <>
          <div className="flex h-[52px] w-[52px] items-center justify-center rounded-[14px] border border-line bg-surface text-ink-2">
            <UploadIcon size={22} />
          </div>
          <p className="text-[15px] font-semibold text-ink">Drop your recording here</p>
          <p className="text-[13px] text-ink-2">or click to browse</p>
          <p className="mt-0.5 font-mono text-[11px] text-ink-3">
            mp3 · wav · m4a · mp4 · mov · webm · flac — up to 2&nbsp;GB
          </p>
        </>
      )}

      {error && (
        <p
          className="mt-2 rounded-[10px] px-3 py-2 text-sm"
          style={{ background: "color-mix(in srgb, #E0533A 10%, transparent)", color: "#E0533A" }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
