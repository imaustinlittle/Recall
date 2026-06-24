/**
 * Typed API client.
 * Auth is handled via httpOnly cookies set by the login endpoint.
 * All requests include credentials (cookies) automatically.
 * No token storage in JavaScript — immune to XSS token theft.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL
  ? `${process.env.NEXT_PUBLIC_API_URL}/api`
  : "/api";

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.body instanceof FormData
      ? {}
      : { "Content-Type": "application/json" }),
    ...(options.headers as Record<string, string>),
  };

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers,
    credentials: "include",  // send/receive httpOnly auth cookie
  });

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const json = await res.json();
      detail = json.detail ?? detail;
    } catch {
      // ignore
    }
    throw new Error(detail);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ── Setup ──────────────────────────────────────────────────────────────────
export const setup = {
  status: () => request<{ needs_setup: boolean }>("/auth/setup/status"),
};

// ── Auth mode (local vs proxy / Authentik forward-auth) ─────────────────────
export interface AuthConfig {
  mode: "local" | "proxy";
  registration_enabled: boolean;
  logout_url: string | null;
}

// ── Auth ───────────────────────────────────────────────────────────────────
export const auth = {
  register: (email: string, password: string, display_name?: string) =>
    request("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, display_name }),
    }),

  login: async (email: string, password: string) => {
    const form = new URLSearchParams({ username: email, password });
    const res = await fetch(`${BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      credentials: "include",  // receive the httpOnly cookie
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      throw new Error(json.detail ?? "Login failed");
    }
    return res.json();
  },

  logout: () =>
    request("/auth/logout", { method: "POST" }).catch(() => {}),

  me: () => request("/auth/me"),

  config: () => request<AuthConfig>("/auth/config"),
};

// ── Meetings ───────────────────────────────────────────────────────────────
export const meetings = {
  list: (params?: { page?: number; limit?: number; status?: string; date_from?: string; date_to?: string; folder?: string; tag?: string }) => {
    const q = new URLSearchParams();
    if (params?.page)      q.set("page", String(params.page));
    if (params?.limit)     q.set("limit", String(params.limit));
    if (params?.status)    q.set("status", params.status);
    if (params?.date_from) q.set("date_from", params.date_from);
    if (params?.date_to)   q.set("date_to", params.date_to);
    if (params?.folder)    q.set("folder", params.folder);
    if (params?.tag)       q.set("tag", params.tag);
    return request(`/meetings?${q}`);
  },

  tags: () => request<{ tag: string; count: number }[]>("/meetings/tags"),

  create: (body: { title?: string; description?: string; tags?: string[] }) =>
    request("/meetings", { method: "POST", body: JSON.stringify(body) }),

  get: (id: string) => request(`/meetings/${id}`),

  update: (id: string, body: object) =>
    request(`/meetings/${id}`, { method: "PATCH", body: JSON.stringify(body) }),

  delete: (id: string) => request(`/meetings/${id}`, { method: "DELETE" }),

  summarize: (id: string) =>
    request(`/meetings/${id}/summarize`, { method: "POST" }),

  importNotesFromSummary: (id: string) =>
    request(`/meetings/${id}/notes/from-summary`, { method: "POST" }),
};

// ── Media ──────────────────────────────────────────────────────────────────
export const media = {
  list: (meetingId: string) => request<{ id: string; file_path: string; mime_type: string | null }[]>(`/meetings/${meetingId}/media`),
};

// ── Upload ─────────────────────────────────────────────────────────────────
export function uploadMedia(
  meetingId: string,
  file: File,
  onProgress?: (pct: number) => void
): Promise<{ id: string; status: string; meeting_id: string }> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);

    const xhr = new XMLHttpRequest();
    xhr.withCredentials = true;  // send auth cookie

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(e.loaded / e.total);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        try {
          const err = JSON.parse(xhr.responseText);
          reject(new Error(err.detail ?? `Upload failed: ${xhr.status}`));
        } catch {
          reject(new Error(`Upload failed: ${xhr.status}`));
        }
      }
    };

    xhr.onerror = () => reject(new Error("Network error during upload"));

    xhr.open("POST", `${BASE}/meetings/${meetingId}/upload`);
    xhr.send(form);
  });
}

// ── Jobs ───────────────────────────────────────────────────────────────────
export const jobs = {
  get: (jobId: string) => request(`/jobs/${jobId}`),
  list: (meetingId: string) => request(`/meetings/${meetingId}/jobs`),
};

// ── Transcript ─────────────────────────────────────────────────────────────
export const transcript = {
  get: (meetingId: string) => request(`/meetings/${meetingId}/transcript`),

  update: (meetingId: string, segmentId: string, body: object) =>
    request(`/meetings/${meetingId}/transcript/${segmentId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  split: (meetingId: string, body: { segment_id: string; split_at_time: number }) =>
    request(`/meetings/${meetingId}/transcript/split`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  merge: (meetingId: string, body: { segment_ids: string[] }) =>
    request(`/meetings/${meetingId}/transcript/merge`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
};

// ── Speakers ───────────────────────────────────────────────────────────────
export const speakers = {
  list: (meetingId: string) => request(`/meetings/${meetingId}/speakers`),

  update: (meetingId: string, speakerId: string, body: object) =>
    request(`/meetings/${meetingId}/speakers/${speakerId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  merge: (meetingId: string, body: { source_id: string; target_id: string }) =>
    request(`/meetings/${meetingId}/speakers/merge`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
};

// ── Notes ──────────────────────────────────────────────────────────────────
export const notes = {
  list: (meetingId: string) =>
    request(`/meetings/${meetingId}/notes`),

  create: (meetingId: string, body: { note_type?: string; body: string; timestamp_ref?: number | null }) =>
    request(`/meetings/${meetingId}/notes`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  update: (meetingId: string, noteId: string, body: { note_type?: string; body?: string; timestamp_ref?: number | null }) =>
    request(`/meetings/${meetingId}/notes/${noteId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  delete: (meetingId: string, noteId: string) =>
    request(`/meetings/${meetingId}/notes/${noteId}`, { method: "DELETE" }),
};

// ── Export ─────────────────────────────────────────────────────────────────
export function exportTranscript(
  meetingId: string,
  format: "txt" | "md" | "srt" | "vtt" | "pdf"
): void {
  // Trigger a browser download by navigating to the endpoint
  const url = `${BASE}/meetings/${meetingId}/export?format=${format}`;
  const a = document.createElement("a");
  a.href = url;
  a.download = "";
  // Include credentials via fetch, then create object URL
  fetch(url, { credentials: "include" })
    .then((res) => {
      if (!res.ok) throw new Error(`Export failed: ${res.status}`);
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const filenameMatch = disposition.match(/filename="([^"]+)"/);
      const filename = filenameMatch?.[1] ?? `transcript.${format}`;
      return res.blob().then((blob) => ({ blob, filename }));
    })
    .then(({ blob, filename }) => {
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    })
    .catch((err) => console.error("Export error:", err));
}

// ── Admin ──────────────────────────────────────────────────────────────────
export type DiagStatus = "ok" | "warn" | "fail" | "skip";
export interface DiagCheck {
  key: string;
  label: string;
  section: string;
  status: DiagStatus;
  detail: string;
}
export interface DiagnosticsOut {
  checks: DiagCheck[];
  summary: { ok: number; warn: number; fail: number };
}

export const adminApi = {
  getSettings: () => request("/admin/settings"),
  patchSettings: (body: Record<string, string>) =>
    request("/admin/settings", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  diagnostics: () => request<DiagnosticsOut>("/admin/diagnostics"),
};

// ── Search ─────────────────────────────────────────────────────────────────
export const searchApi = {
  search: (q: string, limit = 30) =>
    request(`/search?q=${encodeURIComponent(q)}&limit=${limit}`),
};

// ── Transcript chat ────────────────────────────────────────────────────────
import type { ChatThread, ChatCitation } from "./types";

export const chatApi = {
  get: (meetingId: string) => request<ChatThread>(`/meetings/${meetingId}/chat`),

  index: (meetingId: string) =>
    request<{ status: string }>(`/meetings/${meetingId}/chat/index`, { method: "POST" }),

  clear: (meetingId: string) =>
    request(`/meetings/${meetingId}/chat`, { method: "DELETE" }),
};

/**
 * Ask a question and stream the answer via Server-Sent Events.
 * Returns an abort function. Callbacks fire as tokens arrive.
 */
export function streamChat(
  meetingId: string,
  message: string,
  handlers: {
    onToken: (text: string) => void;
    onDone: (citations: ChatCitation[]) => void;
    onError: (detail: string) => void;
  }
): () => void {
  const controller = new AbortController();

  (async () => {
    let res: Response;
    try {
      res = await fetch(`${BASE}/meetings/${meetingId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
        credentials: "include",
        signal: controller.signal,
      });
    } catch (e) {
      if (!controller.signal.aborted) handlers.onError("Network error");
      return;
    }

    if (!res.ok || !res.body) {
      let detail = `HTTP ${res.status}`;
      try { detail = (await res.json()).detail ?? detail; } catch { /* ignore */ }
      handlers.onError(detail);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE frames are separated by a blank line.
        let sep: number;
        while ((sep = buffer.indexOf("\n\n")) !== -1) {
          const frame = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          const line = frame.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          const payload = JSON.parse(line.slice(5).trim());
          if (payload.type === "token") handlers.onToken(payload.text);
          else if (payload.type === "done") handlers.onDone(payload.citations ?? []);
          else if (payload.type === "error") handlers.onError(payload.detail ?? "Error");
        }
      }
    } catch {
      if (!controller.signal.aborted) handlers.onError("Stream interrupted");
    }
  })();

  return () => controller.abort();
}

// ── Folders ────────────────────────────────────────────────────────────────
import type { Folder } from "./types";

export const foldersApi = {
  list: () => request<Folder[]>("/folders"),

  create: (body: { name: string; color_hex?: string }) =>
    request<Folder>("/folders", { method: "POST", body: JSON.stringify(body) }),

  update: (id: string, body: { name?: string; color_hex?: string }) =>
    request<Folder>(`/folders/${id}`, { method: "PATCH", body: JSON.stringify(body) }),

  delete: (id: string) => request(`/folders/${id}`, { method: "DELETE" }),
};

// ── Global speakers ────────────────────────────────────────────────────────
export const speakersApi = {
  listAll: () => request("/speakers"),
  meetingsForSpeaker: (name: string) =>
    request(`/speakers/${encodeURIComponent(name)}/meetings`),
};

// ── Voice profiles ─────────────────────────────────────────────────────────
import type { VoiceProfile } from "./types";

export const voiceProfilesApi = {
  list: () => request<VoiceProfile[]>("/voice-profiles"),

  enroll: (speaker_id: string, name: string) =>
    request<VoiceProfile>("/voice-profiles", {
      method: "POST",
      body: JSON.stringify({ speaker_id, name }),
    }),

  rename: (id: string, name: string) =>
    request<VoiceProfile>(`/voice-profiles/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    }),

  delete: (id: string) => request(`/voice-profiles/${id}`, { method: "DELETE" }),
};

