import clsx from "clsx";
import { MeetingStatus } from "@/lib/types";

const config: Record<
  MeetingStatus,
  { label: string; classes: string }
> = {
  pending:     { label: "Pending",     classes: "bg-gray-100 text-gray-500" },
  uploading:   { label: "Uploading",   classes: "bg-blue-100 text-blue-600" },
  queued:      { label: "Queued",      classes: "bg-yellow-100 text-yellow-700" },
  processing:  { label: "Processing",  classes: "bg-blue-100 text-blue-700 animate-pulse" },
  transcribed: { label: "Transcribed", classes: "bg-green-100 text-green-700" },
  failed:      { label: "Failed",      classes: "bg-red-100 text-red-600" },
};

export function StatusBadge({ status }: { status: MeetingStatus }) {
  const { label, classes } = config[status] ?? config.pending;
  return (
    <span
      className={clsx(
        "inline-flex items-center text-xs font-medium px-2.5 py-0.5 rounded-full shrink-0",
        classes
      )}
    >
      {label}
    </span>
  );
}
