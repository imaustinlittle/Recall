"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { speakersApi, voiceProfilesApi } from "@/lib/api";
import { VoiceProfile } from "@/lib/types";
import { useAuth } from "@/lib/useAuth";
import { AppShell } from "@/components/layout/AppShell";
import { Spinner } from "@/components/ui/Spinner";
import { UsersIcon, MicIcon, TrashIcon } from "@/components/ui/icons";
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

  const [voiceProfiles, setVoiceProfiles] = useState<VoiceProfile[]>([]);

  useEffect(() => {
    if (!user) return;
    speakersApi
      .listAll()
      .then((d) => setProfiles(d as SpeakerProfile[]))
      .finally(() => setLoading(false));
    voiceProfilesApi.list().then(setVoiceProfiles).catch(() => {});
  }, [user]);

  const handleRenameVoice = async (id: string, current: string) => {
    const name = prompt("Rename voice profile", current);
    if (!name || name.trim() === current) return;
    try {
      const updated = await voiceProfilesApi.rename(id, name.trim());
      setVoiceProfiles((prev) => prev.map((p) => (p.id === id ? updated : p)));
    } catch { /* ignore */ }
  };

  const handleDeleteVoice = async (id: string, name: string) => {
    if (!confirm(`Delete voice profile "${name}"? Speakers already labeled stay as-is.`)) return;
    try {
      await voiceProfilesApi.delete(id);
      setVoiceProfiles((prev) => prev.filter((p) => p.id !== id));
    } catch { /* ignore */ }
  };

  const handleSelect = async (name: string) => {
    if (selected === name) {
      setSelected(null);
      setMeetings([]);
      return;
    }
    setSelected(name);
    setLoadingMeetings(true);
    try {
      const data = (await speakersApi.meetingsForSpeaker(name)) as SpeakerMeeting[];
      setMeetings(data);
    } finally {
      setLoadingMeetings(false);
    }
  };

  if (authLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-[980px] px-[26px] pb-20 pt-10">
        <p className="font-mono text-[12px] font-semibold uppercase tracking-[.1em] text-accent">People</p>
        <h1 className="mt-1.5 font-display text-[34px] font-bold tracking-[-.02em] text-ink">Speakers</h1>
        <p className="mt-1 text-[14px] text-ink-2">
          {profiles.length} unique name{profiles.length === 1 ? "" : "s"} across your meetings
        </p>

        {/* Voice profiles */}
        {voiceProfiles.length > 0 && (
          <section className="mt-7 overflow-hidden rounded-[16px] border border-line bg-surface shadow-card-sm">
            <div className="flex items-center gap-2 border-b border-line bg-surface-2 px-5 py-3">
              <MicIcon size={15} className="text-accent" />
              <h2 className="font-mono text-[11.5px] font-semibold uppercase tracking-[.1em] text-ink-2">
                Voice profiles
              </h2>
              <span className="font-mono text-[11px] text-ink-3">
                {voiceProfiles.length} enrolled — used to auto-label speakers in new recordings
              </span>
            </div>
            <ul>
              {voiceProfiles.map((vp) => (
                <li
                  key={vp.id}
                  className="group flex items-center gap-3 border-b border-line px-5 py-3 last:border-b-0"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-weak text-[14px] font-bold text-accent">
                    {vp.name.charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-semibold text-ink">{vp.name}</p>
                    <p className="font-mono text-[11px] text-ink-3">
                      {vp.sample_count} sample{vp.sample_count === 1 ? "" : "s"}
                    </p>
                  </div>
                  <button
                    onClick={() => handleRenameVoice(vp.id, vp.name)}
                    className="rounded-[8px] px-2.5 py-1 text-[12.5px] font-semibold text-ink-2 opacity-0 transition-opacity hover:text-ink group-hover:opacity-100"
                  >
                    Rename
                  </button>
                  <button
                    onClick={() => handleDeleteVoice(vp.id, vp.name)}
                    title="Delete voice profile"
                    className="rounded-lg p-1.5 text-ink-3 opacity-0 transition-opacity hover:text-status-red group-hover:opacity-100"
                  >
                    <TrashIcon size={16} />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {loading ? (
          <div className="flex justify-center py-24">
            <Spinner size="lg" />
          </div>
        ) : profiles.length === 0 ? (
          <div className="mt-8 rounded-[18px] border border-dashed border-line-strong bg-surface-2 py-20 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent-weak text-accent">
              <UsersIcon size={24} />
            </div>
            <p className="mb-1 font-semibold text-ink">No speakers yet</p>
            <p className="text-sm text-ink-2">Rename speakers in your transcripts to see them here.</p>
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-1 gap-3 md:grid-cols-2">
            {profiles.map((p) => {
              const isSelected = selected === p.name;
              return (
                <div
                  key={p.name}
                  className={[
                    "rounded-[16px] border bg-surface shadow-card-sm transition-colors",
                    isSelected ? "border-accent-line" : "border-line",
                  ].join(" ")}
                >
                  <button
                    onClick={() => handleSelect(p.name)}
                    className="flex w-full items-center gap-3 px-5 py-4 text-left"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-weak text-[15px] font-bold text-accent">
                      {p.name.charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-ink">{p.name}</p>
                      <p className="font-mono text-[12px] text-ink-3">
                        {p.meeting_count} meeting{p.meeting_count !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <span className={`text-ink-3 transition-transform ${isSelected ? "rotate-180" : ""}`}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </span>
                  </button>

                  {isSelected && (
                    <div className="border-t border-line px-5 py-3">
                      {loadingMeetings ? (
                        <div className="flex justify-center py-4">
                          <Spinner size="sm" />
                        </div>
                      ) : (
                        <ul className="space-y-1">
                          {meetings.map((m) => (
                            <li key={m.id}>
                              <Link
                                href={`/meetings/${m.id}`}
                                className="flex items-center justify-between gap-3 rounded-[10px] px-2.5 py-2 transition-colors hover:bg-surface-2"
                              >
                                <span className="truncate text-[13.5px] font-medium text-ink">{m.title}</span>
                                <span className="shrink-0 font-mono text-[11px] text-ink-3">
                                  {formatDate(m.created_at)}
                                </span>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </AppShell>
  );
}
