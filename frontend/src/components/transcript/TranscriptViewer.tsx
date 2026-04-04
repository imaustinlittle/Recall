"use client";

import { useRef, useState, useEffect, forwardRef, useImperativeHandle } from "react";
import { TranscriptSegment, Speaker, NoteType } from "@/lib/types";
import { formatTime } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Props {
  segments: TranscriptSegment[];
  speakers: Speaker[];
  meetingId: string;
  currentTime: number;
  onSeek: (t: number) => void;
  onSegmentUpdate: (segmentId: string, content: string) => Promise<void>;
  onSpeakerRename: (speakerId: string, name: string) => Promise<void>;
  onAddNote?: (timestamp: number, body: string, type: NoteType) => Promise<void>;
}

export interface TranscriptViewerHandle {
  openNoteForActiveBlock: () => void;
  editActiveSpeaker: () => void;
}

interface SpeechBlock {
  key: string;
  speakerId: string | null;
  speakerName: string;
  speakerColor: string;
  segments: TranscriptSegment[];
  start_time: number;
  end_time: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function buildBlocks(segments: TranscriptSegment[]): SpeechBlock[] {
  const blocks: SpeechBlock[] = [];
  for (const seg of segments) {
    const last = blocks[blocks.length - 1];
    if (last && last.speakerId === (seg.speaker_id ?? null)) {
      last.segments.push(seg);
      last.end_time = seg.end_time;
    } else {
      blocks.push({
        key: seg.id,
        speakerId: seg.speaker_id ?? null,
        speakerName: seg.speaker?.display_name || seg.speaker?.label || "Unknown",
        speakerColor: seg.speaker?.color_hex ?? "#94a3b8",
        segments: [seg],
        start_time: seg.start_time,
        end_time: seg.end_time,
      });
    }
  }
  return blocks;
}

function overlaps(a: SpeechBlock, b: SpeechBlock): boolean {
  const TOLERANCE = 0.5;
  return a.end_time - TOLERANCE > b.start_time;
}

// ── Inline note form ───────────────────────────────────────────────────────────

const NOTE_TYPES: { key: NoteType; label: string; icon: string }[] = [
  { key: "general",     label: "Note",        icon: "📝" },
  { key: "action_item", label: "Action Item",  icon: "✅" },
  { key: "decision",    label: "Decision",     icon: "⚡" },
  { key: "question",    label: "Question",     icon: "❓" },
];

function InlineNoteForm({
  timestamp,
  onSave,
  onClose,
}: {
  timestamp: number;
  onSave: (body: string, type: NoteType) => Promise<void>;
  onClose: () => void;
}) {
  const [body, setBody] = useState("");
  const [type, setType] = useState<NoteType>("general");
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { textareaRef.current?.focus(); }, []);

  const handleSave = async () => {
    if (!body.trim()) return;
    setSaving(true);
    await onSave(body.trim(), type);
    setSaving(false);
    onClose();
  };

  return (
    <div className="mt-3 border border-brand-200 rounded-xl bg-brand-50/50 p-3 space-y-2 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="text-xs text-brand-600 font-medium font-mono">@ {formatTime(timestamp)}</span>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as NoteType)}
          className="ml-auto text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-brand-400"
        >
          {NOTE_TYPES.map((t) => (
            <option key={t.key} value={t.key}>{t.icon} {t.label}</option>
          ))}
        </select>
      </div>
      <textarea
        ref={textareaRef}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSave();
          if (e.key === "Escape") onClose();
        }}
        placeholder="Add a note… (Ctrl+Enter to save)"
        rows={2}
        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-brand-400 bg-white"
      />
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving || !body.trim()}
          className="text-xs px-3 py-1 bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-50 transition-colors"
        >
          {saving ? "Saving…" : "Add Note"}
        </button>
        <button onClick={onClose} className="text-xs px-3 py-1 text-gray-500 hover:text-gray-700">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Edit area ──────────────────────────────────────────────────────────────────

function EditArea({
  draft,
  saving,
  onDraftChange,
  onSave,
  onCancel,
}: {
  draft: string;
  saving: boolean;
  onDraftChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
    el.setSelectionRange(0, 0);
    el.scrollTop = 0;
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);

  return (
    <div className="space-y-2" onMouseDown={(e) => e.stopPropagation()}>
      <textarea
        ref={ref}
        autoFocus
        value={draft}
        onChange={(e) => onDraftChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onSave();
        }}
        className="w-full text-sm text-gray-800 border border-brand-300 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400 resize-none overflow-hidden"
        style={{ minHeight: "4rem" }}
      />
      <div className="flex gap-2 items-center">
        <button
          onClick={onSave}
          disabled={saving}
          className="text-xs bg-brand-600 text-white px-3 py-1 rounded-lg hover:bg-brand-700 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button onClick={onCancel} className="text-xs text-gray-500 px-3 py-1 rounded-lg hover:bg-gray-100">
          Cancel
        </button>
        <span className="text-xs text-gray-300 ml-1">Ctrl+Enter to save · Esc to cancel</span>
      </div>
    </div>
  );
}

// ── Single speech block ────────────────────────────────────────────────────────

function SpeechBlockCard({
  block,
  isActive,
  editingId,
  editDraft,
  saving,
  blockRef,
  forceNoteOpen,
  onNoteOpened,
  onSeek,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDraftChange,
  onAddNote,
  dimmed,
}: {
  block: SpeechBlock;
  isActive: boolean;
  editingId: string | null;
  editDraft: string;
  saving: boolean;
  blockRef?: React.Ref<HTMLDivElement>;
  forceNoteOpen?: boolean;
  onNoteOpened?: () => void;
  onSeek: (t: number) => void;
  onStartEdit: (seg: TranscriptSegment) => void;
  onCancelEdit: () => void;
  onSaveEdit: (segmentId: string) => void;
  onDraftChange: (v: string) => void;
  onAddNote?: (timestamp: number, body: string, type: NoteType) => Promise<void>;
  dimmed?: boolean;
}) {
  const [noteOpen, setNoteOpen] = useState(false);

  // Keyboard shortcut D can force this block's note form open
  useEffect(() => {
    if (forceNoteOpen && !noteOpen) {
      setNoteOpen(true);
      onNoteOpened?.();
    }
  }, [forceNoteOpen]);

  const combinedText = block.segments.map((s) => s.content.trim()).filter(Boolean).join(" ");
  const hasEdit = block.segments.some((s) => s.is_edited);
  const editingSeg = block.segments.find((s) => s.id === editingId) ?? null;

  return (
    <div
      ref={blockRef}
      className={`group relative rounded-2xl p-4 transition-all ${
        isActive ? "ring-2 ring-inset shadow-sm" : "hover:shadow-sm"
      } ${dimmed ? "opacity-60" : ""}`}
      style={{
        backgroundColor: isActive ? `${block.speakerColor}15` : "transparent",
        ringColor: isActive ? block.speakerColor : undefined,
      } as React.CSSProperties}
    >
      {/* Speaker header */}
      <div className="flex items-center gap-2 mb-1.5">
        <button
          onClick={() => onSeek(block.start_time)}
          className="flex items-center gap-2 group/ts"
          title={`Jump to ${formatTime(block.start_time)}`}
        >
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: block.speakerColor }} />
          <span className="text-xs font-semibold" style={{ color: block.speakerColor }}>
            {block.speakerName}
          </span>
          <span className="font-mono text-xs text-gray-400 group-hover/ts:text-brand-500 transition-colors">
            {formatTime(block.start_time)}
          </span>
        </button>

        {hasEdit && <span className="text-xs text-gray-300 ml-1">edited</span>}

        {/* Note button — always visible, prominent */}
        {onAddNote && !noteOpen && (
          <button
            onClick={() => setNoteOpen(true)}
            className="ml-auto text-xs text-gray-400 hover:text-brand-600 flex items-center gap-1 px-2 py-1 rounded-lg border border-dashed border-gray-200 hover:border-brand-400 hover:bg-brand-50 transition-colors"
            title="Add a note (D)"
          >
            + note
          </button>
        )}
      </div>

      {/* Content */}
      {editingSeg ? (
        <EditArea
          draft={editDraft}
          saving={saving}
          onDraftChange={onDraftChange}
          onSave={() => onSaveEdit(editingSeg.id)}
          onCancel={onCancelEdit}
        />
      ) : (
        <p
          onClick={() => onStartEdit(block.segments[block.segments.length - 1])}
          className="text-sm text-gray-800 leading-relaxed cursor-text hover:text-gray-900"
          title="Click to edit"
        >
          {combinedText || <span className="text-gray-300 italic">empty</span>}
        </p>
      )}

      {/* Inline note form */}
      {noteOpen && onAddNote && (
        <InlineNoteForm
          timestamp={block.start_time}
          onSave={async (body, type) => { await onAddNote(block.start_time, body, type); }}
          onClose={() => setNoteOpen(false)}
        />
      )}
    </div>
  );
}

// ── Overlap row ────────────────────────────────────────────────────────────────

function OverlapRow({
  left,
  right,
  isActiveLeft,
  isActiveRight,
  editingId,
  editDraft,
  saving,
  activeRef,
  forceNoteOpenKey,
  onNoteOpened,
  onSeek,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDraftChange,
  onAddNote,
}: {
  left: SpeechBlock;
  right: SpeechBlock;
  isActiveLeft: boolean;
  isActiveRight: boolean;
  editingId: string | null;
  editDraft: string;
  saving: boolean;
  activeRef?: React.Ref<HTMLDivElement>;
  forceNoteOpenKey: string | null;
  onNoteOpened: () => void;
  onSeek: (t: number) => void;
  onStartEdit: (seg: TranscriptSegment) => void;
  onCancelEdit: () => void;
  onSaveEdit: (segmentId: string) => void;
  onDraftChange: (v: string) => void;
  onAddNote?: (timestamp: number, body: string, type: NoteType) => Promise<void>;
}) {
  const sharedBlockProps = { editingId, editDraft, saving, onSeek, onStartEdit, onCancelEdit, onSaveEdit, onDraftChange, onAddNote };
  return (
    <div className="relative">
      <div className="absolute -top-2 left-1/2 -translate-x-1/2 z-10">
        <span className="text-xs text-gray-400 bg-white px-2 py-0.5 rounded-full border border-gray-200 shadow-sm whitespace-nowrap">
          speaking simultaneously
        </span>
      </div>
      <div className="flex gap-3 mt-2">
        <div className="flex-1">
          <SpeechBlockCard
            block={left}
            isActive={isActiveLeft}
            blockRef={isActiveLeft ? activeRef : undefined}
            forceNoteOpen={forceNoteOpenKey === left.key}
            onNoteOpened={onNoteOpened}
            {...sharedBlockProps}
          />
        </div>
        <div className="w-px bg-gradient-to-b from-transparent via-gray-300 to-transparent self-stretch" />
        <div className="flex-1">
          <SpeechBlockCard
            block={right}
            isActive={isActiveRight}
            blockRef={isActiveRight ? activeRef : undefined}
            forceNoteOpen={forceNoteOpenKey === right.key}
            onNoteOpened={onNoteOpened}
            {...sharedBlockProps}
          />
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export const TranscriptViewer = forwardRef<TranscriptViewerHandle, Props>(function TranscriptViewer({
  segments,
  speakers,
  currentTime,
  onSeek,
  onSegmentUpdate,
  onSpeakerRename,
  onAddNote,
}, ref) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [noteOpenKey, setNoteOpenKey] = useState<string | null>(null);
  const [editSpeakerId, setEditSpeakerId] = useState<string | null>(null);

  const activeSegment = segments.findLast((s) => s.start_time <= currentTime);
  const activeRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const blocks = buildBlocks(segments);
  const activeBlock = blocks.find((b) => b.segments.some((s) => s.id === activeSegment?.id));

  const startEdit = (seg: TranscriptSegment) => {
    const block = blocks.find((b) => b.segments.some((s) => s.id === seg.id));
    const combinedText = block
      ? block.segments.map((s) => s.content.trim()).filter(Boolean).join(" ")
      : seg.content;
    setEditingId(seg.id);
    setDraft(combinedText);
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

  // Expose imperative methods to page level for keyboard shortcuts
  useImperativeHandle(ref, () => ({
    openNoteForActiveBlock: () => {
      if (activeBlock) setNoteOpenKey(activeBlock.key);
    },
    editActiveSpeaker: () => {
      if (activeBlock?.speakerId) setEditSpeakerId(activeBlock.speakerId);
    },
  }), [activeBlock]);

  // Click outside cancels edit
  useEffect(() => {
    if (!editingId) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        cancelEdit();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [editingId]);

  // Scroll when active block changes
  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [activeBlock?.key]);

  // Build render items
  type RenderItem =
    | { type: "single"; block: SpeechBlock }
    | { type: "overlap"; left: SpeechBlock; right: SpeechBlock };

  const items: RenderItem[] = [];
  let i = 0;
  while (i < blocks.length) {
    const cur = blocks[i];
    const next = blocks[i + 1];
    if (next && overlaps(cur, next)) {
      items.push({ type: "overlap", left: cur, right: next });
      i += 2;
    } else {
      items.push({ type: "single", block: cur });
      i += 1;
    }
  }

  const sharedEditProps = {
    editingId,
    editDraft: draft,
    saving,
    onSeek,
    onStartEdit: startEdit,
    onCancelEdit: cancelEdit,
    onSaveEdit: saveEdit,
    onDraftChange: setDraft,
    onAddNote,
  };

  return (
    <div ref={containerRef} className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
      {/* Speaker legend */}
      {speakers.length > 0 && (
        <div className="px-6 py-3 border-b border-gray-100 flex flex-wrap gap-3">
          {speakers.map((sp) => (
            <SpeakerChip
              key={sp.id}
              speaker={sp}
              forceEdit={editSpeakerId === sp.id}
              onForceEditDone={() => setEditSpeakerId(null)}
              onRename={(name) => onSpeakerRename(sp.id, name)}
            />
          ))}
        </div>
      )}

      {/* Speech blocks */}
      <div className="p-4 space-y-1">
        {items.map((item) => {
          if (item.type === "single") {
            const isActive = item.block.segments.some((s) => s.id === activeSegment?.id);
            return (
              <SpeechBlockCard
                key={item.block.key}
                block={item.block}
                isActive={isActive}
                blockRef={isActive ? activeRef : undefined}
                forceNoteOpen={noteOpenKey === item.block.key}
                onNoteOpened={() => setNoteOpenKey(null)}
                {...sharedEditProps}
              />
            );
          }
          const isActiveLeft  = item.left.segments.some((s)  => s.id === activeSegment?.id);
          const isActiveRight = item.right.segments.some((s) => s.id === activeSegment?.id);
          return (
            <OverlapRow
              key={`${item.left.key}-${item.right.key}`}
              left={item.left}
              right={item.right}
              isActiveLeft={isActiveLeft}
              isActiveRight={isActiveRight}
              activeRef={(isActiveLeft || isActiveRight) ? activeRef : undefined}
              forceNoteOpenKey={noteOpenKey}
              onNoteOpened={() => setNoteOpenKey(null)}
              {...sharedEditProps}
            />
          );
        })}
      </div>
    </div>
  );
});

// ── Speaker chip ───────────────────────────────────────────────────────────────

function SpeakerChip({
  speaker,
  forceEdit,
  onForceEditDone,
  onRename,
}: {
  speaker: Speaker;
  forceEdit?: boolean;
  onForceEditDone?: () => void;
  onRename: (name: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(speaker.display_name || speaker.label);

  // Keyboard shortcut Q can force edit mode
  useEffect(() => {
    if (forceEdit && !editing) {
      setEditing(true);
      onForceEditDone?.();
    }
  }, [forceEdit]);

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
      title="Click to rename speaker (Q)"
    >
      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: speaker.color_hex }} />
      {speaker.display_name || speaker.label}
    </button>
  );
}
