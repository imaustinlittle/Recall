import { MeetingStatus } from "@/lib/types";
import { statusStyle } from "@/lib/waveform";

export function StatusBadge({
  status,
  fixedWidth = false,
}: {
  status: MeetingStatus;
  /** Render at a fixed 118px width (used in list rows for column alignment). */
  fixedWidth?: boolean;
}) {
  const { label, fg, bg } = statusStyle(status);
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full px-[11px] py-[5px] font-mono text-[10.5px] font-semibold uppercase tracking-[.06em]"
      style={{ background: bg, color: fg, width: fixedWidth ? 118 : undefined }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: fg }}
      />
      {label}
    </span>
  );
}
