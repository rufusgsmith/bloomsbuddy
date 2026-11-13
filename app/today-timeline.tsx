"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { BUILDINGS } from "@/lib/buildings";
import { setDeadlineOnCalendar, setOnToday } from "@/lib/calendar-items";
import { dayNote } from "@/lib/day-note";
import { formatDurationShort } from "@/lib/duration";
import { londonDateKey } from "@/lib/gaps";
import { homeLabel } from "@/lib/home";
import { readRec, recFingerprint, saveRec } from "@/lib/rec-cache";
import { requestContext } from "@/lib/request-context";
import { addDays, dayOfWeek, formatTime, londonWeekdayAndMinutes, mondayOf } from "@/lib/london-time";
import { demoNow } from "@/lib/mock";
import { demoRecommendation } from "@/lib/mock/recommendations";
import { blankDraft, deleteManualEvent, draftFromClass, draftFromManual, nextHalfHour } from "@/lib/manual-events";
import { saveTodos } from "@/lib/todos";
import type { Deadline, Gap, Home, ManualEvent, Recommendation, Society, TimetableEvent, Todo } from "@/lib/types";
import { allDayText, type AllDayItem } from "@/lib/all-day";
import { useClaudeConnected } from "./claude-status";
import { DayPills, KindLegend, type CalendarEvent, type CalendarGap, type CalendarMarker } from "./day-calendar";
import { DayList } from "./day-list";
import { EventSheet, type EventFormTarget } from "./event-form";
import { PAGE_HEIGHT, primaryButtonClass, secondaryButtonClass, Segmented, SidePanel } from "./form-ui";
import { HomeIcon, PlusIcon, SparkleIcon } from "./icons";
import { HomeSheet } from "./home-sheet";
import { IcsImportSheet } from "./ics-import";
import { MiniMonth } from "./mini-month";
import { DEMO_STEP_MS, DEMO_THINKING_MS, RecommendationPanel, type RecState } from "./recommendation-card";
import { WeekCalendar } from "./week-calendar";

export interface Day {
  dateKey: string; // "YYYY-MM-DD", London calendar day
  /** Timetable classes, the student's events and to-do blocks. */
  events: TimetableEvent[];
  gaps: Gap[];
  /** Gaps too short for Claude: empty gap boxes, not tappable. */
  shortGaps: Gap[];
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

function toShortCalendarGap(g: Gap): CalendarGap {
  return { id: g.id, startMin: minuteOfDay(g.start), endMin: minuteOfDay(g.end), label: "", plain: true };
}

type View = "week" | "day";
const VIEW_KEY = "bloomsbuddy:today-view";

function readView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === "day" ? "day" : "week";
  } catch {
    return "week";
  }
}

function saveView(v: View) {
  try {
    localStorage.setItem(VIEW_KEY, v);
  } catch {
    // Private mode: the toggle still works, it just isn't remembered.
  }
}

/** Wide enough for seven columns. Below this, Today always shows the Day view. */
const WIDE = "(min-width: 768px)";
function useWide(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(WIDE);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(WIDE).matches,
    () => true,
  );
}

/** "13–19 Oct", or "27 Oct – 2 Nov" across a month end. */
function weekRange(first: string, last: string): string {
  const a = dayDate(first);
  const b = dayDate(last);
  return a.getUTCMonth() === b.getUTCMonth()
    ? `${a.getUTCDate()}–${londonDayMonth.format(b)}`
    : `${londonDayMonth.format(a)} – ${londonDayMonth.format(b)}`;
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
  onOpenChat,
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
  /** Opens the chat assistant (mounted by Home, outside this keyed component). */
  onOpenChat: () => void;
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
  const [importOpen, setImportOpen] = useState(false);
  const [chosenView, setChosenView] = useState<View>(readView);
  const wide = useWide();
  const view: View = wide ? chosenView : "day";
  const connected = useClaudeConnected();
  // The demo week is the same for everyone: nothing in it can be added, edited or removed.
  const readOnly = mode === "demo";

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

  function chooseView(v: View) {
    setChosenView(v);
    saveView(v);
  }

  /** Step a day in the Day view (any day of term). */
  function moveDay(step: number) {
    const i = days.findIndex((d) => d.dateKey === dateKey);
    const next = days[i + step];
    if (next) selectDay(next.dateKey);
  }

  /** A tap in the week grid: that day becomes the selected one, so its items are the ones looked up. */
  function tapOn(key: string, id: string, then?: (d: Day) => void) {
    setDateKey(key);
    const d = days.find((x) => x.dateKey === key);
    if (d && then) then(d);
    else setOpenId(openId === id ? null : id);
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
  const realNow = useNow();
  // The demo week is always 19–25 Oct 2026: "now" is today's real weekday and time placed in it.
  const now = mode === "demo" ? demoNow(realNow) : realNow;
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

  function editEvent(id: string, on: Day | undefined = day) {
    const e = on?.events.find((x) => x.id === id);
    if (!on || !e) return;
    // A to-do or exam block opens a small panel under it instead of the event form.
    if (e.todoId || e.deadlineId) return setOpenId(openId === id ? null : id);
    if (readOnly) return;
    const manual = e.manualId ? manualEvents.find((m) => m.id === e.manualId) : undefined;
    setEventForm(
      manual
        ? { kind: "manual", event: manual, draft: draftFromManual(manual) }
        : { kind: "class", event: e, dateKey: on.dateKey, draft: draftFromClass(e, on.dateKey) },
    );
  }

  async function loadRec(gap: Gap, dayGaps: Gap[], on: Day | undefined = day) {
    setRecs((r) => ({ ...r, [gap.id]: mode === "demo" ? { status: "loading", stepMs: DEMO_STEP_MS } : { status: "loading" } }));
    let next: RecState;
    if (mode === "demo") {
      // The demo week never calls Claude: its picks are written in advance (lib/mock/recommendations.ts).
      // The pause runs through each "Checking…" line once, quickly, like a real answer would.
      await new Promise((resolve) => setTimeout(resolve, DEMO_THINKING_MS));
      const rec = demoRecommendation(gap);
      next = rec ? { status: "ok", rec } : { status: "offline" };
      setRecs((r) => ({ ...r, [gap.id]: next }));
      return;
    }
    if (!connected) {
      setRecs((r) => ({ ...r, [gap.id]: { status: "offline" } }));
      return;
    }
    try {
      const res = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gap,
          dayGaps,
          // Not busy time, but Claude should know ("Seven Sisters hike (Time TBC)").
          ...(on?.allDay.length ? { allDay: on.allDay.map(allDayText) } : {}),
          ...requestContext({ deadlines, societies, home, todos, manualEvents }),
        }),
      });
      if (res.status === 503) {
        setRecs((r) => ({ ...r, [gap.id]: { status: "offline" } }));
        return;
      }
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

  function toggleGap(gap: Gap, on: Day | undefined = day) {
    if (openId === gap.id) {
      setOpenId(null);
      return;
    }
    setOpenId(gap.id);
    if (recs[gap.id] || !on) return;
    const saved = mode === "user" ? readRec(recFingerprint(gap, cacheKey)) : undefined;
    if (saved) setRecs((r) => ({ ...r, [gap.id]: { status: "ok", rec: saved } }));
    else void loadRec(gap, on.gaps, on);
  }

  const first = weekDays[0]?.dateKey;
  const last = weekDays[weekDays.length - 1]?.dateKey;
  const nowMin = minuteOfDay(nowIso);
  const dayIndex = days.findIndex((d) => d.dateKey === dateKey);
  const prevDisabled = view === "week" ? weekIndex <= 0 : dayIndex <= 0;
  const nextDisabled = view === "week" ? weekIndex >= weekStarts.length - 1 : dayIndex >= days.length - 1;

  const panel = !day
    ? null
    : openGap
      ? {
          title: `Free ${time(openGap.start)}–${time(openGap.end)}`,
          subtitle: `${londonWeekdayLong.format(dayDate(day.dateKey))} ${londonDayMonth.format(dayDate(day.dateKey))} · ${formatDurationShort(openGap.durationMins)} free`,
          body: <GapPanel gap={openGap} rec={recs[openGap.id]} onReload={() => loadRec(openGap, day.gaps)} />,
        }
      : openTodo
        ? {
            title: openTodo.title,
            subtitle: `${time(openTodo.start)}–${time(openTodo.end)} · To-do`,
            body: <ItemPanel href="/todo" tab="To-do" onRemove={readOnly ? undefined : removeFromToday} readOnly={readOnly} />,
          }
        : openExam
          ? {
              title: [openExam.moduleCode, openExam.title].filter(Boolean).join(" "),
              subtitle: [
                `${time(openExam.start)}–${time(openExam.end)}`,
                "Exam",
                openExam.buildingId ? place(openExam.buildingId) : openExam.place?.label,
              ]
                .filter(Boolean)
                .join(" · "),
              body: <ItemPanel href="/deadlines" tab="Deadlines" readOnly={readOnly} />,
            }
          : openAllDay
            ? {
                title: openAllDay.title,
                subtitle: `${openAllDay.label} · Society`,
                body: <ItemPanel href="/societies" tab="Societies" onRemove={readOnly ? undefined : removeFromToday} readOnly={readOnly} />,
              }
            : openDeadline
              ? {
                  title: [openDeadline.moduleCode, openDeadline.title].filter(Boolean).join(" "),
                  subtitle: `Due ${time(openDeadline.due)} · Deadline`,
                  body: <ItemPanel href="/deadlines" tab="Deadlines" onRemove={readOnly ? undefined : removeFromToday} readOnly={readOnly} />,
                }
              : null;

  /** Taps from either view, once the item's day is known. */
  const tapEvent = (d: Day, id: string) => {
    const e = d.events.find((x) => x.id === id);
    if (e && !e.todoId && !e.deadlineId) setOpenId(null);
    editEvent(id, d);
  };
  const tapGap = (d: Day, id: string) => {
    const gap = d.gaps.find((g) => g.id === id);
    if (gap) toggleGap(gap, d);
  };

  /** "Create": a menu of ways to add to the calendar. The demo week can't be changed, so there it's the way to set up your own. */
  const create = (compact: boolean) =>
    readOnly ? (
      <Link href="/setup" aria-label="Set up my week" className={compact ? primaryButtonClass : CREATE_CLASS}>
        <PlusIcon className={compact ? "size-4" : "size-6"} />
        {/* Icon only on a phone, so the day's title keeps its room. */}
        <span className={compact ? "hidden sm:inline" : ""}>Set up my week</span>
      </Link>
    ) : (
      <CreateMenu
        compact={compact}
        items={[
          { label: "Event", onSelect: addEvent },
          { label: "Import .ics file", onSelect: () => setImportOpen(true) },
          ...(mode === "user" ? [{ label: "Edit timetable", href: "/timetable" }] : []),
        ]}
      />
    );

  return (
    // Exactly the screen beside (or under) the nav. The top bar stays put and only the calendar scrolls.
    <main className={`flex ${PAGE_HEIGHT} w-full flex-col overflow-hidden`}>
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 px-4 pb-2 pt-3 md:pr-2">
        {/* The name sits over the sidebar, as wide as it (16rem less this bar's padding and gap). No logo. */}
        <span className="hidden w-[14.25rem] shrink-0 pl-2 text-[22px] text-muted lg:block">Bloomsbuddy</span>
        {/* Only rendered in the browser (<Home> shows a skeleton on the server), so reading today here can't mismatch. */}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="flex shrink-0">
            <StepButton label={view === "week" ? "Previous week" : "Previous day"} disabled={prevDisabled} onClick={() => (view === "week" ? moveWeek(-1) : moveDay(-1))}>
              ‹
            </StepButton>
            <StepButton label={view === "week" ? "Next week" : "Next day"} disabled={nextDisabled} onClick={() => (view === "week" ? moveWeek(1) : moveDay(1))}>
              ›
            </StepButton>
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-[22px] leading-tight">
              {view === "week"
                ? first && last
                  ? weekRange(first, last)
                  : "This week"
                : day
                  ? `${dayTitle(day.dateKey, todayKey)}, ${londonDayMonth.format(dayDate(day.dateKey))}`
                  : "Today"}
            </h1>
            <p className="truncate text-sm text-muted">
              {view === "week"
                ? mode === "demo"
                  ? "Demo week"
                  : `Week ${weekIndex + 1} of ${weekStarts.length}`
                : // Worked out from this day's events on every render, so it follows timetable edits.
                  day && dayNote(day.dateKey, todayKey, day.events)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Below lg there's no sidebar, so Create sits here. */}
          <div className="lg:hidden">{create(true)}</div>
          <HomeButton home={home} onClick={readOnly ? undefined : () => setHomeSheetOpen(true)} />
          <button type="button" onClick={onOpenChat} aria-haspopup="dialog" aria-label="Ask Bloomsbuddy" className={secondaryButtonClass}>
            <SparkleIcon className="size-4 text-emerald-600 dark:text-emerald-400" />
            {/* Icon only on a phone, so the header stays one row. */}
            <span className="hidden sm:inline">Ask Bloomsbuddy</span>
          </button>
          {wide && (
            <Segmented
              label="Calendar view"
              value={view}
              onChange={chooseView}
              options={[
                { value: "week", label: "Week" },
                { value: "day", label: "Day" },
              ]}
            />
          )}
        </div>
      </div>

      {homeSheetOpen && <HomeSheet home={home} onClose={() => setHomeSheetOpen(false)} />}
      {importOpen && (
        <IcsImportSheet
          eventsOn={(k) => days.find((d) => d.dateKey === k)?.events ?? []}
          lastDay={days[days.length - 1]?.dateKey ?? ""}
          manualEvents={manualEvents}
          onClose={() => setImportOpen(false)}
        />
      )}
      {eventForm && (
        <EventSheet
          target={eventForm}
          eventsOn={(k) => days.find((d) => d.dateKey === k)?.events ?? []}
          onClose={() => setEventForm(null)}
        />
      )}
      {panel && (
        <SidePanel title={panel.title} subtitle={panel.subtitle} onClose={() => setOpenId(null)}>
          {panel.body}
        </SidePanel>
      )}

      <div className="flex min-h-0 flex-1">
        {/* lg and up: the sidebar, on the page colour beside the calendar panel. */}
        <aside aria-label="Calendar tools" className="hidden w-64 shrink-0 flex-col gap-7 overflow-y-auto px-4 pb-6 pt-2 lg:flex">
          <div>{create(false)}</div>
          {dateKey && (
            <MiniMonth
              selected={dateKey}
              todayKey={todayKey}
              wholeWeek={view === "week"}
              isAvailable={(k) => days.some((d) => d.dateKey === k)}
              onSelect={selectDay}
            />
          )}
          <section className="pl-2">
            <h2 className="mb-3 text-sm font-medium">Colours</h2>
            <KindLegend list />
          </section>
        </aside>

        {/* The calendar: a white rounded panel from md, the page itself on a phone. */}
        <div className="flex min-w-0 flex-1 flex-col md:mb-2 md:overflow-hidden md:rounded-2xl md:bg-surface">
          {mode === "demo" && (
            <p className="mx-4 mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-100">
              <span>This is a demo week, so it&apos;s read-only. Tap a free gap to see what Bloomsbuddy suggests, or set up your own week.</span>
              <Link href="/setup" className="font-medium underline underline-offset-2 hover:no-underline">
                Set up my week
              </Link>
            </p>
          )}
          {view === "day" && (
            <div className="mx-auto w-full max-w-3xl px-4 pt-3">
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
          )}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className={view === "week" ? "pb-6" : "mx-auto w-full max-w-3xl px-4 pb-10 pt-2"}>
              {view === "week" ? (
                <WeekCalendar
                  days={weekDays.map((d) => ({
                    dateKey: d.dateKey,
                    weekday: londonWeekday.format(dayDate(d.dateKey)),
                    date: dayDate(d.dateKey).getUTCDate(),
                    isToday: d.dateKey === todayKey,
                    events: d.events.map(toCalendarEvent),
                    gaps: [...d.gaps.map(toCalendarGap), ...d.shortGaps.map(toShortCalendarGap)],
                    markers: d.deadlines.map(toCalendarMarker),
                    allDay: d.allDay,
                  }))}
                  nowMin={weekDays.some((d) => d.dateKey === todayKey) ? nowMin : null}
                  openId={openId}
                  onDayTap={(k) => {
                    selectDay(k);
                    chooseView("day");
                  }}
                  onEventTap={(k, id) => tapOn(k, id, (d) => tapEvent(d, id))}
                  onGapTap={(k, id) => tapOn(k, id, (d) => tapGap(d, id))}
                  onMarkerTap={(k, id) => tapOn(k, id)}
                  onAllDayTap={(k, id) => tapOn(k, id)}
                  onSlotTap={readOnly ? undefined : (k, min) => setEventForm({ kind: "new", draft: blankDraft(k, min) })}
                />
              ) : (
                day && (
                  <DayList
                    events={day.events.map(toCalendarEvent)}
                    gaps={day.gaps.map(toCalendarGap)}
                    markers={day.deadlines.map(toCalendarMarker)}
                    allDay={day.allDay}
                    openId={openId}
                    onEventTap={(id) => tapEvent(day, id)}
                    onGapTap={(id) => tapGap(day, id)}
                    onMarkerTap={(id) => setOpenId(openId === id ? null : id)}
                    onAllDayTap={(id) => setOpenId(openId === id ? null : id)}
                    onAdd={readOnly ? undefined : addEvent}
                  />
                )
              )}
              {/* Below lg the sidebar's colour list isn't there, so it goes under the calendar. */}
              {day && (
                <div className={`lg:hidden ${view === "week" ? "px-4" : ""}`}>
                  <KindLegend />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

const CREATE_CLASS =
  "inline-flex h-14 items-center gap-3 rounded-2xl bg-surface pl-4 pr-5 text-sm font-medium text-foreground shadow-[0_1px_3px_rgba(60,64,67,0.3),0_4px_8px_3px_rgba(60,64,67,0.15)] transition-shadow hover:shadow-[0_1px_3px_rgba(60,64,67,0.3),0_6px_12px_4px_rgba(60,64,67,0.15)] dark:bg-zinc-800";

type CreateItem = { label: string; onSelect: () => void } | { label: string; href: string };

/** The "Create" button and its small menu. `compact` is the header's smaller version, which opens leftwards. */
function CreateMenu({ items, compact }: { items: CreateItem[]; compact: boolean }) {
  const [open, setOpen] = useState(false);
  const itemClass = "flex min-h-10 w-full items-center px-4 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800";
  return (
    <div className="relative" onKeyDown={(e) => e.key === "Escape" && setOpen(false)}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Create" className={compact ? primaryButtonClass : CREATE_CLASS}>
        <PlusIcon className={compact ? "size-4" : "size-6"} />
        {/* Icon only on a phone, so the day's title keeps its room. */}
        <span className={compact ? "hidden sm:inline" : ""}>Create</span>
        <span aria-hidden className={`text-[10px] opacity-70 ${compact ? "hidden sm:inline" : ""}`}>
          ▾
        </span>
      </button>
      {open && (
        <>
          {/* A click anywhere else closes the menu. */}
          <button type="button" aria-hidden tabIndex={-1} onClick={() => setOpen(false)} className="fixed inset-0 z-30 cursor-default" />
          <ul
            className={`absolute top-full z-40 mt-2 w-52 rounded-xl bg-surface py-2 shadow-[0_2px_6px_rgba(60,64,67,0.15),0_8px_24px_rgba(60,64,67,0.15)] ring-1 ring-line ${
              compact ? "right-0" : "left-0"
            }`}
          >
            {items.map((item, i) => (
              <li key={item.label}>
                {"href" in item ? (
                  <Link href={item.href} className={itemClass}>
                    {item.label}
                  </Link>
                ) : (
                  <button
                    type="button"
                    autoFocus={i === 0}
                    onClick={() => {
                      setOpen(false);
                      item.onSelect();
                    }}
                    className={itemClass}
                  >
                    {item.label}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function StepButton({
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
      className="flex size-10 items-center justify-center rounded-full text-2xl leading-none text-muted hover:bg-zinc-200/60 hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted dark:hover:bg-zinc-800"
    >
      {children}
    </button>
  );
}

/** The side panel for an open gap: the trip, what's either side, then Claude's picks. */
function GapPanel({ gap, rec, onReload }: { gap: Gap; rec: RecState | undefined; onReload: () => void }) {
  const from = place(gap.locationId);
  const to = place(gap.nextLocationId);
  const sameBuilding = gap.locationId === gap.nextLocationId;

  return (
    <div id={`${gap.id}-panel`}>
      <dl className="mb-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-xl border border-line bg-background p-3 text-sm">
        <dt className="text-muted">Usable</dt>
        <dd className="tabular-nums">
          {formatDurationShort(gap.usableMins)} ·{" "}
          {sameBuilding
            ? `staying in ${from}`
            : `${from} to ${to}, ${formatDurationShort(gap.travelMins)} ${gap.travelMode === "tube" ? "by tube" : "walk"}`}
        </dd>
        <dt className="text-muted">After</dt>
        <dd>
          <span className="font-medium">{gap.prevEvent.title}</span> ({place(gap.prevLocationId)})
        </dd>
        <dt className="text-muted">Before</dt>
        <dd>
          <span className="font-medium">{gap.nextEvent.title}</span> at <span className="tabular-nums">{time(gap.end)}</span>
          {gap.nextEvent.room && ` (${gap.nextEvent.room})`}
        </dd>
      </dl>
      <RecommendationPanel state={rec ?? { status: "loading" }} onReload={onReload} />
    </div>
  );
}

/**
 * The side panel for a to-do block, exam block or deadline flag: a way to take it off Today, and
 * its tab. An exam is fixed, so it has no onRemove: it's edited in the Deadlines tab instead.
 */
function ItemPanel({ href, tab, onRemove, readOnly }: { href: string; tab: string; onRemove?: () => void; readOnly?: boolean }) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {onRemove && (
          <button type="button" onClick={onRemove} className={primaryButtonClass}>
            Remove from Today
          </button>
        )}
        <Link href={href} className={secondaryButtonClass}>
          Open {tab}
        </Link>
      </div>
      <p className="mt-3 text-sm text-muted">
        {readOnly
          ? "The demo week is read-only. Set up your own week to change it."
          : onRemove
            ? `It stays in ${tab}, and you can add it back there.`
            : `Edit or delete it in ${tab}.`}
      </p>
    </div>
  );
}

/** Opens the Home sheet. Shows where home is, or invites the student to add it. */
function HomeButton({ home, onClick }: { home: Home | null; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      // No onClick in the demo week: it shows the demo home but can't change it.
      aria-disabled={!onClick}
      title={onClick ? undefined : "The demo week's home. Set up your own week to change it."}
      aria-haspopup={onClick ? "dialog" : undefined}
      aria-label={
        !onClick && home
          ? `Home: ${homeLabel(home)} (demo)`
          : home
            ? `Home: ${homeLabel(home)}. Change`
            : "Add your home, so I know when a gap's long enough to pop back"
      }
      className={`${secondaryButtonClass} max-w-56 ${onClick ? "" : "cursor-default hover:bg-surface dark:hover:bg-surface"}`}
    >
      <HomeIcon className={`size-4 shrink-0 ${home ? "text-muted" : "text-emerald-600 dark:text-emerald-400"}`} />
      <span className={`hidden truncate sm:inline ${home?.kind === "none" ? "text-muted" : ""}`}>{home ? homeLabel(home) : "Add your home"}</span>
    </button>
  );
}
