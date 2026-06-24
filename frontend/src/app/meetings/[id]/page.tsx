"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import {
  meetings as meetingsApi,
  transcript as transcriptApi,
  speakers as speakersApi,
  jobs as jobsApi,
  media as mediaApi,
  notes as notesApi,
  voiceProfilesApi,
  exportTranscript,
} from "@/lib/api";
import { Meeting, TranscriptSegment, Speaker, Job, Note, NoteType } from "@/lib/types";
import { useJobStatus } from "@/lib/useJobStatus";
import { useAuth } from "@/lib/useAuth";
import { DropZone } from "@/components/upload/DropZone";
import { RecordingPanel } from "@/components/recording/RecordingPanel";
import { TranscriptViewer, TranscriptViewerHandle } from "@/components/transcript/TranscriptViewer";
import { JobProgressBar } from "@/components/ui/JobProgressBar";
import { WaveformPlayer } from "@/components/ui/WaveformPlayer";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Spinner } from "@/components/ui/Spinner";
import { NotesPanel } from "@/components/notes/NotesPanel";
import { MeetingMetaBar } from "@/components/meeting/MeetingMetaBar";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { SummaryPanel, SummaryPending } from "@/components/summary/SummaryPanel";
import { AppShell } from "@/components/layout/AppShell";
import { BackIcon, ChevronIcon, DownloadIcon } from "@/components/ui/icons";
import { formatDate } from "@/lib/utils";

const EXPORT_FORMATS = [
  { key: "txt", label: "Plain Text (.txt)" },
  { key: "md", label: "Markdown (.md)" },
  { key: "srt", label: "Subtitles (.srt)" },
  { key: "vtt", label: "WebVTT (.vtt)" },
  { key: "pdf", label: "PDF (.pdf)" },
] as const;

export default function MeetingPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [notesList, setNotesList] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeJobId, setActiveJobId] = useState<string | null>(searchParams.get("job"));
  const [currentTime, setCurrentTime] = useState(0);
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const transcriptRef = useRef<TranscriptViewerHandle>(null);

  const job = useJobStatus(activeJobId);

  useEffect(() => {
    if (job?.status === "completed") {
      setActiveJobId(null);
      loadTranscript();
      loadMeeting();
    }
  }, [job?.status]);

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [user, authLoading]);

  useEffect(() => {
    if (user) {
      loadMeeting();
      loadTranscript();
      if (!searchParams.get("job")) {
        jobsApi.list(id).then((list: any) => {
          const active = list?.find((j: any) => j.status === "processing" || j.status === "queued");
          if (active) setActiveJobId(active.id);
        });
      }
    }
  }, [user, id]);

  // Poll for summary while transcript is ready but summary not yet generated
  useEffect(() => {
    if (!meeting || meeting.summary || meeting.status !== "transcribed") return;
    const interval = setInterval(async () => {
      const updated = (await meetingsApi.get(id)) as Meeting;
      if (updated.summary) {
        setMeeting(updated);
        clearInterval(interval);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [meeting?.summary, meeting?.status]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Keyboard shortcuts — only active when there is audio loaded
  useEffect(() => {
    if (!audioSrc) return;
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const el = audioRef.current;
      switch (e.key.toLowerCase()) {
        case "a":
          if (el) el.currentTime = Math.max(0, el.currentTime - 10);
          break;
        case "f":
          if (el) el.currentTime = Math.min(el.duration || 0, el.currentTime + 10);
          break;
        case "s":
          if (el) { el.paused ? el.play().catch(() => {}) : el.pause(); }
          break;
        case "d":
          transcriptRef.current?.openNoteForActiveBlock();
          break;
        case "q":
          transcriptRef.current?.editActiveSpeaker();
          break;
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [audioSrc]);

  const loadMeeting = useCallback(async () => {
    try {
      const m = (await meetingsApi.get(id)) as Meeting;
      setMeeting(m);
    } catch {
      router.push("/");
    }
  }, [id]);

  const loadTranscript = useCallback(async () => {
    try {
      const [segs, spks, mediaFiles, fetchedNotes] = await Promise.all([
        transcriptApi.get(id) as Promise<TranscriptSegment[]>,
        speakersApi.list(id) as Promise<Speaker[]>,
        mediaApi.list(id),
        notesApi.list(id) as Promise<Note[]>,
      ]);
      setSegments(segs);
      setSpeakers(spks);
      setNotesList(fetchedNotes);
      if (mediaFiles.length > 0) {
        const fp = mediaFiles[0].file_path;
        setAudioSrc(fp.replace(/^\/data/, ""));
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  // ── Note CRUD ──────────────────────────────────────────────────────────────

  const handleAddNote = useCallback(async (body: string, type: NoteType, timestampRef: number | null) => {
    const created = (await notesApi.create(id, { note_type: type, body, timestamp_ref: timestampRef })) as Note;
    setNotesList((prev) => [...prev, created]);
  }, [id]);

  const handleUpdateNote = useCallback(async (noteId: string, body: string, type: NoteType) => {
    const updated = (await notesApi.update(id, noteId, { body, note_type: type })) as Note;
    setNotesList((prev) => prev.map((n) => (n.id === noteId ? updated : n)));
  }, [id]);

  const handleDeleteNote = useCallback(async (noteId: string) => {
    await notesApi.delete(id, noteId);
    setNotesList((prev) => prev.filter((n) => n.id !== noteId));
  }, [id]);

  const handleAddNoteFromTranscript = useCallback(async (timestamp: number, body: string, type: NoteType) => {
    await handleAddNote(body, type, timestamp);
  }, [handleAddNote]);

  // ── Transcript handlers ──────────────────────────────────────────────────

  const handleUploaded = (newJob: Job) => {
    setActiveJobId(newJob.id);
    setMeeting((m) => (m ? { ...m, status: "queued" } : m));
  };

  const handleSegmentUpdate = async (segmentId: string, content: string) => {
    const updated = (await transcriptApi.update(id, segmentId, { content })) as TranscriptSegment;
    setSegments((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  };

  const handleSpeakerRename = async (speakerId: string, display_name: string) => {
    const updated = (await speakersApi.update(id, speakerId, { display_name })) as Speaker;
    setSpeakers((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    setSegments((prev) =>
      prev.map((seg) =>
        seg.speaker_id === speakerId ? { ...seg, speaker: { ...seg.speaker!, display_name } } : seg
      )
    );
  };

  const handleSaveVoiceProfile = async (speakerId: string, name: string) => {
    try {
      const profile = await voiceProfilesApi.enroll(speakerId, name);
      setSpeakers((prev) =>
        prev.map((s) => (s.id === speakerId ? { ...s, voice_profile_id: profile.id, display_name: name } : s))
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not save voice profile");
    }
  };

  const seek = (t: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = t;
      audioRef.current.play().catch(() => {});
    }
  };

  if (authLoading || !user || !meeting) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  const isProcessing = ["queued", "processing", "uploading"].includes(meeting.status);
  const hasTranscript = segments.length > 0;

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-[880px] px-[26px] pb-24 pt-[26px]">
        {/* Sub-header */}
        <div className="mb-[22px] flex items-center gap-4">
          <button
            onClick={() => router.push("/")}
            className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[11px] border border-line bg-surface text-ink-2 transition-colors hover:text-ink"
            title="Back to meetings"
          >
            <BackIcon />
          </button>
          <div className="min-w-0 flex-1">
            <EditableTitle
              value={meeting.title}
              onSave={(title) => {
                meetingsApi.update(id, { title });
                setMeeting((m) => (m ? { ...m, title } : m));
              }}
            />
            <p className="mt-[3px] font-mono text-[12px] text-ink-3">{formatDate(meeting.created_at)}</p>
          </div>
          <StatusBadge status={meeting.status} />
          {hasTranscript && (
            <div className="relative" ref={exportMenuRef}>
              <button
                onClick={() => setExportOpen((o) => !o)}
                className="flex items-center gap-1.5 rounded-[11px] border border-line bg-surface px-3 py-2 text-[13px] font-semibold text-ink-2 transition-colors hover:text-ink"
              >
                <DownloadIcon size={15} />
                Export
                <ChevronIcon size={14} />
              </button>
              {exportOpen && (
                <div className="absolute right-0 z-10 mt-1.5 w-48 overflow-hidden rounded-[12px] border border-line bg-surface py-1 shadow-card">
                  {EXPORT_FORMATS.map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => { exportTranscript(id, key); setExportOpen(false); }}
                      className="w-full px-4 py-2 text-left text-sm text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Folder + tags */}
        <div className="mb-[22px]">
          <MeetingMetaBar
            meeting={meeting}
            onChange={(patch) => setMeeting((m) => (m ? { ...m, ...patch } : m))}
          />
        </div>

        {/* Body */}
        {isProcessing ? (
          <JobProgressBar job={job} />
        ) : hasTranscript ? (
          <div className="flex flex-col gap-3.5">
            {audioSrc && (
              <WaveformPlayer
                src={audioSrc}
                audioRef={audioRef}
                seed={id}
                onTimeUpdate={setCurrentTime}
              />
            )}

            <TranscriptViewer
              ref={transcriptRef}
              segments={segments}
              speakers={speakers}
              meetingId={id}
              currentTime={currentTime}
              onSeek={seek}
              onSegmentUpdate={handleSegmentUpdate}
              onSpeakerRename={handleSpeakerRename}
              onSaveVoiceProfile={handleSaveVoiceProfile}
              onAddNote={handleAddNoteFromTranscript}
            />

            {audioSrc && (
              <p className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 font-mono text-[11px] text-ink-3">
                <Key k="A" label="−10s" />
                <Key k="S" label="play / pause" />
                <Key k="F" label="+10s" />
                <Key k="D" label="add note" />
                <Key k="Q" label="rename speaker" />
              </p>
            )}

            {meeting.summary ? (
              <SummaryPanel
                summary={meeting.summary}
                onRegenerate={async () => {
                  await meetingsApi.summarize(id);
                  setMeeting((m) => (m ? { ...m, summary: null } : m));
                }}
                onImportNotes={async () => {
                  const res = (await meetingsApi.importNotesFromSummary(id)) as { created: number };
                  const freshNotes = (await notesApi.list(id)) as Note[];
                  setNotesList(freshNotes);
                  return res.created;
                }}
              />
            ) : meeting.status === "transcribed" ? (
              <SummaryPending onGenerate={async () => { await meetingsApi.summarize(id); }} />
            ) : null}

            <ChatPanel meetingId={id} onSeek={audioSrc ? seek : undefined} />

            <NotesPanel
              notes={notesList}
              currentTime={currentTime}
              onSeek={audioSrc ? seek : undefined}
              onAdd={handleAddNote}
              onUpdate={handleUpdateNote}
              onDelete={handleDeleteNote}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <RecordingPanel meetingId={id} onUploaded={handleUploaded} />
            <div className="flex items-center gap-3.5 font-mono text-[11px] uppercase tracking-[.06em] text-ink-3">
              <span className="h-px flex-1 bg-line" />
              or upload a file
              <span className="h-px flex-1 bg-line" />
            </div>
            <DropZone meetingId={id} onUploaded={handleUploaded} />
          </div>
        )}
      </main>
    </AppShell>
  );
}

function Key({ k, label }: { k: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <kbd className="rounded-[5px] border border-line bg-surface px-1.5 py-0.5 font-bold text-ink-2">{k}</kbd>
      {label}
    </span>
  );
}

function EditableTitle({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { setEditing(false); onSave(draft); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { setEditing(false); onSave(draft); }
          if (e.key === "Escape") { setEditing(false); setDraft(value); }
        }}
        className="w-full border-b border-accent bg-transparent font-display text-[23px] font-bold tracking-[-.01em] text-ink outline-none"
      />
    );
  }
  return (
    <h1
      onClick={() => setEditing(true)}
      className="cursor-text truncate font-display text-[23px] font-bold tracking-[-.01em] text-ink transition-colors hover:text-accent"
      title="Click to rename"
    >
      {value}
    </h1>
  );
}
