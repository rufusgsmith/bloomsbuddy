"use client";

// Today's week view: seven day columns split by hairlines on one hour axis, on Today's white panel. Events,
// free gaps, deadline flags and the now line are placed by minutes since London midnight, like
// DayCalendar. Nothing opens inline here: taps go up, and Today shows the panel at the side.

import { useEffect, useRef } from "react";
import { EVENT_KINDS } from "@/lib/manual-events";
import type { EventKind } from "@/lib/types";
import {
  layoutColumns,
  minutesLabel,
  type CalendarAllDay,
  type CalendarEvent,
  type CalendarGap,
  type CalendarMarker,
} from "./day-calendar";
import { GAP, TONE } from "./event-tones";

export interface WeekColumn {
  dateKey: string;
  /** "Mon". */
  weekday: string;
  /** Day of the month. */
  date: number;
  isToday: boolean;
  events: CalendarEvent[];
  gaps: CalendarGap[];
  markers: CalendarMarker[];
  allDay: CalendarAllDay[];
}

// 60px an hour: a 30-minute block is 30px, room for one line; an hour fits time + title.
const PX_PER_HOUR = 60;
const PX_PER_MIN = PX_PER_HOUR / 60;
// A fixed day, 06:30–23:00, whatever the time or the events: anything outside it is cut at the edges.
const DAY_START = 6 * 60 + 30;
const DAY_END = 23 * 60;
const MIN_BLOCK_PX = 18;

const KIND_LABEL = Object.fromEntries(EVENT_KINDS.map((k) => [k.value, k.label])) as Record<EventKind, string>;

const londonZone = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", timeZoneName: "short" });
/** "BST" or "GMT" on that day, for the gutter over the hour labels. */
const zoneOn = (dateKey: string) =>
  londonZone.formatToParts(new Date(`${dateKey}T12:00:00Z`)).find((p) => p.type === "timeZoneName")?.value ?? "";

export function WeekCalendar({
  days,
  nowMin,
  openId,
  onDayTap,
  onEventTap,
  onGapTap,
  onMarkerTap,
  onAllDayTap,
  onSlotTap,
}: {
  days: WeekColumn[];
  /** Minutes since midnight now, drawn in today's column only. */
  nowMin: number | null;
  /** The item whose side panel is open, outlined. */
  openId: string | null;
  /** The weekday header: opens that day in the Day view. */
  onDayTap: (dateKey: string) => void;
  onEventTap: (dateKey: string, id: string) => void;
  onGapTap: (dateKey: string, id: string) => void;
  onMarkerTap: (dateKey: string, id: string) => void;
  onAllDayTap: (dateKey: string, id: string) => void;
  /** Tap on empty space: the half hour that was tapped. */
  /** Left out when the calendar is read-only (the demo week). */
  onSlotTap?: (dateKey: string, min: number) => void;
}) {
  const start = DAY_START;
  const end = DAY_END;
  const inRange = (s: number, e: number) => s < end && e > start;
  // The now line only shows inside the day (at 01:00 there's none).
  const now = nowMin != null && nowMin >= start && nowMin <= end ? nowMin : null;
  const hasToday = now != null && days.some((d) => d.isToday);
  const y = (min: number) => (min - start) * PX_PER_MIN;
  const hours: number[] = [];
  for (let m = Math.ceil(start / 60) * 60; m <= end; m += 60) hours.push(m);

  // Open on the now line (today), else on the first hour.
  const nowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (hasToday) nowRef.current?.scrollIntoView({ block: "center" });
  }, [hasToday]);

  const cols = "grid grid-cols-[2.75rem_repeat(7,minmax(0,1fr))]";

  return (
    <div className="pb-3 pr-2">
      {/* Weekday headers and all-day bars stay in view while the hours scroll under them. */}
      <div className="sticky top-0 z-20 border-b border-line bg-surface">
        <div className={`${cols} pt-2`}>
          <span aria-hidden />
          {days.map((d) => (
            <button
              key={d.dateKey}
              type="button"
              onClick={() => onDayTap(d.dateKey)}
              aria-current={d.isToday ? "date" : undefined}
              aria-label={`${d.weekday} ${d.date}. Open this day`}
              className="group flex flex-col items-center gap-0.5 pb-1"
            >
              <span className={`text-[11px] font-medium uppercase tracking-wide ${d.isToday ? "text-accent" : "text-muted"}`}>
                {d.weekday}
              </span>
              <span
                className={`flex size-11 items-center justify-center rounded-full text-2xl tabular-nums transition-colors ${
                  d.isToday ? "bg-accent text-on-accent" : "text-foreground group-hover:bg-zinc-100 dark:group-hover:bg-zinc-800"
                }`}
              >
                {d.date}
              </span>
            </button>
          ))}
        </div>
        <div className={`${cols} pb-1.5`}>
          <span className="pr-2 pt-0.5 text-right text-[10px] text-muted">{days[0] && zoneOn(days[0].dateKey)}</span>
          {days.map((d) => (
            <ul key={d.dateKey} className="flex min-w-0 flex-col gap-0.5 px-0.5">
              {d.allDay.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => onAllDayTap(d.dateKey, a.id)}
                    aria-label={`${a.title}, ${a.label}`}
                    className={`${TONE.society.block} w-full truncate rounded border px-2 py-0.5 text-left text-xs font-medium ${
                      openId === a.id ? "ring-2 ring-zinc-900 ring-offset-1 dark:ring-zinc-100" : ""
                    }`}
                  >
                    {a.title}
                  </button>
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>

      <div className={`${cols} mt-3`}>
        {/* Hour labels, centred on their lines. */}
        <div className="relative" style={{ height: y(end) }}>
          {hours.map((m) => (
            <span
              key={m}
              aria-hidden
              className="absolute right-2 -translate-y-1/2 text-[11px] tabular-nums text-muted"
              style={{ top: y(m) }}
            >
              {minutesLabel(m)}
            </span>
          ))}
        </div>

        {days.map((d) => {
          const columns = layoutColumns(d.events);
          const showNow = d.isToday && now != null;
          return (
            <div
              key={d.dateKey}
              className="relative overflow-hidden border-l border-line"
              style={{ height: y(end) }}
            >
              {hours.filter((m) => m > start && m < end).map((m) => (
                <div key={m} aria-hidden className="absolute inset-x-0 border-t border-line/70" style={{ top: y(m) }} />
              ))}
              {/* Behind everything, so only taps on empty space reach it. */}
              {onSlotTap && (
                <div
                  aria-hidden
                  className="absolute inset-0 cursor-pointer"
                  onClick={(ev) => {
                    const offset = ev.clientY - ev.currentTarget.getBoundingClientRect().top;
                    onSlotTap(d.dateKey, Math.max(start, Math.floor((start + offset / PX_PER_MIN) / 30) * 30));
                  }}
                />
              )}

              {d.gaps.filter((g) => inRange(g.startMin, g.endMin)).map((g) => {
                const top = y(Math.max(start, g.startMin));
                const height = y(Math.min(end, g.endMin)) - top;
                if (g.plain) {
                  if (height - 4 < 3) return null;
                  return (
                    <div
                      key={g.id}
                      aria-hidden
                      className={`absolute inset-x-1 rounded-md border ${GAP.plain}`}
                      style={{ top: top + 2, height: height - 4 }}
                    />
                  );
                }
                const isOpen = g.id === openId;
                const time = `${minutesLabel(g.startMin)}–${minutesLabel(g.endMin)}`;
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => onGapTap(d.dateKey, g.id)}
                    aria-expanded={isOpen}
                    aria-label={`${d.weekday} ${d.date}, free ${time}, ${g.label}. Show picks`}
                    className={`absolute inset-x-1 flex flex-col justify-center overflow-hidden rounded-md border px-1.5 text-left text-xs font-medium transition-colors ${
                      isOpen ? GAP.open : GAP.block
                    } ${GAP.text}`}
                    style={{ top: top + 2, height: Math.max(MIN_BLOCK_PX, height - 4) }}
                  >
                    <span className="truncate">{g.label}</span>
                    {height >= 48 && <span className="truncate font-normal tabular-nums opacity-80">{time}</span>}
                  </button>
                );
              })}

              {d.events.filter((e) => inRange(e.startMin, e.endMin)).map((e) => {
                const top = y(Math.max(start, e.startMin));
                const height = Math.max(MIN_BLOCK_PX, y(Math.min(end, e.endMin)) - top);
                const { col, cols: n } = columns.get(e.id) ?? { col: 0, cols: 1 };
                const tone = TONE[e.tone ?? "timetable"];
                const time = `${minutesLabel(e.startMin)}–${minutesLabel(e.endMin)}`;
                const mins = e.endMin - e.startMin;
                const isOpen = e.id === openId;
                return (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => onEventTap(d.dateKey, e.id)}
                    aria-label={`${e.tone === "exam" ? "Exam" : KIND_LABEL[e.kind]}, ${e.title}, ${time}${e.detail ? `, ${e.detail}` : ""}${n > 1 ? ", clashes with another event" : ""}`}
                    className={`absolute flex flex-col overflow-hidden rounded-md border px-1.5 text-left leading-tight transition-colors ${tone.block} ${
                      mins < 45 ? "justify-center" : "pt-1"
                    } ${e.invalid ? "ring-2 ring-red-500" : ""} ${isOpen ? "ring-2 ring-zinc-900 ring-offset-1 dark:ring-zinc-100" : ""}`}
                    style={{
                      top: top + 1,
                      height: height - 2,
                      left: `calc(${(col / n) * 100}% + 2px)`,
                      width: `calc(${100 / n}% - 6px)`,
                    }}
                  >
                    {/* Title first, then the time. */}
                    {mins < 45 ? (
                      <span className="truncate text-xs font-medium">
                        {n > 1 && <span aria-hidden className="font-bold">! </span>}
                        {e.title}
                        <span className={`tabular-nums ${tone.text}`}>, {minutesLabel(e.startMin)}</span>
                      </span>
                    ) : (
                      <>
                        <span className={`text-xs font-medium ${mins >= 90 ? "line-clamp-3" : "line-clamp-2"}`}>
                          {n > 1 && <span aria-hidden className="font-bold">! </span>}
                          {e.title}
                        </span>
                        <span className={`mt-0.5 truncate text-[11px] tabular-nums ${tone.text}`}>{time}</span>
                        {mins >= 120 && e.detail && <span className={`mt-0.5 truncate text-[11px] ${tone.text}`}>{e.detail}</span>}
                      </>
                    )}
                  </button>
                );
              })}

              {d.markers.filter((m) => m.min >= start && m.min <= end).map((m) => (
                // Above the blocks: a deadline can fall inside a class. Only the flag takes taps.
                <div key={m.id} className="pointer-events-none absolute inset-x-0 z-[5]" style={{ top: y(m.min) }}>
                  <span aria-hidden className="absolute inset-x-0 h-0.5 -translate-y-1/2 bg-deadline" />
                  <button
                    type="button"
                    onClick={() => onMarkerTap(d.dateKey, m.id)}
                    aria-label={`Deadline, ${m.label}`}
                    className={`pointer-events-auto absolute left-0.5 right-1 -translate-y-1/2 truncate rounded bg-deadline px-1.5 py-0.5 text-left text-[11px] font-medium tabular-nums text-deadline-ink hover:bg-deadline-hover ${
                      openId === m.id ? "ring-2 ring-zinc-900 ring-offset-1 dark:ring-zinc-100" : ""
                    }`}
                  >
                    {m.label}
                  </button>
                </div>
              ))}

              {showNow && (
                <div
                  ref={nowRef}
                  role="separator"
                  aria-label={`Now, ${minutesLabel(now)}`}
                  className="pointer-events-none absolute inset-x-0 z-10 scroll-mt-16"
                  style={{ top: y(now) }}
                >
                  <span aria-hidden className="absolute inset-x-0 h-0.5 -translate-y-1/2 bg-red-500" />
                  <span aria-hidden className="absolute left-0.5 size-2.5 -translate-y-1/2 rounded-full bg-red-500 ring-2 ring-surface" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
