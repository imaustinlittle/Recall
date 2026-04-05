"use client";

import { Suspense, useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { searchApi } from "@/lib/api";
import { useAuth } from "@/lib/useAuth";
import { Sidebar } from "@/components/layout/Sidebar";
import { Spinner } from "@/components/ui/Spinner";
import { formatDate } from "@/lib/utils";

interface Snippet {
  type: "title" | "transcript" | "note";
  text: string;
  start_time?: number;
  note_type?: string;
}

interface SearchResult {
  id: string;
  title: string;
  status: string;
  created_at: string;
  snippets: Snippet[];
}

function highlight(text: string, query: string) {
  if (!query) return text;
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase()
      ? <mark key={i} className="bg-brand-100 text-brand-800 rounded px-0.5">{part}</mark>
      : part
  );
}

const SNIPPET_LABELS: Record<string, string> = {
  title: "Title",
  transcript: "Transcript",
  note: "Note",
};

function SearchContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [user, authLoading, router]);

  // Run search when query param is present on load
  useEffect(() => {
    const q = searchParams.get("q");
    if (q && user) {
      setQuery(q);
      runSearch(q);
    }
  }, [user]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const runSearch = async (q: string) => {
    if (!q.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const res = await searchApi.search(q) as { results: SearchResult[] };
      setResults(res.results);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    router.replace(`/search?q=${encodeURIComponent(query)}`);
    runSearch(query);
  };

  if (authLoading || !user) {
    return <div className="flex-1 flex items-center justify-center"><Spinner size="lg" /></div>;
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      {/* Top bar */}
      <header className="shrink-0 bg-white border-b border-gray-100 px-8 py-5">
        <form onSubmit={handleSubmit} className="max-w-2xl">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search meetings, transcripts, notes…"
              className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
            {query && (
              <button
                type="button"
                onClick={() => { setQuery(""); setResults([]); setSearched(false); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            )}
          </div>
        </form>
      </header>

      {/* Results */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {loading ? (
          <div className="flex justify-center py-24"><Spinner size="lg" /></div>
        ) : !searched ? (
          <div className="max-w-2xl text-center py-20 text-gray-400 text-sm">
            Search across all your meeting transcripts, titles, and notes.
          </div>
        ) : results.length === 0 ? (
          <div className="max-w-2xl text-center py-20">
            <p className="text-gray-500 font-medium mb-1">No results for "{query}"</p>
            <p className="text-gray-400 text-sm">Try a different keyword or check the spelling.</p>
          </div>
        ) : (
          <div className="max-w-2xl space-y-3">
            <p className="text-xs text-gray-400 mb-4">{results.length} meeting{results.length !== 1 ? "s" : ""} matched</p>
            {results.map((result) => (
              <Link
                key={result.id}
                href={`/meetings/${result.id}`}
                className="block bg-white border border-gray-100 rounded-xl px-5 py-4 hover:border-brand-200 hover:shadow-md transition-all"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <p className="font-medium text-gray-900">{highlight(result.title, query)}</p>
                  <span className="text-xs text-gray-400 shrink-0">{formatDate(result.created_at)}</span>
                </div>
                <div className="space-y-1.5">
                  {result.snippets.slice(0, 3).map((snippet, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className={[
                        "shrink-0 text-xs px-1.5 py-0.5 rounded font-medium",
                        snippet.type === "transcript" ? "bg-blue-50 text-blue-600" :
                        snippet.type === "note" ? "bg-amber-50 text-amber-600" :
                        "bg-gray-100 text-gray-500"
                      ].join(" ")}>
                        {SNIPPET_LABELS[snippet.type]}
                      </span>
                      <p className="text-sm text-gray-600 leading-snug">{highlight(snippet.text, query)}</p>
                    </div>
                  ))}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function SearchPage() {
  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar />
      <Suspense fallback={<div className="flex-1 flex items-center justify-center"><Spinner size="lg" /></div>}>
        <SearchContent />
      </Suspense>
    </div>
  );
}
