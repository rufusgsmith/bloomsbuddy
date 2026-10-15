"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BUILDINGS } from "@/lib/buildings";
import { dayNote } from "@/lib/day-note";
import { formatDurationShort } from "@/lib/duration";
import { londonDateKey } from "@/lib/gaps";
import { homeLabel, homeLocation } from "@/lib/home";
import { addDays, formatTime, londonTodayKey, mondayOf } from "@/lib/london-time";
import type { Deadline, Gap, Home, Recommendation, Society, TimetableEvent, Todo } from "@/lib/types";
import { PageHeader } from "./form-ui";
import { HomeSheet } from "./home-sheet";
import { RecommendationPanel, type RecState } from "./recommendation-card";

export interface Day {
  dateKey: string; // "YYYY-MM-DD", London calendar day
  events: TimetableEvent[];
  gaps: Gap[];
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

type Item = { kind: "event"; event: TimetableEvent } | { kind: "gap"; gap: Gap } | { kind: "now"; at: number };

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

/**
 * The day's items with a "now" marker slotted in by time. Only on today, and only between
 * the first item's start and the last item's end: outside that there's no timeline to mark.
 */
function withNowLine(items: Item[], dateKey: string, now: number): Item[] {
  if (items.length === 0 || londonDateKey(new Date(now).toISOString()) !== dateKey) return items;
  const first = Date.parse(startOf(items[0]));
  const last = Math.max(...items.map((i) => Date.parse(endOf(i))));
  if (now < first || now > last) return items;
  const at = items.findIndex((i) => Date.parse(startOf(i)) > now);
  const marker: Item = { kind: "now", at: now };
  return at === -1 ? [...items, marker] : [...items.slice(0, at), marker, ...items.slice(at)];
}

export function TodayTimeline({
  days,
  initialDateKey,
  mode,
  deadlines,
  societies,
  home,
  todos = [],
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
}) {
  const [dateKey, setDateKey] = useState(
    days.some((d) => d.dateKey === initialDateKey) ? initialDateKey : days[0]?.dateKey,
  );
  const [openGapId, setOpenGapId] = useState<string | null>(null);
  // Cached per gap, so collapsing and reopening a gap doesn't call Claude (and spend tokens) again.
  const [recs, setRecs] = useState<Record<string, RecState>>({});
  const [homeSheetOpen, setHomeSheetOpen] = useState(false);
  const homeLoc = homeLocation(home);
  // Repeating to-dos go too, even if ticked: /api/recommend works out which come up on the gap's day.
  const openTodos = todos.filter((t) => !t.done || t.repeat);

  const day = days.find((d) => d.dateKey === dateKey);

  // Days are shown a week at a time: a whole term of day buttons wouldn't fit.
  const weekStarts = [...new Set(days.map((d) => mondayOf(d.dateKey)))];
  const weekStart = dateKey ? mondayOf(dateKey) : weekStarts[0];
  const weekIndex = weekStarts.indexOf(weekStart);
  const weekDays = days.filter((d) => mondayOf(d.dateKey) === weekStart);

  function selectDay(key: string) {
    setDateKey(key);
    setOpenGapId(null);
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
  const todayKey = londonTodayKey();
  const sorted: Item[] = day
    ? [
        ...day.events.map((event): Item => ({ kind: "event", event })),
        ...day.gaps.map((gap): Item => ({ kind: "gap", gap })),
      ].sort((a, b) => Date.parse(startOf(a)) - Date.parse(startOf(b)))
    : [];
  const items = day ? withNowLine(sorted, day.dateKey, now) : sorted;

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
          ...(deadlines ? { deadlines } : {}),
          ...(societies?.length ? { societies } : {}),
          ...(homeLoc ? { home: homeLoc } : {}),
          ...(openTodos.length ? { todos: openTodos } : {}),
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
    if (openGapId === gap.id) {
      setOpenGapId(null);
      return;
    }
    setOpenGapId(gap.id);
    if (!recs[gap.id] && day) void loadRec(gap, day.gaps);
  }

  return (
    <main className="mx-auto w-full max-w-md px-4 pb-28 pt-8">
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

      <nav className="mb-6 flex gap-1.5" aria-label="Choose a day">
        {weekDays.map((d) => {
          const active = d.dateKey === dateKey;
          const isToday = d.dateKey === todayKey;
          const weekend = dayDate(d.dateKey).getUTCDay() % 6 === 0;
          return (
            <button
              key={d.dateKey}
              type="button"
              onClick={() => selectDay(d.dateKey)}
              aria-pressed={active}
              aria-current={isToday ? "date" : undefined}
              className={`relative flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center rounded-xl text-xs transition-colors ${
                active
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : `hover:bg-zinc-200 dark:hover:bg-zinc-800 ${
                      weekend
                        ? "bg-zinc-50 text-zinc-500 dark:bg-zinc-900/50 dark:text-zinc-500"
                        : "bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400"
                    }`
              }`}
            >
              <span>{londonWeekday.format(dayDate(d.dateKey))}</span>
              <span className="text-base font-semibold">{dayDate(d.dateKey).getUTCDate()}</span>
              {/* Marks the real today, so it's easy to find again after browsing other days. */}
              {isToday && (
                <span
                  aria-hidden
                  className={`absolute bottom-1 size-1 rounded-full ${active ? "bg-emerald-400 dark:bg-emerald-600" : "bg-emerald-600 dark:bg-emerald-400"}`}
                />
              )}
            </button>
          );
        })}
      </nav>

      {items.length === 0 ? (
        <p className="rounded-2xl bg-zinc-100 p-6 text-center text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
          {day ? dayNote(day.dateKey, todayKey, []) : "Nothing scheduled today"}
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {items.map((item) =>
            item.kind === "now" ? (
              <li key="now">
                <NowLine at={item.at} />
              </li>
            ) : item.kind === "event" ? (
              <li key={item.event.id}>
                <EventBlock event={item.event} />
              </li>
            ) : (
              <li key={item.gap.id}>
                <GapBlock
                  gap={item.gap}
                  open={openGapId === item.gap.id}
                  onToggle={() => toggleGap(item.gap)}
                  rec={recs[item.gap.id]}
                  onRetry={() => day && loadRec(item.gap, day.gaps)}
                />
              </li>
            ),
          )}
        </ol>
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

function startOf(item: Item): string {
  if (item.kind === "now") return new Date(item.at).toISOString();
  return item.kind === "event" ? item.event.start : item.gap.start;
}

function endOf(item: Item): string {
  if (item.kind === "now") return new Date(item.at).toISOString();
  return item.kind === "event" ? item.event.end : item.gap.end;
}

/** A red rule across the timeline at the current time, e.g. "● 14:52 ────". */
function NowLine({ at }: { at: number }) {
  const label = time(new Date(at).toISOString());
  return (
    <div role="separator" aria-label={`Now, ${label}`} className="flex items-center gap-2">
      <span aria-hidden className="size-2.5 shrink-0 rounded-full bg-red-500" />
      <span className="text-xs font-semibold tabular-nums text-red-600 dark:text-red-400">{label}</span>
      <span aria-hidden className="h-0.5 flex-1 bg-red-500" />
    </div>
  );
}

function EventBlock({ event }: { event: TimetableEvent }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center justify-between gap-2 text-sm text-zinc-500">
        <span className="tabular-nums">
          {time(event.start)}–{time(event.end)}
        </span>
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs capitalize dark:bg-zinc-800">
          {event.kind}
        </span>
      </div>
      <p className="mt-1 font-semibold">
        <span className="text-zinc-500">{event.moduleCode}</span> {event.title}
      </p>
      <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">{event.room}</p>
    </div>
  );
}

function GapBlock({
  gap,
  open,
  onToggle,
  rec,
  onRetry,
}: {
  gap: Gap;
  open: boolean;
  onToggle: () => void;
  rec: RecState | undefined;
  onRetry: () => void;
}) {
  const from = place(gap.locationId);
  const to = place(gap.nextLocationId);
  const sameBuilding = gap.locationId === gap.nextLocationId;

  // The header and the panel are siblings: the panel has its own buttons, and buttons can't nest.
  return (
    <div className="rounded-2xl border-2 border-dashed border-emerald-400 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/40">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={`${gap.id}-panel`}
        className="block w-full rounded-2xl p-4 text-left transition-colors hover:bg-emerald-100 active:bg-emerald-100 dark:hover:bg-emerald-950/70"
      >
        <span className="flex items-center justify-between gap-2 text-sm text-emerald-700 dark:text-emerald-300">
          <span className="tabular-nums">
            {time(gap.start)}–{time(gap.end)}
          </span>
          <span aria-hidden className={`transition-transform ${open ? "rotate-180" : ""}`}>
            ▾
          </span>
        </span>
        <span className="block mt-1 font-semibold text-emerald-900 dark:text-emerald-100">
          {formatDurationShort(gap.durationMins)} free · {formatDurationShort(gap.usableMins)} usable
        </span>
        <span className="block mt-0.5 text-sm text-emerald-800 dark:text-emerald-200">
          {sameBuilding ? `Staying in ${from}, no walk needed` : `${from} → ${to}, ${formatDurationShort(gap.travelMins)} ${gap.travelMode === "tube" ? "by tube" : "walk"}`}
        </span>
      </button>

      {open && (
        <div id={`${gap.id}-panel`} className="mx-4 mb-4 border-t border-emerald-200 pt-3 dark:border-emerald-800">
          <div className="mb-3 text-sm text-emerald-900 dark:text-emerald-100">
            <p>
              After <strong>{gap.prevEvent.title}</strong> ({place(gap.prevLocationId)})
            </p>
            <p>
              Before <strong>{gap.nextEvent.title}</strong> at {time(gap.end)} ({gap.nextEvent.room})
            </p>
          </div>
          <RecommendationPanel state={rec ?? { status: "loading" }} onRetry={onRetry} />
        </div>
      )}
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
          <span className="block font-semibold text-emerald-700 dark:text-emerald-300">🏠 Add your home</span>
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
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-lg dark:bg-emerald-950"
      >
        🏠
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
