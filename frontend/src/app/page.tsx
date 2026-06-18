"use client";

import { Suspense, useEffect, useState, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { meetings as meetingsApi } from "@/lib/api";
import { Meeting, MeetingListOut } from "@/lib/types";
import { useAuth } from "@/lib/useAuth";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Spinner } from "@/components/ui/Spinner";
import { Sparkline } from "@/components/ui/Sparkline";
import { AppHeader } from "@/components/layout/AppHeader";
import { MiniCalendar } from "@/components/calendar/MiniCalendar";
import { PlusIcon, WaveIcon, TrashIcon } from "@/components/ui/icons";
import { formatDate } from "@/lib/utils";

function monthStart(year: number, month: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-01`;
}
function monthEnd(year: number, month: number) {
  const last = new Date(year, month + 1, 0).getDate();
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Spinner size="lg" />
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();

  const selectedDate = searchParams.get("date");

  // Which month the list + calendar show. Independent of day selection so the
  // popover can page through months without filtering to a single day.
  const initial = selectedDate ? new Date(selectedDate + "T00:00:00") : new Date();
  const [view, setView] = useState({ year: initial.getFullYear(), month: initial.getMonth() });
  const { year: calYear, month: calMonth } = view;

  const [monthMeetings, setMonthMeetings] = useState<Meeting[]>([]);
  const [totalAll, setTotalAll] = useState<number>(0);
  const [loadingMeetings, setLoadingMeetings] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [user, authLoading, router]);

  // Keep the view month in sync when a date is selected from elsewhere (URL).
  useEffect(() => {
    if (!selectedDate) return;
    const d = new Date(selectedDate + "T00:00:00");
    setView((v) =>
      v.year === d.getFullYear() && v.month === d.getMonth()
        ? v
        : { year: d.getFullYear(), month: d.getMonth() }
    );
  }, [selectedDate]);

  useEffect(() => {
    if (!user) return;
    meetingsApi.list({ limit: 1 }).then((d) => setTotalAll((d as MeetingListOut).total));
  }, [user]);

  useEffect(() => {
    if (!user) return;
    setLoadingMeetings(true);
    meetingsApi
      .list({ date_from: monthStart(calYear, calMonth), date_to: monthEnd(calYear, calMonth), limit: 100 })
      .then((d) => setMonthMeetings((d as MeetingListOut).items))
      .finally(() => setLoadingMeetings(false));
  }, [user, calYear, calMonth]);

  const visibleMeetings = useMemo(() => {
    if (!selectedDate) return monthMeetings;
    return monthMeetings.filter((m) => m.created_at.startsWith(selectedDate));
  }, [monthMeetings, selectedDate]);

  const handleNew = async () => {
    setCreating(true);
    try {
      const m = (await meetingsApi.create({ title: "New meeting" })) as Meeting;
      router.push(`/meetings/${m.id}`);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = (id: string) => {
    setMonthMeetings((prev) => prev.filter((m) => m.id !== id));
    setTotalAll((t) => t - 1);
  };

  const handleMonthChange = (year: number, month: number) => {
    setView({ year, month });
    // Paging months clears a day filter that no longer belongs to the view.
    if (selectedDate && !selectedDate.startsWith(monthStart(year, month).slice(0, 7))) {
      router.push("/");
    }
  };
  const handleDateSelect = (date: string | null) => {
    router.push(date ? `/?date=${date}` : "/");
  };

  if (authLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  const subtitle = selectedDate
    ? `${visibleMeetings.length} on ${new Date(selectedDate + "T00:00:00").toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}`
    : `${totalAll} recording${totalAll === 1 ? "" : "s"} archived`;

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />

      <main className="mx-auto w-full max-w-[980px] px-[26px] pb-20 pt-10">
        {/* Header row */}
        <div className="mb-[30px] flex items-end justify-between gap-5">
          <div>
            <p className="font-mono text-[12px] font-semibold uppercase tracking-[.1em] text-accent">
              Library
            </p>
            <h1 className="mt-1.5 font-display text-[34px] font-bold tracking-[-.02em] text-ink">
              Meetings
            </h1>
            <p className="mt-1 text-[14px] text-ink-2">{subtitle}</p>
          </div>

          <div className="flex shrink-0 items-center gap-2.5">
            <DateFilter
              year={calYear}
              month={calMonth}
              selectedDate={selectedDate}
              activeDates={new Set(monthMeetings.map((m) => m.created_at.slice(0, 10)))}
              onDateSelect={handleDateSelect}
              onMonthChange={handleMonthChange}
            />
            <button
              onClick={handleNew}
              disabled={creating}
              className="inline-flex items-center gap-2 whitespace-nowrap rounded-[12px] bg-accent px-[18px] py-3 text-[14px] font-bold text-on-accent shadow-glow transition-opacity disabled:opacity-60"
            >
              {creating ? (
                <Spinner size="sm" className="border-on-accent/40 border-t-on-accent" />
              ) : (
                <PlusIcon />
              )}
              New meeting
            </button>
          </div>
        </div>

        {/* List */}
        {loadingMeetings ? (
          <div className="flex justify-center py-24">
            <Spinner size="lg" />
          </div>
        ) : visibleMeetings.length === 0 ? (
          <EmptyState hasFilter={!!selectedDate} onNew={handleNew} onClearFilter={() => router.push("/")} />
        ) : (
          <div className="flex flex-col gap-[11px]">
            {visibleMeetings.map((m) => (
              <MeetingRow key={m.id} meeting={m} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function MeetingRow({ meeting, onDelete }: { meeting: Meeting; onDelete: (id: string) => void }) {
  const [deleting, setDeleting] = useState(false);
  const isTranscribed = meeting.status === "transcribed";

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!confirm(`Delete "${meeting.title}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await meetingsApi.delete(meeting.id);
      onDelete(meeting.id);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="group relative">
      <Link
        href={`/meetings/${meeting.id}`}
        className="flex w-full items-center gap-5 rounded-[16px] border border-line bg-surface px-5 py-[17px] text-left text-ink shadow-card-sm transition-all duration-150 hover:-translate-y-px hover:border-line-strong"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-accent-weak text-accent">
          <WaveIcon size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15.5px] font-semibold">{meeting.title}</p>
          <p className="mt-[3px] font-mono text-[12px] text-ink-3">{formatDate(meeting.created_at)}</p>
        </div>
        <div className="hidden sm:block">
          <Sparkline seed={meeting.id} active={isTranscribed} />
        </div>
        <StatusBadge status={meeting.status} fixedWidth />
      </Link>

      <button
        onClick={handleDelete}
        disabled={deleting}
        title="Delete meeting"
        className="absolute -right-2 top-1/2 hidden -translate-y-1/2 translate-x-full items-center justify-center rounded-lg p-2 text-ink-3 opacity-0 transition-all hover:text-status-red group-hover:flex group-hover:opacity-100 disabled:opacity-40"
      >
        {deleting ? <Spinner size="sm" /> : <TrashIcon size={16} />}
      </button>
    </div>
  );
}

function DateFilter({
  year,
  month,
  selectedDate,
  activeDates,
  onDateSelect,
  onMonthChange,
}: {
  year: number;
  month: number;
  selectedDate: string | null;
  activeDates: Set<string>;
  onDateSelect: (date: string | null) => void;
  onMonthChange: (year: number, month: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={[
          "inline-flex h-[42px] items-center gap-2 rounded-[12px] border px-[14px] text-[13px] font-semibold transition-colors",
          selectedDate
            ? "border-accent-line bg-accent-weak text-accent"
            : "border-line bg-surface text-ink-2 hover:text-ink",
        ].join(" ")}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
        {selectedDate
          ? new Date(selectedDate + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })
          : "Filter"}
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-[280px] rounded-[16px] border border-line bg-surface p-4 shadow-card">
          <MiniCalendar
            year={year}
            month={month}
            activeDates={activeDates}
            selectedDate={selectedDate}
            onDateSelect={(d) => { onDateSelect(d); setOpen(false); }}
            onMonthChange={onMonthChange}
          />
          {selectedDate && (
            <button
              onClick={() => { onDateSelect(null); setOpen(false); }}
              className="mt-2 w-full rounded-lg py-1.5 text-center text-[12px] font-semibold text-accent hover:bg-accent-weak"
            >
              Clear filter
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function EmptyState({ hasFilter, onNew, onClearFilter }: { hasFilter: boolean; onNew: () => void; onClearFilter: () => void }) {
  return (
    <div className="rounded-[18px] border border-dashed border-line-strong bg-surface-2 py-20 text-center">
      {hasFilter ? (
        <>
          <p className="mb-3 text-sm text-ink-2">No meetings on this day</p>
          <button onClick={onClearFilter} className="text-sm font-semibold text-accent hover:underline">
            Show all this month →
          </button>
        </>
      ) : (
        <>
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent-weak text-accent">
            <WaveIcon size={24} />
          </div>
          <p className="mb-1 font-semibold text-ink">No meetings this month</p>
          <p className="mb-4 text-sm text-ink-2">Record, upload, or create a new meeting to get started.</p>
          <button onClick={onNew} className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline">
            <PlusIcon size={16} />
            New meeting
          </button>
        </>
      )}
    </div>
  );
}
