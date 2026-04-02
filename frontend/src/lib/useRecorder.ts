"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { uploadMedia } from "./api";
import { Job } from "./types";

export type RecorderState = "idle" | "requesting" | "recording" | "processing";

interface UseRecorderOptions {
  meetingId: string;
  onUploaded: (job: Job) => void;
}

export interface UseRecorderReturn {
  state: RecorderState;
  duration: number;       // elapsed seconds
  audioLevel: number;     // 0–1, for level meter display
  useMic: boolean;
  useSystemAudio: boolean;
  setUseMic: (v: boolean) => void;
  setUseSystemAudio: (v: boolean) => void;
  start: () => Promise<void>;
  stop: () => void;
  error: string | null;
}

/** Best-supported MIME type for the current browser */
function pickMimeType(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg",
  ];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? "audio/webm";
}

export function useRecorder({
  meetingId,
  onUploaded,
}: UseRecorderOptions): UseRecorderReturn {
  const [state, setState] = useState<RecorderState>("idle");
  const [duration, setDuration] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [useMic, setUseMic] = useState(true);
  const [useSystemAudio, setUseSystemAudio] = useState(true);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamsRef = useRef<MediaStream[]>([]);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rafRef = useRef<number | null>(null);
  const durationRef = useRef(0);

  /** Stop all tracks and close audio context */
  const cleanup = useCallback(() => {
    if (timerRef.current !== null) clearInterval(timerRef.current);
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    streamsRef.current.forEach((s) => s.getTracks().forEach((t) => t.stop()));
    streamsRef.current = [];
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      audioCtxRef.current.close();
    }
    audioCtxRef.current = null;
    analyserRef.current = null;
    timerRef.current = null;
    rafRef.current = null;
    durationRef.current = 0;
    setDuration(0);
    setAudioLevel(0);
  }, []);

  const start = useCallback(async () => {
    setError(null);

    if (!useMic && !useSystemAudio) {
      setError("Enable at least one audio source before recording.");
      return;
    }

    setState("requesting");

    const audioCtx = new AudioContext();
    audioCtxRef.current = audioCtx;
    const destination = audioCtx.createMediaStreamDestination();

    // Analyser for the level meter — sits in parallel, not in the output chain
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    analyserRef.current = analyser;

    try {
      // ── 1. Microphone ────────────────────────────────────────────────────
      if (useMic) {
        const micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            sampleRate: 48000,
          },
          video: false,
        });
        streamsRef.current.push(micStream);
        const src = audioCtx.createMediaStreamSource(micStream);
        src.connect(destination);
        src.connect(analyser);
      }

      // ── 2. System audio via getDisplayMedia ──────────────────────────────
      // We request video too because some browsers reject audio-only getDisplayMedia.
      // The video track is stopped immediately after acquiring the stream.
      if (useSystemAudio) {
        let displayStream: MediaStream | null = null;
        try {
          displayStream = await navigator.mediaDevices.getDisplayMedia({
            audio: true,
            video: true,
          });
          // Drop video — we only care about the audio track
          displayStream.getVideoTracks().forEach((t) => t.stop());

          if (displayStream.getAudioTracks().length === 0) {
            // User forgot to check "Share system audio" in the browser dialog
            throw new Error(
              'No system audio stream was shared. In the browser dialog, check ' +
              '"Share system audio" (Chrome/Edge) before clicking Share.'
            );
          }

          streamsRef.current.push(displayStream);
          const src = audioCtx.createMediaStreamSource(displayStream);
          src.connect(destination);
          src.connect(analyser);
        } catch (err: unknown) {
          const e = err as DOMException;
          // If the user cancelled the picker (NotAllowedError / AbortError)
          // and the mic is active, we can continue with mic-only.
          if (e.name === "NotAllowedError" || e.name === "AbortError") {
            if (!useMic) throw err; // no sources at all — rethrow
            // else: fall through with mic only
          } else {
            throw err;
          }
        }
      }

      // ── 3. Start MediaRecorder on the mixed stream ────────────────────────
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(destination.stream, { mimeType });
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        cleanup();
        setState("processing");
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const ext = mimeType.startsWith("audio/ogg") ? "ogg" : "webm";
        const file = new File([blob], `recording-${Date.now()}.${ext}`, {
          type: mimeType,
        });
        try {
          const job = (await uploadMedia(meetingId, file)) as unknown as Job;
          onUploaded(job);
        } catch (uploadErr: unknown) {
          const e = uploadErr as Error;
          setError(e.message ?? "Upload failed");
        } finally {
          setState("idle");
        }
      };

      recorder.start(1000); // emit a chunk every second
      setState("recording");

      // ── Duration counter ─────────────────────────────────────────────────
      timerRef.current = setInterval(() => {
        durationRef.current += 1;
        setDuration(durationRef.current);
      }, 1000);

      // ── Level meter (via analyser) ───────────────────────────────────────
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(data);
        const rms = Math.sqrt(
          data.reduce((sum, v) => sum + v * v, 0) / data.length
        );
        setAudioLevel(Math.min(rms / 128, 1)); // normalise to 0–1
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch (err: unknown) {
      cleanup();
      setState("idle");
      const e = err as DOMException & { message?: string };
      if (e.name === "NotAllowedError") {
        setError(
          "Microphone permission was denied. " +
          "Allow microphone access in your browser's site settings and try again."
        );
      } else {
        setError((e as Error).message ?? "Could not start recording.");
      }
    }
  }, [useMic, useSystemAudio, meetingId, onUploaded, cleanup]);

  const stop = useCallback(() => {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }
  }, []);

  // Clean up on unmount
  useEffect(() => () => cleanup(), [cleanup]);

  return {
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
  };
}
