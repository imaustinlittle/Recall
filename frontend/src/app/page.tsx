"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { meetings as meetingsApi } from "@/lib/api";
import { Meeting, MeetingListOut } from "@/lib/types";
import { useAuth } from "@/lib/useAuth";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Spinner } from "@/components/ui/Spinner";
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
  const { user, loading: authLoading, logout } = useAuth();

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
        setTotalAll(res.total);
      })
      .finally(() => setLoadingMeetings(false));
  }, [user, calYear, calMonth]);

  // Also fetch the total count across all time for display
  useEffect(() => {
    if (!user) return;
    meetingsApi.list({ limit: 1 }).then((d) => {
      setTotalAll((d as MeetingListOut).total);
    });
  }, [user]);

  const activeDates = useMemo(() => {
    const s = new Set<string>();
    for (const m of monthMeetings) {
      s.add(m.created_at.slice(0, 10));
    }
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
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* ── Sidebar ─────────────────────────────────────────── */}
      <aside className="w-64 shrink-0 bg-white border-r border-gray-200 flex flex-col">
        {/* Branding */}
        <div className="px-5 py-5 border-b border-gray-100">
          <span className="text-lg font-semibold text-brand-600">Recall</span>
        </div>

        {/* Nav links */}
        <nav className="px-3 py-3 space-y-0.5">
          <NavItem href="/" icon={<MeetingsIcon />} active>
            Meetings
          </NavItem>
          <NavItem href="/admin" icon={<SettingsIcon />}>
            Settings
          </NavItem>
        </nav>

        <div className="mx-3 my-2 border-t border-gray-100" />

        {/* Mini calendar */}
        <div className="px-4 py-3">
          <MiniCalendar
            year={calYear}
            month={calMonth}
            activeDates={activeDates}
            selectedDate={selectedDate}
            onDateSelect={setSelectedDate}
            onMonthChange={handleMonthChange}
          />
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* User footer */}
        <div className="px-4 py-4 border-t border-gray-100">
          <p className="text-xs text-gray-500 truncate mb-2">{user.email}</p>
          <button
            onClick={logout}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────── */}
      <main className="flex-1 min-w-0 px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Meetings</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              {selectedDate
                ? `${visibleMeetings.length} on ${new Date(selectedDate + "T00:00:00").toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}`
                : `${totalAll} total`}
            </p>
          </div>
          <button
            onClick={handleNew}
            disabled={creating}
            className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-60"
          >
            {creating ? <Spinner size="sm" /> : (
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
            )}
            New meeting
          </button>
        </div>

        {/* List */}
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
          <ul className="space-y-3 max-w-3xl">
            {visibleMeetings.map((m) => (
              <MeetingRow key={m.id} meeting={m} onDelete={handleDelete} />
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function NavItem({
  href,
  icon,
  active,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={[
        "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
        active
          ? "bg-brand-50 text-brand-700"
          : "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
      ].join(" ")}
    >
      <span className="w-4 h-4 shrink-0">{icon}</span>
      {children}
    </Link>
  );
}

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
    <li>
      <div className="flex items-center gap-2">
        <Link
          href={`/meetings/${meeting.id}`}
          className="flex-1 block bg-white border border-gray-200 rounded-xl px-5 py-4 hover:border-brand-500 hover:shadow-sm transition-all"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="font-medium text-gray-900 truncate">{meeting.title}</p>
              <p className="text-sm text-gray-400 mt-0.5">{formatDate(meeting.created_at)}</p>
            </div>
            <StatusBadge status={meeting.status} />
          </div>
        </Link>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="p-2 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-40"
          title="Delete meeting"
        >
          {deleting ? <Spinner size="sm" /> : (
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          )}
        </button>
      </div>
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
    <div className="max-w-3xl text-center py-24 bg-white border border-dashed border-gray-300 rounded-xl">
      {hasFilter ? (
        <>
          <p className="text-gray-400 text-sm mb-3">No meetings on this day</p>
          <button onClick={onClearFilter} className="text-brand-600 hover:underline text-sm font-medium">
            Show all this month →
          </button>
        </>
      ) : (
        <>
          <p className="text-gray-400 text-sm mb-4">No meetings this month</p>
          <button onClick={onNew} className="text-brand-600 hover:underline text-sm font-medium">
            Create your first meeting →
          </button>
        </>
      )}
    </div>
  );
}

function MeetingsIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z" />
      <path d="M15 7v2a4 4 0 01-4 4H9.828l-1.766 1.767c.28.149.599.233.938.233h2l3 3v-3h2a2 2 0 002-2V9a2 2 0 00-2-2h-1z" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
    </svg>
  );
}
