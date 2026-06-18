"use client";

import { useState } from "react";

// Minimal markdown renderer for the three-section summary format.
function renderSummary(text: string) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let key = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      elements.push(<div key={key++} className="h-2" />);
      continue;
    }

    const headingMatch = trimmed.match(/^(?:\d+\.\s+|#{1,3}\s+)\*?\*?(.+?)\*?\*?$/);
    if (headingMatch && (trimmed.startsWith("#") || /^\d+\./.test(trimmed))) {
      const raw = trimmed.replace(/^#+\s+/, "").replace(/^\d+\.\s+/, "").replace(/\*\*/g, "");
      elements.push(
        <h3 key={key++} className="mb-1 mt-3 text-sm font-semibold text-ink">
          {raw}
        </h3>
      );
      continue;
    }

    if (/^[-*•]\s/.test(trimmed)) {
      const content = trimmed.replace(/^[-*•]\s+/, "");
      elements.push(
        <li key={key++} className="ml-4 list-disc text-sm leading-relaxed text-ink-2">
          {inlineBold(content)}
        </li>
      );
      continue;
    }

    elements.push(
      <p key={key++} className="text-sm leading-relaxed text-ink-2">
        {inlineBold(trimmed)}
      </p>
    );
  }

  return elements;
}

function inlineBold(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i} className="font-semibold text-ink">{part.slice(2, -2)}</strong>
    ) : (
      part
    )
  );
}

export function SummaryPanel({
  summary,
  onRegenerate,
  onImportNotes,
}: {
  summary: string;
  onRegenerate: () => Promise<void>;
  onImportNotes?: () => Promise<number>;
}) {
  const [regenerating, setRegenerate] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);

  const handleRegenerate = async () => {
    setRegenerate(true);
    await onRegenerate();
    setRegenerate(false);
  };

  const handleImport = async () => {
    if (!onImportNotes) return;
    setImporting(true);
    try {
      const count = await onImportNotes();
      setImportResult(count > 0 ? `${count} note${count !== 1 ? "s" : ""} added` : "Nothing new to import");
      setTimeout(() => setImportResult(null), 4000);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="rounded-[18px] border border-line bg-surface shadow-card-sm">
      <div className="flex items-center justify-between border-b border-line px-[22px] py-[14px]">
        <div className="flex items-center gap-2">
          <span className="text-sm">✨</span>
          <h2 className="font-mono text-[11.5px] font-semibold uppercase tracking-[.1em] text-ink-2">Summary</h2>
          <span className="rounded-full bg-accent-weak px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[.04em] text-accent">
            AI
          </span>
        </div>
        <div className="flex items-center gap-3">
          {onImportNotes && (
            <button
              onClick={handleImport}
              disabled={importing}
              className="text-xs font-semibold text-accent transition-colors hover:opacity-80 disabled:opacity-50"
              title="Create notes from action items and decisions in this summary"
            >
              {importing ? "Importing…" : importResult ?? "↓ Import to Notes"}
            </button>
          )}
          <button
            onClick={handleRegenerate}
            disabled={regenerating}
            className="text-xs font-medium text-ink-3 transition-colors hover:text-accent disabled:opacity-50"
            title="Re-generate summary (useful after renaming speakers)"
          >
            {regenerating ? "Queued…" : "↺ Regenerate"}
          </button>
        </div>
      </div>
      <div className="space-y-0.5 px-[22px] py-4">{renderSummary(summary)}</div>
    </div>
  );
}

export function SummaryPending({ onGenerate }: { onGenerate?: () => Promise<void> }) {
  const [loading, setLoading] = useState(false);
  const [queued, setQueued] = useState(false);

  const handleGenerate = async () => {
    if (!onGenerate) return;
    setLoading(true);
    await onGenerate();
    setLoading(false);
    setQueued(true);
  };

  if (queued) {
    return (
      <div className="flex items-center gap-3 rounded-[18px] border border-line bg-surface px-[22px] py-5 shadow-card-sm">
        <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-accent-line border-t-accent" />
        <div>
          <p className="text-sm font-semibold text-ink">Generating summary…</p>
          <p className="font-mono text-[12px] text-ink-3">This usually takes 30–60 seconds.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-[18px] border border-line bg-surface px-[22px] py-5 shadow-card-sm">
      <div className="flex items-center gap-2">
        <span className="text-sm">✨</span>
        <div>
          <p className="text-sm font-semibold text-ink">No summary yet</p>
          <p className="font-mono text-[12px] text-ink-3">Generate an AI summary of this meeting.</p>
        </div>
      </div>
      {onGenerate && (
        <button
          onClick={handleGenerate}
          disabled={loading}
          className="shrink-0 rounded-[10px] bg-accent px-4 py-2 text-sm font-semibold text-on-accent transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Starting…" : "Generate Summary"}
        </button>
      )}
    </div>
  );
}
