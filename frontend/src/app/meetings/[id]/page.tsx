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
  exportTranscript,
} from "@/lib/api";
import { Meeting, TranscriptSegment, Speaker, Job, Note, NoteType } from "@/lib/types";
import { useJobStatus } from "@/lib/useJobStatus";
import { useAuth } from "@/lib/useAuth";
import { DropZone } from "@/components/upload/DropZone";
import { RecordingPanel } from "@/components/recording/RecordingPanel";
import { TranscriptViewer, TranscriptViewerHandle } from "@/components/transcript/TranscriptViewer";
import { JobProgressBar } from "@/components/ui/JobProgressBar";
import { AudioPlayer } from "@/components/ui/AudioPlayer";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Spinner } from "@/components/ui/Spinner";
import { NotesPanel } from "@/components/notes/NotesPanel";
import { SummaryPanel, SummaryPending } from "@/components/summary/SummaryPanel";
import { Sidebar } from "@/components/layout/Sidebar";
import { formatDate } from "@/lib/utils";

const EXPORT_FORMATS = [
  { key: "txt", label: "Plain Text (.txt)" },
  { key: "md",  label: "Markdown (.md)"   },
  { key: "srt", label: "Subtitles (.srt)" },
  { key: "vtt", label: "WebVTT (.vtt)"    },
  { key: "pdf", label: "PDF (.pdf)"       },
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
          const active = list?.find((j: any) =>
            j.status === "processing" || j.status === "queued"
          );
          if (active) setActiveJobId(active.id);
        });
      }
    }
  }, [user, id]);

  // Poll for summary while transcript is ready but summary not yet generated
  useEffect(() => {
    if (!meeting || meeting.summary || meeting.status !== "transcribed") return;
    const interval = setInterval(async () => {
      const updated = await meetingsApi.get(id) as Meeting;
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
      // Don't fire while the user is typing in any input
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

  // ── Note CRUD (lifted so both TranscriptViewer and NotesPanel share state) ──

  const handleAddNote = useCallback(async (
    body: string,
    type: NoteType,
    timestampRef: number | null
  ) => {
    const created = (await notesApi.create(id, {
      note_type: type,
      body,
      timestamp_ref: timestampRef,
    })) as Note;
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

  // ── Called from TranscriptViewer's inline note form ──────────────────────

  const handleAddNoteFromTranscript = useCallback(async (
    timestamp: number,
    body: string,
    type: NoteType
  ) => {
    await handleAddNote(body, type, timestamp);
  }, [handleAddNote]);

  // ── Transcript handlers ──────────────────────────────────────────────────

  const handleUploaded = (newJob: Job) => {
    setActiveJobId(newJob.id);
    setMeeting((m) => m ? { ...m, status: "queued" } : m);
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
        seg.speaker_id === speakerId
          ? { ...seg, speaker: { ...seg.speaker!, display_name } }
          : seg
      )
    );
  };

  const seek = (t: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = t;
      audioRef.current.play().catch(() => {});
    }
  };

  if (authLoading || !user || !meeting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Spinner size="lg" />
      </div>
    );
  }

  const isProcessing = ["queued", "processing"].includes(meeting.status);
  const hasTranscript = segments.length > 0;

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar />

      {/* Right pane */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="shrink-0 bg-white border-b border-gray-100 px-6 py-3.5 flex items-center gap-4">
          <button
            onClick={() => router.push("/")}
            className="flex items-center gap-1.5 text-gray-400 hover:text-gray-600 text-sm transition-colors shrink-0"
          >
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
            </svg>
            Back
          </button>

          <div className="flex-1 min-w-0">
            <EditableTitle
              value={meeting.title}
              onSave={(title) => {
                meetingsApi.update(id, { title });
                setMeeting((m) => m ? { ...m, title } : m);
              }}
            />
            <p className="text-xs text-gray-400 mt-0.5">{formatDate(meeting.created_at)}</p>
          </div>

          <StatusBadge status={meeting.status} />

          {hasTranscript && (
            <div className="relative" ref={exportMenuRef}>
              <button
                onClick={() => setExportOpen((o) => !o)}
                className="flex items-center gap-1.5 text-sm px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors"
              >
                Export
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {exportOpen && (
                <div className="absolute right-0 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-10 py-1">
                  {EXPORT_FORMATS.map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => { exportTranscript(id, key); setExportOpen(false); }}
                      className="w-full text-left text-sm px-4 py-2 text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </header>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          <main className="max-w-4xl mx-auto px-6 py-8 pb-40 space-y-6">
            {(isProcessing || job) && <JobProgressBar job={job} />}

            {!hasTranscript && !isProcessing && (
              <div className="space-y-3">
                <RecordingPanel meetingId={id} onUploaded={handleUploaded} />
                <div className="flex items-center gap-3 text-xs text-gray-400">
                  <div className="flex-1 border-t border-gray-200" />
                  <span>or upload an existing file</span>
                  <div className="flex-1 border-t border-gray-200" />
                </div>
                <DropZone meetingId={id} onUploaded={handleUploaded} />
              </div>
            )}

            {hasTranscript && (
              <TranscriptViewer
                ref={transcriptRef}
                segments={segments}
                speakers={speakers}
                meetingId={id}
                currentTime={currentTime}
                onSeek={seek}
                onSegmentUpdate={handleSegmentUpdate}
                onSpeakerRename={handleSpeakerRename}
                onAddNote={handleAddNoteFromTranscript}
              />
            )}

            {isProcessing && !job && (
              <div className="text-center py-16 text-gray-400 text-sm">
                Processing your recording…
              </div>
            )}

            {hasTranscript && meeting.summary && (
              <SummaryPanel
                summary={meeting.summary}
                onRegenerate={async () => {
                  await meetingsApi.summarize(id);
                  setMeeting((m) => m ? { ...m, summary: null } : m);
                }}
                onImportNotes={async () => {
                  const res = await meetingsApi.importNotesFromSummary(id) as { created: number };
                  const freshNotes = await notesApi.list(id) as Note[];
                  setNotesList(freshNotes);
                  return res.created;
                }}
              />
            )}
            {hasTranscript && !meeting.summary && meeting.status === "transcribed" && (
              <SummaryPending
                onGenerate={async () => {
                  await meetingsApi.summarize(id);
                }}
              />
            )}

            <NotesPanel
              notes={notesList}
              currentTime={currentTime}
              onSeek={audioSrc ? seek : undefined}
              onAdd={handleAddNote}
              onUpdate={handleUpdateNote}
              onDelete={handleDeleteNote}
            />
          </main>
        </div>

        {/* Fixed audio player + shortcut bar — offset by sidebar width */}
        {hasTranscript && audioSrc && (
          <>
            <div className="fixed bottom-20 left-64 right-0 z-20 pointer-events-none flex justify-center">
              <div className="flex items-center gap-4 bg-gray-900/80 backdrop-blur-sm text-white text-xs px-4 py-2 rounded-full shadow-lg">
                <Key k="A" label="← 10s" />
                <Key k="S" label="play/pause" />
                <Key k="D" label="+ note" />
                <Key k="F" label="10s →" />
                <Key k="Q" label="rename speaker" />
              </div>
            </div>
            <AudioPlayer
              src={audioSrc}
              audioRef={audioRef}
              onTimeUpdate={setCurrentTime}
              barClassName="left-64"
            />
          </>
        )}
      </div>
    </div>
  );
}

function Key({ k, label }: { k: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <kbd className="bg-white/20 rounded px-1.5 py-0.5 font-mono font-bold text-xs">{k}</kbd>
      <span className="text-white/70">{label}</span>
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
        className="text-lg font-semibold bg-transparent border-b border-brand-400 outline-none w-full"
      />
    );
  }
  return (
    <h1
      onClick={() => setEditing(true)}
      className="text-lg font-semibold text-gray-900 cursor-text hover:text-brand-600 transition-colors truncate"
      title="Click to rename"
    >
      {value}
    </h1>
  );
}
