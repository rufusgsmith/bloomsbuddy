"use client";

import { useState } from "react";
import { BUILDINGS } from "@/lib/buildings";
import type { Gap, TimetableEvent } from "@/lib/types";

export interface Day {
  dateKey: string; // "YYYY-MM-DD", London calendar day
  events: TimetableEvent[];
  gaps: Gap[];
}

// Always format in Europe/London, so the server and the browser render identical text.
const londonTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  hour: "2-digit",
  minute: "2-digit",
});
const londonWeekday = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short" });
const londonDayMonth = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  day: "numeric",
  month: "short",
});

const time = (iso: string) => londonTime.format(new Date(iso));
// Midday UTC is always the same calendar day in London, whatever the season.
const dayDate = (dateKey: string) => new Date(`${dateKey}T12:00:00Z`);
const place = (id: keyof typeof BUILDINGS) => BUILDINGS[id].shortName;

function duration(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function tagline(gaps: Gap[]): string {
  if (gaps.length === 0) return "Back-to-back today. Hydrate and survive 💪";
  const usable = gaps.reduce((sum, g) => sum + g.usableMins, 0);
  const noun = gaps.length === 1 ? "gap" : "gaps";
  return `${gaps.length} ${noun}, ${duration(usable)} of free time. Let's not waste it.`;
}

type Item = { kind: "event"; event: TimetableEvent } | { kind: "gap"; gap: Gap };

export function TodayTimeline({ days, initialDateKey }: { days: Day[]; initialDateKey: string }) {
  const [dateKey, setDateKey] = useState(
    days.some((d) => d.dateKey === initialDateKey) ? initialDateKey : days[0]?.dateKey,
  );
  const [openGapId, setOpenGapId] = useState<string | null>(null);

  const day = days.find((d) => d.dateKey === dateKey);
  const items: Item[] = day
    ? [
        ...day.events.map((event): Item => ({ kind: "event", event })),
        ...day.gaps.map((gap): Item => ({ kind: "gap", gap })),
      ].sort((a, b) => Date.parse(startOf(a)) - Date.parse(startOf(b)))
    : [];

  return (
    <main className="mx-auto w-full max-w-md px-4 pb-16 pt-8">
      <header className="mb-5">
        <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">Bloomsbuddy</p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Today{" "}
          {day && (
            <span className="text-zinc-400 dark:text-zinc-500">
              · {londonWeekday.format(dayDate(day.dateKey))} {londonDayMonth.format(dayDate(day.dateKey))}
            </span>
          )}
        </h1>
        {day && <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{tagline(day.gaps)}</p>}
      </header>

      {/* Day picker for browsing the mock week */}
      <nav className="mb-6 flex gap-2" aria-label="Choose a day">
        {days.map((d) => {
          const active = d.dateKey === dateKey;
          return (
            <button
              key={d.dateKey}
              type="button"
              onClick={() => {
                setDateKey(d.dateKey);
                setOpenGapId(null);
              }}
              aria-pressed={active}
              className={`flex min-h-12 flex-1 flex-col items-center justify-center rounded-xl text-xs transition-colors ${
                active
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
              }`}
            >
              <span>{londonWeekday.format(dayDate(d.dateKey))}</span>
              <span className="text-base font-semibold">{dayDate(d.dateKey).getUTCDate()}</span>
            </button>
          );
        })}
      </nav>

      {items.length === 0 ? (
        <p className="rounded-2xl bg-zinc-100 p-6 text-center text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
          Nothing on today. Go touch grass in Gordon Square 🌳
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {items.map((item) =>
            item.kind === "event" ? (
              <li key={item.event.id}>
                <EventBlock event={item.event} />
              </li>
            ) : (
              <li key={item.gap.id}>
                <GapBlock
                  gap={item.gap}
                  open={openGapId === item.gap.id}
                  onToggle={() => setOpenGapId(openGapId === item.gap.id ? null : item.gap.id)}
                />
              </li>
            ),
          )}
        </ol>
      )}
    </main>
  );
}

function startOf(item: Item): string {
  return item.kind === "event" ? item.event.start : item.gap.start;
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

function GapBlock({ gap, open, onToggle }: { gap: Gap; open: boolean; onToggle: () => void }) {
  const from = place(gap.locationId);
  const to = place(gap.nextLocationId);
  const sameBuilding = gap.locationId === gap.nextLocationId;

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="block w-full rounded-2xl border-2 border-dashed border-emerald-400 bg-emerald-50 p-4 text-left transition-colors hover:bg-emerald-100 active:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950/40 dark:hover:bg-emerald-950/70"
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
        {duration(gap.durationMins)} free · {duration(gap.usableMins)} usable
      </span>
      <span className="block mt-0.5 text-sm text-emerald-800 dark:text-emerald-200">
        {sameBuilding ? `Staying in ${from}, no walk needed` : `${from} → ${to}, ${gap.walkMins} min walk`}
      </span>

      {open && (
        <span className="block mt-3 border-t border-emerald-200 pt-3 text-sm text-emerald-900 dark:border-emerald-800 dark:text-emerald-100">
          <span className="block">
            After <strong>{gap.prevEvent.title}</strong> ({place(gap.prevLocationId)})
          </span>
          <span className="block">
            Before <strong>{gap.nextEvent.title}</strong> at {time(gap.end)} ({gap.nextEvent.room})
          </span>
          <span className="block mt-3 italic text-emerald-700 dark:text-emerald-300">
            Picks for this gap coming soon ✨
          </span>
        </span>
      )}
    </button>
  );
}
