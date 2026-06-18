// The 4-bar "Recall" lockup from the handoff. Bar heights 36/78/100/52%.

const BARS = [36, 78, 100, 52];

export function LogoMark({
  height = 18,
  barWidth = 3,
  gap = 2,
}: {
  height?: number;
  barWidth?: number;
  gap?: number;
}) {
  return (
    <span
      style={{ height, gap }}
      className="flex items-end"
      aria-hidden="true"
    >
      {BARS.map((h, i) => (
        <span
          key={i}
          className="rounded-[2px] bg-accent"
          style={{ width: barWidth, height: `${h}%` }}
        />
      ))}
    </span>
  );
}

export function Logo({
  size = 19,
  markHeight = 18,
  barWidth = 3,
  className = "",
}: {
  size?: number;
  markHeight?: number;
  barWidth?: number;
  className?: string;
}) {
  return (
    <span className={`flex items-center gap-[11px] text-ink ${className}`}>
      <LogoMark height={markHeight} barWidth={barWidth} gap={barWidth < 4 ? 2 : 2.5} />
      <span
        className="font-display font-bold tracking-[-.02em]"
        style={{ fontSize: size }}
      >
        Recall
      </span>
    </span>
  );
}
