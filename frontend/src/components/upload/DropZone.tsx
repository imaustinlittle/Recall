"use client";

import { useCallback, useState, useRef } from "react";
import { uploadMedia } from "@/lib/api";
import { Job } from "@/lib/types";
import { Spinner } from "@/components/ui/Spinner";

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
        const job = await uploadMedia(meetingId, file, (pct) =>
          setProgress(pct)
        );
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
      className={`
        relative border-2 border-dashed rounded-2xl p-16 text-center transition-all
        ${isUploading ? "cursor-default" : "cursor-pointer"}
        ${dragging
          ? "border-brand-500 bg-brand-50"
          : "border-gray-300 hover:border-gray-400 bg-white"}
      `}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED}
        className="hidden"
        onChange={onFileChange}
      />

      {isUploading ? (
        <div className="space-y-4">
          <Spinner size="lg" />
          <p className="text-sm text-gray-500">
            Uploading… {Math.round((progress ?? 0) * 100)}%
          </p>
          <div className="w-64 mx-auto bg-gray-200 rounded-full h-1.5">
            <div
              className="bg-brand-500 h-1.5 rounded-full transition-all duration-200"
              style={{ width: `${(progress ?? 0) * 100}%` }}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="text-4xl">🎙️</div>
          <p className="text-base font-medium text-gray-700">
            Drop your recording here
          </p>
          <p className="text-sm text-gray-400">
            or click to browse
          </p>
          <p className="text-xs text-gray-300 mt-2">
            mp3 · wav · m4a · mp4 · mov · webm · ogg · flac — up to 2 GB
          </p>
        </div>
      )}

      {error && (
        <p className="mt-4 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
    </div>
  );
}
