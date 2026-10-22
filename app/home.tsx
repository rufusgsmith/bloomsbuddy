"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import {
  calendarKey,
  deadlinesOn,
  examBlocksOn,
  parseDeadlineIds,
  readRawCalendarDeadlines,
  readRawHiddenExams,
  subscribeCalendarDeadlines,
  todoBlocksOn,
} from "@/lib/calendar-items";
import { allDayOn } from "@/lib/all-day";
import { findGaps, findShortGaps } from "@/lib/gaps";
import { parseHome, readRawHome, subscribeHome } from "@/lib/home";
import { addDays, londonTodayKey } from "@/lib/london-time";
import { dayEventsFor, parseEvents, readRawEvents, subscribeEvents, type EventStore } from "@/lib/manual-events";
import { DEMO_HOME, demoMonday, mockDeadlines, mockTimetable, mockTodos } from "@/lib/mock";
import { parseUserData, readRawUserData, subscribeUserData } from "@/lib/storage";
import { parseTodos, readRawTodos, subscribeTodos } from "@/lib/todos";
import { expandWeekly } from "@/lib/timetable";
import type { Deadline, Todo, UserData } from "@/lib/types";
import { ChatAssistant } from "./chat-sheet";
import { TodayTimeline, type Day } from "./today-timeline";

/**
 * Shows the student's own timetable when they've saved one, otherwise the demo week.
 * A first-time visitor lands on the demo week too (never sent to /setup), so a shared link opens
 * straight on it. The demo banner links to setup.
 * localStorage only exists in the browser, so the server renders a skeleton and the
 * real content appears right after hydration (no flash of the demo week).
 */
export function Home() {
  // "" = checked, nothing saved. null = not checked yet (server render / hydration).
  const raw = useSyncExternalStore(subscribeUserData, () => readRawUserData() ?? "", () => null);
  const user = useMemo(() => parseUserData(raw), [raw]);
  const rawHome = useSyncExternalStore(subscribeHome, () => readRawHome() ?? "", () => null);
  const home = useMemo(() => parseHome(rawHome), [rawHome]);
  // Only the calendar part of the to-dos is in the remount keys (calendarKey): ticking off an
  // unplaced to-do shouldn't throw away cached picks.
  const rawTodos = useSyncExternalStore(subscribeTodos, () => readRawTodos() ?? "", () => null);
  const todos = useMemo(() => parseTodos(rawTodos), [rawTodos]);
  // Not on the server (rawTodos null): it only renders the skeleton, and reading the clock during
  // prerender is an error in this Next.js.
  const todoKey = useMemo(() => (rawTodos === null ? "" : calendarKey(todos, londonTodayKey())), [rawTodos, todos]);
  // Deadlines added to the calendar. Flags aren't busy time, so they don't change the gaps.
  const rawDeadlineIds = useSyncExternalStore(subscribeCalendarDeadlines, () => readRawCalendarDeadlines() ?? "", () => null);
  // Exams taken off the calendar. Exams are busy time, so these are in the remount keys.
  const rawHiddenExams = useSyncExternalStore(subscribeCalendarDeadlines, () => readRawHiddenExams() ?? "", () => null);
  const shownDeadlines = useMemo(
    () => ({ shown: parseDeadlineIds(rawDeadlineIds), hiddenExams: parseDeadlineIds(rawHiddenExams) }),
    [rawDeadlineIds, rawHiddenExams],
  );
  // Hand-added events and one-off class changes. They change the gaps, so they're in the remount keys.
  const rawEvents = useSyncExternalStore(subscribeEvents, () => readRawEvents() ?? "", () => null);
  const store = useMemo(() => parseEvents(rawEvents), [rawEvents]);
  const userDays = useMemo(() => (user ? buildDays(user, store, todos, shownDeadlines) : null), [user, store, todos, shownDeadlines]);
  // Only built in the browser, once we know there's no usable saved timetable, so the server
  // never renders a week from its own clock.
  const demo = useMemo(() => (raw !== null && !user ? buildDemo() : null), [raw, user]);
  // Lifted here so the chat stays open when Add saves an event and Today remounts.
  const [chatOpen, setChatOpen] = useState(false);

  if (raw === null) return <Skeleton />;
  // Everything besides the timetable that changes the gaps or the picks. Also keys the saved picks.
  const inputsKey = `${rawHome ?? ""}|${rawEvents ?? ""}|${todoKey}|${rawHiddenExams ?? ""}`;
  if (!user || !userDays) {
    if (!demo) return <Skeleton />;
    return (
      <>
        {/* Fixed and read-only, so it never reads the visitor's saved home, events or to-dos. */}
        <TodayTimeline
          cacheKey="demo"
          days={demo.days}
          initialDateKey={demo.initialDateKey}
          mode="demo"
          home={DEMO_HOME}
          todos={demo.todos}
          onOpenChat={() => setChatOpen(true)}
        />
        {/* The demo week never calls Claude, so the chat only explains that. */}
        <ChatAssistant
          open={chatOpen}
          onClose={() => setChatOpen(false)}
          days={demo.days}
          home={DEMO_HOME}
          todos={demo.todos}
          manualEvents={[]}
          offline
        />
      </>
    );
  }
  return (
    <>
      <TodayTimeline
        // Remount when the data, home or events change, so cached recommendations for old gaps are dropped.
        key={`${user.savedAt}|${inputsKey}`}
        cacheKey={`${user.savedAt}|${inputsKey}`}
        days={userDays}
        initialDateKey={pickInitialDay(userDays)}
        mode="user"
        deadlines={user.deadlines}
        societies={user.societies}
        home={home}
        todos={todos}
        manualEvents={store.events}
        onOpenChat={() => setChatOpen(true)}
      />
      <ChatAssistant
        open={chatOpen}
        onClose={() => setChatOpen(false)}
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

/** Which deadlines are flagged on the calendar, and which exams were taken off it. */
interface CalendarDeadlines {
  shown: string[];
  hiddenExams: string[];
}

/** Deadline flags shown on the demo week (each one's due time on its day). */
const DEMO_SHOWN_DEADLINES: CalendarDeadlines = { shown: ["dl-stat0002-quiz3", "dl-econ0019-ps2"], hiddenExams: [] };

/**
 * The mock week, Monday–Sunday (always the current one). Opens on today, or on Monday at the weekend.
 * Built only from mock data, never the visitor's saved events, to-dos or home: its gaps must match
 * the ready-made picks in lib/mock/recommendations.ts.
 */
function buildDemo(): { days: Day[]; initialDateKey: string; todos: Todo[] } {
  const timetable = mockTimetable();
  const deadlines = mockDeadlines();
  const todos = mockTodos();
  const store: EventStore = { events: [], hidden: [] };
  const today = londonTodayKey();
  const monday = demoMonday(today);
  const dateKeys = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const days = dateKeys.map((dateKey) =>
    buildDay(dateKey, dayEventsFor(timetable, store, dateKey), todos, deadlines, DEMO_SHOWN_DEADLINES, store),
  );
  return { days, initialDateKey: dateKeys.includes(today) ? today : monday, todos };
}

/** Every day of term, Monday–Sunday, weekends included. */
function buildDays(user: UserData, store: EventStore, todos: Todo[], shown: CalendarDeadlines): Day[] {
  const events = expandWeekly(user.classes, user.termStart, user.weeks);
  const days: Day[] = [];
  for (let i = 0; i < user.weeks * 7; i++) {
    const dateKey = addDays(user.termStart, i);
    days.push(buildDay(dateKey, dayEventsFor(events, store, dateKey), todos, user.deadlines, shown, store));
  }
  return days;
}

/**
 * One day: its events plus to-do and exam blocks (busy time, so they shape the gaps), deadline flags, and
 * all-day society strips (not busy time, so they never touch the gaps).
 */
function buildDay(
  dateKey: string,
  events: Day["events"],
  todos: Todo[],
  deadlines: Deadline[],
  { shown, hiddenExams }: CalendarDeadlines,
  store: EventStore,
): Day {
  const all = [...events, ...todoBlocksOn(todos, dateKey), ...examBlocksOn(deadlines, dateKey, hiddenExams)];
  return {
    dateKey,
    events: all,
    gaps: findGaps(all),
    shortGaps: findShortGaps(all),
    deadlines: deadlinesOn(deadlines, shown, dateKey),
    allDay: allDayOn(store.events, dateKey),
  };
}

/** Today if it's a term day, else the next term day, else the last one. */
function pickInitialDay(days: Day[]): string {
  const today = londonTodayKey();
  return (days.find((d) => d.dateKey >= today) ?? days[days.length - 1])?.dateKey ?? today;
}

function Skeleton() {
  return (
    <main aria-busy="true" className="mx-auto w-full max-w-7xl animate-pulse px-4 pt-5 md:px-6">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="h-10 w-56 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
        <div className="hidden h-10 w-96 rounded-lg bg-zinc-100 md:block dark:bg-zinc-900" />
      </div>
      <div className="h-[70dvh] rounded-xl border border-line bg-surface" />
    </main>
  );
}
