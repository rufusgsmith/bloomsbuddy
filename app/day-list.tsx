"use client";

// Today's day view: the selected day as a list of cards in time order. Each card has an icon tile in
// its tone, the time and a kind badge, the title and a detail line. Free gaps with picks sit between
// them as dashed rows; tapping a card or a gap goes up, and Today opens the side panel.

import type { ReactNode } from "react";
import { EVENT_KINDS } from "@/lib/manual-events";
import type { EventKind } from "@/lib/types";
import { minutesLabel, type CalendarAllDay, type CalendarEvent, type CalendarGap, type CalendarMarker } from "./day-calendar";
import { GAP, TONE, type EventTone } from "./event-tones";
import { CapIcon, CheckListIcon, ClockIcon, FlagIcon, PenIcon, PeopleIcon, PersonIcon, PlusIcon } from "./icons";
import { secondaryButtonClass } from "./form-ui";

const KIND_LABEL = Object.fromEntries(EVENT_KINDS.map((k) => [k.value, k.label])) as Record<EventKind, string>;

const TONE_ICON: Record<EventTone, (p: { className?: string }) => ReactNode> = {
  timetable: CapIcon,
  mine: PersonIcon,
  society: PeopleIcon,
  todo: CheckListIcon,
  exam: PenIcon,
};

type Row =
  | { kind: "event"; at: number; item: CalendarEvent }
  | { kind: "gap"; at: number; item: CalendarGap }
  | { kind: "marker"; at: number; item: CalendarMarker };

export function DayList({
  events,
  gaps,
  markers,
  allDay,
  openId,
  onEventTap,
  onGapTap,
  onMarkerTap,
  onAllDayTap,
  onAdd,
}: {
  events: CalendarEvent[];
  /** Only gaps with picks: short ones aren't listed. */
  gaps: CalendarGap[];
  markers: CalendarMarker[];
  allDay: CalendarAllDay[];
  openId: string | null;
  onEventTap: (id: string) => void;
  onGapTap: (id: string) => void;
  onMarkerTap: (id: string) => void;
  onAllDayTap: (id: string) => void;
  /** Left out when the day is read-only (the demo week). */
  onAdd?: () => void;
}) {
  const rows: Row[] = [
    ...events.map((item): Row => ({ kind: "event", at: item.startMin, item })),
    ...gaps.filter((g) => !g.plain).map((item): Row => ({ kind: "gap", at: item.startMin, item })),
    ...markers.map((item): Row => ({ kind: "marker", at: item.min, item })),
  ].sort((a, b) => a.at - b.at);

  if (rows.length === 0 && allDay.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-zinc-300 bg-surface p-6 dark:border-zinc-700">
        <p className="text-sm text-muted">Nothing scheduled.</p>
        {onAdd && (
          <button type="button" onClick={onAdd} className={secondaryButtonClass}>
            <PlusIcon className="size-4" />
            Add event
          </button>
        )}
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2.5">
      {allDay.map((a) => (
        <li key={a.id}>
          <Card open={openId === a.id} onClick={() => onAllDayTap(a.id)} tile={<Tile tone="society" />}>
            <Meta time={a.label} badge={<Badge tone="society">Society</Badge>} />
            <p className="mt-1 truncate font-medium">{a.title}</p>
          </Card>
        </li>
      ))}
      {rows.map((r) =>
        r.kind === "event" ? (
          <li key={r.item.id}>
            <Card
              open={openId === r.item.id}
              onClick={() => onEventTap(r.item.id)}
              tile={<Tile tone={r.item.tone ?? "timetable"} />}
            >
              <Meta
                time={`${minutesLabel(r.item.startMin)}–${minutesLabel(r.item.endMin)}`}
                badge={<Badge tone={r.item.tone ?? "timetable"}>{badgeLabel(r.item)}</Badge>}
              />
              <p className="mt-1 font-medium leading-snug">{r.item.title}</p>
              {r.item.detail && <p className="mt-0.5 text-sm text-muted">{r.item.detail}</p>}
            </Card>
          </li>
        ) : r.kind === "gap" ? (
          <li key={r.item.id}>
            <button
              type="button"
              onClick={() => onGapTap(r.item.id)}
              aria-expanded={openId === r.item.id}
              className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
                openId === r.item.id ? GAP.open : GAP.block
              }`}
            >
              <span className={`flex size-10 shrink-0 items-center justify-center rounded-lg border border-gap-line bg-surface ${GAP.text}`}>
                <ClockIcon className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block text-sm font-medium ${GAP.text}`}>
                  <span className="tabular-nums">
                    {minutesLabel(r.item.startMin)}–{minutesLabel(r.item.endMin)}
                  </span>{" "}
                  · {r.item.label}
                </span>
                <span className="block text-sm text-muted">See what to do with it</span>
              </span>
              <span aria-hidden className={`shrink-0 ${GAP.text}`}>
                ›
              </span>
            </button>
          </li>
        ) : (
          <li key={r.item.id}>
            <button
              type="button"
              onClick={() => onMarkerTap(r.item.id)}
              aria-label={`Deadline, ${r.item.label}`}
              className={`flex w-full items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-left text-sm font-medium text-amber-800 hover:bg-amber-100 dark:border-amber-500/50 dark:bg-amber-950 dark:text-amber-200 ${
                openId === r.item.id ? "ring-2 ring-zinc-900 dark:ring-zinc-100" : ""
              }`}
            >
              <FlagIcon className="size-4 shrink-0" />
              <span className="truncate tabular-nums">Due {r.item.label}</span>
            </button>
          </li>
        ),
      )}
    </ul>
  );
}

function badgeLabel(e: CalendarEvent): string {
  if (e.tone === "exam") return "Exam";
  if (e.tone === "todo") return "To-do";
  return KIND_LABEL[e.kind];
}

function Card({ open, onClick, tile, children }: { open: boolean; onClick: () => void; tile: ReactNode; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      className={`flex w-full items-start gap-4 rounded-xl border border-line bg-surface px-4 py-4 text-left transition-colors hover:border-zinc-300 dark:hover:border-zinc-700 ${
        open ? "ring-2 ring-zinc-900 dark:ring-zinc-100" : ""
      }`}
    >
      {tile}
      <span className="block min-w-0 flex-1">{children}</span>
    </button>
  );
}

function Tile({ tone }: { tone: EventTone }) {
  const Icon = TONE_ICON[tone];
  return (
    <span aria-hidden className={`flex size-10 shrink-0 items-center justify-center rounded-lg border ${TONE[tone].tile}`}>
      <Icon className="size-5" />
    </span>
  );
}

function Meta({ time, badge }: { time: string; badge: ReactNode }) {
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium tabular-nums text-muted">{time}</span>
      {badge}
    </span>
  );
}

export function Badge({ tone, children }: { tone: EventTone; children: ReactNode }) {
  return <span className={`rounded-md border px-1.5 py-px text-xs font-medium ${TONE[tone].badge}`}>{children}</span>;
}
