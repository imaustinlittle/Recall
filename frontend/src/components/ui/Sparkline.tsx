import { bars, seedFrom } from "@/lib/waveform";

/** The 120px-wide mini sparkline used in dashboard meeting rows.
 *  Transcribed meetings get accent bars; everything else muted wave bars. */
export function Sparkline({
  seed,
  active,
  count = 32,
  width = 120,
  height = 26,
}: {
  seed: string;
  active: boolean;
  count?: number;
  width?: number;
  height?: number;
}) {
  const heights = bars(seedFrom(seed), count, 14);
  return (
    <div
      className="flex shrink-0 items-end gap-[1.5px]"
      style={{ width, height }}
      aria-hidden="true"
    >
      {heights.map((h, i) => (
        <div
          key={i}
          className="flex-1 rounded-[1.5px]"
          style={{
            height: `${active ? h : h * 0.7}%`,
            background: active ? "var(--accent)" : "var(--wave)",
          }}
        />
      ))}
    </div>
  );
}
