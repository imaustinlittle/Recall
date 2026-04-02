/**
 * Typed API client.
 * Reads the auth token from localStorage and attaches it to every request.
 * All methods throw on non-2xx responses with the server's error detail.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL
  ? `${process.env.NEXT_PUBLIC_API_URL}/api`
  : "/api";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("access_token");
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.body instanceof FormData
      ? {}
      : { "Content-Type": "application/json" }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers as Record<string, string>),
  };

  const res = await fetch(`${BASE}${path}`, { ...options, headers });

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
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      throw new Error(json.detail ?? "Login failed");
    }
    const data = await res.json();
    localStorage.setItem("access_token", data.access_token);
    return data;
  },

  logout: () => {
    localStorage.removeItem("access_token");
  },

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
    const token = getToken();
    const form = new FormData();
    form.append("file", file);

    const xhr = new XMLHttpRequest();

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
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
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
