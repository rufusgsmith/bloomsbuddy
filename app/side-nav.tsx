"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// The app's navigation: a bar along the top with the tabs as pills (a strip that scrolls sideways
// on a phone). From lg the name sits on the left, as wide as Today's sidebar, so the tabs start in
// the same place on every tab. On Today from xl this bar is hidden and Today puts the name and
// <NavTabs> in its own top bar, beside its buttons. On /setup, /timetable and /debug the tabs are
// hidden (those pages have their own buttons at the bottom) and the bar keeps just the name. No logo,
// by request. Pages size themselves with --nav-h (this bar's height).

const TABS = [
  { href: "/", label: "Today" },
  { href: "/todo", label: "To-do" },
  { href: "/library", label: "Library" },
  { href: "/societies", label: "Societies" },
  { href: "/deadlines", label: "Deadlines" },
];

const HIDDEN_ON = ["/setup", "/timetable", "/debug"];

const isActive = (pathname: string, href: string) =>
  href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

const TAB_ON = "bg-primary text-on-primary";
const TAB_OFF = "text-muted hover:bg-zinc-200/60 hover:text-foreground dark:hover:bg-zinc-800";

/** The tab pills, shared by this bar and Today's own top bar. */
export function NavTabs() {
  const pathname = usePathname();
  return (
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
  );
}

export function SideNav() {
  const pathname = usePathname();
  const tabsHidden = HIDDEN_ON.some((p) => isActive(pathname, p));

  return (
    // md+ padding matches Today's top bar, so the tabs don't jump when switching to or from Today.
    <header
      className={`sticky top-0 z-40 flex h-[var(--nav-h)] shrink-0 items-center gap-3 border-b border-line bg-background px-4 md:border-b-0 md:pb-2 md:pt-3 ${
        pathname === "/" ? "xl:hidden" : ""
      }`}
    >
      {tabsHidden ? (
        <Link href="/" className="flex min-h-9 shrink-0 items-center text-lg text-foreground">
          Bloomsbuddy
        </Link>
      ) : (
        <>
          {/* As wide as Today's sidebar less this bar's padding and gap, like Today's own name. */}
          <span className="hidden w-[14.25rem] shrink-0 pl-2 text-[22px] text-muted lg:block">Bloomsbuddy</span>
          <NavTabs />
        </>
      )}
    </header>
  );
}
