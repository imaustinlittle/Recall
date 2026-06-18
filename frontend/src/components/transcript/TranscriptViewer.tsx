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
        speakerColor: seg.speaker?.color_hex ?? "var(--ink-3)",
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
  { key: "general", label: "Note", icon: "📝" },
  { key: "action_item", label: "Action Item", icon: "✅" },
  { key: "decision", label: "Decision", icon: "⚡" },
  { key: "question", label: "Question", icon: "❓" },
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
    <div className="mt-3 space-y-2 rounded-[12px] border border-accent-line bg-accent-weak p-3">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[11px] font-semibold text-accent">@ {formatTime(timestamp)}</span>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as NoteType)}
          className="ml-auto rounded-[8px] border border-line bg-surface px-2 py-1 text-xs text-ink focus:outline-none"
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
        className="w-full resize-none rounded-[10px] border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
      />
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving || !body.trim()}
          className="rounded-[9px] bg-accent px-4 py-1.5 text-xs font-semibold text-on-accent disabled:opacity-50"
        >
          {saving ? "Saving…" : "Add Note"}
        </button>
        <button onClick={onClose} className="px-2 py-1.5 text-xs font-semibold text-ink-2 hover:text-ink">
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
        className="w-full resize-none overflow-hidden rounded-[10px] border border-accent bg-inset px-3 py-2 text-[14.5px] leading-[1.6] text-ink focus:outline-none focus:shadow-[0_0_0_3px_var(--accent-weak)]"
        style={{ minHeight: "4rem" }}
      />
      <div className="flex items-center gap-2">
        <button
          onClick={onSave}
          disabled={saving}
          className="rounded-[9px] bg-accent px-4 py-1.5 text-xs font-semibold text-on-accent disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button onClick={onCancel} className="rounded-[9px] px-3 py-1.5 text-xs font-semibold text-ink-2 hover:bg-surface-2">
          Cancel
        </button>
        <span className="ml-1 font-mono text-[10px] text-ink-3">Ctrl+Enter to save · Esc to cancel</span>
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
      className={`group relative rounded-[14px] p-4 transition-colors ${dimmed ? "opacity-60" : ""}`}
      style={{ backgroundColor: isActive ? "var(--accent-weak)" : "transparent" }}
    >
      {/* Speaker header */}
      <div className="mb-1.5 flex items-center gap-2">
        <button
          onClick={() => onSeek(block.start_time)}
          className="group/ts flex items-center gap-2"
          title={`Jump to ${formatTime(block.start_time)}`}
        >
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: block.speakerColor }} />
          <span className="text-[12.5px] font-bold" style={{ color: block.speakerColor }}>
            {block.speakerName}
          </span>
          <span className="font-mono text-[12px] text-ink-3 transition-colors group-hover/ts:text-accent">
            {formatTime(block.start_time)}
          </span>
        </button>

        {hasEdit && (
          <span className="font-mono text-[10px] uppercase tracking-[.05em] text-ink-3">· edited</span>
        )}

        {onAddNote && !noteOpen && (
          <button
            onClick={() => setNoteOpen(true)}
            className="ml-auto flex items-center gap-1 rounded-[8px] border border-dashed border-line px-2 py-1 text-xs text-ink-3 transition-colors hover:border-accent hover:bg-accent-weak hover:text-accent"
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
          className="cursor-text text-[14.5px] leading-[1.62] text-ink transition-colors hover:text-accent"
          title="Click to edit"
        >
          {combinedText || <span className="italic text-ink-3">empty</span>}
        </p>
      )}

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
      <div className="absolute -top-2 left-1/2 z-10 -translate-x-1/2">
        <span className="whitespace-nowrap rounded-full border border-line bg-surface px-2 py-0.5 font-mono text-[10px] uppercase tracking-[.05em] text-ink-3 shadow-card-sm">
          speaking simultaneously
        </span>
      </div>
      <div className="mt-2 flex gap-3">
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
        <div className="w-px self-stretch bg-line" />
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
  const [search, setSearch] = useState("");

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

  useImperativeHandle(ref, () => ({
    openNoteForActiveBlock: () => {
      if (activeBlock) setNoteOpenKey(activeBlock.key);
    },
    editActiveSpeaker: () => {
      if (activeBlock?.speakerId) setEditSpeakerId(activeBlock.speakerId);
    },
  }), [activeBlock]);

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

  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [activeBlock?.key]);

  // Search filter — match against text or speaker name (case-insensitive)
  const q = search.trim().toLowerCase();
  const matchBlock = (b: SpeechBlock) =>
    !q ||
    b.speakerName.toLowerCase().includes(q) ||
    b.segments.some((s) => s.content.toLowerCase().includes(q));
  const visibleBlocks = blocks.filter(matchBlock);

  type RenderItem =
    | { type: "single"; block: SpeechBlock }
    | { type: "overlap"; left: SpeechBlock; right: SpeechBlock };

  const items: RenderItem[] = [];
  let i = 0;
  while (i < visibleBlocks.length) {
    const cur = visibleBlocks[i];
    const next = visibleBlocks[i + 1];
    if (!q && next && overlaps(cur, next)) {
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
    <div className="flex flex-col gap-3.5">
      {/* Speaker legend + search */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-1 flex-wrap items-center gap-[7px]">
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
        <div className="relative flex w-[230px] items-center">
          <span className="absolute left-3 flex text-ink-3">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" />
            </svg>
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search transcript"
            className="w-full rounded-[11px] border border-line bg-surface py-[9px] pl-9 pr-12 text-[13.5px] text-ink focus:border-accent focus:outline-none focus:shadow-[0_0_0_3px_var(--accent-weak)]"
          />
          {q && (
            <span className="absolute right-3 font-mono text-[11px] font-semibold text-accent">
              {visibleBlocks.length}
            </span>
          )}
        </div>
      </div>

      {/* Segments */}
      <div
        ref={containerRef}
        className="scrollbar-thin max-h-[60vh] overflow-y-auto rounded-[18px] border border-line bg-surface p-2 shadow-card"
      >
        {items.length === 0 ? (
          <p className="py-10 text-center text-sm text-ink-3">No segments match “{search}”.</p>
        ) : (
          items.map((item) => {
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
            const isActiveLeft = item.left.segments.some((s) => s.id === activeSegment?.id);
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
          })
        )}
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
        className="w-28 rounded-full border border-accent bg-surface px-3 py-1 text-[12.5px] text-ink focus:outline-none focus:shadow-[0_0_0_3px_var(--accent-weak)]"
      />
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="inline-flex items-center gap-[7px] whitespace-nowrap rounded-full border border-line bg-surface py-[5px] pl-[9px] pr-3 text-[12.5px] font-semibold text-ink transition-colors hover:border-line-strong"
      title="Click to rename speaker (Q)"
    >
      <span className="h-[9px] w-[9px] shrink-0 rounded-full" style={{ backgroundColor: speaker.color_hex }} />
      {speaker.display_name || speaker.label}
    </button>
  );
}
