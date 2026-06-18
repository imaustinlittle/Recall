"use client";

import { Suspense, useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { searchApi } from "@/lib/api";
import { useAuth } from "@/lib/useAuth";
import { AppHeader } from "@/components/layout/AppHeader";
import { Spinner } from "@/components/ui/Spinner";
import { SearchIcon } from "@/components/ui/icons";
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
    part.toLowerCase() === query.toLowerCase() ? (
      <mark key={i} className="rounded bg-accent-weak px-0.5 text-accent">{part}</mark>
    ) : (
      part
    )
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
      const res = (await searchApi.search(q)) as { results: SearchResult[] };
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
    return (
      <div className="flex flex-1 items-center justify-center py-24">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[720px] px-[26px] pb-20 pt-10">
      <p className="font-mono text-[12px] font-semibold uppercase tracking-[.1em] text-accent">Search</p>
      <h1 className="mb-5 mt-1.5 font-display text-[32px] font-bold tracking-[-.02em] text-ink">
        Find anything
      </h1>

      <form onSubmit={handleSubmit}>
        <div className="relative flex items-center">
          <span className="absolute left-3.5 text-ink-3">
            <SearchIcon size={18} />
          </span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search meetings, transcripts, notes…"
            className="w-full rounded-[12px] border border-line bg-surface py-3 pl-11 pr-4 text-[14.5px] text-ink shadow-card-sm focus:border-accent focus:outline-none focus:shadow-[0_0_0_3px_var(--accent-weak)]"
          />
        </div>
      </form>

      <div className="mt-6">
        {loading ? (
          <div className="flex justify-center py-20">
            <Spinner size="lg" />
          </div>
        ) : !searched ? (
          <p className="py-16 text-center text-sm text-ink-3">
            Search across all your meeting transcripts, titles, and notes.
          </p>
        ) : results.length === 0 ? (
          <div className="py-16 text-center">
            <p className="mb-1 font-semibold text-ink">No results for “{query}”</p>
            <p className="text-sm text-ink-2">Try a different keyword or check the spelling.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-[11px]">
            <p className="font-mono text-[12px] text-ink-3">
              {results.length} meeting{results.length !== 1 ? "s" : ""} matched
            </p>
            {results.map((result) => (
              <Link
                key={result.id}
                href={`/meetings/${result.id}`}
                className="block rounded-[16px] border border-line bg-surface px-5 py-4 shadow-card-sm transition-all hover:-translate-y-px hover:border-line-strong"
              >
                <div className="mb-2 flex items-start justify-between gap-3">
                  <p className="font-semibold text-ink">{highlight(result.title, query)}</p>
                  <span className="shrink-0 font-mono text-[11.5px] text-ink-3">
                    {formatDate(result.created_at)}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {result.snippets.slice(0, 3).map((snippet, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="shrink-0 rounded-[6px] bg-inset px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[.04em] text-ink-2">
                        {SNIPPET_LABELS[snippet.type]}
                      </span>
                      <p className="text-[13.5px] leading-snug text-ink-2">{highlight(snippet.text, query)}</p>
                    </div>
                  ))}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

export default function SearchPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />
      <Suspense
        fallback={
          <div className="flex flex-1 items-center justify-center py-24">
            <Spinner size="lg" />
          </div>
        }
      >
        <SearchContent />
      </Suspense>
    </div>
  );
}
