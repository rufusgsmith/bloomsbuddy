"use client";

import { useState } from "react";
import { addDays, mondayOf } from "@/lib/london-time";

// Today's small month calendar in the sidebar: tap a date to jump the calendar to it. Only the days
// Today has (this term) can be picked. Monday first, like every view.

const monthTitle = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", month: "long", year: "numeric" });
const dayLabel = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "long", day: "numeric", month: "long" });
const noon = (dateKey: string) => new Date(`${dateKey}T12:00:00Z`);

/** "2026-10" moved by n months. */
function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}

const STEP = "flex size-7 items-center justify-center rounded-full text-lg leading-none text-muted hover:bg-zinc-200/70 hover:text-foreground dark:hover:bg-zinc-800";

export function MiniMonth({
  selected,
  todayKey,
  wholeWeek,
  isAvailable,
  onSelect,
}: {
  /** The day the calendar is on. */
  selected: string;
  todayKey: string;
  /** Week view: the selected day's whole week is highlighted. */
  wholeWeek: boolean;
  isAvailable: (dateKey: string) => boolean;
  onSelect: (dateKey: string) => void;
}) {
  // The month shown follows the calendar: when the selected day changes, jump back to its month.
  const [shown, setShown] = useState(selected.slice(0, 7));
  const [lastSelected, setLastSelected] = useState(selected);
  if (selected !== lastSelected) {
    setLastSelected(selected);
    setShown(selected.slice(0, 7));
  }

  const start = mondayOf(`${shown}-01`);
  const weeks = Array.from({ length: 6 }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d)));
  const selectedWeek = mondayOf(selected);

  return (
    <div>
      <div className="mb-1 flex items-center justify-between pl-2">
        <h2 className="text-sm font-medium">{monthTitle.format(noon(`${shown}-01`))}</h2>
        <div className="flex">
          <button type="button" aria-label="Previous month" onClick={() => setShown(shiftMonth(shown, -1))} className={STEP}>
            ‹
          </button>
          <button type="button" aria-label="Next month" onClick={() => setShown(shiftMonth(shown, 1))} className={STEP}>
            ›
          </button>
        </div>
      </div>
      <div aria-hidden className="grid grid-cols-7 py-1 text-center text-[10px] font-medium text-muted">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>
      {weeks.map((week) => (
        // In week view the shown week is one tinted band, like the calendar it mirrors.
        <div
          key={week[0]}
          className={`grid grid-cols-7 rounded-full ${wholeWeek && week[0] === selectedWeek ? "bg-primary text-on-primary" : ""}`}
        >
          {week.map((key) => {
            const available = isAvailable(key);
            const isToday = key === todayKey;
            const picked = !wholeWeek && key === selected;
            return (
              <button
                key={key}
                type="button"
                disabled={!available}
                onClick={() => onSelect(key)}
                aria-label={dayLabel.format(noon(key))}
                aria-current={isToday ? "date" : undefined}
                aria-pressed={picked || (wholeWeek && mondayOf(key) === selectedWeek)}
                className={`mx-auto my-px flex size-7 items-center justify-center rounded-full text-[11px] tabular-nums transition-colors ${
                  isToday
                    ? "bg-accent text-on-accent"
                    : picked
                      ? "bg-primary text-on-primary"
                      : !key.startsWith(shown)
                        ? "text-muted"
                        : ""
                } ${available ? (isToday || picked ? "" : "hover:bg-zinc-200/70 dark:hover:bg-zinc-800") : "cursor-default opacity-40"}`}
              >
                {Number(key.slice(8))}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
