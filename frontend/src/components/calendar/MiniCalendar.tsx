"use client";

const DAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

interface MiniCalendarProps {
  year: number;
  month: number; // 0-indexed
  /** Set of "YYYY-MM-DD" strings that have at least one meeting */
  activeDates: Set<string>;
  selectedDate: string | null; // "YYYY-MM-DD" or null
  onDateSelect: (date: string | null) => void;
  onMonthChange: (year: number, month: number) => void;
}

function toDateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

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
  const today = toDateStr(
    new Date().getFullYear(),
    new Date().getMonth(),
    new Date().getDate()
  );

  const prevMonth = () => {
    if (month === 0) onMonthChange(year - 1, 11);
    else onMonthChange(year, month - 1);
  };

  const nextMonth = () => {
    if (month === 11) onMonthChange(year + 1, 0);
    else onMonthChange(year, month + 1);
  };

  // Build grid cells: leading blanks + days
  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  // Pad to complete last row
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="select-none">
      {/* Month header */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={prevMonth}
          className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
          aria-label="Previous month"
        >
          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        </button>
        <span className="text-sm font-medium text-gray-700">
          {MONTH_NAMES[month]} {year}
        </span>
        <button
          onClick={nextMonth}
          className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
          aria-label="Next month"
        >
          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      {/* Day-of-week labels */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_LABELS.map((d) => (
          <div key={d} className="text-center text-xs text-gray-400 font-medium py-0.5">
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
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
                "relative flex flex-col items-center justify-center w-full aspect-square rounded-lg text-xs font-medium transition-colors",
                isSelected
                  ? "bg-brand-600 text-white"
                  : isToday
                  ? "text-brand-600 font-semibold hover:bg-brand-50"
                  : "text-gray-700 hover:bg-gray-100",
              ].join(" ")}
            >
              {day}
              {hasActivity && (
                <span
                  className={[
                    "absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full",
                    isSelected ? "bg-white/70" : "bg-brand-500",
                  ].join(" ")}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
