"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BUILDINGS } from "@/lib/buildings";
import { setDeadlineOnCalendar, setOnToday } from "@/lib/calendar-items";
import { dayNote } from "@/lib/day-note";
import { formatDurationShort } from "@/lib/duration";
import { londonDateKey } from "@/lib/gaps";
import { homeLabel } from "@/lib/home";
import { readRec, recFingerprint, saveRec } from "@/lib/rec-cache";
import { requestContext } from "@/lib/request-context";
import { addDays, dayOfWeek, formatTime, londonWeekdayAndMinutes, mondayOf } from "@/lib/london-time";
import { blankDraft, deleteManualEvent, draftFromClass, draftFromManual, nextHalfHour } from "@/lib/manual-events";
import { saveTodos } from "@/lib/todos";
import type { Deadline, Gap, Home, ManualEvent, Recommendation, ShortGap, Society, TimetableEvent, Todo } from "@/lib/types";
import { quickTip } from "@/lib/quick-tips";
import { allDayText, type AllDayItem } from "@/lib/all-day";
import { DayCalendar, DayPills, KindLegend, type CalendarEvent, type CalendarGap, type CalendarMarker } from "./day-calendar";
import { EventSheet, type EventFormTarget } from "./event-form";
import { PageHeader } from "./form-ui";
import { HomeIcon } from "./icons";
import { HomeSheet } from "./home-sheet";
import { RecommendationPanel, type RecState } from "./recommendation-card";

export interface Day {
  dateKey: string; // "YYYY-MM-DD", London calendar day
  /** Timetable classes, the student's events and to-do blocks. */
  events: TimetableEvent[];
  gaps: Gap[];
  /** Gaps too short for Claude: a quick tip or a "get moving" note, not tappable. */
  shortGaps: ShortGap[];
  /** Deadlines due this day that are shown on Today, as flags. */
  deadlines: Deadline[];
  /** Added society events with no time or over several days: strips at the top, not busy time. */
  allDay: AllDayItem[];
}

// Always format in Europe/London, so the server and the browser render identical text.
const londonWeekday = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short" });
const londonDayMonth = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  day: "numeric",
  month: "short",
});
const londonWeekdayLong = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "long" });

const time = formatTime;
// Midday UTC is always the same calendar day in London, whatever the season.
const dayDate = (dateKey: string) => new Date(`${dateKey}T12:00:00Z`);
const place = (id: keyof typeof BUILDINGS) => BUILDINGS[id].shortName;

/** The big title: "Today", "Tomorrow", "Yesterday", else the weekday ("Saturday"). The date goes underneath. */
function dayTitle(dateKey: string, todayKey: string): string {
  if (dateKey === todayKey) return "Today";
  if (dateKey === addDays(todayKey, 1)) return "Tomorrow";
  if (dateKey === addDays(todayKey, -1)) return "Yesterday";
  return londonWeekdayLong.format(dayDate(dateKey));
}

/** Minutes since London midnight. */
const minuteOfDay = (iso: string) => londonWeekdayAndMinutes(iso).minutes;

function toCalendarEvent(e: TimetableEvent): CalendarEvent {
  const startMin = minuteOfDay(e.start);
  // An event running past midnight is cut off at the end of the day.
  const endMin = londonDateKey(e.end) === londonDateKey(e.start) ? minuteOfDay(e.end) : 24 * 60;
  return {
    id: e.id,
    startMin,
    endMin,
    kind: e.kind,
    tone: e.deadlineId ? "exam" : e.todoId ? "todo" : !e.manualId || e.fromClass ? "timetable" : e.kind === "society" ? "society" : "mine",
    title: [e.moduleCode, e.title].filter(Boolean).join(" "),
    // An exam has no room, so it shows its building.
    detail: e.room || (e.deadlineId && e.buildingId ? place(e.buildingId) : undefined),
  };
}

/** "17:00 ECON0013 problem set". */
function toCalendarMarker(d: Deadline): CalendarMarker {
  return {
    id: `deadline-${d.id}`,
    min: minuteOfDay(d.due),
    label: `${time(d.due)} ${[d.moduleCode, d.title].filter(Boolean).join(" ")}`,
  };
}

function toCalendarGap(g: Gap): CalendarGap {
  return {
    id: g.id,
    startMin: minuteOfDay(g.start),
    endMin: minuteOfDay(g.end),
    label: `${formatDurationShort(g.durationMins)} free`,
  };
}

function toShortCalendarGap(g: ShortGap): CalendarGap {
  return {
    id: g.id,
    startMin: minuteOfDay(g.start),
    endMin: minuteOfDay(g.end),
    label: quickTip(g),
    kind: g.tier,
  };
}

/** The current time in ms, updated on each minute boundary. */
function useNow(): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    const tick = () => setNow(Date.now());
    // Line up with the clock's minute, so the label changes when the phone's clock does.
    const timeout = setTimeout(() => {
      tick();
      interval = setInterval(tick, 60_000);
    }, 60_000 - (Date.now() % 60_000));
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, []);
  return now;
}

export function TodayTimeline({
  days,
  initialDateKey,
  mode,
  deadlines,
  societies,
  home,
  todos = [],
  manualEvents = [],
  cacheKey,
}: {
  days: Day[];
  initialDateKey: string;
  /** "demo" = the mock week, "user" = the student's saved timetable. */
  mode: "demo" | "user";
  /** The student's own deadlines. Sent with each request so Claude uses them instead of the mocks. */
  deadlines?: Deadline[];
  /** The student's SU societies. Sent with each request so Claude sees their real events. */
  societies?: Society[];
  /** Where the student lives. null = not set yet. */
  home: Home | null;
  /** The To-do tab's list. Open and repeating ones are sent; the server picks the ones that fit each gap. */
  todos?: Todo[];
  /** The student's hand-added events, to open one in the form when tapped. Already merged into days. */
  manualEvents?: ManualEvent[];
  /** What the picks depend on besides the gap itself. Saved picks are kept under it for the session. */
  cacheKey: string;
}) {
  const [dateKey, setDateKey] = useState(
    days.some((d) => d.dateKey === initialDateKey) ? initialDateKey : days[0]?.dateKey,
  );
  const [openId, setOpenId] = useState<string | null>(null);
  // Cached per gap (and in sessionStorage, see rec-cache), so collapsing and reopening a gap doesn't
  // call Claude (and spend tokens) again. Only Redo does.
  const [recs, setRecs] = useState<Record<string, RecState>>({});
  const [homeSheetOpen, setHomeSheetOpen] = useState(false);
  const [eventForm, setEventForm] = useState<EventFormTarget | null>(null);

  const day = days.find((d) => d.dateKey === dateKey);

  // Days are shown a week at a time: a whole term of day buttons wouldn't fit.
  const weekStarts = [...new Set(days.map((d) => mondayOf(d.dateKey)))];
  const weekStart = dateKey ? mondayOf(dateKey) : weekStarts[0];
  const weekIndex = weekStarts.indexOf(weekStart);
  const weekDays = days.filter((d) => mondayOf(d.dateKey) === weekStart);

  function selectDay(key: string) {
    setDateKey(key);
    setOpenId(null);
  }

  /** Jump a week, landing on the same weekday if it exists. */
  function moveWeek(step: number) {
    const target = weekStarts[weekIndex + step];
    if (!target || !dateKey) return;
    const sameWeekday = days.find(
      (d) => mondayOf(d.dateKey) === target && dayDate(d.dateKey).getUTCDay() === dayDate(dateKey).getUTCDay(),
    );
    const fallback = days.find((d) => mondayOf(d.dateKey) === target);
    const next = sameWeekday ?? fallback;
    if (next) selectDay(next.dateKey);
  }
  const now = useNow();
  const nowIso = new Date(now).toISOString();
  const todayKey = londonDateKey(nowIso);
  const openGap = day?.gaps.find((g) => g.id === openId);
  const openTodo = day?.events.find((e) => e.id === openId && e.todoId);
  const openExam = day?.events.find((e) => e.id === openId && e.deadlineId);
  const openDeadline = day?.deadlines.find((d) => `deadline-${d.id}` === openId);
  const openAllDay = day?.allDay.find((a) => a.id === openId);

  /** Takes a to-do, deadline or all-day society event off the calendar. It stays in its own tab. */
  function removeFromToday() {
    if (openTodo) saveTodos(todos.map((t) => (t.id === openTodo.todoId ? setOnToday(t, false) : t)));
    if (openDeadline) setDeadlineOnCalendar(openDeadline.id, false);
    if (openAllDay) deleteManualEvent(openAllDay.manualId);
    setOpenId(null);
  }

  /** "+" button: the selected day, from the next half hour if it's today, else 09:00. */
  function addEvent() {
    if (!day) return;
    const start = day.dateKey === todayKey ? Math.min(nextHalfHour(minuteOfDay(nowIso)), 23 * 60) : 9 * 60;
    setEventForm({ kind: "new", draft: blankDraft(day.dateKey, start) });
  }

  function editEvent(id: string) {
    const e = day?.events.find((x) => x.id === id);
    if (!day || !e) return;
    // A to-do or exam block opens a small panel under it instead of the event form.
    if (e.todoId || e.deadlineId) return setOpenId(openId === id ? null : id);
    const manual = e.manualId ? manualEvents.find((m) => m.id === e.manualId) : undefined;
    setEventForm(
      manual
        ? { kind: "manual", event: manual, draft: draftFromManual(manual) }
        : { kind: "class", event: e, dateKey: day.dateKey, draft: draftFromClass(e, day.dateKey) },
    );
  }

  async function loadRec(gap: Gap, dayGaps: Gap[]) {
    setRecs((r) => ({ ...r, [gap.id]: { status: "loading" } }));
    let next: RecState;
    try {
      const res = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gap,
          dayGaps,
          // Not busy time, but Claude should know ("Seven Sisters hike (Time TBC)").
          ...(day?.allDay.length ? { allDay: day.allDay.map(allDayText) } : {}),
          ...requestContext({ deadlines, societies, home, todos, manualEvents }),
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rec = (await res.json()) as Recommendation;
      saveRec(recFingerprint(gap, cacheKey), rec);
      next = { status: "ok", rec };
    } catch (err) {
      console.warn("[recommend]", err); // warn, not error: the fallback handles it, so no dev-overlay alarm
      next = { status: "error" };
    }
    // Keyed by gap id, so a slow reply can never land on a different gap.
    setRecs((r) => ({ ...r, [gap.id]: next }));
  }

  function toggleGap(gap: Gap) {
    if (openId === gap.id) {
      setOpenId(null);
      return;
    }
    setOpenId(gap.id);
    if (recs[gap.id] || !day) return;
    const saved = readRec(recFingerprint(gap, cacheKey));
    if (saved) setRecs((r) => ({ ...r, [gap.id]: { status: "ok", rec: saved } }));
    else void loadRec(gap, day.gaps);
  }

  return (
    // Exactly the screen above the tab bar (min-h-16 + its 1px border + the safe area); dvh, so
    // mobile browser bars don't change it. The top stays put and only the calendar scrolls.
    <main className="mx-auto flex h-dvh w-full max-w-md flex-col overflow-hidden pb-[calc(4rem+1px+env(safe-area-inset-bottom))]">
      <div className="shrink-0 border-b border-zinc-200 px-4 pt-8 dark:border-zinc-800">
        {/* Only rendered in the browser (<Home> shows a skeleton on the server), so reading today here can't mismatch. */}
        <PageHeader
          title={day ? dayTitle(day.dateKey, todayKey) : "Today"}
          action={
            mode === "user" && (
              <Link
                href="/timetable"
                className="rounded-full px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
              >
                Edit timetable
              </Link>
            )
          }
        >
          {day && (
            <>
              <p className="text-zinc-500 dark:text-zinc-400">{londonDayMonth.format(dayDate(day.dateKey))}</p>
              {/* Worked out from this day's events on every render, so it follows timetable edits. */}
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{dayNote(day.dateKey, todayKey, day.events)}</p>
            </>
          )}
          <HomeButton home={home} onClick={() => setHomeSheetOpen(true)} />
        </PageHeader>
        {homeSheetOpen && <HomeSheet home={home} onClose={() => setHomeSheetOpen(false)} />}
        {eventForm && (
          <EventSheet
            target={eventForm}
            eventsOn={(k) => days.find((d) => d.dateKey === k)?.events ?? []}
            onClose={() => setEventForm(null)}
          />
        )}

        {mode === "demo" && (
          <Link
            href="/setup"
            className="mb-5 flex items-center justify-between gap-3 rounded-2xl bg-emerald-600 p-4 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:text-emerald-950 dark:hover:bg-emerald-400"
          >
            <span>
              <span className="block font-semibold">This is a demo week</span>
              <span className="block text-sm opacity-90">Snap your timetable and Moodle to make it yours.</span>
            </span>
            <span aria-hidden className="text-xl">
              →
            </span>
          </Link>
        )}

        {weekStarts.length > 1 && (
          <div className="mb-2 flex items-center justify-between">
            <WeekButton label="Previous week" disabled={weekIndex <= 0} onClick={() => moveWeek(-1)}>
              ‹
            </WeekButton>
            <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
              Week {weekIndex + 1} · w/c {londonDayMonth.format(dayDate(weekStart))}
            </p>
            <WeekButton label="Next week" disabled={weekIndex >= weekStarts.length - 1} onClick={() => moveWeek(1)}>
              ›
            </WeekButton>
          </div>
        )}

        <DayPills
          days={weekDays.map((d) => ({
            key: d.dateKey,
            weekday: londonWeekday.format(dayDate(d.dateKey)),
            date: dayDate(d.dateKey).getUTCDate(),
            // Marks the real today, so it's easy to find again after browsing other days.
            dot: d.dateKey === todayKey,
            current: d.dateKey === todayKey,
            weekend: dayOfWeek(d.dateKey) > 5,
          }))}
          active={dateKey ?? ""}
          onSelect={selectDay}
        />
      </div>

      {/* Bottom padding so the last hours can scroll clear of the + and ✨ buttons. */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-24">

        {day && (
          <DayCalendar
            events={day.events.map(toCalendarEvent)}
            gaps={[...day.gaps.map(toCalendarGap), ...day.shortGaps.map(toShortCalendarGap)]}
            markers={day.deadlines.map(toCalendarMarker)}
            allDay={day.allDay}
            onAllDayTap={(id) => setOpenId(openId === id ? null : id)}
            nowMin={day.dateKey === todayKey ? minuteOfDay(nowIso) : null}
            openId={openId}
            onEventTap={editEvent}
            onMarkerTap={(id) => setOpenId(openId === id ? null : id)}
            onSlotTap={(min) => setEventForm({ kind: "new", draft: blankDraft(day.dateKey, min) })}
            onGapTap={(id) => {
              const gap = day.gaps.find((g) => g.id === id);
              if (gap) toggleGap(gap);
            }}
            panel={
              openGap ? (
                <GapPanel gap={openGap} rec={recs[openGap.id]} onReload={() => loadRec(openGap, day.gaps)} />
              ) : openTodo ? (
                <ItemPanel
                  title={openTodo.title}
                  when={`${time(openTodo.start)}–${time(openTodo.end)} · To-do`}
                  href="/todo"
                  tab="To-do"
                  onRemove={removeFromToday}
                />
              ) : openExam ? (
                <ItemPanel
                  title={[openExam.moduleCode, openExam.title].filter(Boolean).join(" ")}
                  when={[
                    `${time(openExam.start)}–${time(openExam.end)}`,
                    "Exam",
                    openExam.buildingId ? `${place(openExam.buildingId)}` : openExam.place && `${openExam.place.label}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  href="/deadlines"
                  tab="Deadlines"
                />
              ) : openAllDay ? (
                <ItemPanel
                  title={openAllDay.title}
                  when={`${openAllDay.label} · Society`}
                  href="/societies"
                  tab="Societies"
                  onRemove={removeFromToday}
                />
              ) : openDeadline ? (
                <ItemPanel
                  title={[openDeadline.moduleCode, openDeadline.title].filter(Boolean).join(" ")}
                  when={`Due ${time(openDeadline.due)} · Deadline`}
                  href="/deadlines"
                  tab="Deadlines"
                  onRemove={removeFromToday}
                />
              ) : null
            }
          />
        )}
        {day && <KindLegend />}
      </div>

      {day && (
        <button
          type="button"
          onClick={addEvent}
          aria-label="Add event"
          aria-haspopup="dialog"
          className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-[max(1rem,calc(50%-14rem+1rem))] z-30 flex size-14 items-center justify-center rounded-full bg-zinc-900 text-3xl leading-none text-white shadow-lg hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          +
        </button>
      )}
    </main>
  );
}

function WeekButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-11 items-center justify-center rounded-full text-2xl text-zinc-600 hover:bg-zinc-100 disabled:opacity-30 disabled:hover:bg-transparent dark:text-zinc-400 dark:hover:bg-zinc-900"
    >
      {children}
    </button>
  );
}

/** The body of an open gap, joined under its box: the trip, what's either side, then Claude's picks. */
function GapPanel({ gap, rec, onReload }: { gap: Gap; rec: RecState | undefined; onReload: () => void }) {
  const from = place(gap.locationId);
  const to = place(gap.nextLocationId);
  const sameBuilding = gap.locationId === gap.nextLocationId;

  return (
    <div
      id={`${gap.id}-panel`}
      // The body of the open gap's card, under its header in DayCalendar: same border and fill, no top edge.
      className="rounded-b-2xl border-2 border-t-0 border-emerald-500 bg-emerald-100 px-3 pb-3 pt-1 dark:border-emerald-500 dark:bg-emerald-950/70"
    >
      <div className="mb-3 border-b border-emerald-300 pb-2 text-sm text-emerald-900 dark:border-emerald-800 dark:text-emerald-100">
        {/* The header above already shows the times and how long it's free. */}
        <p className="text-emerald-800 dark:text-emerald-200">
          {formatDurationShort(gap.usableMins)} usable ·{" "}
          {sameBuilding
            ? `Staying in ${from}, no walk needed`
            : `${from} → ${to}, ${formatDurationShort(gap.travelMins)} ${gap.travelMode === "tube" ? "by tube" : "walk"}`}
        </p>
        <p className="mt-1">
          After <strong>{gap.prevEvent.title}</strong> ({place(gap.prevLocationId)})
        </p>
        <p>
          Before <strong>{gap.nextEvent.title}</strong> at {time(gap.end)}
          {gap.nextEvent.room && ` (${gap.nextEvent.room})`}
        </p>
      </div>
      <RecommendationPanel state={rec ?? { status: "loading" }} onReload={onReload} />
    </div>
  );
}

/**
 * Opens under a tapped to-do block, exam block or deadline flag: what it is, and a way to take it
 * off Today. An exam is fixed, so it has no onRemove: it's edited in the Deadlines tab instead.
 */
function ItemPanel({
  title,
  when,
  href,
  tab,
  onRemove,
}: {
  title: string;
  when: string;
  href: string;
  tab: string;
  onRemove?: () => void;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <p className="font-semibold">{title}</p>
      <p className="mt-0.5 text-sm tabular-nums text-zinc-600 dark:text-zinc-400">{when}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="min-h-11 rounded-full bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            Remove from Today
          </button>
        )}
        <Link
          href={href}
          className="flex min-h-11 items-center rounded-full px-3 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
        >
          Open {tab} tab
        </Link>
      </div>
      <p className="mt-2 text-xs text-zinc-500">
        {onRemove ? `It stays in the ${tab} tab, and you can add it back there.` : `Edit or delete it in the ${tab} tab.`}
      </p>
    </div>
  );
}

/** Opens the Home sheet. Shows where home is, or invites the student to add it. */
function HomeButton({ home, onClick }: { home: Home | null; onClick: () => void }) {
  if (!home) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-haspopup="dialog"
        className="mt-4 flex min-h-14 w-full items-center gap-3 rounded-2xl border-2 border-dashed border-emerald-400 px-4 py-2.5 text-left transition-colors hover:bg-emerald-50 dark:border-emerald-700 dark:hover:bg-emerald-950/40"
      >
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-emerald-700 dark:text-emerald-300">Add your home</span>
          <span className="block text-sm text-zinc-600 dark:text-zinc-400">So I know when a gap&apos;s long enough to pop back</span>
        </span>
        <span aria-hidden className="text-xl text-emerald-600 dark:text-emerald-400">
          +
        </span>
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      aria-label={`Home: ${homeLabel(home)}. Change`}
      className="mt-4 flex min-h-14 w-full items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-left transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900"
    >
      <span
        aria-hidden
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
      >
        <HomeIcon />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-medium text-zinc-500">Home</span>
        <span className={`block truncate font-medium ${home.kind === "none" ? "text-zinc-500" : ""}`}>
          {homeLabel(home)}
        </span>
      </span>
      <span aria-hidden className="text-xl text-zinc-400">
        ›
      </span>
    </button>
  );
}
