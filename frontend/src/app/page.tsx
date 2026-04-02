"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { meetings as meetingsApi } from "@/lib/api";
import { Meeting, MeetingListOut } from "@/lib/types";
import { useAuth } from "@/lib/useAuth";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Spinner } from "@/components/ui/Spinner";
import { formatDate, formatDuration } from "@/lib/utils";

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading, logout } = useAuth();
  const [data, setData] = useState<MeetingListOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user) return;
    meetingsApi
      .list({ limit: 30 })
      .then((d) => setData(d as MeetingListOut))
      .finally(() => setLoading(false));
  }, [user]);

  const handleNew = async () => {
    setCreating(true);
    try {
      const m = (await meetingsApi.create({ title: "New meeting" })) as Meeting;
      router.push(`/meetings/${m.id}`);
    } finally {
      setCreating(false);
    }
  };

  if (authLoading || !user) return <FullScreenSpinner />;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Nav */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl font-semibold text-brand-600">Recall</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">{user.email}</span>
          <Link href="/admin" className="text-sm text-gray-500 hover:text-gray-700">
            Settings
          </Link>
          <button
            onClick={logout}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        {/* Header row */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Meetings</h1>
            <p className="text-sm text-gray-500 mt-1">
              {data?.total ?? 0} total
            </p>
          </div>
          <button
            onClick={handleNew}
            disabled={creating}
            className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-60"
          >
            {creating ? <Spinner size="sm" /> : "+"}
            New meeting
          </button>
        </div>

        {/* Meeting list */}
        {loading ? (
          <div className="flex justify-center py-24">
            <Spinner size="lg" />
          </div>
        ) : data?.items.length === 0 ? (
          <EmptyState onNew={handleNew} />
        ) : (
          <ul className="space-y-3">
            {data?.items.map((m) => (
              <MeetingRow key={m.id} meeting={m} />
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

function MeetingRow({ meeting }: { meeting: Meeting }) {
  return (
    <li>
      <Link
        href={`/meetings/${meeting.id}`}
        className="block bg-white border border-gray-200 rounded-xl px-5 py-4 hover:border-brand-500 hover:shadow-sm transition-all"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-medium text-gray-900 truncate">{meeting.title}</p>
            <p className="text-sm text-gray-400 mt-0.5">
              {formatDate(meeting.created_at)}
            </p>
          </div>
          <StatusBadge status={meeting.status} />
        </div>
      </Link>
    </li>
  );
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="text-center py-24 bg-white border border-dashed border-gray-300 rounded-xl">
      <p className="text-gray-400 text-sm mb-4">No meetings yet</p>
      <button
        onClick={onNew}
        className="text-brand-600 hover:underline text-sm font-medium"
      >
        Create your first meeting →
      </button>
    </div>
  );
}

function FullScreenSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <Spinner size="lg" />
    </div>
  );
}
