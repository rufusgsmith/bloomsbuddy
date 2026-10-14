"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

// Fixed to the bottom of the screen so every tab is in thumb reach on a phone.
// Hidden on /setup and /timetable (they have their own buttons at the bottom) and /debug.

const TABS: { href: string; label: string; icon: ReactNode }[] = [
  {
    href: "/",
    label: "Today",
    icon: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </>
    ),
  },
  {
    href: "/todo",
    label: "To-do",
    icon: (
      <>
        <path d="M9 6h11M9 12h11M9 18h11" />
        <path d="m3.5 6 1 1 2-2M3.5 12l1 1 2-2M3.5 18l1 1 2-2" />
      </>
    ),
  },
  {
    href: "/library",
    label: "Library",
    icon: (
      <>
        <path d="M4 19.5V5a1.5 1.5 0 0 1 1.5-1.5H8A1.5 1.5 0 0 1 9.5 5v14.5" />
        <path d="M9.5 19.5V7a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 7v12.5" />
        <path d="m15 7.6 2.4-.7a1.5 1.5 0 0 1 1.9 1l3 10.4" />
        <path d="M2.5 20.5h19M4 8h5.5M9.5 10h5" />
      </>
    ),
  },
  {
    href: "/societies",
    label: "Societies",
    icon: (
      <>
        <circle cx="9" cy="8" r="3.5" />
        <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
        <path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5" />
      </>
    ),
  },
  {
    href: "/deadlines",
    label: "Deadlines",
    icon: (
      <>
        <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
        <path d="M3 9.5h18M8 2.5v4M16 2.5v4M12 13v3l2 1.5" />
      </>
    ),
  },
];

const HIDDEN_ON = ["/setup", "/timetable", "/debug"];

const isActive = (pathname: string, href: string) =>
  href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

export function TabBar() {
  const pathname = usePathname();
  if (HIDDEN_ON.some((p) => isActive(pathname, p))) return null;

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95"
    >
      <ul className="mx-auto grid w-full max-w-md grid-cols-5">
        {TABS.map((tab) => {
          const active = isActive(pathname, tab.href);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-16 flex-col items-center justify-center gap-0.5 text-xs font-medium ${
                  active
                    ? "text-emerald-700 dark:text-emerald-400"
                    : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                }`}
              >
                <span
                  className={`flex h-8 w-12 items-center justify-center rounded-full ${
                    active ? "bg-emerald-100 dark:bg-emerald-950" : ""
                  }`}
                >
                  <svg
                    aria-hidden
                    viewBox="0 0 24 24"
                    width="24"
                    height="24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    {tab.icon}
                  </svg>
                </span>
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
