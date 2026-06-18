"use client";

import { useState, useRef } from "react";
import { Note, NoteType } from "@/lib/types";

// ── Type config ────────────────────────────────────────────────────────────
// `accent` is the per-type dot/label colour. Backgrounds use a tint of it.

const TYPE_CONFIG: Record<NoteType, { label: string; icon: string; color: string }> = {
  general: { label: "Note", icon: "📝", color: "var(--ink-2)" },
  action_item: { label: "Action Item", icon: "✅", color: "#3B82F6" },
  decision: { label: "Decision", icon: "⚡", color: "#1F9D6B" },
  question: { label: "Question", icon: "❓", color: "#C8862A" },
};

const FILTER_TABS: { key: NoteType | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "action_item", label: "Action Items" },
  { key: "decision", label: "Decisions" },
  { key: "question", label: "Questions" },
  { key: "general", label: "Notes" },
];

function fmtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function tint(color: string) {
  return color === "var(--ink-2)" ? "var(--surface-2)" : `color-mix(in srgb, ${color} 10%, transparent)`;
}

// ── NoteCard ───────────────────────────────────────────────────────────────

function NoteCard({
  note,
  onUpdate,
  onDelete,
  onSeek,
}: {
  note: Note;
  onUpdate: (id: string, body: string, type: NoteType) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onSeek?: (t: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.body);
  const [draftType, setDraftType] = useState<NoteType>(note.note_type);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const cfg = TYPE_CONFIG[note.note_type];

  const handleSave = async () => {
    if (!draft.trim()) return;
    setSaving(true);
    await onUpdate(note.id, draft.trim(), draftType);
    setSaving(false);
    setEditing(false);
  };

  const handleCancel = () => {
    setDraft(note.body);
    setDraftType(note.note_type);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="space-y-2 rounded-[12px] border border-line p-3" style={{ background: tint(cfg.color) }}>
        <select
          value={draftType}
          onChange={(e) => setDraftType(e.target.value as NoteType)}
          className="rounded-[8px] border border-line bg-surface px-2 py-1 text-xs text-ink focus:outline-none"
        >
          {Object.entries(TYPE_CONFIG).map(([k, v]) => (
            <option key={k} value={k}>{v.icon} {v.label}</option>
          ))}
        </select>
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          className="w-full resize-none rounded-[10px] border border-line bg-surface px-2.5 py-1.5 text-sm text-ink focus:border-accent focus:outline-none"
        />
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={saving || !draft.trim()}
            className="rounded-[9px] bg-accent px-3 py-1 text-xs font-semibold text-on-accent disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button onClick={handleCancel} className="px-3 py-1 text-xs font-semibold text-ink-2 hover:text-ink">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="group space-y-1.5 rounded-[12px] border border-transparent p-3 transition-colors hover:border-line"
      style={{ background: tint(cfg.color) }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs">{cfg.icon}</span>
        <span className="text-xs font-semibold" style={{ color: cfg.color }}>{cfg.label}</span>
        {note.timestamp_ref != null && (
          <button
            onClick={() => onSeek?.(note.timestamp_ref!)}
            className="font-mono text-xs text-ink-3 transition-colors hover:text-accent"
            title="Jump to this timestamp"
          >
            @ {fmtTime(note.timestamp_ref)}
          </button>
        )}
        <div className="ml-auto flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button onClick={() => setEditing(true)} className="px-1 text-xs text-ink-3 hover:text-ink" title="Edit">
            ✎
          </button>
          {confirming ? (
            <>
              <button onClick={() => onDelete(note.id)} className="px-1 text-xs text-status-red hover:opacity-80">
                Confirm
              </button>
              <button onClick={() => setConfirming(false)} className="px-1 text-xs text-ink-3 hover:text-ink">
                ✕
              </button>
            </>
          ) : (
            <button onClick={() => setConfirming(true)} className="px-1 text-xs text-ink-3 hover:text-status-red" title="Delete">
              🗑
            </button>
          )}
        </div>
      </div>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{note.body}</p>
    </div>
  );
}

// ── AddNoteForm ────────────────────────────────────────────────────────────

function AddNoteForm({
  onAdd,
  currentTime,
}: {
  onAdd: (body: string, type: NoteType, timestampRef: number | null) => Promise<void>;
  currentTime?: number;
}) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [type, setType] = useState<NoteType>("general");
  const [timestampRef, setTimestampRef] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleOpen = () => {
    setOpen(true);
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  const handleAdd = async () => {
    if (!body.trim()) return;
    setSaving(true);
    await onAdd(body.trim(), type, timestampRef);
    setBody("");
    setType("general");
    setTimestampRef(null);
    setSaving(false);
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleAdd();
    if (e.key === "Escape") { setOpen(false); setBody(""); setTimestampRef(null); }
  };

  if (!open) {
    return (
      <button
        onClick={handleOpen}
        className="w-full rounded-[10px] border border-dashed border-line-strong px-3 py-2.5 text-left text-sm text-ink-3 transition-colors hover:border-accent hover:text-accent"
      >
        + Add a note…
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-[12px] border border-line bg-surface p-3 shadow-card-sm">
      <div className="flex items-center gap-2">
        <select
          value={type}
          onChange={(e) => setType(e.target.value as NoteType)}
          className="rounded-[8px] border border-line bg-surface px-2 py-1 text-xs text-ink focus:outline-none"
        >
          {Object.entries(TYPE_CONFIG).map(([k, v]) => (
            <option key={k} value={k}>{v.icon} {v.label}</option>
          ))}
        </select>
        {currentTime != null && currentTime > 0 && (
          <button
            onClick={() => setTimestampRef(timestampRef === null ? currentTime : null)}
            className={[
              "rounded-[8px] border px-2 py-1 text-xs transition-colors",
              timestampRef !== null
                ? "border-accent-line bg-accent-weak text-accent"
                : "border-line text-ink-2 hover:border-line-strong",
            ].join(" ")}
            title="Link to current playback position"
          >
            {timestampRef !== null ? `@ ${fmtTime(timestampRef)} ✓` : `@ ${fmtTime(currentTime)}`}
          </button>
        )}
      </div>
      <textarea
        ref={textareaRef}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Write your note… (Ctrl+Enter to save)"
        rows={3}
        className="w-full resize-none rounded-[10px] border border-line bg-surface px-2.5 py-1.5 text-sm text-ink focus:border-accent focus:outline-none"
      />
      <div className="flex gap-2">
        <button
          onClick={handleAdd}
          disabled={saving || !body.trim()}
          className="rounded-[9px] bg-accent px-3 py-1 text-xs font-semibold text-on-accent disabled:opacity-50"
        >
          {saving ? "Adding…" : "Add Note"}
        </button>
        <button
          onClick={() => { setOpen(false); setBody(""); setTimestampRef(null); }}
          className="px-3 py-1 text-xs font-semibold text-ink-2 hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Main export ────────────────────────────────────────────────────────────

export function NotesPanel({
  notes,
  currentTime,
  onSeek,
  onAdd,
  onUpdate,
  onDelete,
}: {
  notes: Note[];
  currentTime?: number;
  onSeek?: (t: number) => void;
  onAdd: (body: string, type: NoteType, timestampRef: number | null) => Promise<void>;
  onUpdate: (id: string, body: string, type: NoteType) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [filter, setFilter] = useState<NoteType | "all">("all");

  const filtered = filter === "all" ? notes : notes.filter((n) => n.note_type === filter);
  const countFor = (key: NoteType | "all") =>
    key === "all" ? notes.length : notes.filter((n) => n.note_type === key).length;

  return (
    <div className="rounded-[18px] border border-line bg-surface shadow-card-sm">
      <div className="flex items-center justify-between border-b border-line px-[22px] py-[14px]">
        <h2 className="font-mono text-[11.5px] font-semibold uppercase tracking-[.1em] text-ink-2">Notes</h2>
        <span className="font-mono text-[12px] text-ink-3">{notes.length} total</span>
      </div>

      {notes.length > 0 && (
        <div className="flex gap-0.5 overflow-x-auto px-3 pt-2">
          {FILTER_TABS.map((tab) => {
            const count = countFor(tab.key);
            if (count === 0 && tab.key !== "all") return null;
            return (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                className={[
                  "whitespace-nowrap rounded-[8px] px-2.5 py-1 text-xs transition-colors",
                  filter === tab.key
                    ? "bg-accent-weak font-semibold text-accent"
                    : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                ].join(" ")}
              >
                {tab.label}
                {count > 0 && <span className="ml-1 text-ink-3">{count}</span>}
              </button>
            );
          })}
        </div>
      )}

      <div className="space-y-2 p-3">
        {filtered.length === 0 && filter !== "all" && (
          <p className="py-2 text-center text-xs text-ink-3">No {filter.replace("_", " ")}s yet.</p>
        )}
        {filtered.map((note) => (
          <NoteCard key={note.id} note={note} onUpdate={onUpdate} onDelete={onDelete} onSeek={onSeek} />
        ))}
        <AddNoteForm onAdd={onAdd} currentTime={currentTime} />
      </div>
    </div>
  );
}
