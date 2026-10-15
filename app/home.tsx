"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { findGaps } from "@/lib/gaps";
import { parseHome, readRawHome, subscribeHome } from "@/lib/home";
import { addDays, londonTodayKey } from "@/lib/london-time";
import { dayEventsFor, parseEvents, readRawEvents, subscribeEvents, type EventStore } from "@/lib/manual-events";
import { demoMonday, mockTimetable } from "@/lib/mock";
import { onboardingSkipped, parseUserData, readRawUserData, subscribeUserData } from "@/lib/storage";
import { parseTodos, readRawTodos, subscribeTodos } from "@/lib/todos";
import { expandWeekly } from "@/lib/timetable";
import type { UserData } from "@/lib/types";
import { ChatAssistant } from "./chat-sheet";
import { TodayTimeline, type Day } from "./today-timeline";

/**
 * Shows the student's own timetable when they've saved one, otherwise the demo week.
 * A first-time visitor (nothing saved, onboarding not skipped) is sent to /setup instead.
 * localStorage only exists in the browser, so the server renders a skeleton and the
 * real content appears right after hydration (no flash of the demo week).
 */
export function Home() {
  // "" = checked, nothing saved. null = not checked yet (server render / hydration).
  const raw = useSyncExternalStore(subscribeUserData, () => readRawUserData() ?? "", () => null);
  const user = useMemo(() => parseUserData(raw), [raw]);
  const rawHome = useSyncExternalStore(subscribeHome, () => readRawHome() ?? "", () => null);
  const home = useMemo(() => parseHome(rawHome), [rawHome]);
  // Not part of the remount keys below: ticking off a to-do shouldn't throw away cached picks.
  const rawTodos = useSyncExternalStore(subscribeTodos, () => readRawTodos() ?? "", () => null);
  const todos = useMemo(() => parseTodos(rawTodos), [rawTodos]);
  // Hand-added events and one-off class changes. They change the gaps, so they're in the remount keys.
  const rawEvents = useSyncExternalStore(subscribeEvents, () => readRawEvents() ?? "", () => null);
  const store = useMemo(() => parseEvents(rawEvents), [rawEvents]);
  const userDays = useMemo(() => (user ? buildDays(user, store) : null), [user, store]);
  // Only built in the browser, once we know there's no usable saved timetable, so the server
  // never renders a week from its own clock.
  const firstVisit = raw === "" && !onboardingSkipped();
  const demo = useMemo(
    () => (raw !== null && !user && !firstVisit ? buildDemo(store) : null),
    [raw, user, firstVisit, store],
  );
  const router = useRouter();
  useEffect(() => {
    if (firstVisit) router.replace("/setup");
  }, [firstVisit, router]);

  if (raw === null || firstVisit) return <Skeleton />;
  if (!user || !userDays) {
    if (!demo) return <Skeleton />;
    return (
      <>
        <TodayTimeline
          // Remount when home or events change, so cached recommendations for old gaps are dropped.
          key={`${rawHome ?? ""}|${rawEvents ?? ""}`}
          days={demo.days}
          initialDateKey={demo.initialDateKey}
          mode="demo"
          home={home}
          todos={todos}
          manualEvents={store.events}
        />
        {/* Outside the keyed timeline, so the chat stays open when Add saves an event. */}
        <ChatAssistant days={demo.days} home={home} todos={todos} manualEvents={store.events} />
      </>
    );
  }
  return (
    <>
      <TodayTimeline
        // Remount when the data, home or events change, so cached recommendations for old gaps are dropped.
        key={`${user.savedAt}|${rawHome ?? ""}|${rawEvents ?? ""}`}
        days={userDays}
        initialDateKey={pickInitialDay(userDays)}
        mode="user"
        deadlines={user.deadlines}
        societies={user.societies}
        home={home}
        todos={todos}
        manualEvents={store.events}
      />
      <ChatAssistant
        days={userDays}
        deadlines={user.deadlines}
        societies={user.societies}
        home={home}
        todos={todos}
        manualEvents={store.events}
      />
    </>
  );
}

/** The mock week, Monday–Sunday (always the current one). Opens on today, or on Monday at the weekend. */
function buildDemo(store: EventStore): { days: Day[]; initialDateKey: string } {
  const timetable = mockTimetable();
  const today = londonTodayKey();
  const monday = demoMonday(today);
  const dateKeys = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const days = dateKeys.map((dateKey) => {
    const events = dayEventsFor(timetable, store, dateKey);
    return { dateKey, events, gaps: findGaps(events) };
  });
  return { days, initialDateKey: dateKeys.includes(today) ? today : monday };
}

/** Every day of term, Monday–Sunday, weekends included. */
function buildDays(user: UserData, store: EventStore): Day[] {
  const events = expandWeekly(user.classes, user.termStart, user.weeks);
  const days: Day[] = [];
  for (let i = 0; i < user.weeks * 7; i++) {
    const dateKey = addDays(user.termStart, i);
    const dayEvents = dayEventsFor(events, store, dateKey);
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
    <main aria-busy="true" className="mx-auto w-full max-w-md animate-pulse px-4 pb-28 pt-8">
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
