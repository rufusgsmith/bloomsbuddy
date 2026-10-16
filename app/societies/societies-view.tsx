"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { isAllDaySociety } from "@/lib/all-day";
import { clashMessage, findClashes } from "@/lib/clashes";
import { examBlocksOn, parseDeadlineIds, readRawHiddenExams, subscribeCalendarDeadlines } from "@/lib/calendar-items";
import { newId } from "@/lib/deadline-draft";
import { londonDateKey } from "@/lib/gaps";
import { addDays, formatTime, londonIso, londonTodayKey } from "@/lib/london-time";
import {
  dayEventsFor,
  deleteManualEvent,
  findSocietyAdd,
  manualFromSociety,
  parseEvents,
  readRawEvents,
  saveManualEvent,
  subscribeEvents,
  type EventStore,
} from "@/lib/manual-events";
import { CalendarButton, PageHeader, TabPage } from "../form-ui";
import { mockDeadlines, mockSocietyEvents, mockTimetable } from "@/lib/mock";
import { parseUserData, readRawUserData, saveUserData, subscribeUserData } from "@/lib/storage";
import { termEndKey } from "@/lib/term";
import { expandWeekly } from "@/lib/timetable";
import type { DateKey, Society, SocietyEvent, TimetableEvent, UserData } from "@/lib/types";
import { SocietyPicker } from "../society-picker";

// The Societies tab: the student's societies as chips (add/remove), then all their upcoming
// events until the end of term, grouped by day (past ones hidden). Each society loads on its
// own (scraping can take a few seconds), so one slow or broken SU page never holds up the rest.
// Without a saved timetable there's nowhere to save societies, so it shows the demo ones read-only.
// Any event can be added to the calendar (a one-off manual event linked by societyEventId), which
// works in the demo week too. One with no time (Time TBC) or over several days goes on as an
// all-day strip, which isn't busy time, so it skips the clash check.

type Result = { status: "ok"; events: SocietyEvent[] } | { status: "error" };

/** What adding an event needs: the saved manual events, and the timetable to check clashes against. */
interface Calendar {
  store: EventStore;
  timetable: TimetableEvent[];
}

const londonDay = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  weekday: "short",
  day: "numeric",
  month: "short",
});

export function SocietiesView() {
  // "" = checked, nothing saved. null = not checked yet (server render / hydration).
  const raw = useSyncExternalStore(subscribeUserData, () => readRawUserData() ?? "", () => null);
  const user = useMemo(() => parseUserData(raw), [raw]);
  const rawEvents = useSyncExternalStore(subscribeEvents, () => readRawEvents() ?? "", () => null);
  const store = useMemo(() => parseEvents(rawEvents), [rawEvents]);
  const rawHiddenExams = useSyncExternalStore(subscribeCalendarDeadlines, () => readRawHiddenExams() ?? "", () => null);
  // Browser only (raw is null on the server), so the demo week never moves with the server's clock.
  // Exams on the calendar are busy time too, so adding an event over one warns.
  const timetable = useMemo(() => {
    if (raw === null) return [];
    const classes = user ? expandWeekly(user.classes, user.termStart, user.weeks) : mockTimetable();
    const deadlines = user ? user.deadlines : mockDeadlines();
    const examDays = [...new Set(deadlines.filter((d) => d.exam).map((d) => londonDateKey(d.due)))];
    const hidden = parseDeadlineIds(rawHiddenExams);
    return [...classes, ...examDays.flatMap((k) => examBlocksOn(deadlines, k, hidden))];
  }, [raw, user, rawHiddenExams]);
  const calendar = useMemo(() => ({ store, timetable }), [store, timetable]);

  return (
    <TabPage top={<PageHeader title="Societies" />}>
      {raw === null ? <Skeleton /> : user ? <Mine user={user} calendar={calendar} /> : <Demo calendar={calendar} />}
    </TabPage>
  );
}

/** The student's own societies: editable, events fetched per society. */
function Mine({ user, calendar }: { user: UserData; calendar: Calendar }) {
  const societies = useMemo(() => user.societies ?? [], [user]);
  const [results, setResults] = useState<Record<string, Result>>({});
  const [saveFailed, setSaveFailed] = useState(false);
  // Slugs already asked for, so re-renders (and Strict Mode's double effect) don't refetch.
  const requested = useRef(new Set<string>());
  const [clock] = useState(() => ({ now: Date.now(), today: londonTodayKey() }));

  function load(society: Society) {
    requested.current.add(society.slug);
    fetchEvents(society, termEndKey(user)).then((result) => setResults((prev) => ({ ...prev, [society.slug]: result })));
  }

  function retry(society: Society) {
    setResults((prev) => {
      const next = { ...prev };
      delete next[society.slug]; // back to "loading"
      return next;
    });
    load(society);
  }

  useEffect(() => {
    for (const society of societies) if (!requested.current.has(society.slug)) load(society);
  }, [societies]);

  function save(next: Society[]) {
    setSaveFailed(!saveUserData({ ...user, societies: next, savedAt: new Date().toISOString() }));
  }

  const loading = societies.filter((s) => !results[s.slug]);
  const failed = societies.filter((s) => results[s.slug]?.status === "error");
  const events = societies.flatMap((s) => {
    const r = results[s.slug];
    return r?.status === "ok" ? r.events : [];
  });

  return (
    <>
      {saveFailed && (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          Your browser wouldn&apos;t let us save that. Is private mode or blocked storage on?
        </p>
      )}

      <section className="mb-6 flex flex-col gap-3">
        {societies.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            No societies yet. Add the ones you&apos;re in and I&apos;ll dig out their events (free pizza included).
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {societies.map((s) => (
              <li key={s.slug}>
                <Chip
                  society={s}
                  state={results[s.slug] ? results[s.slug].status : "loading"}
                  onRemove={() => save(societies.filter((x) => x.slug !== s.slug))}
                />
              </li>
            ))}
          </ul>
        )}
        <SocietyPicker existing={societies} onAdd={(s) => save([...societies, s])} />
      </section>

      {failed.map((s) => (
        <div
          key={s.slug}
          role="alert"
          className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/40"
        >
          <span>Couldn&apos;t load {s.name}&apos;s events.</span>
          <button
            type="button"
            onClick={() => retry(s)}
            className="min-h-11 shrink-0 rounded-full bg-white px-3 font-medium text-zinc-800 hover:bg-zinc-100 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            Retry
          </button>
        </div>
      ))}

      {societies.length > 0 && (
        <EventList
          events={events}
          now={clock.now}
          today={clock.today}
          stillLoading={loading.length}
          calendar={calendar}
        />
      )}
    </>
  );
}

/** No saved timetable: the demo week's societies and events, read-only. */
function Demo({ calendar }: { calendar: Calendar }) {
  const [clock] = useState(() => ({ now: Date.now(), today: londonTodayKey() }));
  // Built in the browser only, so the server never moves the demo week with its own clock.
  const events = useMemo(() => mockSocietyEvents(), []);
  const names = [...new Set(events.map((e) => e.society))].sort();

  return (
    <>
      <Link
        href="/setup"
        className="mb-5 flex items-center justify-between gap-3 rounded-2xl bg-emerald-600 p-4 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:text-emerald-950 dark:hover:bg-emerald-400"
      >
        <span>
          <span className="block font-semibold">These are demo societies</span>
          <span className="block text-sm opacity-90">Set up your timetable, then add the societies you&apos;re in.</span>
        </span>
        <span aria-hidden className="text-xl">
          →
        </span>
      </Link>
      <ul className="mb-6 flex flex-wrap gap-2">
        {names.map((name) => (
          <li key={name} className="rounded-full bg-zinc-100 px-3 py-1.5 text-sm font-medium dark:bg-zinc-800">
            {name}
          </li>
        ))}
      </ul>
      <EventList events={events} now={clock.now} today={clock.today} stillLoading={0} calendar={calendar} />
    </>
  );
}

async function fetchEvents(society: Society, until: DateKey): Promise<Result> {
  try {
    const params = new URLSearchParams({ slug: society.slug, name: society.name, until });
    const res = await fetch(`/api/societies/events?${params}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as { events?: SocietyEvent[] };
    return { status: "ok", events: Array.isArray(body.events) ? body.events : [] };
  } catch (err) {
    console.warn(`[societies] ${society.slug}:`, err);
    return { status: "error" };
  }
}

function Chip({
  society,
  state,
  onRemove,
}: {
  society: Society;
  state: "loading" | Result["status"];
  onRemove: () => void;
}) {
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 py-1 pl-3 pr-1 text-sm font-medium text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
      {state === "loading" && (
        <span
          aria-label="Loading events"
          className="h-3 w-3 animate-spin rounded-full border-2 border-emerald-300 border-t-emerald-700 dark:border-emerald-800 dark:border-t-emerald-300"
        />
      )}
      {state === "error" && <span aria-label="Events failed to load" className="h-2 w-2 rounded-full bg-amber-500" />}
      {society.name}
      {/* One tap: re-adding a society is easy, so no "Tap again to delete" here. */}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${society.name}`}
        className="-my-1.5 flex size-11 items-center justify-center rounded-full text-emerald-700 hover:bg-emerald-100 dark:text-emerald-300 dark:hover:bg-emerald-900"
      >
        ×
      </button>
    </span>
  );
}

/** Upcoming events grouped by London day. Days with nothing on are left out. */
function EventList({
  events,
  now,
  today,
  stillLoading,
  calendar,
}: {
  events: SocietyEvent[];
  now: number;
  today: DateKey;
  stillLoading: number;
  calendar: Calendar;
}) {
  const days = useMemo(() => {
    const upcoming = [...new Map(events.map((e) => [e.id, e])).values()]
      .filter((e) => Date.parse(e.end) > now)
      .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
    const byDay = new Map<DateKey, SocietyEvent[]>();
    for (const e of upcoming) {
      const key = londonDateKey(e.start);
      byDay.set(key, [...(byDay.get(key) ?? []), e]);
    }
    return [...byDay];
  }, [events, now]);

  return (
    <div className="flex flex-col gap-6">
      {days.map(([dateKey, dayEvents]) => (
        <section key={dateKey}>
          <h2 className="mb-2 text-sm font-semibold text-zinc-600 dark:text-zinc-400">{dayLabel(dateKey, today)}</h2>
          <ul className="flex flex-col gap-2">
            {dayEvents.map((e) => (
              <li key={e.id}>
                <EventCard event={e} calendar={calendar} />
              </li>
            ))}
          </ul>
        </section>
      ))}
      {stillLoading > 0 ? (
        <p className="text-sm text-zinc-500">
          Still checking {stillLoading} {stillLoading === 1 ? "society" : "societies"}…
        </p>
      ) : (
        days.length === 0 && (
          <p className="rounded-2xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
            No more events this term.
          </p>
        )
      )}
    </div>
  );
}

function dayLabel(dateKey: DateKey, today: DateKey): string {
  if (dateKey === today) return "Today";
  if (dateKey === addDays(today, 1)) return "Tomorrow";
  return londonDay.format(new Date(`${dateKey}T12:00:00Z`));
}

function timeLabel(e: SocietyEvent): string {
  if (e.timeTBC) return e.partOfDay ? `Time TBC · ${e.partOfDay}` : "Time TBC";
  const start = formatTime(e.start);
  if (e.endEstimated) return start;
  // Over several days: "Sun 8 Nov 07:00 – Wed 11 Nov 18:00". A late night out keeps the short form.
  if (isAllDaySociety(e)) {
    const day = (iso: string) => londonDay.format(new Date(iso)).replace(",", "");
    return `${day(e.start)} ${start} – ${day(e.end)} ${formatTime(e.end)}`;
  }
  return `${start}–${formatTime(e.end)}`;
}

function EventCard({ event: e, calendar }: { event: SocietyEvent; calendar: Calendar }) {
  // Only what the page actually said: no cost tag when it didn't mention cost.
  const tags: { label: string; tone: string }[] = [];
  if (e.membersOnly) tags.push({ label: "Members only", tone: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200" });
  if (e.tags.includes("free-food")) tags.push({ label: "Free food", tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" });
  else if (e.free === true) tags.push({ label: "Free", tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" });
  else if (e.free === false) tags.push({ label: "Paid", tone: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" });
  const cal = useSocietyAdd(e, calendar);

  return (
    <article className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
      {/* The button sits bottom-right beside the details, so the card stays a tidy rectangle. */}
      <div className="flex items-end gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">{e.society}</p>
          <h3 className="font-medium">
            {e.url ? (
              <a href={e.url} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
                {e.title}
              </a>
            ) : (
              e.title
            )}
          </h3>
          <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">
            {timeLabel(e)}
            {e.venue && ` · ${e.venue}`}
          </p>
          {tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <span key={t.label} className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${t.tone}`}>
                  {t.label}
                </span>
              ))}
            </div>
          )}
        </div>
        <CalendarButton added={cal.added} onAdd={() => cal.add(false)} onRemove={cal.remove} title={e.title}>
          Add to my calendar
        </CalendarButton>
      </div>
      {cal.clash && (
        <div role="alert" className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/40">
          <p className="mb-2 text-sm font-medium text-amber-900 dark:text-amber-100">⚠️ {cal.clash}</p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={cal.cancel}
              className="min-h-11 rounded-full px-4 text-sm font-medium text-zinc-700 hover:bg-amber-100 dark:text-zinc-300 dark:hover:bg-amber-900/40"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => cal.add(true)}
              className="min-h-11 rounded-full bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              Add anyway
            </button>
          </div>
        </div>
      )}
      {cal.saveFailed && (
        <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
          Your browser wouldn&apos;t let me save that. Private mode?
        </p>
      )}
    </article>
  );
}

/**
 * Adding a society event to the calendar (a one-off manual event linked by societyEventId).
 * Adding over another event first sets `clash`, for "Add anyway" / "Cancel".
 */
function useSocietyAdd(e: SocietyEvent, calendar: Calendar) {
  const added = findSocietyAdd(calendar.store, e.id);
  const [clash, setClash] = useState<string | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);

  function add(anyway: boolean) {
    const m = manualFromSociety(e, newId("ev"));
    // An all-day strip isn't busy time, so it can't clash.
    if (!anyway && !m.allDay) {
      const found = findClashes(
        dayEventsFor(calendar.timetable, calendar.store, m.date),
        londonIso(m.date, m.startTime),
        londonIso(m.date, m.endTime),
      );
      if (found.length) {
        setClash(clashMessage(found));
        return;
      }
    }
    setClash(null);
    setSaveFailed(!saveManualEvent(m));
  }

  function remove() {
    if (added) setSaveFailed(!deleteManualEvent(added.id));
  }

  return { added: !!added, clash, saveFailed, add, remove, cancel: () => setClash(null) };
}

function Skeleton() {
  return (
    <div aria-busy="true" className="flex animate-pulse flex-col gap-3">
      <div className="flex gap-2">
        <div className="h-9 w-28 rounded-full bg-zinc-100 dark:bg-zinc-900" />
        <div className="h-9 w-36 rounded-full bg-zinc-100 dark:bg-zinc-900" />
      </div>
      <div className="h-20 rounded-2xl bg-zinc-100 dark:bg-zinc-900" />
      <div className="h-20 rounded-2xl bg-zinc-100 dark:bg-zinc-900" />
    </div>
  );
}
