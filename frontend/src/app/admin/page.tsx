"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { adminApi, DiagCheck, DiagStatus } from "@/lib/api";
import { useAuth } from "@/lib/useAuth";
import { Spinner } from "@/components/ui/Spinner";
import { AppShell } from "@/components/layout/AppShell";
import { AlertIcon, ChevronIcon } from "@/components/ui/icons";

// ── Types mirroring the backend schema ──────────────────────────────────────

interface SettingEntry {
  key: string;
  label: string;
  section: string;
  description: string;
  type: "select" | "bool" | "text" | "number" | "float" | "password";
  options?: string[];
  restart_required: boolean;
  current_value: string;
  has_db_override: boolean;
  db_value?: string;
}

interface SettingsResponse {
  settings: SettingEntry[];
  warnings: { default_secret_key: boolean };
}

interface PatchResponse {
  saved: string[];
  restart_required: string[];
}

function groupBySection(settings: SettingEntry[]) {
  return settings.reduce<Record<string, SettingEntry[]>>((acc, s) => {
    (acc[s.section] ??= []).push(s);
    return acc;
  }, {});
}

// ── Pills ────────────────────────────────────────────────────────────────────

function Pill({ children, tone }: { children: React.ReactNode; tone: "accent" | "amber" }) {
  const style =
    tone === "accent"
      ? { background: "var(--accent-weak)", color: "var(--accent)" }
      : { background: "color-mix(in srgb, #C8862A 16%, transparent)", color: "#C8862A" };
  return (
    <span
      className="rounded-full px-2 py-[3px] font-mono text-[9.5px] font-semibold uppercase tracking-[.06em]"
      style={style}
    >
      {children}
    </span>
  );
}

// ── Diagnostics ──────────────────────────────────────────────────────────────

const DIAG_COLORS: Record<DiagStatus, string> = {
  ok: "#1F9D6B",
  warn: "#C8862A",
  fail: "#E0533A",
  skip: "var(--ink-3)",
};
const DIAG_LABELS: Record<DiagStatus, string> = {
  ok: "OK",
  warn: "Warn",
  fail: "Fail",
  skip: "Skip",
};

function DiagRow({ check }: { check: DiagCheck }) {
  const color = DIAG_COLORS[check.status];
  return (
    <div className="flex items-start gap-3 border-b border-line px-[22px] py-[14px] last:border-b-0">
      <span
        className="mt-0.5 inline-flex shrink-0 items-center justify-center rounded-full px-2 py-[3px] font-mono text-[10px] font-semibold uppercase tracking-[.06em]"
        style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}
      >
        {DIAG_LABELS[check.status]}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold text-ink">{check.label}</p>
        <p className="mt-0.5 break-words font-mono text-[12px] text-ink-2">{check.detail}</p>
      </div>
    </div>
  );
}

function Diagnostics() {
  const [checks, setChecks] = useState<DiagCheck[] | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await adminApi.diagnostics();
      setChecks(res.checks);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to run diagnostics");
    } finally {
      setRunning(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-[16px] border border-line bg-surface shadow-card-sm">
      <div className="flex items-center justify-between gap-3 border-b border-line bg-surface-2 px-[22px] py-[14px]">
        <div>
          <h2 className="font-mono text-[11.5px] font-semibold uppercase tracking-[.1em] text-ink-2">Diagnostics</h2>
          <p className="mt-0.5 text-[12px] text-ink-3">Test database, Redis, worker, Ollama, HuggingFace, and storage.</p>
        </div>
        <button
          onClick={run}
          disabled={running}
          className="inline-flex shrink-0 items-center gap-2 rounded-[10px] border border-line bg-surface px-3.5 py-2 text-[13px] font-semibold text-ink-2 transition-colors hover:text-ink disabled:opacity-60"
        >
          {running && <Spinner size="sm" />}
          {running ? "Testing…" : checks ? "Re-run tests" : "Run tests"}
        </button>
      </div>

      {error && (
        <p
          className="px-[22px] py-3 text-[13px]"
          style={{ background: "color-mix(in srgb, #E0533A 10%, transparent)", color: "#E0533A" }}
        >
          {error}
        </p>
      )}

      {checks ? (
        <div>
          {checks.map((c) => (
            <DiagRow key={c.key} check={c} />
          ))}
        </div>
      ) : (
        !error && (
          <p className="px-[22px] py-5 text-[13px] text-ink-3">
            Run the tests to verify each integration is reachable and configured correctly.
          </p>
        )
      )}
    </section>
  );
}

// ── Controls ─────────────────────────────────────────────────────────────────

function SettingControl({
  entry,
  value,
  onChange,
}: {
  entry: SettingEntry;
  value: string;
  onChange: (v: string) => void;
}) {
  if (entry.type === "bool") {
    const on = value === "true";
    return (
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => onChange(on ? "false" : "true")}
        className="relative h-[26px] w-[46px] rounded-full transition-colors"
        style={{ background: on ? "var(--accent)" : "var(--border-strong)" }}
      >
        <span
          className="absolute top-[3px] h-5 w-5 rounded-full bg-white shadow transition-[left]"
          style={{ left: on ? 23 : 3 }}
        />
      </button>
    );
  }

  if (entry.type === "select" && entry.options) {
    return (
      <div className="relative w-full">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none rounded-[10px] border border-line bg-inset px-3 py-2 pr-9 text-right font-mono text-[13px] text-ink focus:border-accent focus:outline-none"
        >
          {entry.options.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-3">
          <ChevronIcon size={16} />
        </span>
      </div>
    );
  }

  const isNumeric = entry.type === "number" || entry.type === "float";
  return (
    <input
      type={entry.type === "password" ? "password" : isNumeric ? "number" : "text"}
      step={entry.type === "float" ? "0.01" : undefined}
      value={value}
      placeholder={entry.type === "password" ? "Enter token…" : undefined}
      autoComplete={entry.type === "password" ? "off" : undefined}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-[10px] border border-line bg-inset px-3 py-2 text-right font-mono text-[13px] text-ink focus:border-accent focus:outline-none"
    />
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [data, setData] = useState<SettingsResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<PatchResponse | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [user, authLoading, router]);

  const loadSettings = useCallback(async () => {
    try {
      const resp = (await adminApi.getSettings()) as SettingsResponse;
      setData(resp);
      const initial: Record<string, string> = {};
      for (const s of resp.settings) initial[s.key] = s.current_value ?? "";
      setDraft(initial);
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : "Failed to load settings");
    }
  }, []);

  useEffect(() => {
    if (user) loadSettings();
  }, [user, loadSettings]);

  const handleSave = async () => {
    if (!data) return;
    setSaving(true);
    setSaveResult(null);
    setSaveError(null);

    const changed: Record<string, string> = {};
    for (const s of data.settings) {
      if (draft[s.key] !== s.current_value) changed[s.key] = draft[s.key];
    }
    if (Object.keys(changed).length === 0) {
      setSaving(false);
      return;
    }

    try {
      const result = (await adminApi.patchSettings(changed)) as PatchResponse;
      setSaveResult(result);
      await loadSettings();
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  const sections = data ? groupBySection(data.settings) : {};
  const hasChanges = data ? data.settings.some((s) => draft[s.key] !== s.current_value) : false;
  const pendingRestartKeys = saveResult?.restart_required ?? [];

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-[720px] px-[26px] pb-20 pt-10">
        <p className="font-mono text-[12px] font-semibold uppercase tracking-[.1em] text-accent">
          Configuration
        </p>
        <h1 className="mt-1.5 font-display text-[32px] font-bold tracking-[-.02em] text-ink">
          Settings
        </h1>
        <p className="mt-1 max-w-[60ch] text-[14px] text-ink-2">
          Saved to the database and persisted across container restarts. Items marked{" "}
          <span className="font-semibold" style={{ color: "#C8862A" }}>restart required</span>{" "}
          take effect after the next restart.
        </p>

        {data?.warnings.default_secret_key && (
          <div
            className="mt-6 flex gap-3 rounded-[14px] border px-[18px] py-[15px]"
            style={{
              background: "color-mix(in srgb, #E0533A 9%, var(--surface))",
              borderColor: "color-mix(in srgb, #E0533A 26%, transparent)",
            }}
          >
            <span className="mt-px shrink-0" style={{ color: "#E0533A" }}>
              <AlertIcon />
            </span>
            <p className="text-[13.5px] text-ink">
              <strong className="font-bold">Security warning:</strong> SECRET_KEY is set to the default
              placeholder. Set a strong random key via the{" "}
              <code className="rounded-[5px] bg-inset px-1.5 py-px font-mono text-[12.5px]">SECRET_KEY</code>{" "}
              environment variable before exposing this service.
            </p>
          </div>
        )}

        {pendingRestartKeys.length > 0 && (
          <div
            className="mt-4 rounded-[12px] border px-4 py-3 text-sm"
            style={{
              background: "color-mix(in srgb, #C8862A 10%, transparent)",
              borderColor: "color-mix(in srgb, #C8862A 26%, transparent)",
              color: "#C8862A",
            }}
          >
            <strong>Restart required</strong> — saved, but these take effect after a restart:{" "}
            <span className="font-mono">{pendingRestartKeys.join(", ")}</span>.
          </div>
        )}

        {saveError && (
          <div
            className="mt-4 rounded-[12px] px-4 py-3 text-sm"
            style={{ background: "color-mix(in srgb, #E0533A 10%, transparent)", color: "#E0533A" }}
          >
            {saveError}
          </div>
        )}

        <div className="mt-6">
          <Diagnostics />
        </div>

        {loadError ? (
          <div
            className="mt-6 rounded-[12px] px-4 py-3 text-sm"
            style={{ background: "color-mix(in srgb, #E0533A 10%, transparent)", color: "#E0533A" }}
          >
            {loadError}
          </div>
        ) : !data ? (
          <div className="flex justify-center py-24">
            <Spinner size="lg" />
          </div>
        ) : (
          <div className="mt-6 flex flex-col gap-[18px]">
            {Object.entries(sections).map(([section, entries]) => (
              <section
                key={section}
                className="overflow-hidden rounded-[16px] border border-line bg-surface shadow-card-sm"
              >
                <div className="border-b border-line bg-surface-2 px-[22px] py-[14px]">
                  <h2 className="font-mono text-[11.5px] font-semibold uppercase tracking-[.1em] text-ink-2">
                    {section}
                  </h2>
                </div>
                <div>
                  {entries.map((entry) => (
                    <div
                      key={entry.key}
                      className="flex items-start gap-5 border-b border-line px-[22px] py-[18px] last:border-b-0"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[14.5px] font-semibold text-ink">{entry.label}</span>
                          {entry.restart_required && <Pill tone="amber">Restart required</Pill>}
                          {entry.has_db_override && <Pill tone="accent">Overridden</Pill>}
                        </div>
                        <p className="mt-[3px] text-[13px] text-ink-2">{entry.description}</p>
                      </div>
                      <div className="flex w-[188px] shrink-0 justify-end">
                        <SettingControl
                          entry={entry}
                          value={draft[entry.key] ?? ""}
                          onChange={(v) => setDraft((d) => ({ ...d, [entry.key]: v }))}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        <div className="mt-6 flex items-center justify-between">
          <button
            onClick={() => router.push("/")}
            className="text-[13.5px] font-semibold text-ink-2 transition-colors hover:text-ink"
          >
            ← Back to meetings
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className="inline-flex items-center gap-2 rounded-[12px] bg-accent px-[22px] py-[11px] text-[14px] font-bold text-on-accent shadow-glow transition-opacity disabled:opacity-50"
          >
            {saving && <Spinner size="sm" className="border-on-accent/40 border-t-on-accent" />}
            {saving ? "Saving…" : "Save settings"}
          </button>
        </div>
      </main>
    </AppShell>
  );
}
