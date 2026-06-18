import { MeetingStatus } from "./types";

// ── Deterministic bar generator ──────────────────────────────────────────────
// Ports the prototype's seeded RNG so a given meeting always renders the same
// sparkline / waveform. In production these stand in for real audio amplitude
// data, which we don't yet persist per-segment.

function rng(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** `n` bar heights in the range [min, 100], from a stable seed. */
export function bars(seed: number, n: number, min = 8): number[] {
  const r = rng(seed);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    out.push(min + Math.pow(r(), 0.7) * (100 - min));
  }
  return out;
}

/** Turn an arbitrary id string into a stable numeric seed. */
export function seedFrom(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) % 2147483647;
  }
  return h || 7;
}

// ── Status pill styling (matches the handoff status table) ───────────────────

export interface StatusStyle {
  label: string;
  fg: string;
  bg: string;
}

export function statusStyle(status: MeetingStatus | string): StatusStyle {
  const map: Record<string, StatusStyle> = {
    transcribed: {
      label: "Transcribed",
      fg: "#1F9D6B",
      bg: "color-mix(in srgb, #1F9D6B 14%, transparent)",
    },
    processing: {
      label: "Processing",
      fg: "#3B82F6",
      bg: "color-mix(in srgb, #3B82F6 14%, transparent)",
    },
    uploading: {
      label: "Uploading",
      fg: "#3B82F6",
      bg: "color-mix(in srgb, #3B82F6 14%, transparent)",
    },
    queued: {
      label: "Queued",
      fg: "#C8862A",
      bg: "color-mix(in srgb, #C8862A 16%, transparent)",
    },
    failed: {
      label: "Failed",
      fg: "#E0533A",
      bg: "color-mix(in srgb, #E0533A 14%, transparent)",
    },
    pending: { label: "Pending", fg: "var(--ink-3)", bg: "var(--inset)" },
  };
  return map[status] ?? map.pending;
}
