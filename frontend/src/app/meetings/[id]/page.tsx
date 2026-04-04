"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { meetings as meetingsApi, transcript as transcriptApi, speakers as speakersApi, jobs as jobsApi, media as mediaApi, notes as notesApi, exportTranscript } from "@/lib/api";
import { Meeting, TranscriptSegment, Speaker, Job, Note } from "@/lib/types";
import { useJobStatus } from "@/lib/useJobStatus";
import { useAuth } from "@/lib/useAuth";
import { DropZone } from "@/components/upload/DropZone";
import { RecordingPanel } from "@/components/recording/RecordingPanel";
import { TranscriptViewer } from "@/components/transcript/TranscriptViewer";
import { JobProgressBar } from "@/components/ui/JobProgressBar";
import { AudioPlayer } from "@/components/ui/AudioPlayer";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Spinner } from "@/components/ui/Spinner";
import { NotesPanel } from "@/components/notes/NotesPanel";
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
  const [activeJobId, setActiveJobId] = useState<string | null>(
    searchParams.get("job")
  );
  const [jobsLoaded, setJobsLoaded] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // Watch job progress via WS/polling
  const job = useJobStatus(activeJobId);

  // Reload transcript when job completes
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
      // Reconnect to any active job if we navigated back without a ?job= param
      if (!searchParams.get("job")) {
        jobsApi.list(id).then((list: any) => {
          const active = list?.find((j: any) =>
            j.status === "processing" || j.status === "queued"
          );
          if (active) setActiveJobId(active.id);
        }).finally(() => setJobsLoaded(true));
      } else {
        setJobsLoaded(true);
      }
    }
  }, [user, id]);

  // Close export menu when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

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
        const publicUrl = fp.replace(/^\/data/, "");
        setAudioSrc(publicUrl);
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  const handleUploaded = (newJob: Job) => {
    setActiveJobId(newJob.id);
    setMeeting((m) => m ? { ...m, status: "queued" } : m);
  };

  const handleSegmentUpdate = async (
    segmentId: string,
    content: string
  ) => {
    const updated = (await transcriptApi.update(id, segmentId, { content })) as TranscriptSegment;
    setSegments((prev) =>
      prev.map((s) => (s.id === updated.id ? updated : s))
    );
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

  if (authLoading || !user || !meeting) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  const seek = (t: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = t;
      audioRef.current.play().catch(() => {});
    }
  };

  const isProcessing = ["queued", "processing"].includes(meeting.status);
  const hasTranscript = segments.length > 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4">
        <button
          onClick={() => router.push("/")}
          className="text-gray-400 hover:text-gray-600 text-sm"
        >
          ← Back
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

        {/* Export dropdown — only shown when there's a transcript */}
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
                    onClick={() => {
                      exportTranscript(id, key);
                      setExportOpen(false);
                    }}
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

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {/* Job progress bar */}
        {(isProcessing || job) && (
          <JobProgressBar job={job} />
        )}

        {/* Capture options — shown when no transcript and not already processing */}
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

        {/* Transcript */}
        {hasTranscript && (
          <TranscriptViewer
            segments={segments}
            speakers={speakers}
            meetingId={id}
            currentTime={currentTime}
            onSeek={seek}
            onSegmentUpdate={handleSegmentUpdate}
            onSpeakerRename={handleSpeakerRename}
          />
        )}

        {/* Empty state while processing */}
        {isProcessing && !job && (
          <div className="text-center py-16 text-gray-400 text-sm">
            Processing your recording…
          </div>
        )}

        {/* Notes — always visible once meeting loads */}
        <NotesPanel
          meetingId={id}
          initialNotes={notesList}
          currentTime={currentTime}
          onSeek={audioSrc ? seek : undefined}
        />
      </main>

      {/* Sticky audio player — shown once transcript is ready */}
      {hasTranscript && audioSrc && (
        <AudioPlayer
          src={audioSrc}
          audioRef={audioRef}
          onTimeUpdate={setCurrentTime}
        />
      )}
    </div>
  );
}

function EditableTitle({
  value,
  onSave,
}: {
  value: string;
  onSave: (v: string) => void;
}) {
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
