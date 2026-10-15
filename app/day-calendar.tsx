"use client";

// A one-day calendar: an hour grid with events placed and sized by their real times, free gaps as
// tappable blocks, and a red "now" line. Shared by Today and the timetable editor.
// Everything is in minutes since London midnight, so Today (ISO instants) and the editor
// (weekly wall times, no dates) can both feed it.

import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { formatWallTime } from "@/lib/london-time";
import { EVENT_KINDS } from "@/lib/manual-events";
import type { EventKind } from "@/lib/types";

export interface CalendarEvent {
  id: string;
  startMin: number;
  endMin: number;
  kind: EventKind;
  title: string;
  /** Shown after the time on the second line, when the block is tall enough. E.g. the room. */
  detail?: string;
  /** Editor only: the class has a problem, so it gets a red ring. */
  invalid?: boolean;
}

export interface CalendarGap {
  id: string;
  startMin: number;
  endMin: number;
  /** E.g. "1h 30m free". */
  label: string;
}

const PX_PER_HOUR = 64;
const PX_PER_MIN = PX_PER_HOUR / 60;
const DEFAULT_START = 8 * 60;
const DEFAULT_END = 22 * 60;
const MIN_EVENT_PX = 22;
/** Blocks this long or longer have room for a second line. */
const TWO_LINE_MINS = 45;

// Solid fills per type. Emerald is kept for gaps, so no event is green.
const KIND_CLASS: Record<EventKind, string> = {
  lecture: "bg-indigo-600 text-white hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600",
  seminar: "bg-amber-400 text-amber-950 hover:bg-amber-500",
  lab: "bg-rose-600 text-white hover:bg-rose-700 dark:bg-rose-500 dark:hover:bg-rose-600",
  tutorial: "bg-sky-600 text-white hover:bg-sky-700 dark:bg-sky-500 dark:hover:bg-sky-600",
  "office-hours": "bg-fuchsia-600 text-white hover:bg-fuchsia-700 dark:bg-fuchsia-500 dark:hover:bg-fuchsia-600",
  society: "bg-orange-500 text-orange-950 hover:bg-orange-600",
  personal: "bg-slate-600 text-white hover:bg-slate-700 dark:bg-slate-500 dark:hover:bg-slate-600",
};

// The legend's dots: the same colour as each block's fill.
const KIND_DOT: Record<EventKind, string> = {
  lecture: "bg-indigo-600 dark:bg-indigo-500",
  seminar: "bg-amber-400",
  lab: "bg-rose-600 dark:bg-rose-500",
  tutorial: "bg-sky-600 dark:bg-sky-500",
  "office-hours": "bg-fuchsia-600 dark:bg-fuchsia-500",
  society: "bg-orange-500",
  personal: "bg-slate-600 dark:bg-slate-500",
};

const KIND_LABEL = Object.fromEntries(EVENT_KINDS.map((k) => [k.value, k.label])) as Record<EventKind, string>;

/** Which colour is which type, as a small wrapped row of dots. */
export function KindLegend() {
  return (
    <ul aria-label="Event colours" className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-600 dark:text-zinc-400">
      {EVENT_KINDS.map((k) => (
        <li key={k.value} className="flex items-center gap-1.5">
          <span aria-hidden className={`size-2.5 rounded-full ${KIND_DOT[k.value]}`} />
          {k.label}
        </li>
      ))}
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="size-2.5 rounded-full border border-dashed border-emerald-500 bg-emerald-50 dark:bg-emerald-950" />
        Free gap
      </li>
    </ul>
  );
}

/** 615 → "10:15". 24-hour, and 1440 (end of day) shows as "24:00". */
export function minutesLabel(min: number): string {
  return formatWallTime(`${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`);
}

/** Side-by-side columns for overlapping events: each gets a column and the column count of its cluster. */
function layoutColumns(events: CalendarEvent[]): Map<string, { col: number; cols: number }> {
  const sorted = [...events].sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);
  const out = new Map<string, { col: number; cols: number }>();
  let cluster: { id: string; col: number }[] = [];
  let colEnds: number[] = [];
  let clusterEnd = -1;
  const flush = () => {
    for (const c of cluster) out.set(c.id, { col: c.col, cols: colEnds.length });
    cluster = [];
    colEnds = [];
  };
  for (const e of sorted) {
    if (e.startMin >= clusterEnd) flush();
    let col = colEnds.findIndex((end) => end <= e.startMin);
    if (col === -1) col = colEnds.push(0) - 1;
    colEnds[col] = e.endMin;
    cluster.push({ id: e.id, col });
    clusterEnd = Math.max(clusterEnd, e.endMin);
  }
  flush();
  return out;
}

export function DayCalendar({
  events,
  gaps = [],
  nowMin,
  openId,
  panel,
  onEventTap,
  onGapTap,
  onSlotTap,
}: {
  events: CalendarEvent[];
  gaps?: CalendarGap[];
  /** Minutes since midnight now. Only pass it when the calendar shows today. */
  nowMin?: number | null;
  /** The event or gap whose panel is open. The panel opens right under it. */
  openId?: string | null;
  panel?: ReactNode;
  onEventTap?: (id: string) => void;
  onGapTap?: (id: string) => void;
  /** Tap on empty space: the half hour that was tapped, in minutes since midnight. */
  onSlotTap?: (min: number) => void;
}) {
  const hasNow = nowMin != null;
  // 08:00–22:00, widened to whole hours around anything outside it (and the now line).
  const mins = [...events.flatMap((e) => [e.startMin, e.endMin]), ...(hasNow ? [nowMin] : [])];
  const start = Math.min(DEFAULT_START, ...mins.map((m) => Math.floor(m / 60) * 60));
  const end = Math.max(DEFAULT_END, ...mins.map((m) => Math.min(24 * 60, Math.ceil(m / 60) * 60)));

  const columns = layoutColumns(events);
  const open = [...events, ...gaps].find((x) => x.id === openId);
  // The grid is split under the open item, and its panel sits in the page flow between the halves.
  const split = open && panel ? Math.min(end, Math.max(start, open.endMin)) : null;

  const nowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (hasNow) nowRef.current?.scrollIntoView({ block: "center" });
  }, [hasNow]);

  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (openId) panelRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [openId]);

  const segment = (from: number, to: number, isLast: boolean) => (
    <Segment
      from={from}
      to={to}
      isLast={isLast}
      events={events}
      gaps={gaps}
      columns={columns}
      nowMin={nowMin}
      nowRef={nowRef}
      openId={openId}
      onEventTap={onEventTap}
      onGapTap={onGapTap}
      onSlotTap={onSlotTap}
    />
  );

  return (
    // Padding so the first and last hour labels (centred on their lines) aren't cut off.
    <div className="py-2">
      {split === null ? (
        segment(start, end, true)
      ) : (
        <>
          {segment(start, split, split === end)}
          <div ref={panelRef} className="my-2 scroll-mt-4 scroll-mb-28">
            {panel}
          </div>
          {split < end && segment(split, end, true)}
        </>
      )}
    </div>
  );
}

function Segment({
  from,
  to,
  isLast,
  events,
  gaps,
  columns,
  nowMin,
  nowRef,
  openId,
  onEventTap,
  onGapTap,
  onSlotTap,
}: {
  from: number;
  to: number;
  isLast: boolean;
  events: CalendarEvent[];
  gaps: CalendarGap[];
  columns: Map<string, { col: number; cols: number }>;
  nowMin?: number | null;
  nowRef: RefObject<HTMLDivElement | null>;
  openId?: string | null;
  onEventTap?: (id: string) => void;
  onGapTap?: (id: string) => void;
  onSlotTap?: (min: number) => void;
}) {
  const y = (min: number) => (min - from) * PX_PER_MIN;
  // Lines every half hour inside this segment. The last segment also gets its closing line.
  const lines: number[] = [];
  for (let m = Math.ceil(from / 30) * 30; m < to || (isLast && m === to); m += 30) lines.push(m);
  const inSegment = (s: number, e: number) => s < to && e > from;
  const showNow = nowMin != null && nowMin >= from && (nowMin < to || (isLast && nowMin === to));

  return (
    <div className="relative" style={{ height: (to - from) * PX_PER_MIN }}>
      {lines.map((m) =>
        m % 60 === 0 ? (
          <div key={m}>
            <span
              aria-hidden
              className="absolute left-0 w-11 -translate-y-1/2 pr-2 text-right text-xs tabular-nums text-zinc-500"
              style={{ top: y(m) }}
            >
              {minutesLabel(m)}
            </span>
            <div aria-hidden className="absolute left-12 right-0 border-t border-zinc-200 dark:border-zinc-800" style={{ top: y(m) }} />
          </div>
        ) : (
          <div
            key={m}
            aria-hidden
            className="absolute left-12 right-0 border-t border-dashed border-zinc-100 dark:border-zinc-900"
            style={{ top: y(m) }}
          />
        ),
      )}

      <div className="absolute inset-y-0 left-12 right-0">
        {onSlotTap && (
          // Behind the gaps and events, so only taps on empty space reach it. Touch and mouse
          // users get the "+" button too; this is the shortcut.
          <div
            aria-hidden
            className="absolute inset-0 cursor-pointer"
            onClick={(ev) => {
              const offset = ev.clientY - ev.currentTarget.getBoundingClientRect().top;
              onSlotTap(Math.floor((from + offset / PX_PER_MIN) / 30) * 30);
            }}
          />
        )}
        {gaps
          .filter((g) => inSegment(g.startMin, g.endMin))
          .map((g) => {
            const top = y(Math.max(from, g.startMin));
            const height = y(Math.min(to, g.endMin)) - top;
            const isOpen = g.id === openId;
            const time = `${minutesLabel(g.startMin)}–${minutesLabel(g.endMin)}`;
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => onGapTap?.(g.id)}
                aria-expanded={isOpen}
                aria-label={`Free ${time}, ${g.label}. ${isOpen ? "Hide" : "Show"} suggestions`}
                className={`absolute inset-x-1 flex flex-col justify-center overflow-hidden rounded-lg border-2 border-dashed px-2 text-left text-sm transition-colors ${
                  isOpen
                    ? "border-emerald-500 bg-emerald-100 dark:border-emerald-500 dark:bg-emerald-950/70"
                    : "border-emerald-400 bg-emerald-50 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950/40 dark:hover:bg-emerald-950/70"
                }`}
                style={{ top: top + 2, height: Math.max(MIN_EVENT_PX, height - 4) }}
              >
                <span className="flex items-center justify-between gap-2 font-medium text-emerald-800 dark:text-emerald-200">
                  <span className="truncate">
                    <span className="tabular-nums">{time}</span> · {g.label}
                  </span>
                  <span aria-hidden className={`shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}>
                    ▾
                  </span>
                </span>
                {g.endMin - g.startMin >= 60 && !isOpen && (
                  <span className="truncate text-xs text-emerald-700 dark:text-emerald-300">Tap for suggestions</span>
                )}
              </button>
            );
          })}

        {events
          .filter((e) => inSegment(e.startMin, e.endMin))
          .map((e) => {
            const top = y(Math.max(from, e.startMin));
            const height = Math.max(MIN_EVENT_PX, y(Math.min(to, e.endMin)) - top);
            const { col, cols } = columns.get(e.id) ?? { col: 0, cols: 1 };
            const time = `${minutesLabel(e.startMin)}–${minutesLabel(e.endMin)}`;
            const second = [time, e.detail].filter(Boolean).join(" · ");
            const className = `absolute flex flex-col overflow-hidden rounded-lg px-2 py-1 text-left text-sm leading-tight transition-colors ${KIND_CLASS[e.kind]} ${
              e.invalid ? "ring-2 ring-red-500 ring-offset-1 ring-offset-white dark:ring-offset-zinc-950" : ""
            } ${e.id === openId ? "ring-2 ring-zinc-900 ring-offset-1 ring-offset-white dark:ring-zinc-100 dark:ring-offset-zinc-950" : ""}`;
            const style = {
              top: top + 1,
              height: height - 2,
              left: `calc(${(col / cols) * 100}% + 2px)`,
              width: `calc(${100 / cols}% - 4px)`,
            };
            const body = (
              <>
                <span className="truncate font-semibold">{e.title}</span>
                {e.endMin - e.startMin >= TWO_LINE_MINS && <span className="truncate text-xs opacity-90 tabular-nums">{second}</span>}
              </>
            );
            const label = `${KIND_LABEL[e.kind]}, ${e.title}, ${time}${e.detail ? `, ${e.detail}` : ""}`;
            return onEventTap ? (
              <button
                key={e.id}
                type="button"
                onClick={() => onEventTap(e.id)}
                aria-expanded={e.id === openId}
                aria-label={`${label}. Edit`}
                className={className}
                style={style}
              >
                {body}
              </button>
            ) : (
              <div key={e.id} role="group" aria-label={label} className={className} style={style}>
                {body}
              </div>
            );
          })}
      </div>

      {showNow && (
        <div
          ref={nowRef}
          role="separator"
          aria-label={`Now, ${minutesLabel(nowMin)}`}
          className="pointer-events-none absolute inset-x-0 z-10 scroll-mt-4"
          style={{ top: y(nowMin) }}
        >
          {/* Covers the hour label it lands on, so the two don't overlap. */}
          <span className="absolute left-0 w-11 -translate-y-1/2 bg-background pr-1 text-right text-xs font-semibold tabular-nums text-red-600 dark:text-red-400">
            {minutesLabel(nowMin)}
          </span>
          <span aria-hidden className="absolute left-12 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500" />
          <span aria-hidden className="absolute left-12 right-0 h-0.5 -translate-y-1/2 bg-red-500" />
        </div>
      )}
    </div>
  );
}

export interface DayPill {
  key: string;
  /** "Mon". */
  weekday: string;
  /** Day of the month. Left out in the editor, where days are a weekly pattern. */
  date?: number;
  /** Small dot under the label: today on Today, "has classes" in the editor. */
  dot?: boolean;
  /** The real today. */
  current?: boolean;
  weekend?: boolean;
}

/** Monday–Sunday buttons to switch the day the calendar shows. */
export function DayPills({
  days,
  active,
  onSelect,
  label = "Choose a day",
}: {
  days: DayPill[];
  active: string;
  onSelect: (key: string) => void;
  label?: string;
}) {
  return (
    <nav className="mb-4 flex gap-1.5" aria-label={label}>
      {days.map((d) => {
        const isActive = d.key === active;
        return (
          <button
            key={d.key}
            type="button"
            onClick={() => onSelect(d.key)}
            aria-pressed={isActive}
            aria-current={d.current ? "date" : undefined}
            className={`relative flex min-w-0 flex-1 flex-col items-center justify-center rounded-xl text-xs transition-colors ${
              d.date === undefined ? "min-h-11 pb-1" : "min-h-14"
            } ${
              isActive
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : `hover:bg-zinc-200 dark:hover:bg-zinc-800 ${
                    d.weekend
                      ? "bg-zinc-50 text-zinc-500 dark:bg-zinc-900/50 dark:text-zinc-500"
                      : "bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400"
                  }`
            }`}
          >
            <span>{d.weekday}</span>
            {d.date !== undefined && <span className="text-base font-semibold">{d.date}</span>}
            {d.dot && (
              <span
                aria-hidden
                className={`absolute bottom-1 size-1 rounded-full ${isActive ? "bg-emerald-400 dark:bg-emerald-600" : "bg-emerald-600 dark:bg-emerald-400"}`}
              />
            )}
          </button>
        );
      })}
    </nav>
  );
}
