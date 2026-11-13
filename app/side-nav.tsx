"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

// The app's navigation. From md it's a narrow rail down the right (an icon with a small label
// under it, the current tab's icon in a blue pill), so Today's own sidebar can sit on the left like
// a calendar app's; on a phone it's a pinned bar on top with the tabs as a strip that scrolls
// sideways. On /setup, /timetable and /debug the tabs are hidden (those pages have their own buttons
// at the bottom): the phone bar keeps just the name and the rail isn't shown. No logo, by request.
// Pages size themselves with --nav-h (the phone bar's height, 0 from md).

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

const TAB_ON = "bg-primary text-on-primary";
const TAB_OFF = "text-muted hover:bg-zinc-200/60 hover:text-foreground dark:hover:bg-zinc-800";

function TabIcon({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`size-[18px] shrink-0 ${className}`}
    >
      {children}
    </svg>
  );
}

export function SideNav() {
  const pathname = usePathname();
  const tabsHidden = HIDDEN_ON.some((p) => isActive(pathname, p));

  return (
    <>
      {/* Phone: a bar on top. */}
      <header className="sticky top-0 z-40 flex h-[var(--nav-h)] shrink-0 items-center gap-3 border-b border-line bg-background px-4 md:hidden">
        {tabsHidden && (
          <Link href="/" className="flex min-h-9 shrink-0 items-center text-lg text-foreground">
            Bloomsbuddy
          </Link>
        )}
        {!tabsHidden && (
          <nav aria-label="Main" className="no-scrollbar min-w-0 overflow-x-auto">
            <ul className="flex w-max gap-1">
              {TABS.map((tab) => {
                const active = isActive(pathname, tab.href);
                return (
                  <li key={tab.href}>
                    <Link
                      href={tab.href}
                      aria-current={active ? "page" : undefined}
                      className={`flex min-h-9 items-center whitespace-nowrap rounded-full px-3.5 text-sm font-medium transition-colors ${
                        active ? TAB_ON : TAB_OFF
                      }`}
                    >
                      {tab.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        )}
      </header>

      {/* md and up: a rail down the right (order-last in the body's row). */}
      {!tabsHidden && (
        <aside className="sticky top-0 hidden h-dvh w-[4.5rem] shrink-0 flex-col items-center pt-3 md:order-last md:flex">
          <nav aria-label="Main">
            <ul className="flex flex-col gap-3">
              {TABS.map((tab) => {
                const active = isActive(pathname, tab.href);
                return (
                  <li key={tab.href}>
                    <Link
                      href={tab.href}
                      aria-current={active ? "page" : undefined}
                      className="group flex w-14 flex-col items-center gap-1 text-[11px] font-medium text-muted aria-[current=page]:text-foreground"
                    >
                      <span className={`flex h-8 w-14 items-center justify-center rounded-full transition-colors ${active ? TAB_ON : TAB_OFF}`}>
                        <TabIcon className="size-5">{tab.icon}</TabIcon>
                      </span>
                      {tab.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </aside>
      )}
    </>
  );
}
