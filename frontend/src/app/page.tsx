"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { meetings as meetingsApi, foldersApi } from "@/lib/api";
import { Meeting, MeetingListOut, Folder, TagCount } from "@/lib/types";
import { useAuth } from "@/lib/useAuth";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Spinner } from "@/components/ui/Spinner";
import { Sparkline } from "@/components/ui/Sparkline";
import { AppShell } from "@/components/layout/AppShell";
import { PlusIcon, WaveIcon, TrashIcon, CheckIcon, FolderIcon, TagIcon } from "@/components/ui/icons";
import { formatDate } from "@/lib/utils";

const LIMIT = 30;

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "transcribed", label: "Transcribed" },
  { value: "processing", label: "Processing" },
  { value: "queued", label: "Queued" },
  { value: "failed", label: "Failed" },
  { value: "pending", label: "Pending" },
];

function monthStart(year: number, month: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-01`;
}
function monthEnd(year: number, month: number) {
  const last = new Date(year, month + 1, 0).getDate();
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}

function buildParams(
  dateParam: string | null,
  monthParam: string | null,
  status: string,
  page: number,
  folder: string | null,
  tag: string | null
) {
  const p: Record<string, string | number> = { page, limit: LIMIT };
  if (status) p.status = status;
  if (folder) p.folder = folder;
  if (tag) p.tag = tag;
  if (dateParam) {
    p.date_from = dateParam;
    p.date_to = dateParam;
  } else if (monthParam) {
    const [y, m] = monthParam.split("-").map(Number);
    p.date_from = monthStart(y, m - 1);
    p.date_to = monthEnd(y, m - 1);
  }
  return p;
}

export default function DashboardPage() {
  return (
    <AppShell>
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center">
            <Spinner size="lg" />
          </div>
        }
      >
        <DashboardContent />
      </Suspense>
    </AppShell>
  );
}

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();

  const dateParam = searchParams.get("date");
  const monthParam = searchParams.get("month");
  const folderParam = searchParams.get("folder");
  const tagParam = searchParams.get("tag");
  const hasDateFilter = !!(dateParam || monthParam);

  const [status, setStatus] = useState("");
  const [items, setItems] = useState<Meeting[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [creating, setCreating] = useState(false);

  // Folders & tags
  const [folders, setFolders] = useState<Folder[]>([]);
  const [tags, setTags] = useState<TagCount[]>([]);

  // Bulk-management state
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkMoving, setBulkMoving] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [user, authLoading, router]);

  // Folder/tag metadata for chips + bulk-move (refreshed on user change).
  const loadMeta = useCallback(() => {
    if (!user) return;
    foldersApi.list().then(setFolders).catch(() => {});
    meetingsApi.tags().then(setTags).catch(() => {});
  }, [user]);

  useEffect(() => { loadMeta(); }, [loadMeta]);

  // Load page 1 whenever the filter changes.
  useEffect(() => {
    if (!user) return;
    setLoading(true);
    setPage(1);
    setSelectMode(false);
    setSelected(new Set());
    meetingsApi
      .list(buildParams(dateParam, monthParam, status, 1, folderParam, tagParam))
      .then((d) => {
        const data = d as MeetingListOut;
        setItems(data.items);
        setTotal(data.total);
      })
      .finally(() => setLoading(false));
  }, [user, dateParam, monthParam, status, folderParam, tagParam]);

  const loadMore = async () => {
    const next = page + 1;
    setLoadingMore(true);
    try {
      const d = (await meetingsApi.list(buildParams(dateParam, monthParam, status, next, folderParam, tagParam))) as MeetingListOut;
      setItems((prev) => [...prev, ...d.items]);
      setTotal(d.total);
      setPage(next);
    } finally {
      setLoadingMore(false);
    }
  };

  const activeFolder = folderParam && folderParam !== "none"
    ? folders.find((f) => f.id === folderParam)
    : null;

  const handleBulkMove = async (folderId: string | null) => {
    const ids = [...selected];
    if (ids.length === 0) return;
    setBulkMoving(true);
    try {
      await Promise.allSettled(ids.map((id) => meetingsApi.update(id, { folder_id: folderId })));
      // If we're viewing a folder, moved-out meetings should drop from the list.
      if (folderParam) {
        const moved = new Set(ids);
        setItems((prev) => prev.filter((m) => !moved.has(m.id)));
        setTotal((t) => Math.max(0, t - moved.size));
      } else {
        setItems((prev) => prev.map((m) => (selected.has(m.id) ? { ...m, folder_id: folderId } : m)));
      }
      loadMeta();
      exitSelect();
    } finally {
      setBulkMoving(false);
    }
  };

  const handleNew = async () => {
    setCreating(true);
    try {
      const m = (await meetingsApi.create({ title: "New meeting" })) as Meeting;
      router.push(`/meetings/${m.id}`);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = (id: string) => {
    setItems((prev) => prev.filter((m) => m.id !== id));
    setTotal((t) => Math.max(0, t - 1));
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const allLoadedSelected = items.length > 0 && items.every((m) => selected.has(m.id));
  const toggleSelectAll = () => {
    setSelected(allLoadedSelected ? new Set() : new Set(items.map((m) => m.id)));
  };

  const exitSelect = () => {
    setSelectMode(false);
    setSelected(new Set());
  };

  const handleBulkDelete = async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (!confirm(`Delete ${ids.length} meeting${ids.length === 1 ? "" : "s"}? This cannot be undone.`)) return;
    setBulkDeleting(true);
    try {
      const results = await Promise.allSettled(ids.map((id) => meetingsApi.delete(id)));
      const deleted = new Set(ids.filter((_, i) => results[i].status === "fulfilled"));
      setItems((prev) => prev.filter((m) => !deleted.has(m.id)));
      setTotal((t) => Math.max(0, t - deleted.size));
      const failed = ids.length - deleted.size;
      if (failed > 0) alert(`${failed} meeting${failed === 1 ? "" : "s"} could not be deleted.`);
      exitSelect();
    } finally {
      setBulkDeleting(false);
    }
  };

  if (authLoading || !user) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  const filterLabel = dateParam
    ? new Date(dateParam + "T00:00:00").toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })
    : monthParam
    ? new Date(monthParam + "-01T00:00:00").toLocaleDateString(undefined, { month: "long", year: "numeric" })
    : null;

  const folderLabel = activeFolder ? activeFolder.name : folderParam === "none" ? "Unfiled" : null;

  const subtitle = folderLabel
    ? `${total} in ${folderLabel}`
    : tagParam
    ? `${total} tagged "${tagParam}"`
    : hasDateFilter
    ? `${total} ${filterLabel}`
    : `${total} recording${total === 1 ? "" : "s"} archived`;

  const dropParam = (key: string) => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete(key);
    const qs = next.toString();
    router.push(qs ? `/?${qs}` : "/");
  };

  const hasMore = items.length < total;

  return (
    <main className="mx-auto w-full max-w-[980px] px-[26px] pb-20 pt-10">
      {/* Header row */}
      <div className="mb-5 flex items-end justify-between gap-5">
        <div>
          <p className="font-mono text-[12px] font-semibold uppercase tracking-[.1em] text-accent">Library</p>
          <h1 className="mt-1.5 font-display text-[34px] font-bold tracking-[-.02em] text-ink">Meetings</h1>
          <p className="mt-1 text-[14px] text-ink-2">{subtitle}</p>
        </div>

        <button
          onClick={handleNew}
          disabled={creating}
          className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-[12px] bg-accent px-[18px] py-3 text-[14px] font-bold text-on-accent shadow-glow transition-opacity disabled:opacity-60"
        >
          {creating ? <Spinner size="sm" className="border-on-accent/40 border-t-on-accent" /> : <PlusIcon />}
          New meeting
        </button>
      </div>

      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        {filterLabel && (
          <button
            onClick={() => dropParam(dateParam ? "date" : "month")}
            className="inline-flex items-center gap-1.5 rounded-full bg-accent-weak px-3 py-1.5 text-[12.5px] font-semibold text-accent"
            title="Clear date filter"
          >
            {filterLabel}
            <span aria-hidden>✕</span>
          </button>
        )}

        {folderLabel && (
          <button
            onClick={() => dropParam("folder")}
            className="inline-flex items-center gap-1.5 rounded-full bg-accent-weak px-3 py-1.5 text-[12.5px] font-semibold text-accent"
            title="Clear folder filter"
          >
            <FolderIcon size={13} />
            {folderLabel}
            <span aria-hidden>✕</span>
          </button>
        )}

        {tagParam && (
          <button
            onClick={() => dropParam("tag")}
            className="inline-flex items-center gap-1.5 rounded-full bg-accent-weak px-3 py-1.5 text-[12.5px] font-semibold text-accent"
            title="Clear tag filter"
          >
            <TagIcon size={13} />
            {tagParam}
            <span aria-hidden>✕</span>
          </button>
        )}

        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-[10px] border border-line bg-surface px-3 py-2 text-[13px] font-medium text-ink-2 focus:border-accent focus:outline-none"
        >
          {STATUS_FILTERS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>

        <div className="flex-1" />

        {items.length > 0 && (
          selectMode ? (
            <button
              onClick={exitSelect}
              className="rounded-[10px] border border-line bg-surface px-3 py-2 text-[13px] font-semibold text-ink-2 transition-colors hover:text-ink"
            >
              Cancel
            </button>
          ) : (
            <button
              onClick={() => setSelectMode(true)}
              className="rounded-[10px] border border-line bg-surface px-3 py-2 text-[13px] font-semibold text-ink-2 transition-colors hover:text-ink"
            >
              Manage
            </button>
          )
        )}
      </div>

      {/* Tag filter row */}
      {!tagParam && tags.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <TagIcon size={14} className="text-ink-3" />
          {tags.slice(0, 16).map((t) => (
            <button
              key={t.tag}
              onClick={() => router.push(`/?tag=${encodeURIComponent(t.tag)}`)}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-[12px] font-medium text-ink-2 transition-colors hover:border-accent hover:text-accent"
            >
              {t.tag}
              <span className="font-mono text-[10.5px] text-ink-3">{t.count}</span>
            </button>
          ))}
        </div>
      )}

      {/* Bulk action bar */}
      {selectMode && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-[12px] border border-accent-line bg-accent-weak px-4 py-2.5">
          <button onClick={toggleSelectAll} className="text-[13px] font-semibold text-accent">
            {allLoadedSelected ? "Clear all" : "Select all"}
          </button>
          <span className="font-mono text-[12.5px] text-ink-2">{selected.size} selected</span>
          <div className="flex-1" />

          {/* Move to folder */}
          <select
            value=""
            disabled={selected.size === 0 || bulkMoving}
            onChange={(e) => {
              const v = e.target.value;
              if (v) handleBulkMove(v === "none" ? null : v);
            }}
            className="rounded-[10px] border border-line bg-surface px-3 py-1.5 text-[13px] font-semibold text-ink-2 transition-colors hover:text-ink disabled:opacity-50"
          >
            <option value="">Move to…</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
            <option value="none">Unfiled</option>
          </select>

          <button
            onClick={handleBulkDelete}
            disabled={selected.size === 0 || bulkDeleting}
            className="inline-flex items-center gap-1.5 rounded-[10px] bg-record px-3.5 py-1.5 text-[13px] font-semibold text-white transition-opacity disabled:opacity-50"
          >
            {bulkDeleting ? <Spinner size="sm" className="border-white/40 border-t-white" /> : <TrashIcon size={15} />}
            Delete{selected.size > 0 ? ` (${selected.size})` : ""}
          </button>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-24">
          <Spinner size="lg" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState hasFilter={hasDateFilter || !!status} onNew={handleNew} onClearFilter={() => { setStatus(""); router.push("/"); }} />
      ) : (
        <>
          <div className="flex flex-col gap-[11px]">
            {items.map((m) => (
              <MeetingRow
                key={m.id}
                meeting={m}
                onDelete={handleDelete}
                selectMode={selectMode}
                selected={selected.has(m.id)}
                onToggleSelect={toggleSelect}
              />
            ))}
          </div>

          {hasMore && (
            <div className="mt-6 flex justify-center">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="inline-flex items-center gap-2 rounded-[12px] border border-line bg-surface px-5 py-2.5 text-[13.5px] font-semibold text-ink-2 transition-colors hover:text-ink disabled:opacity-60"
              >
                {loadingMore && <Spinner size="sm" />}
                Load more ({total - items.length} remaining)
              </button>
            </div>
          )}
        </>
      )}
    </main>
  );
}

function RowInner({ meeting }: { meeting: Meeting }) {
  return (
    <>
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-accent-weak text-accent">
        <WaveIcon size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15.5px] font-semibold">{meeting.title}</p>
        <p className="mt-[3px] font-mono text-[12px] text-ink-3">{formatDate(meeting.created_at)}</p>
      </div>
      <div className="hidden sm:block">
        <Sparkline seed={meeting.id} active={meeting.status === "transcribed"} />
      </div>
      <StatusBadge status={meeting.status} fixedWidth />
    </>
  );
}

function MeetingRow({
  meeting,
  onDelete,
  selectMode,
  selected,
  onToggleSelect,
}: {
  meeting: Meeting;
  onDelete: (id: string) => void;
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: (id: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!confirm(`Delete "${meeting.title}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await meetingsApi.delete(meeting.id);
      onDelete(meeting.id);
    } finally {
      setDeleting(false);
    }
  };

  if (selectMode) {
    return (
      <button
        onClick={() => onToggleSelect(meeting.id)}
        className={[
          "flex w-full items-center gap-4 rounded-[16px] border bg-surface px-5 py-[17px] text-left text-ink shadow-card-sm transition-colors",
          selected ? "border-accent" : "border-line hover:border-line-strong",
        ].join(" ")}
      >
        <span
          className={[
            "flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] transition-colors",
            selected ? "bg-accent text-on-accent" : "border border-line-strong bg-inset text-transparent",
          ].join(" ")}
        >
          <CheckIcon size={13} strokeWidth={3} />
        </span>
        <RowInner meeting={meeting} />
      </button>
    );
  }

  return (
    <div className="group flex items-center gap-1">
      <Link
        href={`/meetings/${meeting.id}`}
        className="flex min-w-0 flex-1 items-center gap-5 rounded-[16px] border border-line bg-surface px-5 py-[17px] text-left text-ink shadow-card-sm transition-all duration-150 hover:-translate-y-px hover:border-line-strong"
      >
        <RowInner meeting={meeting} />
      </Link>

      <button
        onClick={handleDelete}
        disabled={deleting}
        title="Delete meeting"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-3 opacity-0 transition-opacity hover:text-status-red focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-40"
      >
        {deleting ? <Spinner size="sm" /> : <TrashIcon size={16} />}
      </button>
    </div>
  );
}

function EmptyState({ hasFilter, onNew, onClearFilter }: { hasFilter: boolean; onNew: () => void; onClearFilter: () => void }) {
  return (
    <div className="rounded-[18px] border border-dashed border-line-strong bg-surface-2 py-20 text-center">
      {hasFilter ? (
        <>
          <p className="mb-3 text-sm text-ink-2">No meetings match this filter</p>
          <button onClick={onClearFilter} className="text-sm font-semibold text-accent hover:underline">
            Clear filters →
          </button>
        </>
      ) : (
        <>
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent-weak text-accent">
            <WaveIcon size={24} />
          </div>
          <p className="mb-1 font-semibold text-ink">No meetings yet</p>
          <p className="mb-4 text-sm text-ink-2">Record, upload, or create a new meeting to get started.</p>
          <button onClick={onNew} className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline">
            <PlusIcon size={16} />
            New meeting
          </button>
        </>
      )}
    </div>
  );
}
