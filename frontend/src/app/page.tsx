"use client";

import { Suspense, useEffect, useState, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { meetings as meetingsApi } from "@/lib/api";
import { Meeting, MeetingListOut } from "@/lib/types";
import { useAuth } from "@/lib/useAuth";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Spinner } from "@/components/ui/Spinner";
import { Sparkline } from "@/components/ui/Sparkline";
import { AppShell } from "@/components/layout/AppShell";
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
    <AppShell>
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center">
            <Spinner size="lg" />
          </div>
        }
      >
        <DashboardContent />
      </Suspense>
    </AppShell>
  );
}

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();

  const dateParam = searchParams.get("date");
  const monthParam = searchParams.get("month");

  // Visible month is derived from the URL (the sidebar calendar writes it).
  const base = dateParam
    ? new Date(dateParam + "T00:00:00")
    : monthParam
    ? new Date(monthParam + "-01T00:00:00")
    : new Date();
  const calYear = base.getFullYear();
  const calMonth = base.getMonth();

  const [monthMeetings, setMonthMeetings] = useState<Meeting[]>([]);
  const [totalAll, setTotalAll] = useState<number>(0);
  const [loadingMeetings, setLoadingMeetings] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [user, authLoading, router]);

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
    if (!dateParam) return monthMeetings;
    return monthMeetings.filter((m) => m.created_at.startsWith(dateParam));
  }, [monthMeetings, dateParam]);

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
      <div className="flex h-full items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  const monthLabel = base.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const subtitle = dateParam
    ? `${visibleMeetings.length} on ${new Date(dateParam + "T00:00:00").toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}`
    : monthParam
    ? `${monthMeetings.length} in ${monthLabel}`
    : `${totalAll} recording${totalAll === 1 ? "" : "s"} archived`;

  return (
    <main className="mx-auto w-full max-w-[980px] px-[26px] pb-20 pt-10">
      {/* Header row */}
      <div className="mb-[30px] flex items-end justify-between gap-5">
        <div>
          <p className="font-mono text-[12px] font-semibold uppercase tracking-[.1em] text-accent">Library</p>
          <h1 className="mt-1.5 font-display text-[34px] font-bold tracking-[-.02em] text-ink">Meetings</h1>
          <p className="mt-1 text-[14px] text-ink-2">{subtitle}</p>
        </div>

        <button
          onClick={handleNew}
          disabled={creating}
          className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-[12px] bg-accent px-[18px] py-3 text-[14px] font-bold text-on-accent shadow-glow transition-opacity disabled:opacity-60"
        >
          {creating ? (
            <Spinner size="sm" className="border-on-accent/40 border-t-on-accent" />
          ) : (
            <PlusIcon />
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
        <EmptyState hasFilter={!!dateParam} onNew={handleNew} onClearFilter={() => router.push("/")} />
      ) : (
        <div className="flex flex-col gap-[11px]">
          {visibleMeetings.map((m) => (
            <MeetingRow key={m.id} meeting={m} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </main>
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
    <div className="group flex items-center gap-1">
      <Link
        href={`/meetings/${meeting.id}`}
        className="flex min-w-0 flex-1 items-center gap-5 rounded-[16px] border border-line bg-surface px-5 py-[17px] text-left text-ink shadow-card-sm transition-all duration-150 hover:-translate-y-px hover:border-line-strong"
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

      {/* In-flow sibling inside the hover group → no dead gap to cross. */}
      <button
        onClick={handleDelete}
        disabled={deleting}
        title="Delete meeting"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-3 opacity-0 transition-opacity hover:text-status-red focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-40"
      >
        {deleting ? <Spinner size="sm" /> : <TrashIcon size={16} />}
      </button>
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
