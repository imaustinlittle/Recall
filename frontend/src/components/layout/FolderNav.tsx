"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { foldersApi } from "@/lib/api";
import { Folder } from "@/lib/types";
import { FolderIcon, PlusIcon, TrashIcon } from "@/components/ui/icons";

/**
 * Sidebar folder list. Reads/writes the `folder` URL param the library
 * (page.tsx) filters on. "All" clears the filter; "Unfiled" → folder=none.
 */
export function FolderNav() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = searchParams.get("folder");

  const [folders, setFolders] = useState<Folder[]>([]);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const load = () => {
    foldersApi.list().then(setFolders).catch(() => {});
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (creating) inputRef.current?.focus();
  }, [creating]);

  const go = (folder: string | null) => {
    router.push(folder ? `/?folder=${folder}` : "/");
  };

  const onLibrary = pathname === "/";

  const submitCreate = async () => {
    const name = draft.trim();
    setCreating(false);
    setDraft("");
    if (!name) return;
    try {
      const f = await foldersApi.create({ name });
      setFolders((prev) => [...prev, f].sort((a, b) => a.name.localeCompare(b.name)));
      go(f.id);
    } catch {
      /* ignore */
    }
  };

  const handleDelete = async (e: React.MouseEvent, f: Folder) => {
    e.stopPropagation();
    if (!confirm(`Delete folder "${f.name}"? Meetings inside will be kept and unfiled.`)) return;
    try {
      await foldersApi.delete(f.id);
      setFolders((prev) => prev.filter((x) => x.id !== f.id));
      if (active === f.id) go(null);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="mt-4 border-t border-line px-3 pt-4">
      <div className="mb-1 flex items-center justify-between px-2">
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[.08em] text-ink-3">
          Folders
        </span>
        <button
          onClick={() => setCreating(true)}
          title="New folder"
          className="rounded p-0.5 text-ink-3 transition-colors hover:text-accent"
        >
          <PlusIcon size={14} />
        </button>
      </div>

      <div className="space-y-0.5">
        <FolderRow
          label="All meetings"
          activeState={onLibrary && !active}
          onClick={() => go(null)}
        />

        {folders.map((f) => (
          <FolderRow
            key={f.id}
            label={f.name}
            color={f.color_hex}
            count={f.meeting_count}
            activeState={onLibrary && active === f.id}
            onClick={() => go(f.id)}
            onDelete={(e) => handleDelete(e, f)}
          />
        ))}

        <FolderRow
          label="Unfiled"
          muted
          activeState={onLibrary && active === "none"}
          onClick={() => go("none")}
        />

        {creating && (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={submitCreate}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitCreate();
              if (e.key === "Escape") { setCreating(false); setDraft(""); }
            }}
            placeholder="Folder name…"
            className="w-full rounded-[8px] border border-accent bg-inset px-2.5 py-1.5 text-[13px] text-ink outline-none"
          />
        )}
      </div>
    </div>
  );
}

function FolderRow({
  label,
  color,
  count,
  muted,
  activeState,
  onClick,
  onDelete,
}: {
  label: string;
  color?: string;
  count?: number;
  muted?: boolean;
  activeState: boolean;
  onClick: () => void;
  onDelete?: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      onClick={onClick}
      className={[
        "group flex cursor-pointer items-center gap-2 rounded-[9px] px-2.5 py-1.5 text-[13px] font-medium transition-colors",
        activeState ? "bg-accent-weak text-accent" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
      ].join(" ")}
    >
      {color ? (
        <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: color }} />
      ) : (
        <FolderIcon size={14} className={muted ? "text-ink-3" : undefined} />
      )}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {typeof count === "number" && count > 0 && (
        <span className="shrink-0 font-mono text-[11px] text-ink-3">{count}</span>
      )}
      {onDelete && (
        <button
          onClick={onDelete}
          title="Delete folder"
          className="shrink-0 rounded p-0.5 text-ink-3 opacity-0 transition-opacity hover:text-status-red group-hover:opacity-100"
        >
          <TrashIcon size={13} />
        </button>
      )}
    </div>
  );
}
