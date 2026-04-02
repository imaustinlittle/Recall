"use client";

import { useEffect, useState, useRef } from "react";
import { Job } from "./types";
import { jobs as jobsApi } from "./api";

const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled"]);

/**
 * Subscribes to a job's progress via WebSocket, falling back to HTTP polling
 * if the WS connection fails (e.g. reverse proxy doesn't support WS).
 *
 * Returns the latest Job object, or null while loading.
 */
export function useJobStatus(jobId: string | null): Job | null {
  const [job, setJob] = useState<Job | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!jobId) return;

    let settled = false;

    const stopPolling = () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };

    const startPolling = () => {
      pollRef.current = setInterval(async () => {
        try {
          const data = (await jobsApi.get(jobId)) as Job;
          setJob(data);
          if (TERMINAL_STATUSES.has(data.status)) {
            stopPolling();
            settled = true;
          }
        } catch {
          // swallow — keep polling
        }
      }, 2000);
    };

    // Derive WS URL from current page origin
    const wsProtocol = window.location.protocol === "https:" ? "wss" : "ws";
    const wsHost = window.location.host;
    const wsUrl = `${wsProtocol}://${wsHost}/ws/jobs/${jobId}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as Partial<Job>;
        setJob((prev) => ({ ...(prev ?? {}), ...data } as Job));
        if (data.status && TERMINAL_STATUSES.has(data.status)) {
          ws.close();
          settled = true;
        }
      } catch {
        // ignore malformed message
      }
    };

    ws.onerror = () => {
      // WS failed — fall back to polling
      if (!settled) startPolling();
    };

    ws.onclose = () => {
      if (!settled) startPolling();
    };

    return () => {
      settled = true;
      ws.close();
      stopPolling();
    };
  }, [jobId]);

  return job;
}
