"use client";

import { useRef, useState, useEffect } from "react";
import { TranscriptSegment, Speaker } from "@/lib/types";
import { formatTime } from "@/lib/utils";

interface Props {
  segments: TranscriptSegment[];
  speakers: Speaker[];
  meetingId: string;
  currentTime: number;
  onSeek: (t: number) => void;
  onSegmentUpdate: (segmentId: string, content: string) => Promise<void>;
  onSpeakerRename: (speakerId: string, name: string) => Promise<void>;
}

export function TranscriptViewer({
  segments,
  speakers,
  currentTime,
  onSeek,
  onSegmentUpdate,
  onSpeakerRename,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft]         = useState("");
  const [saving, setSaving]       = useState(false);

  const activeSegment = segments.findLast((s) => s.start_time <= currentTime);

  const startEdit = (seg: TranscriptSegment) => {
    setEditingId(seg.id);
    setDraft(seg.content);
  };

  const cancelEdit = () => { setEditingId(null); setDraft(""); };

  const saveEdit = async (segmentId: string) => {
    setSaving(true);
    try {
      await onSegmentUpdate(segmentId, draft);
      setEditingId(null);
    } finally {
      setSaving(false);
    }
  };

  // Auto-scroll active segment into view
  const activeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [activeSegment?.id]);

  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
      {/* Speaker legend */}
      {speakers.length > 0 && (
        <div className="px-6 py-3 border-b border-gray-100 flex flex-wrap gap-3">
          {speakers.map((sp) => (
            <SpeakerChip
              key={sp.id}
              speaker={sp}
              onRename={(name) => onSpeakerRename(sp.id, name)}
            />
          ))}
        </div>
      )}

      {/* Segments */}
      <div className="divide-y divide-gray-50">
        {segments.map((seg) => {
          const isActive  = seg.id === activeSegment?.id;
          const isEditing = seg.id === editingId;
          const speakerName  = seg.speaker?.display_name || seg.speaker?.label || "Unknown";
          const speakerColor = seg.speaker?.color_hex ?? "#94a3b8";

          return (
            <div
              key={seg.id}
              ref={isActive ? activeRef : undefined}
              className={`flex gap-4 px-6 py-4 transition-colors group ${
                isActive ? "bg-brand-50" : "hover:bg-gray-50"
              }`}
            >
              {/* Timestamp — click to seek */}
              <button
                onClick={() => onSeek(seg.start_time)}
                className="shrink-0 font-mono text-xs text-gray-400 hover:text-brand-600 pt-0.5 transition-colors w-12 text-left"
                title={`Jump to ${formatTime(seg.start_time)}`}
              >
                {formatTime(seg.start_time)}
              </button>

              {/* Speaker dot */}
              <div
                className="shrink-0 w-2 h-2 rounded-full mt-2"
                style={{ backgroundColor: speakerColor }}
                title={speakerName}
              />

              {/* Content */}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium mb-1" style={{ color: speakerColor }}>
                  {speakerName}
                  {seg.is_edited && (
                    <span className="ml-2 text-gray-300 font-normal">edited</span>
                  )}
                </p>

                {isEditing ? (
                  <div className="space-y-2">
                    <textarea
                      autoFocus
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      rows={3}
                      className="w-full text-sm text-gray-800 border border-brand-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400 resize-none"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => saveEdit(seg.id)}
                        disabled={saving}
                        className="text-xs bg-brand-600 text-white px-3 py-1 rounded-lg hover:bg-brand-700 disabled:opacity-60"
                      >
                        {saving ? "Saving…" : "Save"}
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="text-xs text-gray-500 px-3 py-1 rounded-lg hover:bg-gray-100"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <p
                    onClick={() => startEdit(seg)}
                    className="text-sm text-gray-800 leading-relaxed cursor-text hover:text-gray-900"
                    title="Click to edit"
                  >
                    {seg.content}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SpeakerChip({ speaker, onRename }: { speaker: Speaker; onRename: (name: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(speaker.display_name || speaker.label);

  const save = async () => {
    setEditing(false);
    if (draft.trim() && draft !== (speaker.display_name || speaker.label)) {
      await onRename(draft.trim());
    }
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
        className="text-xs border border-gray-300 rounded-full px-3 py-1 focus:outline-none focus:ring-2 focus:ring-brand-400 w-28"
      />
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="inline-flex items-center gap-1.5 text-xs rounded-full px-3 py-1 border border-gray-200 hover:border-gray-300 transition-colors"
      title="Click to rename speaker"
    >
      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: speaker.color_hex }} />
      {speaker.display_name || speaker.label}
    </button>
  );
}
