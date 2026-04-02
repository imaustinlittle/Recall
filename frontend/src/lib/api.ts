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
};

// ── Meetings ───────────────────────────────────────────────────────────────
export const meetings = {
  list: (params?: { page?: number; limit?: number; status?: string }) => {
    const q = new URLSearchParams();
    if (params?.page)   q.set("page", String(params.page));
    if (params?.limit)  q.set("limit", String(params.limit));
    if (params?.status) q.set("status", params.status);
    return request(`/meetings?${q}`);
  },

  create: (body: { title?: string; description?: string; tags?: string[] }) =>
    request("/meetings", { method: "POST", body: JSON.stringify(body) }),

  get: (id: string) => request(`/meetings/${id}`),

  update: (id: string, body: object) =>
    request(`/meetings/${id}`, { method: "PATCH", body: JSON.stringify(body) }),

  delete: (id: string) => request(`/meetings/${id}`, { method: "DELETE" }),
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

// ── Admin ──────────────────────────────────────────────────────────────────
export const adminApi = {
  getSettings: () => request("/admin/settings"),
  patchSettings: (body: Record<string, string>) =>
    request("/admin/settings", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
};
