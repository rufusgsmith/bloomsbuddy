"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BUILDINGS } from "@/lib/buildings";
import { setDeadlineOnCalendar, setOnToday } from "@/lib/calendar-items";
import { dayNote } from "@/lib/day-note";
import { formatDurationShort } from "@/lib/duration";
import { londonDateKey } from "@/lib/gaps";
import { homeLabel } from "@/lib/home";
import { requestContext } from "@/lib/request-context";
import { addDays, dayOfWeek, formatTime, londonWeekdayAndMinutes, mondayOf } from "@/lib/london-time";
import { blankDraft, draftFromClass, draftFromManual, nextHalfHour } from "@/lib/manual-events";
import { saveTodos } from "@/lib/todos";
import type { Deadline, Gap, Home, ManualEvent, Recommendation, Society, TimetableEvent, Todo } from "@/lib/types";
import { DayCalendar, DayPills, KindLegend, type CalendarEvent, type CalendarGap, type CalendarMarker } from "./day-calendar";
import { DaySheet } from "./day-sheet";
import { EventSheet, type EventFormTarget } from "./event-form";
import { HomeSheet } from "./home-sheet";
import { RecommendationPanel, type RecState } from "./recommendation-card";

export interface Day {
  dateKey: string; // "YYYY-MM-DD", London calendar day
  /** Timetable classes, the student's events and to-do blocks. */
  events: TimetableEvent[];
  gaps: Gap[];
  /** Deadlines due this day that are shown on Today, as flags. */
  deadlines: Deadline[];
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
    tone: e.todoId ? "todo" : !e.manualId || e.fromClass ? "timetable" : e.kind === "society" ? "society" : "mine",
    title: [e.moduleCode, e.title].filter(Boolean).join(" "),
    detail: e.room || undefined,
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
}) {
  const [dateKey, setDateKey] = useState(
    days.some((d) => d.dateKey === initialDateKey) ? initialDateKey : days[0]?.dateKey,
  );
  const [openId, setOpenId] = useState<string | null>(null);
  // Cached per gap, so collapsing and reopening a gap doesn't call Claude (and spend tokens) again.
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
  const openDeadline = day?.deadlines.find((d) => `deadline-${d.id}` === openId);

  /** Takes a to-do or deadline off the calendar. It stays in its own tab. */
  function removeFromToday() {
    if (openTodo) saveTodos(todos.map((t) => (t.id === openTodo.todoId ? setOnToday(t, false) : t)));
    if (openDeadline) setDeadlineOnCalendar(openDeadline.id, false);
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
    // A to-do block opens a small panel under it instead of the event form.
    if (e.todoId) return setOpenId(openId === id ? null : id);
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
          ...requestContext({ deadlines, societies, home, todos, manualEvents }),
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      next = { status: "ok", rec: (await res.json()) as Recommendation };
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
    if (!recs[gap.id] && day) void loadRec(gap, day.gaps);
  }

  const panel = !day
    ? null
    : openGap
      ? { title: "Free gap", body: <GapPanel gap={openGap} rec={recs[openGap.id]} onReload={() => loadRec(openGap, day.gaps)} /> }
      : openTodo
        ? {
            title: "To-do",
            body: (
              <ItemPanel
                title={openTodo.title}
                when={`${time(openTodo.start)}–${time(openTodo.end)} · To-do`}
                href="/todo"
                tab="To-do"
                onRemove={removeFromToday}
              />
            ),
          }
        : openDeadline
          ? {
              title: "Deadline",
              body: (
                <ItemPanel
                  title={[openDeadline.moduleCode, openDeadline.title].filter(Boolean).join(" ")}
                  when={`Due ${time(openDeadline.due)} · Deadline`}
                  href="/deadlines"
                  tab="Deadlines"
                  onRemove={removeFromToday}
                />
              ),
            }
          : null;

  return (
    // Exactly the screen above the tab bar (min-h-16 + its 1px border + the safe area). dvh, so
    // mobile browser bars can't make it scroll. Only the sheets scroll.
    <main className="mx-auto flex h-dvh w-full max-w-md flex-col overflow-hidden px-4 pb-[calc(4rem+1px+env(safe-area-inset-bottom))] pt-4">
      {/* Only rendered in the browser (<Home> shows a skeleton on the server), so reading today here can't mismatch. */}
      <header className="mb-2 shrink-0">
        <div className="flex items-center gap-2">
          <h1 className="min-w-0 flex-1 truncate text-2xl font-semibold tracking-tight">
            {day ? dayTitle(day.dateKey, todayKey) : "Today"}
          </h1>
          <HomeChip home={home} onClick={() => setHomeSheetOpen(true)} />
          {mode === "user" && (
            <Link
              href="/timetable"
              className="flex min-h-10 shrink-0 items-center rounded-full px-2 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
            >
              Edit timetable
            </Link>
          )}
        </div>
        {day && (
          // Worked out from this day's events on every render, so it follows timetable edits.
          <p className="truncate text-sm text-zinc-600 dark:text-zinc-400">
            {londonDayMonth.format(dayDate(day.dateKey))} · {dayNote(day.dateKey, todayKey, day.events)}
          </p>
        )}
      </header>
      {homeSheetOpen && <HomeSheet home={home} onClose={() => setHomeSheetOpen(false)} />}
      {eventForm && (
        <EventSheet
          target={eventForm}
          eventsOn={(k) => days.find((d) => d.dateKey === k)?.events ?? []}
          onClose={() => setEventForm(null)}
        />
      )}
      {panel && (
        <DaySheet title={panel.title} onClose={() => setOpenId(null)}>
          {panel.body}
        </DaySheet>
      )}

      {mode === "demo" && (
        <Link
          href="/setup"
          className="mb-2 flex shrink-0 items-center justify-between gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-sm text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:text-emerald-950 dark:hover:bg-emerald-400"
        >
          <span className="truncate">
            <span className="font-semibold">Demo week</span> · Snap your timetable to make it yours
          </span>
          <span aria-hidden>→</span>
        </Link>
      )}

      {weekStarts.length > 1 && (
        <div className="mb-1 flex shrink-0 items-center justify-between">
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

      {/* Takes whatever height is left; the calendar sizes its hours to fit it. */}
      <div className="min-h-0 flex-1">
        {day && (
          <DayCalendar
            fit
            events={day.events.map(toCalendarEvent)}
            gaps={day.gaps.map(toCalendarGap)}
            markers={day.deadlines.map(toCalendarMarker)}
            nowMin={day.dateKey === todayKey ? minuteOfDay(nowIso) : null}
            openId={openId}
            onEventTap={editEvent}
            onMarkerTap={(id) => setOpenId(openId === id ? null : id)}
            onSlotTap={(min) => setEventForm({ kind: "new", draft: blankDraft(day.dateKey, min) })}
            onGapTap={(id) => {
              const gap = day.gaps.find((g) => g.id === id);
              if (gap) toggleGap(gap);
            }}
          />
        )}
      </div>
      {day && (
        <div className="shrink-0">
          <KindLegend />
        </div>
      )}

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
      className="flex size-9 items-center justify-center rounded-full text-2xl text-zinc-600 hover:bg-zinc-100 disabled:opacity-30 disabled:hover:bg-transparent dark:text-zinc-400 dark:hover:bg-zinc-900"
    >
      {children}
    </button>
  );
}

/** Opens inline under a tapped gap: the trip, what's either side, then Claude's picks. */
function GapPanel({ gap, rec, onReload }: { gap: Gap; rec: RecState | undefined; onReload: () => void }) {
  const from = place(gap.locationId);
  const to = place(gap.nextLocationId);
  const sameBuilding = gap.locationId === gap.nextLocationId;

  return (
    <div
      id={`${gap.id}-panel`}
      className="rounded-2xl border-2 border-emerald-400 bg-emerald-50 p-4 dark:border-emerald-700 dark:bg-emerald-950/40"
    >
      <div className="mb-3 border-b border-emerald-200 pb-3 text-sm text-emerald-900 dark:border-emerald-800 dark:text-emerald-100">
        <p className="font-semibold">
          <span className="tabular-nums">
            {time(gap.start)}–{time(gap.end)}
          </span>{" "}
          · {formatDurationShort(gap.durationMins)} free · {formatDurationShort(gap.usableMins)} usable
        </p>
        <p className="mt-0.5 text-emerald-800 dark:text-emerald-200">
          {sameBuilding
            ? `Staying in ${from}, no walk needed`
            : `${from} → ${to}, ${formatDurationShort(gap.travelMins)} ${gap.travelMode === "tube" ? "by tube" : "walk"}`}
        </p>
        <p className="mt-2">
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

/** Opens under a tapped to-do block or deadline flag: what it is, and a way to take it off Today. */
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
  onRemove: () => void;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <p className="font-semibold">{title}</p>
      <p className="mt-0.5 text-sm tabular-nums text-zinc-600 dark:text-zinc-400">{when}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onRemove}
          className="min-h-11 rounded-full bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Remove from Today
        </button>
        <Link
          href={href}
          className="flex min-h-11 items-center rounded-full px-3 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
        >
          Open {tab} tab
        </Link>
      </div>
      <p className="mt-2 text-xs text-zinc-500">It stays in the {tab} tab, and you can add it back there.</p>
    </div>
  );
}

/** Opens the Home sheet. A small chip in the header: where home is, or "Add home". */
function HomeChip({ home, onClick }: { home: Home | null; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      aria-label={home ? `Home: ${homeLabel(home)}. Change` : "Add your home"}
      className={`flex min-h-10 min-w-0 max-w-[9rem] shrink items-center gap-1 rounded-full px-3 text-sm transition-colors ${
        home
          ? "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          : "border border-dashed border-emerald-400 font-medium text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
      }`}
    >
      <span aria-hidden>🏠</span>
      <span className="truncate">{home ? homeLabel(home) : "Add home"}</span>
    </button>
  );
}
