"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/useAuth";
import { useTheme } from "@/lib/useTheme";
import { Logo } from "./Logo";
import { MoonIcon, SunIcon } from "@/components/ui/icons";

const NAV = [
  { href: "/", label: "Meetings", match: (p: string) => p === "/" || p.startsWith("/meetings") },
  { href: "/search", label: "Search", match: (p: string) => p.startsWith("/search") },
  { href: "/speakers", label: "Speakers", match: (p: string) => p.startsWith("/speakers") },
  { href: "/admin", label: "Settings", match: (p: string) => p.startsWith("/admin") },
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function AppHeader() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const name = user?.display_name || user?.email?.split("@")[0] || "user";
  const role = user?.is_admin ? "operator" : "member";

  return (
    <header
      className="sticky top-0 z-30 flex h-[62px] items-center gap-[18px] border-b border-line px-[26px] backdrop-blur-[10px]"
      style={{ background: "color-mix(in srgb, var(--bg) 86%, transparent)" }}
    >
      <Link href="/" className="shrink-0">
        <Logo />
      </Link>

      <nav className="ml-2.5 flex items-center gap-[3px]">
        {NAV.map((item) => {
          const active = item.match(pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "rounded-[9px] px-[13px] py-[7px] text-[13.5px] font-semibold transition-colors",
                active
                  ? "bg-accent-weak text-accent"
                  : "text-ink-2 hover:text-ink",
              ].join(" ")}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="flex-1" />

      <button
        onClick={toggle}
        title="Toggle theme"
        aria-label="Toggle theme"
        className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-line bg-surface text-ink-2 transition-colors hover:text-ink"
      >
        {theme === "dark" ? <SunIcon /> : <MoonIcon />}
      </button>

      <div className="relative pl-1" ref={menuRef}>
        <button
          onClick={() => setMenuOpen((o) => !o)}
          className="flex items-center gap-2.5"
        >
          <span className="hidden font-mono text-[12.5px] text-ink-2 sm:inline">
            {name} · {role}
          </span>
          <span className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-accent text-[13px] font-bold text-on-accent">
            {initials(name)}
          </span>
        </button>

        {menuOpen && (
          <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-xl border border-line bg-surface shadow-card">
            <div className="border-b border-line px-4 py-3">
              <p className="truncate text-sm font-semibold text-ink">{name}</p>
              <p className="truncate font-mono text-[11.5px] text-ink-3">
                {user?.email}
              </p>
            </div>
            <button
              onClick={logout}
              className="w-full px-4 py-2.5 text-left text-sm font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
