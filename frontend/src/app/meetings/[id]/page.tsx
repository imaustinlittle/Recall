"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { meetings as meetingsApi, transcript as transcriptApi, speakers as speakersApi } from "@/lib/api";
import { Meeting, TranscriptSegment, Speaker, Job } from "@/lib/types";
import { useJobStatus } from "@/lib/useJobStatus";
import { useAuth } from "@/lib/useAuth";
import { DropZone } from "@/components/upload/DropZone";
import { TranscriptViewer } from "@/components/transcript/TranscriptViewer";
import { JobProgressBar } from "@/components/ui/JobProgressBar";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Spinner } from "@/components/ui/Spinner";
import { formatDate } from "@/lib/utils";

export default function MeetingPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeJobId, setActiveJobId] = useState<string | null>(
    searchParams.get("job")
  );

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
    }
  }, [user, id]);

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
      const [segs, spks] = await Promise.all([
        transcriptApi.get(id) as Promise<TranscriptSegment[]>,
        speakersApi.list(id) as Promise<Speaker[]>,
      ]);
      setSegments(segs);
      setSpeakers(spks);
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

  const mediaUrl = `/media/${id}`;
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
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {/* Job progress bar */}
        {(isProcessing || job) && (
          <JobProgressBar job={job} />
        )}

        {/* Upload zone — show if no transcript yet and not processing */}
        {!hasTranscript && !isProcessing && (
          <DropZone meetingId={id} onUploaded={handleUploaded} />
        )}

        {/* Transcript */}
        {hasTranscript && (
          <TranscriptViewer
            segments={segments}
            speakers={speakers}
            meetingId={id}
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
      </main>
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
