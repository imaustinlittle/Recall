"use client";

import { useState, useRef } from "react";
import { Note, NoteType } from "@/lib/types";

// ── Type config ────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<NoteType, { label: string; icon: string; color: string; bg: string }> = {
  general:     { label: "Note",        icon: "📝", color: "text-gray-600",  bg: "bg-gray-100"  },
  action_item: { label: "Action Item", icon: "✅", color: "text-blue-700",  bg: "bg-blue-50"   },
  decision:    { label: "Decision",    icon: "⚡", color: "text-green-700", bg: "bg-green-50"  },
  question:    { label: "Question",    icon: "❓", color: "text-amber-700", bg: "bg-amber-50"  },
};

const FILTER_TABS: { key: NoteType | "all"; label: string }[] = [
  { key: "all",         label: "All"          },
  { key: "action_item", label: "Action Items" },
  { key: "decision",    label: "Decisions"    },
  { key: "question",    label: "Questions"    },
  { key: "general",     label: "Notes"        },
];

function fmtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
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
      <div className={`rounded-lg border p-3 space-y-2 ${cfg.bg} border-transparent`}>
        <select
          value={draftType}
          onChange={(e) => setDraftType(e.target.value as NoteType)}
          className="text-xs border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none"
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
          className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-brand-400"
        />
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={saving || !draft.trim()}
            className="text-xs px-3 py-1 bg-brand-500 text-white rounded hover:bg-brand-600 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button onClick={handleCancel} className="text-xs px-3 py-1 text-gray-500 hover:text-gray-700">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`group rounded-lg border border-transparent hover:border-gray-200 p-3 space-y-1.5 ${cfg.bg} transition-colors`}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs">{cfg.icon}</span>
        <span className={`text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
        {note.timestamp_ref != null && (
          <button
            onClick={() => onSeek?.(note.timestamp_ref!)}
            className="font-mono text-xs text-gray-400 hover:text-brand-500 transition-colors"
            title="Jump to this timestamp"
          >
            @ {fmtTime(note.timestamp_ref)}
          </button>
        )}
        <div className="ml-auto flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => setEditing(true)}
            className="text-gray-400 hover:text-gray-600 text-xs px-1"
            title="Edit"
          >
            ✎
          </button>
          {confirming ? (
            <>
              <button onClick={() => onDelete(note.id)} className="text-red-500 hover:text-red-700 text-xs px-1">
                Confirm
              </button>
              <button onClick={() => setConfirming(false)} className="text-gray-400 hover:text-gray-600 text-xs px-1">
                ✕
              </button>
            </>
          ) : (
            <button
              onClick={() => setConfirming(true)}
              className="text-gray-400 hover:text-red-500 text-xs px-1"
              title="Delete"
            >
              🗑
            </button>
          )}
        </div>
      </div>
      <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{note.body}</p>
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
        className="w-full text-left text-sm text-gray-400 hover:text-gray-600 border border-dashed border-gray-300 hover:border-gray-400 rounded-lg px-3 py-2.5 transition-colors"
      >
        + Add a note…
      </button>
    );
  }

  return (
    <div className="border border-gray-200 rounded-lg p-3 space-y-2 bg-white shadow-sm">
      <div className="flex items-center gap-2">
        <select
          value={type}
          onChange={(e) => setType(e.target.value as NoteType)}
          className="text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none"
        >
          {Object.entries(TYPE_CONFIG).map(([k, v]) => (
            <option key={k} value={k}>{v.icon} {v.label}</option>
          ))}
        </select>
        {currentTime != null && currentTime > 0 && (
          <button
            onClick={() => setTimestampRef(timestampRef === null ? currentTime : null)}
            className={`text-xs px-2 py-1 rounded border transition-colors ${
              timestampRef !== null
                ? "bg-brand-100 border-brand-300 text-brand-700"
                : "border-gray-200 text-gray-500 hover:border-gray-300"
            }`}
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
        className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-brand-400"
      />
      <div className="flex gap-2">
        <button
          onClick={handleAdd}
          disabled={saving || !body.trim()}
          className="text-xs px-3 py-1 bg-brand-500 text-white rounded hover:bg-brand-600 disabled:opacity-50"
        >
          {saving ? "Adding…" : "Add Note"}
        </button>
        <button
          onClick={() => { setOpen(false); setBody(""); setTimestampRef(null); }}
          className="text-xs px-3 py-1 text-gray-500 hover:text-gray-700"
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
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">Notes</h2>
        <span className="text-xs text-gray-400">{notes.length} total</span>
      </div>

      {/* Filter tabs */}
      {notes.length > 0 && (
        <div className="flex gap-0.5 px-3 pt-2 overflow-x-auto">
          {FILTER_TABS.map((tab) => {
            const count = countFor(tab.key);
            if (count === 0 && tab.key !== "all") return null;
            return (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                className={`text-xs px-2.5 py-1 rounded-md whitespace-nowrap transition-colors ${
                  filter === tab.key
                    ? "bg-brand-100 text-brand-700 font-medium"
                    : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                }`}
              >
                {tab.label}
                {count > 0 && <span className="ml-1 text-gray-400">{count}</span>}
              </button>
            );
          })}
        </div>
      )}

      <div className="p-3 space-y-2">
        {filtered.length === 0 && filter !== "all" && (
          <p className="text-xs text-gray-400 text-center py-2">
            No {filter.replace("_", " ")}s yet.
          </p>
        )}
        {filtered.map((note) => (
          <NoteCard
            key={note.id}
            note={note}
            onUpdate={onUpdate}
            onDelete={onDelete}
            onSeek={onSeek}
          />
        ))}
        <AddNoteForm onAdd={onAdd} currentTime={currentTime} />
      </div>
    </div>
  );
}
