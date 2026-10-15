"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarClock, Flag, LibraryBig, ListChecks, Users, type LucideIcon } from "lucide-react";

// Phone: fixed to the bottom of the screen so every tab is in thumb reach.
// md+: a left rail with the wordmark (PAGE_FRAME in form-ui.tsx leaves room for it).
// Hidden on /setup and /timetable (they have their own buttons at the bottom) and /debug.

const TABS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/", label: "Today", icon: CalendarClock },
  { href: "/todo", label: "To-do", icon: ListChecks },
  { href: "/library", label: "Library", icon: LibraryBig },
  { href: "/societies", label: "Societies", icon: Users },
  { href: "/deadlines", label: "Deadlines", icon: Flag },
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
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:inset-x-auto md:inset-y-0 md:left-0 md:w-56 md:border-r md:border-t-0 md:px-3 md:pb-0 md:pt-10"
    >
      <p className="hidden px-3 pb-6 text-xl font-semibold text-ink md:block">Bloomsbuddy</p>
      <ul className="mx-auto grid w-full max-w-md grid-cols-5 md:flex md:flex-col md:gap-1">
        {TABS.map((tab) => {
          const active = isActive(pathname, tab.href);
          const Icon = tab.icon;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-medium transition-colors md:min-h-11 md:flex-row md:justify-start md:gap-3 md:rounded-lg md:px-3 md:text-sm ${
                  active ? "text-square md:bg-square-tint" : "text-muted hover:text-ink md:hover:bg-sunken"
                }`}
              >
                <Icon size={22} strokeWidth={active ? 2 : 1.75} aria-hidden className="md:size-5" />
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
