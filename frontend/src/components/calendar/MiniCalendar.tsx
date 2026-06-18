"use client";

const DAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface MiniCalendarProps {
  year: number;
  month: number; // 0-indexed
  /** Set of "YYYY-MM-DD" strings that have at least one meeting */
  activeDates: Set<string>;
  selectedDate: string | null;
  onDateSelect: (date: string | null) => void;
  onMonthChange: (year: number, month: number) => void;
}

function toDateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function MiniCalendar({
  year,
  month,
  activeDates,
  selectedDate,
  onDateSelect,
  onMonthChange,
}: MiniCalendarProps) {
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = toDateStr(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());

  const prevMonth = () => (month === 0 ? onMonthChange(year - 1, 11) : onMonthChange(year, month - 1));
  const nextMonth = () => (month === 11 ? onMonthChange(year + 1, 0) : onMonthChange(year, month + 1));

  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="select-none">
      <div className="mb-3 flex items-center justify-between">
        <button
          onClick={prevMonth}
          aria-label="Previous month"
          className="rounded-[8px] p-1 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <span className="font-display text-sm font-semibold text-ink">
          {MONTH_NAMES[month]} {year}
        </span>
        <button
          onClick={nextMonth}
          aria-label="Next month"
          className="rounded-[8px] p-1 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </div>

      <div className="mb-1 grid grid-cols-7">
        {DAY_LABELS.map((d) => (
          <div key={d} className="py-0.5 text-center font-mono text-[10px] font-medium text-ink-3">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {cells.map((day, idx) => {
          if (!day) return <div key={`blank-${idx}`} />;
          const dateStr = toDateStr(year, month, day);
          const hasActivity = activeDates.has(dateStr);
          const isSelected = selectedDate === dateStr;
          const isToday = dateStr === today;

          return (
            <button
              key={dateStr}
              onClick={() => onDateSelect(isSelected ? null : dateStr)}
              className={[
                "relative flex aspect-square w-full flex-col items-center justify-center rounded-[8px] text-xs font-medium transition-colors",
                isSelected
                  ? "bg-accent text-on-accent"
                  : isToday
                  ? "font-semibold text-accent hover:bg-accent-weak"
                  : "text-ink-2 hover:bg-surface-2",
              ].join(" ")}
            >
              {day}
              {hasActivity && (
                <span
                  className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full"
                  style={{ background: isSelected ? "var(--on-accent)" : "var(--accent)" }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
