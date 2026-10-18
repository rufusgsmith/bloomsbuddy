"use client";

// A one-day calendar: an hour grid with events placed and sized by their real times, free gaps as
// tappable blocks, and a red "now" line. Shared by Today and the timetable editor.
// Everything is in minutes since London midnight, so Today (ISO instants) and the editor
// (weekly wall times, no dates) can both feed it.

import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { formatWallTime } from "@/lib/london-time";
import { EVENT_KINDS } from "@/lib/manual-events";
import type { EventKind } from "@/lib/types";
import { GAP, TONE, TONE_LABELS, type EventTone } from "./event-tones";

export type { EventTone };

export interface CalendarEvent {
  id: string;
  startMin: number;
  endMin: number;
  kind: EventKind;
  /** Picks the colour. Defaults to the timetable's. */
  tone?: EventTone;
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
  /** Too short for Claude picks: same look, but no text and not tappable. */
  plain?: boolean;
}

/** A thin flag at one moment, e.g. a deadline. Not a block and not busy time. */
export interface CalendarMarker {
  id: string;
  min: number;
  /** E.g. "17:00 ECON0013 problem set". */
  label: string;
}

/** A strip at the top of the day, e.g. a society hike with no time yet. Not a block and not busy time. */
export interface CalendarAllDay {
  id: string;
  title: string;
  /** E.g. "Time TBC", "From 07:00", "All day", "Until 18:00". */
  label: string;
}

// 96px an hour: a 15-minute block is 24px, enough for one line of text.
const PX_PER_HOUR = 96;
const PX_PER_MIN = PX_PER_HOUR / 60;
// A fixed day, 06:30–23:00, whatever the time or the events: anything outside it is cut at the edges.
const DAY_START = 6 * 60 + 30;
const DAY_END = 23 * 60;
const MIN_EVENT_PX = 24;
/** Blocks this long or longer have room for a second line. */
const TWO_LINE_MINS = 30;

const KIND_LABEL = Object.fromEntries(EVENT_KINDS.map((k) => [k.value, k.label])) as Record<EventKind, string>;

/** Which colour is which, as one quiet wrapped row of swatches. */
export function KindLegend() {
  return (
    <ul aria-label="Event colours" className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted">
      {TONE_LABELS.map((t) => (
        <li key={t.tone} className="flex items-center gap-1.5">
          <span aria-hidden className={`size-2.5 rounded-[3px] ${TONE[t.tone].dot}`} />
          {t.label}
        </li>
      ))}
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="size-2.5 rounded-[3px] border border-dashed border-gap-ink" />
        Free gap
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="h-0.5 w-3 bg-amber-500" />
        Deadline
      </li>
    </ul>
  );
}

/** 615 → "10:15". 24-hour, and 1440 (end of day) shows as "24:00". */
export function minutesLabel(min: number): string {
  return formatWallTime(`${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`);
}

/**
 * Side-by-side columns for overlapping events: each gets a column and the column count of its cluster.
 * Every event in a cluster of 2+ columns overlaps at least one other, so cols > 1 means a clash.
 */
export function layoutColumns(events: CalendarEvent[]): Map<string, { col: number; cols: number }> {
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
  markers = [],
  allDay = [],
  nowMin,
  openId,
  panel,
  onEventTap,
  onGapTap,
  onMarkerTap,
  onAllDayTap,
  onSlotTap,
}: {
  events: CalendarEvent[];
  gaps?: CalendarGap[];
  markers?: CalendarMarker[];
  /** Strips above the hour grid: society events with no time, or over several days. */
  allDay?: CalendarAllDay[];
  /** Minutes since midnight now. Only pass it when the calendar shows today. */
  nowMin?: number | null;
  /** The event or gap whose panel is open. The panel opens right under it. */
  openId?: string | null;
  panel?: ReactNode;
  onEventTap?: (id: string) => void;
  onGapTap?: (id: string) => void;
  onMarkerTap?: (id: string) => void;
  onAllDayTap?: (id: string) => void;
  /** Tap on empty space: the half hour that was tapped, in minutes since midnight. */
  onSlotTap?: (min: number) => void;
}) {
  const start = DAY_START;
  const end = DAY_END;
  // The now line only shows inside the day (at 01:00 there's none).
  const hasNow = nowMin != null && nowMin >= start && nowMin <= end;

  const columns = layoutColumns(events);
  const open = [...events, ...gaps, ...markers.map((m) => ({ id: m.id, endMin: m.min }))].find((x) => x.id === openId);
  // The grid is split under the open item, and its panel sits in the page flow between the halves.
  const split = open && panel ? Math.min(end, Math.max(start, open.endMin)) : null;
  // A tapped strip opens its panel right under the strips, above the grid.
  const allDayOpen = !!panel && allDay.some((a) => a.id === openId);
  // An open gap becomes one card in the page flow: a slim header (its arrow closes it) with the panel
  // as its body. Its empty stretch of grid is skipped, so the card starts right at the gap's start.
  const openGap = panel ? gaps.find((g) => g.id === openId) : undefined;

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
      markers={markers}
      columns={columns}
      nowMin={nowMin}
      nowRef={nowRef}
      openId={openId}
      onEventTap={onEventTap}
      onGapTap={onGapTap}
      onMarkerTap={onMarkerTap}
      onSlotTap={onSlotTap}
    />
  );

  return (
    // Padding so the first and last hour labels (centred on their lines) aren't cut off. A little
    // more on top, so the top of the day doesn't sit tight under the day pills.
    <div className="pb-2 pt-5">
      {allDay.length > 0 && (
        <ul aria-label="All day" className="mb-3 ml-[calc(3rem+0.25rem)] mr-1 flex flex-col gap-1">
          {allDay.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => onAllDayTap?.(a.id)}
                aria-expanded={openId === a.id}
                className={`${TONE.society.block} flex min-h-8 w-full items-center gap-1.5 rounded-lg border px-2 py-1 text-left text-xs font-medium`}
              >
                <span className="min-w-0 flex-1 truncate">{a.title}</span>
                <span className={`shrink-0 tabular-nums ${TONE.society.text}`}>{a.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {allDayOpen && (
        <div ref={panelRef} className="mb-3 ml-[calc(3rem+0.25rem)] mr-1 scroll-mt-4 scroll-mb-28">
          {panel}
        </div>
      )}
      {openGap ? (
        <>
          {openGap.startMin > start && segment(start, Math.min(end, openGap.startMin), false)}
          <div ref={panelRef} className="my-1 ml-[calc(3rem+0.25rem)] mr-1 scroll-mt-4 scroll-mb-28">
            <button
              type="button"
              onClick={() => onGapTap?.(openGap.id)}
              aria-expanded
              aria-label={`Free ${minutesLabel(openGap.startMin)}–${minutesLabel(openGap.endMin)}, ${openGap.label}. Hide suggestions`}
              className={`flex w-full items-center justify-between gap-2 rounded-t-xl border border-b-0 px-3 pb-0.5 pt-1.5 text-left text-sm font-medium ${GAP.open} ${GAP.text}`}
            >
              <span className="truncate">
                <span className="tabular-nums">
                  {minutesLabel(openGap.startMin)}–{minutesLabel(openGap.endMin)}
                </span>{" "}
                · {openGap.label}
              </span>
              <span aria-hidden className="shrink-0 rotate-180">
                ▾
              </span>
            </button>
            {panel}
          </div>
          {openGap.endMin < end && segment(Math.max(start, openGap.endMin), end, true)}
        </>
      ) : split === null ? (
        segment(start, end, true)
      ) : (
        <>
          {segment(start, split, split === end)}
          {/* Lined up with the event and gap boxes: past the hour labels (left-12), inset like inset-x-1. */}
          <div ref={panelRef} className="my-2 ml-[calc(3rem+0.25rem)] mr-1 scroll-mt-4 scroll-mb-28">
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
  markers,
  columns,
  nowMin,
  nowRef,
  openId,
  onEventTap,
  onGapTap,
  onMarkerTap,
  onSlotTap,
}: {
  from: number;
  to: number;
  isLast: boolean;
  events: CalendarEvent[];
  gaps: CalendarGap[];
  markers: CalendarMarker[];
  columns: Map<string, { col: number; cols: number }>;
  nowMin?: number | null;
  nowRef: RefObject<HTMLDivElement | null>;
  openId?: string | null;
  onEventTap?: (id: string) => void;
  onGapTap?: (id: string) => void;
  onMarkerTap?: (id: string) => void;
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
              className="absolute left-0 w-11 -translate-y-1/2 pr-2 text-right text-xs tabular-nums text-muted"
              style={{ top: y(m) }}
            >
              {minutesLabel(m)}
            </span>
            <div aria-hidden className="absolute left-12 right-0 border-t border-line" style={{ top: y(m) }} />
          </div>
        ) : (
          <div
            key={m}
            aria-hidden
            className="absolute left-12 right-0 border-t border-dashed border-line/60"
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
            if (g.plain) {
              // Drawn at its real size (no minimum), so it never spills onto the events around it.
              if (height - 2 < 3) return null;
              return (
                <div
                  key={g.id}
                  aria-hidden
                  className={`absolute inset-x-1 rounded-lg border ${GAP.plain}`}
                  style={{ top: top + 1, height: height - 2 }}
                />
              );
            }
            const isOpen = g.id === openId;
            const time = `${minutesLabel(g.startMin)}–${minutesLabel(g.endMin)}`;
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => onGapTap?.(g.id)}
                aria-expanded={isOpen}
                aria-label={`Free ${time}, ${g.label}. ${isOpen ? "Hide" : "Show"} suggestions`}
                className={`absolute inset-x-1 flex flex-col justify-center overflow-hidden rounded-lg border px-2 text-left text-sm transition-colors ${
                  isOpen ? GAP.open : GAP.block
                }`}
                style={{ top: top + 2, height: Math.max(MIN_EVENT_PX, height - 4) }}
              >
                <span className={`flex items-center justify-between gap-2 font-medium ${GAP.text}`}>
                  <span className="truncate">
                    <span className="tabular-nums">{time}</span> · {g.label}
                  </span>
                  <span aria-hidden className={`shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}>
                    ▾
                  </span>
                </span>
                {g.endMin - g.startMin >= 60 && !isOpen && (
                  <span className={`truncate text-xs opacity-80 ${GAP.text}`}>Tap for suggestions</span>
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
            const clashes = cols > 1;
            const time = `${minutesLabel(e.startMin)}–${minutesLabel(e.endMin)}`;
            const second = [time, e.detail].filter(Boolean).join(" · ");
            // Under 30 minutes there's room for one line only: centre it with no vertical padding.
            const pad = e.endMin - e.startMin < TWO_LINE_MINS ? "justify-center py-0" : "py-1";
            const tone = TONE[e.tone ?? "timetable"];
            const className = `absolute flex flex-col overflow-hidden rounded-lg border px-2 ${pad} text-left text-sm leading-tight text-foreground transition-colors ${tone.block} ${
              e.invalid ? "ring-2 ring-red-500 ring-offset-1 ring-offset-white dark:ring-offset-zinc-950" : ""
            } ${e.id === openId ? "ring-2 ring-zinc-900 ring-offset-1 ring-offset-background dark:ring-zinc-100" : ""}`;
            const style = {
              top: top + 1,
              height: height - 2,
              left: `calc(${(col / cols) * 100}% + 2px)`,
              width: `calc(${100 / cols}% - 4px)`,
            };
            const body = (
              <>
                <span className="truncate font-medium">
                  {clashes && <span aria-hidden className={`font-bold ${tone.text}`}>! </span>}
                  {e.title}
                </span>
                {e.endMin - e.startMin >= TWO_LINE_MINS && <span className={`truncate text-xs font-medium tabular-nums ${tone.text}`}>{second}</span>}
              </>
            );
            const label = `${e.tone === "exam" ? "Exam" : KIND_LABEL[e.kind]}, ${e.title}, ${time}${e.detail ? `, ${e.detail}` : ""}${clashes ? ", clashes with another event" : ""}`;
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

        {markers
          .filter((m) => m.min >= from && (m.min < to || (isLast && m.min === to)))
          .map((m) => {
            const isOpen = m.id === openId;
            return (
              // Above the blocks: a deadline can fall inside a class. Only the pill takes taps.
              <div key={m.id} className="pointer-events-none absolute inset-x-0 z-[5]" style={{ top: y(m.min) }}>
                <span aria-hidden className="absolute inset-x-0 h-0.5 -translate-y-1/2 bg-amber-500" />
                <button
                  type="button"
                  onClick={() => onMarkerTap?.(m.id)}
                  aria-expanded={isOpen}
                  aria-label={`Deadline, ${m.label}`}
                  className={`pointer-events-auto absolute right-1 max-w-[85%] -translate-y-1/2 truncate rounded-md border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-800 hover:bg-amber-100 dark:border-amber-500/50 dark:bg-amber-950 dark:text-amber-200 ${
                    isOpen ? "ring-2 ring-zinc-900 dark:ring-zinc-100" : ""
                  }`}
                >
                  <span aria-hidden>⚑ </span>
                  <span className="tabular-nums">{m.label}</span>
                </button>
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
          {/* Dot drawn in two layers: its halo under the line, its fill over it, so the halo outlines dot and line as one shape. */}
          <span aria-hidden className="absolute left-12 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-background" />
          {/* The time sits in a break in the middle of the line, clear of the hour labels on the left. A halo in the
              page colour round the line, dot and pill keeps them readable over rose exams and fuchsia own events. */}
          <div className="absolute left-12 right-0 flex -translate-y-1/2 items-center gap-1.5">
            <span aria-hidden className="h-0.5 flex-1 bg-red-500 shadow-[0_0_0_1.5px_var(--background)]" />
            <span className="rounded-full bg-red-600 px-1.5 py-0.5 text-[11px] font-semibold leading-none tabular-nums text-white ring-2 ring-background dark:bg-red-500">
              {minutesLabel(nowMin)}
            </span>
            <span aria-hidden className="h-0.5 flex-1 bg-red-500 shadow-[0_0_0_1.5px_var(--background)]" />
          </div>
          <span aria-hidden className="absolute left-12 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500" />
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
            className={`relative flex min-w-0 flex-1 flex-col items-center justify-center rounded-lg border text-xs transition-colors sm:max-w-24 ${
              d.date === undefined ? "min-h-10 pb-1" : "min-h-14"
            } ${
              isActive
                ? "border-indigo-300 bg-surface font-medium text-foreground ring-1 ring-indigo-300 dark:border-indigo-400/60 dark:ring-indigo-400/60"
                : `border-line hover:bg-surface ${d.weekend ? "bg-background text-zinc-400" : "bg-zinc-100/70 text-muted dark:bg-zinc-900"}`
            }`}
          >
            <span>{d.weekday}</span>
            {d.date !== undefined && <span className="text-base font-semibold tabular-nums">{d.date}</span>}
            {d.dot && (
              <span
                aria-hidden
                className="absolute bottom-1 size-1 rounded-full bg-emerald-600 dark:bg-emerald-400"
              />
            )}
          </button>
        );
      })}
    </nav>
  );
}
