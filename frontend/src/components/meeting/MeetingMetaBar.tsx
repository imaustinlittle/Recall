"use client";

import { useEffect, useRef, useState } from "react";
import { meetings as meetingsApi, foldersApi } from "@/lib/api";
import { Folder, Meeting } from "@/lib/types";
import { FolderIcon, TagIcon, PlusIcon, PinIcon } from "@/components/ui/icons";

/**
 * Compact folder picker + tag editor shown under a meeting's title.
 * Persists immediately via PATCH /meetings/{id}.
 */
export function MeetingMetaBar({
  meeting,
  onChange,
}: {
  meeting: Meeting;
  onChange: (patch: Partial<Meeting>) => void;
}) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [addingTag, setAddingTag] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  const tagInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    foldersApi.list().then(setFolders).catch(() => {});
  }, []);

  useEffect(() => {
    if (addingTag) tagInputRef.current?.focus();
  }, [addingTag]);

  const tags = meeting.tags ?? [];

  const setFolder = async (folderId: string | null) => {
    onChange({ folder_id: folderId });
    try {
      await meetingsApi.update(meeting.id, { folder_id: folderId });
    } catch {
      /* ignore */
    }
  };

  const persistTags = async (next: string[]) => {
    onChange({ tags: next });
    try {
      await meetingsApi.update(meeting.id, { tags: next });
    } catch {
      /* ignore */
    }
  };

  const addTag = () => {
    const t = tagDraft.trim();
    setAddingTag(false);
    setTagDraft("");
    if (!t || tags.includes(t)) return;
    persistTags([...tags, t]);
  };

  const removeTag = (t: string) => persistTags(tags.filter((x) => x !== t));

  const toggleKeep = async () => {
    const next = !meeting.retention_exempt;
    onChange({ retention_exempt: next });
    try {
      await meetingsApi.update(meeting.id, { retention_exempt: next });
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Folder picker */}
      <div className="inline-flex items-center gap-1.5 rounded-[10px] border border-line bg-surface px-2.5 py-1.5 text-[12.5px] text-ink-2">
        <FolderIcon size={14} className="text-ink-3" />
        <select
          value={meeting.folder_id ?? ""}
          onChange={(e) => setFolder(e.target.value || null)}
          className="cursor-pointer bg-transparent font-medium text-ink-2 outline-none"
        >
          <option value="">Unfiled</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
      </div>

      <span className="h-4 w-px bg-line" />

      {/* Tags */}
      <TagIcon size={14} className="text-ink-3" />
      {tags.map((t) => (
        <span
          key={t}
          className="group inline-flex items-center gap-1 rounded-full bg-accent-weak px-2.5 py-1 text-[12px] font-medium text-accent"
        >
          {t}
          <button
            onClick={() => removeTag(t)}
            title="Remove tag"
            className="text-accent/60 transition-colors hover:text-accent"
          >
            ✕
          </button>
        </span>
      ))}

      {addingTag ? (
        <input
          ref={tagInputRef}
          value={tagDraft}
          onChange={(e) => setTagDraft(e.target.value)}
          onBlur={addTag}
          onKeyDown={(e) => {
            if (e.key === "Enter") addTag();
            if (e.key === "Escape") { setAddingTag(false); setTagDraft(""); }
          }}
          placeholder="tag…"
          maxLength={100}
          className="w-24 rounded-full border border-accent bg-inset px-2.5 py-1 text-[12px] text-ink outline-none"
        />
      ) : (
        <button
          onClick={() => setAddingTag(true)}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-line-strong px-2.5 py-1 text-[12px] font-medium text-ink-3 transition-colors hover:border-accent hover:text-accent"
        >
          <PlusIcon size={12} />
          Tag
        </button>
      )}

      <span className="h-4 w-px bg-line" />

      {/* Keep — exempt from automatic retention cleanup */}
      <button
        onClick={toggleKeep}
        title={
          meeting.retention_exempt
            ? "Pinned — exempt from automatic cleanup. Click to unpin."
            : "Pin to keep this meeting exempt from automatic retention cleanup."
        }
        className={[
          "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors",
          meeting.retention_exempt
            ? "bg-accent-weak text-accent"
            : "border border-dashed border-line-strong text-ink-3 hover:border-accent hover:text-accent",
        ].join(" ")}
      >
        <PinIcon size={12} />
        {meeting.retention_exempt ? "Kept" : "Keep"}
      </button>
    </div>
  );
}
