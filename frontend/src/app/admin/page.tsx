"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { adminApi } from "@/lib/api";
import { useAuth } from "@/lib/useAuth";
import { Spinner } from "@/components/ui/Spinner";

// ── Types mirroring the backend schema ──────────────────────────────────────

interface SettingEntry {
  key: string;
  label: string;
  section: string;
  description: string;
  type: "select" | "bool" | "text" | "number" | "password";
  options?: string[];
  restart_required: boolean;
  current_value: string;
  has_db_override: boolean;
  db_value?: string;
}

interface SettingsResponse {
  settings: SettingEntry[];
  warnings: {
    default_secret_key: boolean;
  };
}

interface PatchResponse {
  saved: string[];
  restart_required: string[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function groupBySection(settings: SettingEntry[]) {
  return settings.reduce<Record<string, SettingEntry[]>>((acc, s) => {
    (acc[s.section] ??= []).push(s);
    return acc;
  }, {});
}

// ── Sub-components ───────────────────────────────────────────────────────────

function SettingInput({
  entry,
  value,
  onChange,
}: {
  entry: SettingEntry;
  value: string;
  onChange: (v: string) => void;
}) {
  const base =
    "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 " +
    "focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent";

  if (entry.type === "select" && entry.options) {
    return (
      <select className={base} value={value} onChange={(e) => onChange(e.target.value)}>
        {entry.options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    );
  }

  if (entry.type === "bool") {
    return (
      <div className="flex items-center gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={value === "true"}
          onClick={() => onChange(value === "true" ? "false" : "true")}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            value === "true" ? "bg-brand-600" : "bg-gray-300"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              value === "true" ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
        <span className="text-sm text-gray-600">{value === "true" ? "Enabled" : "Disabled"}</span>
      </div>
    );
  }

  if (entry.type === "password") {
    return (
      <input
        type="password"
        className={base}
        value={value}
        placeholder="Enter token…"
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
      />
    );
  }

  if (entry.type === "number") {
    return (
      <input
        type="number"
        className={base}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  return (
    <input
      type="text"
      className={base}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

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
      // Seed draft with current effective values
      const initial: Record<string, string> = {};
      for (const s of resp.settings) {
        initial[s.key] = s.current_value ?? "";
      }
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

    // Only send keys whose draft value differs from the current effective value
    const changed: Record<string, string> = {};
    for (const s of data.settings) {
      if (draft[s.key] !== s.current_value) {
        changed[s.key] = draft[s.key];
      }
    }

    if (Object.keys(changed).length === 0) {
      setSaving(false);
      return;
    }

    try {
      const result = (await adminApi.patchSettings(changed)) as PatchResponse;
      setSaveResult(result);
      await loadSettings(); // refresh to show new current values
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  const sections = data ? groupBySection(data.settings) : {};
  const hasChanges = data
    ? data.settings.some((s) => draft[s.key] !== s.current_value)
    : false;
  const pendingRestartKeys = saveResult?.restart_required ?? [];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Nav */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-xl font-semibold text-brand-600">
            Recall
          </Link>
          <span className="text-gray-300">/</span>
          <span className="text-sm font-medium text-gray-600">Settings</span>
        </div>
        <span className="text-sm text-gray-500">{user.email}</span>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10 space-y-8">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Application Settings</h1>
          <p className="text-sm text-gray-500 mt-1">
            Changes are saved to the database and survive container restarts.
            Settings marked <span className="font-medium text-amber-600">Restart Required</span> take
            effect after you restart the container.
          </p>
        </div>

        {/* Warnings */}
        {data?.warnings.default_secret_key && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <strong>Security warning:</strong> SECRET_KEY is set to the default placeholder value.
            Set a strong random key via the <code className="font-mono">SECRET_KEY</code> environment
            variable before exposing this service publicly.
          </div>
        )}

        {/* Restart notice */}
        {pendingRestartKeys.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <strong>Restart required</strong> — the following settings were saved but won&apos;t take
            effect until you restart the container:{" "}
            <span className="font-mono">{pendingRestartKeys.join(", ")}</span>.
          </div>
        )}

        {/* Save error */}
        {saveError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {saveError}
          </div>
        )}

        {/* Loading / error */}
        {loadError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {loadError}
          </div>
        ) : !data ? (
          <div className="flex justify-center py-24">
            <Spinner size="lg" />
          </div>
        ) : (
          <>
            {Object.entries(sections).map(([section, entries]) => (
              <section key={section} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
                  <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                    {section}
                  </h2>
                </div>
                <div className="divide-y divide-gray-100">
                  {entries.map((entry) => (
                    <div key={entry.key} className="px-6 py-5">
                      <div className="flex items-start justify-between gap-4 mb-2">
                        <div>
                          <label className="text-sm font-medium text-gray-900">
                            {entry.label}
                          </label>
                          {entry.restart_required && (
                            <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                              Restart required
                            </span>
                          )}
                          {entry.has_db_override && (
                            <span className="ml-2 inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                              Overridden
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 mb-3">{entry.description}</p>
                      <SettingInput
                        entry={entry}
                        value={draft[entry.key] ?? ""}
                        onChange={(v) => setDraft((d) => ({ ...d, [entry.key]: v }))}
                      />
                    </div>
                  ))}
                </div>
              </section>
            ))}

            {/* Save button */}
            <div className="flex items-center justify-between pt-2">
              <Link href="/" className="text-sm text-gray-500 hover:text-gray-700">
                ← Back to meetings
              </Link>
              <button
                onClick={handleSave}
                disabled={saving || !hasChanges}
                className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors disabled:opacity-50"
              >
                {saving && <Spinner size="sm" />}
                {saving ? "Saving…" : "Save settings"}
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
