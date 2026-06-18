"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, setup } from "@/lib/api";
import { Spinner } from "@/components/ui/Spinner";
import { Logo } from "@/components/layout/Logo";
import { useTheme } from "@/lib/useTheme";
import { MoonIcon, SunIcon } from "@/components/ui/icons";
import { bars } from "@/lib/waveform";

type Screen = "loading" | "setup" | "login" | "proxy";

const HERO_BARS = bars(42, 60, 18);

export default function LoginPage() {
  const router = useRouter();
  const { theme, toggle } = useTheme();
  const [screen, setScreen] = useState<Screen>("loading");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    auth
      .config()
      .then(async (cfg) => {
        if (cfg.mode === "proxy") {
          // Identity comes from the upstream proxy (e.g. Authentik). If the
          // headers are present, /me succeeds and we go straight in.
          try {
            await auth.me();
            router.replace("/");
          } catch {
            setScreen("proxy");
          }
          return;
        }
        const { needs_setup } = await setup.status();
        setScreen(needs_setup ? "setup" : "login");
      })
      .catch(() => setScreen("login"));
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (screen === "setup") {
        await auth.register(email, password, displayName);
      }
      await auth.login(email, password);
      router.push("/");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  if (screen === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (screen === "proxy") {
    return (
      <div className="relative flex min-h-screen items-center justify-center px-6">
        <div className="relative z-[2] w-full max-w-[392px]">
          <div className="mb-[26px] flex flex-col items-center gap-[14px]">
            <Logo size={30} markHeight={30} barWidth={4} />
          </div>
          <div className="rounded-[20px] border border-line bg-surface p-[30px] text-center shadow-card">
            <h2 className="font-display text-base font-bold text-ink">Sign in via your identity provider</h2>
            <p className="mt-2 text-[13.5px] text-ink-2">
              This instance authenticates through an upstream proxy, but no identity was
              received. Sign in to the proxy (e.g. Authentik), then reload this page.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="mt-5 w-full rounded-[11px] bg-accent px-3 py-[13px] text-[14.5px] font-bold text-on-accent shadow-glow"
            >
              Reload
            </button>
          </div>
        </div>
      </div>
    );
  }

  const inputClasses =
    "w-full rounded-[11px] border border-line bg-inset px-[14px] py-[12px] text-[14.5px] text-ink outline-none transition-shadow focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-weak)]";
  const labelClasses =
    "font-mono text-[12.5px] font-semibold tracking-[.02em] text-ink-2";

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-6">
      {/* Hero waveform backdrop */}
      <div
        className="pointer-events-none absolute inset-0 flex items-center gap-[3px] px-[6%] opacity-50"
        aria-hidden="true"
      >
        {HERO_BARS.map((h, i) => (
          <div
            key={i}
            className="flex-1 rounded-[3px] bg-wave"
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 80% at 50% 8%, transparent, var(--bg) 62%)",
        }}
      />

      {/* Theme toggle */}
      <button
        onClick={toggle}
        className="absolute right-[22px] top-[22px] z-10 inline-flex items-center gap-[7px] rounded-full border border-line bg-surface px-3 py-2 text-[12px] font-semibold text-ink-2 shadow-card-sm"
      >
        {theme === "dark" ? <SunIcon /> : <MoonIcon />}
        <span>{theme === "dark" ? "Light" : "Dark"}</span>
      </button>

      <div className="relative z-[2] w-full max-w-[392px]">
        <div className="mb-[26px] flex flex-col items-center gap-[14px]">
          <Logo size={30} markHeight={30} barWidth={4} />
          <p className="text-center text-[14.5px] text-ink-2">
            Record, transcribe, and recall your meetings.
          </p>
        </div>

        <div className="rounded-[20px] border border-line bg-surface p-[30px] shadow-card">
          {screen === "setup" && (
            <div className="mb-5">
              <h2 className="font-display text-base font-bold text-ink">
                Welcome — set up your account
              </h2>
              <p className="mt-1 text-[13.5px] text-ink-2">
                Create the admin account to get started.
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {screen === "setup" && (
              <div className="flex flex-col gap-[5px]">
                <label className={labelClasses}>Name</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className={inputClasses}
                  placeholder="Your name"
                />
              </div>
            )}

            <div className="flex flex-col gap-[5px]">
              <label className={labelClasses}>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className={inputClasses}
                placeholder="ops@homelab.dev"
              />
            </div>

            <div className="flex flex-col gap-[5px]">
              <label className={labelClasses}>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className={inputClasses}
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p
                className="rounded-[10px] px-3 py-2 text-[13px] font-medium"
                style={{
                  background: "color-mix(in srgb, #E0533A 12%, transparent)",
                  color: "#E0533A",
                }}
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-1 flex w-full items-center justify-center gap-2 rounded-[11px] bg-accent px-3 py-[13px] text-[14.5px] font-bold text-on-accent shadow-glow transition-opacity disabled:opacity-60"
            >
              {loading && <Spinner size="sm" className="border-on-accent/40 border-t-on-accent" />}
              {screen === "setup" ? "Create account" : "Sign in"}
            </button>
          </form>
        </div>

        <p className="mt-[18px] text-center font-mono text-[12px] tracking-[.04em] text-ink-3">
          SELF-HOSTED · v1.0 · localhost:3000
        </p>
      </div>
    </div>
  );
}
