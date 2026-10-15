"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { clashMessage, findClashes } from "@/lib/clashes";
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
import { ArrowRight, RotateCw, X } from "lucide-react";
import {
  Badge,
  CalendarButton,
  ClashNotice,
  EmptyState,
  ICON,
  Notice,
  PageHeader,
  RowsSkeleton,
  secondaryButton,
  TabPage,
} from "../form-ui";
import { mockSocietyEvents, mockTimetable } from "@/lib/mock";
import { parseUserData, readRawUserData, saveUserData, subscribeUserData } from "@/lib/storage";
import { termEndKey } from "@/lib/term";
import { expandWeekly } from "@/lib/timetable";
import type { DateKey, Society, SocietyEvent, TimetableEvent, UserData } from "@/lib/types";
import { SocietyPicker } from "../society-picker";

// The Societies tab: the student's societies as chips (add/remove), then all their upcoming
// events until the end of term, grouped by day (past ones hidden). Each society loads on its
// own (scraping can take a few seconds), so one slow or broken SU page never holds up the rest.
// Without a saved timetable there's nowhere to save societies, so it shows the demo ones read-only.
// Any event with a real time can be added to the calendar (a one-off manual event linked by
// societyEventId), which works in the demo week too.

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
  // Browser only (raw is null on the server), so the demo week never moves with the server's clock.
  const timetable = useMemo(
    () => (raw === null ? [] : user ? expandWeekly(user.classes, user.termStart, user.weeks) : mockTimetable()),
    [raw, user],
  );
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
        <Notice tone="bad" className="mb-4">
          Your browser wouldn&apos;t let us save that. Is private mode or blocked storage on?
        </Notice>
      )}

      <section className="mb-6 flex flex-col gap-3">
        {societies.length === 0 ? (
          <p className="text-sm text-muted">
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
          className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-ochre/30 bg-ochre-tint p-3 text-sm"
        >
          <span>Couldn&apos;t load {s.name}&apos;s events.</span>
          <button
            type="button"
            onClick={() => retry(s)}
            className={secondaryButton}
          >
            <RotateCw {...ICON} />
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
      <p className="mb-4 flex flex-wrap items-center gap-x-2 text-sm text-muted">
        These are demo societies.
        <Link href="/setup" className="inline-flex min-h-11 items-center gap-1 font-medium text-square hover:underline">
          Set up yours
          <ArrowRight {...ICON} />
        </Link>
      </p>
      <ul className="mb-6 flex flex-wrap gap-2">
        {names.map((name) => (
          <li key={name} className="rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium">
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
    <span className="flex items-center gap-2 rounded-lg border border-line bg-surface pl-3 text-sm font-medium">
      {state === "loading" && (
        <span
          aria-label="Loading events"
          className="h-3 w-3 animate-spin rounded-full border-2 border-square/30 border-t-square"
        />
      )}
      {state === "error" && <span aria-label="Events failed to load" className="h-2 w-2 rounded-full bg-ochre" />}
      {society.name}
      {/* One tap: re-adding a society is easy, so no "Tap again to delete" here. */}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${society.name}`}
        className="flex size-9 items-center justify-center rounded-r-lg text-muted hover:bg-sunken hover:text-ink"
      >
        <X {...ICON} />
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
          <h2 className="mb-1 text-sm font-medium text-muted">{dayLabel(dateKey, today)}</h2>
          <ul className="border-b border-line">
            {dayEvents.map((e) => (
              <li key={e.id} className="border-t border-line">
                <EventCard event={e} calendar={calendar} />
              </li>
            ))}
          </ul>
        </section>
      ))}
      {stillLoading > 0 ? (
        <p className="text-sm text-muted">
          Still checking {stillLoading} {stillLoading === 1 ? "society" : "societies"}…
        </p>
      ) : (
        days.length === 0 && (
          <EmptyState title="No more events this term">
            New ones show up here as soon as your societies post them on the Students&apos; Union site.
          </EmptyState>
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
  return e.endEstimated ? start : `${start}–${formatTime(e.end)}`;
}

function EventCard({ event: e, calendar }: { event: SocietyEvent; calendar: Calendar }) {
  // Only what the page actually said: no cost tag when it didn't mention cost.
  const tags: { label: string; tone: "neutral" | "good" }[] = [];
  if (e.membersOnly) tags.push({ label: "Members only", tone: "neutral" });
  if (e.tags.includes("free-food")) tags.push({ label: "Free food", tone: "good" });
  else if (e.free === true) tags.push({ label: "Free", tone: "good" });
  else if (e.free === false) tags.push({ label: "Paid", tone: "neutral" });
  const cal = useSocietyAdd(e, calendar);

  return (
    <article className="py-3">
      {/* The button sits bottom-right beside the details, so the row stays a tidy rectangle. */}
      <div className="flex items-end gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-tone-society">{e.society}</p>
          <h3 className="font-medium">
            {e.url ? (
              <a href={e.url} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
                {e.title}
              </a>
            ) : (
              e.title
            )}
          </h3>
          <p className="mt-0.5 text-sm tabular-nums text-muted">
            {timeLabel(e)}
            {e.venue && ` · ${e.venue}`}
          </p>
          {tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {tags.map((t) => (
                <Badge key={t.label} tone={t.tone}>
                  {t.label}
                </Badge>
              ))}
            </div>
          )}
        </div>
        {/* A "Time TBC" session has no real time to block out. */}
        {!e.timeTBC && (
          <CalendarButton added={cal.added} onAdd={() => cal.add(false)} onRemove={cal.remove} title={e.title}>
            Add to my calendar
          </CalendarButton>
        )}
      </div>
      {cal.clash && <ClashNotice className="mt-3" message={cal.clash} onCancel={cal.cancel} onConfirm={() => cal.add(true)} />}
      {cal.saveFailed && (
        <p role="alert" className="mt-2 text-sm text-danger">
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
    if (!anyway) {
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
        <div className="h-9 w-28 rounded-lg bg-sunken" />
        <div className="h-9 w-36 rounded-lg bg-sunken" />
      </div>
      <RowsSkeleton rows={3} rowClassName="h-20" />
    </div>
  );
}
