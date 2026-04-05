"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { meetings as meetingsApi } from "@/lib/api";
import { Meeting, MeetingListOut } from "@/lib/types";
import { useAuth } from "@/lib/useAuth";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Spinner } from "@/components/ui/Spinner";
import { Sidebar } from "@/components/layout/Sidebar";
import { MiniCalendar } from "@/components/calendar/MiniCalendar";
import { formatDate } from "@/lib/utils";

function monthStart(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-01`;
}
function monthEnd(year: number, month: number): string {
  const last = new Date(year, month + 1, 0).getDate();
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [monthMeetings, setMonthMeetings] = useState<Meeting[]>([]);
  const [loadingMeetings, setLoadingMeetings] = useState(true);
  const [totalAll, setTotalAll] = useState<number>(0);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [user, authLoading, router]);

  // Fetch total count across all time
  useEffect(() => {
    if (!user) return;
    meetingsApi.list({ limit: 1 }).then((d) => {
      setTotalAll((d as MeetingListOut).total);
    });
  }, [user]);

  // Fetch meetings for the visible calendar month
  useEffect(() => {
    if (!user) return;
    setLoadingMeetings(true);
    meetingsApi
      .list({
        date_from: monthStart(calYear, calMonth),
        date_to: monthEnd(calYear, calMonth),
        limit: 100,
      })
      .then((d) => {
        const res = d as MeetingListOut;
        setMonthMeetings(res.items);
      })
      .finally(() => setLoadingMeetings(false));
  }, [user, calYear, calMonth]);

  const activeDates = useMemo(() => {
    const s = new Set<string>();
    for (const m of monthMeetings) s.add(m.created_at.slice(0, 10));
    return s;
  }, [monthMeetings]);

  const visibleMeetings = useMemo(() => {
    if (!selectedDate) return monthMeetings;
    return monthMeetings.filter((m) => m.created_at.startsWith(selectedDate));
  }, [monthMeetings, selectedDate]);

  const handleMonthChange = (year: number, month: number) => {
    setCalYear(year);
    setCalMonth(month);
    setSelectedDate(null);
  };

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

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Spinner size="lg" />
      </div>
    );
  }

  const calendar = (
    <MiniCalendar
      year={calYear}
      month={calMonth}
      activeDates={activeDates}
      selectedDate={selectedDate}
      onDateSelect={setSelectedDate}
      onMonthChange={handleMonthChange}
      dark
    />
  );

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar extra={calendar} />

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="shrink-0 bg-white border-b border-gray-100 px-8 py-5 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Meetings</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              {selectedDate
                ? `${visibleMeetings.length} on ${new Date(selectedDate + "T00:00:00").toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}`
                : `${totalAll} total`}
            </p>
          </div>
          <button
            onClick={handleNew}
            disabled={creating}
            className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors shadow-sm disabled:opacity-60"
          >
            {creating ? <Spinner size="sm" /> : (
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
            )}
            New meeting
          </button>
        </header>

        {/* Scrollable list */}
        <div className="flex-1 overflow-y-auto px-8 py-6">
          {loadingMeetings ? (
            <div className="flex justify-center py-24">
              <Spinner size="lg" />
            </div>
          ) : visibleMeetings.length === 0 ? (
            <EmptyState
              hasFilter={!!selectedDate}
              onNew={handleNew}
              onClearFilter={() => setSelectedDate(null)}
            />
          ) : (
            <ul className="space-y-2.5 max-w-3xl">
              {visibleMeetings.map((m) => (
                <MeetingRow key={m.id} meeting={m} onDelete={handleDelete} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function MeetingRow({ meeting, onDelete }: { meeting: Meeting; onDelete: (id: string) => void }) {
  const [deleting, setDeleting] = useState(false);

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
    <li className="group flex items-center gap-2">
      <Link
        href={`/meetings/${meeting.id}`}
        className="flex-1 block bg-white border border-gray-100 rounded-xl px-5 py-4 hover:border-brand-200 hover:shadow-md transition-all duration-150"
      >
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 flex items-center gap-3">
            {/* Status dot */}
            <span className={[
              "shrink-0 w-2 h-2 rounded-full",
              meeting.status === "transcribed" ? "bg-emerald-400" :
              meeting.status === "processing" || meeting.status === "queued" ? "bg-amber-400 animate-pulse" :
              meeting.status === "failed" ? "bg-red-400" :
              "bg-gray-300"
            ].join(" ")} />
            <div className="min-w-0">
              <p className="font-medium text-gray-900 truncate">{meeting.title}</p>
              <p className="text-xs text-gray-400 mt-0.5">{formatDate(meeting.created_at)}</p>
            </div>
          </div>
          <StatusBadge status={meeting.status} />
        </div>
      </Link>
      <button
        onClick={handleDelete}
        disabled={deleting}
        className="p-2 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all disabled:opacity-40"
        title="Delete meeting"
      >
        {deleting ? <Spinner size="sm" /> : (
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        )}
      </button>
    </li>
  );
}

function EmptyState({
  hasFilter,
  onNew,
  onClearFilter,
}: {
  hasFilter: boolean;
  onNew: () => void;
  onClearFilter: () => void;
}) {
  return (
    <div className="max-w-3xl text-center py-20 bg-white border border-dashed border-gray-200 rounded-xl">
      {hasFilter ? (
        <>
          <p className="text-gray-400 text-sm mb-3">No meetings on this day</p>
          <button onClick={onClearFilter} className="text-brand-600 hover:underline text-sm font-medium">
            Show all this month →
          </button>
        </>
      ) : (
        <>
          <div className="w-12 h-12 rounded-full bg-brand-50 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-brand-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </div>
          <p className="text-gray-500 font-medium mb-1">No meetings this month</p>
          <p className="text-gray-400 text-sm mb-4">Record, upload, or create a new meeting to get started.</p>
          <button
            onClick={onNew}
            className="inline-flex items-center gap-1.5 text-brand-600 hover:text-brand-700 text-sm font-medium"
          >
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            New meeting
          </button>
        </>
      )}
    </div>
  );
}
