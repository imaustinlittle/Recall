"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { speakersApi } from "@/lib/api";
import { useAuth } from "@/lib/useAuth";
import { Sidebar } from "@/components/layout/Sidebar";
import { Spinner } from "@/components/ui/Spinner";
import { formatDate } from "@/lib/utils";

interface SpeakerProfile {
  name: string;
  meeting_count: number;
  last_seen: string | null;
}

interface SpeakerMeeting {
  id: string;
  title: string;
  status: string;
  created_at: string;
}

export default function SpeakersPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [profiles, setProfiles] = useState<SpeakerProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [meetings, setMeetings] = useState<SpeakerMeeting[]>([]);
  const [loadingMeetings, setLoadingMeetings] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user) return;
    speakersApi.listAll()
      .then((d) => setProfiles(d as SpeakerProfile[]))
      .finally(() => setLoading(false));
  }, [user]);

  const handleSelect = async (name: string) => {
    if (selected === name) { setSelected(null); setMeetings([]); return; }
    setSelected(name);
    setLoadingMeetings(true);
    try {
      const data = await speakersApi.meetingsForSpeaker(name) as SpeakerMeeting[];
      setMeetings(data);
    } finally {
      setLoadingMeetings(false);
    }
  };

  if (authLoading || !user) {
    return (
      <div className="flex h-screen overflow-hidden bg-gray-50">
        <Sidebar />
        <div className="flex-1 flex items-center justify-center"><Spinner size="lg" /></div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar />

      <div className="flex-1 flex min-w-0 overflow-hidden">
        {/* Speaker list */}
        <div className="w-72 shrink-0 flex flex-col border-r border-gray-100 bg-white overflow-y-auto">
          <div className="px-5 py-5 border-b border-gray-100">
            <h1 className="text-base font-semibold text-gray-900">Speakers</h1>
            <p className="text-xs text-gray-400 mt-0.5">{profiles.length} unique names</p>
          </div>

          {loading ? (
            <div className="flex justify-center py-16"><Spinner size="md" /></div>
          ) : profiles.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-gray-400">
              No speakers yet. Rename speakers in your meeting transcripts to see them here.
            </div>
          ) : (
            <ul className="py-2">
              {profiles.map((p) => (
                <li key={p.name}>
                  <button
                    onClick={() => handleSelect(p.name)}
                    className={[
                      "w-full text-left px-5 py-3 flex items-center gap-3 transition-colors",
                      selected === p.name ? "bg-brand-50 border-r-2 border-brand-500" : "hover:bg-gray-50",
                    ].join(" ")}
                  >
                    <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center shrink-0">
                      <span className="text-sm font-semibold text-brand-600">
                        {p.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                      <p className="text-xs text-gray-400">
                        {p.meeting_count} meeting{p.meeting_count !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Meeting list for selected speaker */}
        <div className="flex-1 overflow-y-auto px-8 py-6">
          {!selected ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <p className="text-gray-500 font-medium text-sm">Select a speaker</p>
              <p className="text-gray-400 text-xs mt-1">See all meetings they appear in</p>
            </div>
          ) : loadingMeetings ? (
            <div className="flex justify-center py-24"><Spinner size="lg" /></div>
          ) : (
            <div className="max-w-2xl">
              <h2 className="text-base font-semibold text-gray-900 mb-4">{selected}</h2>
              <ul className="space-y-2.5">
                {meetings.map((m) => (
                  <li key={m.id}>
                    <Link
                      href={`/meetings/${m.id}`}
                      className="block bg-white border border-gray-100 rounded-xl px-5 py-4 hover:border-brand-200 hover:shadow-md transition-all"
                    >
                      <p className="font-medium text-gray-900">{m.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{formatDate(m.created_at)}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
