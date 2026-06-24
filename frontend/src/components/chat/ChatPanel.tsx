"use client";

import { useEffect, useRef, useState } from "react";
import { chatApi, streamChat } from "@/lib/api";
import { ChatMessage, ChatCitation } from "@/lib/types";
import { Spinner } from "@/components/ui/Spinner";
import { ChatIcon, TrashIcon } from "@/components/ui/icons";

function fmtTs(seconds: number): string {
  const s = Math.floor(seconds);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function ChatPanel({
  meetingId,
  onSeek,
}: {
  meetingId: string;
  onSeek?: (t: number) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [indexed, setIndexed] = useState<boolean | null>(null);
  const [indexing, setIndexing] = useState(false);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<(() => void) | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Initial load
  useEffect(() => {
    chatApi.get(meetingId)
      .then((t) => {
        setMessages(t.messages);
        setIndexed(t.indexed);
        if (!t.indexed) startPolling();
      })
      .catch(() => setIndexed(false));
    return () => {
      abortRef.current?.();
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, streamText]);

  const startPolling = () => {
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      try {
        const t = await chatApi.get(meetingId);
        if (t.indexed) {
          setIndexed(true);
          setIndexing(false);
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
        }
      } catch { /* keep polling */ }
    }, 4000);
  };

  const handleIndex = async () => {
    setIndexing(true);
    setError(null);
    try {
      await chatApi.index(meetingId);
      startPolling();
    } catch (e) {
      setIndexing(false);
      setError(e instanceof Error ? e.message : "Failed to start indexing");
    }
  };

  const handleClear = async () => {
    if (!confirm("Clear this chat thread?")) return;
    try {
      await chatApi.clear(meetingId);
      setMessages([]);
    } catch { /* ignore */ }
  };

  const handleSend = () => {
    const q = input.trim();
    if (!q || streaming) return;
    setInput("");
    setError(null);
    setMessages((prev) => [
      ...prev,
      { id: `local-${Date.now()}`, role: "user", content: q, citations: null, created_at: new Date().toISOString() },
    ]);
    setStreaming(true);
    setStreamText("");

    let acc = "";
    abortRef.current = streamChat(meetingId, q, {
      onToken: (text) => { acc += text; setStreamText(acc); },
      onDone: (citations: ChatCitation[]) => {
        setMessages((prev) => [
          ...prev,
          { id: `a-${Date.now()}`, role: "assistant", content: acc, citations, created_at: new Date().toISOString() },
        ]);
        setStreamText("");
        setStreaming(false);
      },
      onError: (detail) => {
        setError(detail);
        setStreamText("");
        setStreaming(false);
      },
    });
  };

  // ── Render states ──────────────────────────────────────────────────────────
  if (indexed === null) {
    return (
      <Shell>
        <div className="flex items-center justify-center py-10">
          <Spinner />
        </div>
      </Shell>
    );
  }

  if (!indexed) {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <p className="text-[13.5px] text-ink-2">
            {indexing
              ? "Indexing this meeting for chat… this runs in the background."
              : "Chat with this meeting's transcript using your local model."}
          </p>
          <button
            onClick={handleIndex}
            disabled={indexing}
            className="inline-flex items-center gap-2 rounded-[11px] bg-accent px-4 py-2.5 text-[13.5px] font-bold text-on-accent shadow-glow transition-opacity disabled:opacity-60"
          >
            {indexing ? <Spinner size="sm" className="border-on-accent/40 border-t-on-accent" /> : <ChatIcon size={16} />}
            {indexing ? "Indexing…" : "Index this meeting"}
          </button>
          {error && <p className="text-[12.5px] text-status-red">{error}</p>}
        </div>
      </Shell>
    );
  }

  return (
    <Shell onClear={messages.length > 0 ? handleClear : undefined}>
      <div ref={scrollRef} className="flex max-h-[460px] flex-col gap-3 overflow-y-auto px-1 py-2">
        {messages.length === 0 && !streaming && (
          <p className="py-6 text-center text-[13px] text-ink-3">
            Ask anything about this meeting — “What were the action items?”, “What did Alice say about the budget?”
          </p>
        )}

        {messages.map((m) => (
          <Bubble key={m.id} message={m} onSeek={onSeek} />
        ))}

        {streaming && (
          <div className="mr-8 self-start rounded-[14px] rounded-tl-[4px] bg-surface-2 px-3.5 py-2.5 text-[13.5px] text-ink">
            {streamText || <span className="text-ink-3">Thinking…</span>}
            {streamText && <span className="ml-0.5 inline-block h-3.5 w-[2px] animate-pulse bg-accent align-middle" />}
          </div>
        )}
      </div>

      {error && <p className="px-2 pb-1 text-[12.5px] text-status-red">{error}</p>}

      <div className="flex items-end gap-2 border-t border-line px-1 pt-2.5">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
          }}
          placeholder="Ask about this meeting…"
          rows={1}
          className="max-h-28 min-h-[40px] flex-1 resize-none rounded-[11px] border border-line bg-inset px-3 py-2.5 text-[13.5px] text-ink outline-none focus:border-accent"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || streaming}
          className="inline-flex h-[40px] items-center gap-1.5 rounded-[11px] bg-accent px-4 text-[13.5px] font-bold text-on-accent shadow-glow transition-opacity disabled:opacity-50"
        >
          {streaming ? <Spinner size="sm" className="border-on-accent/40 border-t-on-accent" /> : "Send"}
        </button>
      </div>
    </Shell>
  );
}

function Bubble({ message, onSeek }: { message: ChatMessage; onSeek?: (t: number) => void }) {
  const isUser = message.role === "user";
  return (
    <div className={isUser ? "ml-8 self-end" : "mr-8 self-start"}>
      <div
        className={[
          "whitespace-pre-wrap rounded-[14px] px-3.5 py-2.5 text-[13.5px]",
          isUser
            ? "rounded-tr-[4px] bg-accent text-on-accent"
            : "rounded-tl-[4px] bg-surface-2 text-ink",
        ].join(" ")}
      >
        {message.content}
      </div>
      {!isUser && message.citations && message.citations.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {message.citations.map((c, i) => (
            <button
              key={i}
              onClick={() => onSeek?.(c.start_time)}
              title={c.snippet}
              disabled={!onSeek}
              className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2 py-0.5 font-mono text-[11px] text-ink-2 transition-colors enabled:hover:border-accent enabled:hover:text-accent disabled:opacity-70"
            >
              {fmtTs(c.start_time)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Shell({ children, onClear }: { children: React.ReactNode; onClear?: () => void }) {
  return (
    <section className="rounded-[16px] border border-line bg-surface p-3.5 shadow-card-sm">
      <div className="mb-1 flex items-center justify-between px-1">
        <h2 className="flex items-center gap-2 font-mono text-[11.5px] font-semibold uppercase tracking-[.1em] text-ink-2">
          <ChatIcon size={15} />
          Chat
        </h2>
        {onClear && (
          <button
            onClick={onClear}
            title="Clear thread"
            className="rounded p-1 text-ink-3 transition-colors hover:text-status-red"
          >
            <TrashIcon size={15} />
          </button>
        )}
      </div>
      {children}
    </section>
  );
}
