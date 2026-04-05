"use client";

import { useState } from "react";

// Minimal markdown renderer for the three-section summary format.
// Handles **bold**, bullet lists (- or *), and numbered sections.
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

    // Numbered heading: "1. **Overview**" or "## Overview"
    const headingMatch = trimmed.match(/^(?:\d+\.\s+|#{1,3}\s+)\*?\*?(.+?)\*?\*?$/);
    if (headingMatch && (trimmed.startsWith("#") || /^\d+\./.test(trimmed))) {
      const raw = trimmed.replace(/^#+\s+/, "").replace(/^\d+\.\s+/, "").replace(/\*\*/g, "");
      elements.push(
        <h3 key={key++} className="text-sm font-semibold text-gray-800 mt-3 mb-1">
          {raw}
        </h3>
      );
      continue;
    }

    // Bullet item
    if (/^[-*•]\s/.test(trimmed)) {
      const content = trimmed.replace(/^[-*•]\s+/, "");
      elements.push(
        <li key={key++} className="text-sm text-gray-700 ml-4 list-disc leading-relaxed">
          {inlineBold(content)}
        </li>
      );
      continue;
    }

    // Plain paragraph
    elements.push(
      <p key={key++} className="text-sm text-gray-700 leading-relaxed">
        {inlineBold(trimmed)}
      </p>
    );
  }

  return elements;
}

function inlineBold(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**")
      ? <strong key={i}>{part.slice(2, -2)}</strong>
      : part
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
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm">✨</span>
          <h2 className="text-sm font-semibold text-gray-900">Summary</h2>
          <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">AI generated</span>
        </div>
        <div className="flex items-center gap-3">
          {onImportNotes && (
            <button
              onClick={handleImport}
              disabled={importing}
              className="text-xs text-brand-600 hover:text-brand-700 disabled:opacity-50 transition-colors font-medium"
              title="Create notes from action items and decisions in this summary"
            >
              {importing ? "Importing…" : importResult ?? "↓ Import to Notes"}
            </button>
          )}
          <button
            onClick={handleRegenerate}
            disabled={regenerating}
            className="text-xs text-gray-400 hover:text-brand-600 disabled:opacity-50 transition-colors"
            title="Re-generate summary (useful after renaming speakers)"
          >
            {regenerating ? "Queued…" : "↺ Regenerate"}
          </button>
        </div>
      </div>
      <div className="px-4 py-3 space-y-0.5">
        {renderSummary(summary)}
      </div>
    </div>
  );
}

export function SummaryPending({
  onGenerate,
}: {
  onGenerate?: () => Promise<void>;
}) {
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
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm px-4 py-5 flex items-center gap-3">
        <svg className="animate-spin h-4 w-4 text-brand-500 shrink-0" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        <div>
          <p className="text-sm font-medium text-gray-700">Generating summary…</p>
          <p className="text-xs text-gray-400">This usually takes 30–60 seconds.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm px-4 py-5 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <span className="text-sm">✨</span>
        <div>
          <p className="text-sm font-medium text-gray-700">No summary yet</p>
          <p className="text-xs text-gray-400">Generate an AI summary of this meeting.</p>
        </div>
      </div>
      {onGenerate && (
        <button
          onClick={handleGenerate}
          disabled={loading}
          className="text-sm px-3 py-1.5 bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-50 transition-colors shrink-0"
        >
          {loading ? "Starting…" : "Generate Summary"}
        </button>
      )}
    </div>
  );
}
