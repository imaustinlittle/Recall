"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/useAuth";
import { meetings as meetingsApi } from "@/lib/api";
import { MeetingListOut } from "@/lib/types";
import { MiniCalendar } from "@/components/calendar/MiniCalendar";

function monthStart(year: number, month: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-01`;
}
function monthEnd(year: number, month: number) {
  const last = new Date(year, month + 1, 0).getDate();
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}

/** Inner component that uses useSearchParams — must be wrapped in Suspense */
function CalendarSection({ user }: { user: { email: string } | null }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const [monthDates, setMonthDates] = useState<string[]>([]);

  const selectedDate = searchParams.get("date");

  useEffect(() => {
    if (!user) return;
    meetingsApi
      .list({ date_from: monthStart(calYear, calMonth), date_to: monthEnd(calYear, calMonth), limit: 100 })
      .then((d) => {
        const items = (d as MeetingListOut).items;
        setMonthDates(items.map((m) => m.created_at.slice(0, 10)));
      })
      .catch(() => {});
  }, [user, calYear, calMonth]);

  const activeDates = useMemo(() => new Set(monthDates), [monthDates]);

  const handleDateSelect = (date: string | null) => {
    if (date) router.push(`/?date=${date}`);
    else router.push("/");
  };

  const handleMonthChange = (year: number, month: number) => {
    setCalYear(year);
    setCalMonth(month);
    if (pathname === "/") router.push("/");
  };

  return (
    <MiniCalendar
      year={calYear}
      month={calMonth}
      activeDates={activeDates}
      selectedDate={selectedDate}
      onDateSelect={handleDateSelect}
      onMonthChange={handleMonthChange}
      dark
    />
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <aside className="w-64 shrink-0 flex flex-col bg-gray-900 text-gray-100 h-full overflow-y-auto">
      {/* Brand */}
      <div className="px-5 pt-6 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-brand-500 flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-white" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
            </svg>
          </div>
          <span className="text-base font-semibold text-white tracking-tight">Recall</span>
        </div>
      </div>

      {/* Calendar — always visible, Suspense required for useSearchParams */}
      <div className="px-4 py-2">
        <Suspense fallback={<div className="h-48" />}>
          <CalendarSection user={user} />
        </Suspense>
      </div>

      {/* Divider */}
      <div className="mx-4 my-2 border-t border-white/10" />

      {/* Nav */}
      <nav className="px-3 pb-2 space-y-0.5">
        <NavItem href="/" active={pathname === "/"} icon={<MeetingsIcon />}>
          Meetings
        </NavItem>
        <NavItem href="/search" active={pathname === "/search"} icon={<SearchIcon />}>
          Search
        </NavItem>
        <NavItem href="/speakers" active={pathname === "/speakers"} icon={<SpeakersIcon />}>
          Speakers
        </NavItem>
        <NavItem href="/admin" active={pathname === "/admin"} icon={<SettingsIcon />}>
          Settings
        </NavItem>
      </nav>

      <div className="flex-1" />

      {/* User footer */}
      <div className="px-4 py-4 border-t border-white/10">
        <p className="text-xs text-gray-400 truncate mb-2">{user?.email}</p>
        <button
          onClick={logout}
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}

function NavItem({
  href,
  active,
  icon,
  children,
}: {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={[
        "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
        active ? "bg-white/10 text-white" : "text-gray-400 hover:bg-white/5 hover:text-gray-100",
      ].join(" ")}
    >
      <span className="w-4 h-4 shrink-0">{icon}</span>
      {children}
    </Link>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
    </svg>
  );
}

function SpeakersIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
    </svg>
  );
}

function MeetingsIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z" />
      <path d="M15 7v2a4 4 0 01-4 4H9.828l-1.766 1.767c.28.149.599.233.938.233h2l3 3v-3h2a2 2 0 002-2V9a2 2 0 00-2-2h-1z" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
    </svg>
  );
}
