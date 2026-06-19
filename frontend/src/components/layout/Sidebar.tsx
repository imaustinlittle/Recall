"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/useAuth";
import { useTheme } from "@/lib/useTheme";
import { meetings as meetingsApi } from "@/lib/api";
import { MeetingListOut } from "@/lib/types";
import { Logo } from "./Logo";
import { MiniCalendar } from "@/components/calendar/MiniCalendar";
import {
  WaveIcon,
  SearchIcon,
  UsersIcon,
  SettingsIcon,
  MoonIcon,
  SunIcon,
} from "@/components/ui/icons";

const NAV = [
  { href: "/", label: "Meetings", Icon: WaveIcon, match: (p: string) => p === "/" || p.startsWith("/meetings") },
  { href: "/search", label: "Search", Icon: SearchIcon, match: (p: string) => p.startsWith("/search") },
  { href: "/speakers", label: "Speakers", Icon: UsersIcon, match: (p: string) => p.startsWith("/speakers") },
  { href: "/admin", label: "Settings", Icon: SettingsIcon, match: (p: string) => p.startsWith("/admin") },
];

function monthStart(year: number, month: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-01`;
}
function monthEnd(year: number, month: number) {
  const last = new Date(year, month + 1, 0).getDate();
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}
function ym(year: number, month: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Calendar block — reads/writes the date & month URL params that the
 *  dashboard filters on. Isolated so its useSearchParams sits in Suspense. */
function CalendarSection() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const dateParam = searchParams.get("date");
  const monthParam = searchParams.get("month");

  const initial = dateParam
    ? new Date(dateParam + "T00:00:00")
    : monthParam
    ? new Date(monthParam + "-01T00:00:00")
    : new Date();
  const [view, setView] = useState({ year: initial.getFullYear(), month: initial.getMonth() });

  // Keep the calendar in sync when the URL changes (e.g. nav from elsewhere).
  useEffect(() => {
    const d = dateParam
      ? new Date(dateParam + "T00:00:00")
      : monthParam
      ? new Date(monthParam + "-01T00:00:00")
      : null;
    if (!d) return;
    setView((v) =>
      v.year === d.getFullYear() && v.month === d.getMonth()
        ? v
        : { year: d.getFullYear(), month: d.getMonth() }
    );
  }, [dateParam, monthParam]);

  const [monthDates, setMonthDates] = useState<string[]>([]);
  useEffect(() => {
    meetingsApi
      .list({ date_from: monthStart(view.year, view.month), date_to: monthEnd(view.year, view.month), limit: 100 })
      .then((d) => setMonthDates((d as MeetingListOut).items.map((m) => m.created_at.slice(0, 10))))
      .catch(() => {});
  }, [view.year, view.month]);

  const activeDates = useMemo(() => new Set(monthDates), [monthDates]);

  const handleDateSelect = (date: string | null) => {
    router.push(date ? `/?date=${date}` : "/");
  };
  const handleMonthChange = (year: number, month: number) => {
    setView({ year, month });
    // On the meetings list, page the visible month too; elsewhere just browse.
    if (pathname === "/") router.push(`/?month=${ym(year, month)}`);
  };

  return (
    <MiniCalendar
      year={view.year}
      month={view.month}
      activeDates={activeDates}
      selectedDate={dateParam}
      onDateSelect={handleDateSelect}
      onMonthChange={handleMonthChange}
    />
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();

  const name = user?.display_name || user?.email?.split("@")[0] || "user";
  const role = user?.is_admin ? "operator" : "member";

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col overflow-y-auto border-r border-line bg-surface">
      {/* Brand */}
      <div className="px-5 pb-4 pt-6">
        <Link href="/">
          <Logo />
        </Link>
      </div>

      {/* Nav */}
      <nav className="space-y-0.5 px-3">
        {NAV.map(({ href, label, Icon, match }) => {
          const active = match(pathname);
          return (
            <Link
              key={href}
              href={href}
              className={[
                "flex items-center gap-2.5 rounded-[10px] px-3 py-2 text-[13.5px] font-semibold transition-colors",
                active ? "bg-accent-weak text-accent" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
              ].join(" ")}
            >
              <Icon size={17} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Calendar */}
      <div className="mt-4 border-t border-line px-4 pt-4">
        <Suspense fallback={<div className="h-56" />}>
          <CalendarSection />
        </Suspense>
      </div>

      <div className="flex-1" />

      {/* Footer: theme + user */}
      <div className="space-y-3 border-t border-line p-3">
        <button
          onClick={toggle}
          className="flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-[13.5px] font-semibold text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
        >
          {theme === "dark" ? <SunIcon size={17} /> : <MoonIcon size={17} />}
          {theme === "dark" ? "Light mode" : "Dark mode"}
        </button>

        <div className="flex items-center gap-2.5 px-1">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-[12px] font-bold text-on-accent">
            {initials(name)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-ink">{name}</p>
            <p className="truncate font-mono text-[11px] text-ink-3">{role}</p>
          </div>
          <button
            onClick={logout}
            title="Sign out"
            className="shrink-0 rounded-lg p-1.5 text-ink-3 transition-colors hover:text-status-red"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <path d="M16 17l5-5-5-5" />
              <path d="M21 12H9" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}
