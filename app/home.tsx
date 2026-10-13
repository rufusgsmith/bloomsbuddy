"use client";

import { useMemo, useSyncExternalStore } from "react";
import { eventsOnDay, findGaps, londonDateKey } from "@/lib/gaps";
import { addDays, dayOfWeek, londonTodayKey } from "@/lib/london-time";
import { parseUserData, readRawUserData, subscribeUserData } from "@/lib/storage";
import { expandWeekly } from "@/lib/timetable";
import type { UserData } from "@/lib/types";
import { TodayTimeline, type Day } from "./today-timeline";

/**
 * Shows the student's own timetable when they've saved one, otherwise the demo week.
 * localStorage only exists in the browser, so the server renders a skeleton and the
 * real content appears right after hydration (no flash of the demo week).
 */
export function Home({ demoDays, demoDateKey }: { demoDays: Day[]; demoDateKey: string }) {
  // "" = checked, nothing saved. null = not checked yet (server render / hydration).
  const raw = useSyncExternalStore(subscribeUserData, () => readRawUserData() ?? "", () => null);
  const user = useMemo(() => parseUserData(raw), [raw]);
  const userDays = useMemo(() => (user ? buildDays(user) : null), [user]);

  if (raw === null) return <Skeleton />;
  if (!user || !userDays) {
    return <TodayTimeline days={demoDays} initialDateKey={demoDateKey} mode="demo" />;
  }
  return (
    <TodayTimeline
      // Remount when the data changes, so cached recommendations for old gaps are dropped.
      key={user.savedAt}
      days={userDays}
      initialDateKey={pickInitialDay(userDays)}
      mode="user"
      deadlines={user.deadlines}
      societies={user.societies}
    />
  );
}

/** Every weekday of term, plus any weekend day that has a class. */
function buildDays(user: UserData): Day[] {
  const events = expandWeekly(user.classes, user.termStart, user.weeks);
  const withEvents = new Set(events.map((e) => londonDateKey(e.start)));
  const days: Day[] = [];
  for (let i = 0; i < user.weeks * 7; i++) {
    const dateKey = addDays(user.termStart, i);
    if (dayOfWeek(dateKey) > 5 && !withEvents.has(dateKey)) continue;
    const dayEvents = eventsOnDay(events, dateKey);
    days.push({ dateKey, events: dayEvents, gaps: findGaps(dayEvents) });
  }
  return days;
}

/** Today if it's a term day, else the next term day, else the last one. */
function pickInitialDay(days: Day[]): string {
  const today = londonTodayKey();
  return (days.find((d) => d.dateKey >= today) ?? days[days.length - 1])?.dateKey ?? today;
}

function Skeleton() {
  return (
    <main aria-busy="true" className="mx-auto w-full max-w-md animate-pulse px-4 pb-16 pt-8">
      <div className="mb-2 h-4 w-24 rounded bg-zinc-200 dark:bg-zinc-800" />
      <div className="mb-6 h-9 w-56 rounded bg-zinc-200 dark:bg-zinc-800" />
      <div className="mb-6 h-12 rounded-xl bg-zinc-100 dark:bg-zinc-900" />
      <div className="flex flex-col gap-3">
        <div className="h-24 rounded-2xl bg-zinc-100 dark:bg-zinc-900" />
        <div className="h-24 rounded-2xl bg-zinc-100 dark:bg-zinc-900" />
      </div>
    </main>
  );
}
