"use client";

import { ArrowRight, ChevronLeft, ChevronRight, House, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
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
import { EventSheet, type EventFormTarget } from "./event-form";
import { FAB_POSITION, ghostButton, iconButton, ICON, PAGE_FRAME, PageHeader, secondaryButton } from "./form-ui";
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

  return (
    // Exactly the screen above the tab bar (min-h-16 + its 1px border + the safe area); dvh, so
    // mobile browser bars don't change it. The top stays put and only the calendar scrolls.
    <main className={PAGE_FRAME}>
      <div className="shrink-0 border-b border-line px-4 pt-8 md:px-8 md:pt-10">
        {/* Only rendered in the browser (<Home> shows a skeleton on the server), so reading today here can't mismatch. */}
        <PageHeader
          title={day ? dayTitle(day.dateKey, todayKey) : "Today"}
          action={
            mode === "user" && (
              <Link href="/timetable" className={`${ghostButton} -mr-3 -mt-1`}>
                Edit timetable
              </Link>
            )
          }
        >
          {day && (
            <>
              {/* The note is worked out from this day's events on every render, so it follows timetable edits. */}
              <p className="mt-1 text-sm text-muted">
                <span className="text-ink">{londonDayMonth.format(dayDate(day.dateKey))}</span>
                <span aria-hidden> · </span>
                {dayNote(day.dateKey, todayKey, day.events)}
              </p>
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
          <p className="-mt-4 mb-1 flex flex-wrap items-center gap-x-2 text-sm text-muted">
            You&apos;re looking at a demo week.
            <Link href="/setup" className="inline-flex min-h-11 items-center gap-1 font-medium text-square hover:underline">
              Add your timetable
              <ArrowRight {...ICON} />
            </Link>
          </p>
        )}

        {weekStarts.length > 1 && (
          <div className="mb-2 flex items-center justify-between">
            <WeekButton label="Previous week" disabled={weekIndex <= 0} onClick={() => moveWeek(-1)}>
              <ChevronLeft size={20} strokeWidth={1.75} aria-hidden />
            </WeekButton>
            <p className="text-sm font-medium tabular-nums text-muted">
              Week {weekIndex + 1} · w/c {londonDayMonth.format(dayDate(weekStart))}
            </p>
            <WeekButton label="Next week" disabled={weekIndex >= weekStarts.length - 1} onClick={() => moveWeek(1)}>
              <ChevronRight size={20} strokeWidth={1.75} aria-hidden />
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
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-24 md:px-8">

        {day && (
          <DayCalendar
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
          className={`${FAB_POSITION} bottom-[calc(5rem+env(safe-area-inset-bottom))] z-30 flex size-14 items-center justify-center rounded-full bg-ink text-paper shadow-[0_2px_8px_rgb(0_0_0/0.15)] transition-opacity hover:opacity-90 md:bottom-6`}
        >
          <Plus size={24} strokeWidth={2} aria-hidden />
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
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={iconButton}
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
    <div id={`${gap.id}-panel`} className="rounded-xl border border-square/40 bg-surface p-4">
      <div className="mb-4 border-b border-line pb-3 text-sm">
        <p className="text-base font-semibold">
          {formatDurationShort(gap.usableMins)} to use{" "}
          <span className="font-normal tabular-nums text-muted">
            {time(gap.start)}–{time(gap.end)}
          </span>
        </p>
        <p className="mt-1 text-muted">
          {sameBuilding
            ? `Staying in ${from}, no walk needed`
            : `${from} to ${to}, ${formatDurationShort(gap.travelMins)} ${gap.travelMode === "tube" ? "by tube" : "walk"}`}
          {" · "}
          {formatDurationShort(gap.durationMins)} free in total
        </p>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
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
    <div className="rounded-xl border border-line bg-surface p-4">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm tabular-nums text-muted">{when}</p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" onClick={onRemove} className={secondaryButton}>
          Remove from Today
        </button>
        <Link href={href} className={ghostButton}>
          Open {tab} tab
        </Link>
      </div>
      <p className="mt-2 text-xs text-muted">It stays in the {tab} tab, and you can add it back there.</p>
    </div>
  );
}

/** Opens the Home sheet: one compact row with where home is, or an invite to add it. */
function HomeButton({ home, onClick }: { home: Home | null; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      aria-label={home ? `Home: ${homeLabel(home)}. Change` : "Add your home"}
      className="-mx-2 mt-2 flex min-h-11 w-[calc(100%+1rem)] items-center gap-2 rounded-lg px-2 text-left text-sm transition-colors hover:bg-sunken"
    >
      <House {...ICON} className="shrink-0 text-muted" />
      {home ? (
        <span className="min-w-0 flex-1 truncate">
          <span className="text-muted">Home: </span>
          <span className={home.kind === "none" ? "text-muted" : "font-medium"}>{homeLabel(home)}</span>
        </span>
      ) : (
        <span className="min-w-0 flex-1 truncate">
          <span className="font-medium text-square">Add your home</span>
          <span className="hidden text-muted sm:inline"> so I know when a gap&apos;s long enough to pop back</span>
        </span>
      )}
      <ChevronRight {...ICON} className="shrink-0 text-muted" />
    </button>
  );
}
