"use client";

import { useState } from "react";
import { planImport, type ImportPlan } from "@/lib/ics";
import { londonTodayKey, mondayOf } from "@/lib/london-time";
import { deleteImported, isImported, saveImport } from "@/lib/manual-events";
import { termEndKey } from "@/lib/term";
import type { DateKey, ManualEvent, TimetableEvent } from "@/lib/types";
import { DeleteButton, primaryButtonClass, secondaryButtonClass, SidePanel } from "./form-ui";

/** Bigger than any real term of events, so a wrong file can't freeze the tab. */
const MAX_BYTES = 5_000_000;

const shortDate = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });
const dayLabel = (k: DateKey) => shortDate.format(new Date(`${k}T12:00:00Z`));

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

type State =
  | { step: "pick"; error?: string }
  | { step: "review"; fileName: string; plan: ImportPlan; error?: string };

/**
 * Import a calendar file (.ics) from Google, Outlook, Apple or the UCL timetable. Its events become
 * one-off manual events from this week to the end of term. Ones already on the timetable are skipped.
 * Saving remounts Today (the events are in its key), which closes this panel.
 */
export function IcsImportSheet({
  eventsOn,
  lastDay,
  manualEvents,
  onClose,
}: {
  /** A day's events as Today shows them, for the duplicate and clash checks. */
  eventsOn: (dateKey: DateKey) => TimetableEvent[];
  /** The last day Today has. Events are imported up to it, or to the end of term if later. */
  lastDay: DateKey;
  manualEvents: ManualEvent[];
  onClose: () => void;
}) {
  const [state, setState] = useState<State>({ step: "pick" });
  const from = mondayOf(londonTodayKey());
  const to = [termEndKey(), lastDay].sort().at(-1)!;
  const imported = manualEvents.filter(isImported).length;

  async function read(file: File) {
    if (file.size > MAX_BYTES) return setState({ step: "pick", error: "That file's too big to be a calendar." });
    try {
      const plan = planImport(await file.text(), from, to, eventsOn, manualEvents);
      if (plan.found === 0) {
        return setState({ step: "pick", error: `No events in that file between ${dayLabel(from)} and ${dayLabel(to)}.` });
      }
      setState({ step: "review", fileName: file.name, plan });
    } catch {
      setState({ step: "pick", error: "Couldn't read that one. It needs to be an .ics calendar file." });
    }
  }

  function save(plan: ImportPlan) {
    if (!saveImport(plan.add, plan.uids, from)) {
      setState((s) => ({ ...s, error: "Your browser wouldn't let me save that. Private mode?" }));
      return;
    }
    onClose();
  }

  return (
    <SidePanel title="Import a calendar" subtitle={`.ics file, ${dayLabel(from)} to ${dayLabel(to)}`} onClose={onClose}>
      <div className="flex flex-col gap-4 text-sm">
        {state.step === "pick" ? (
          <>
            <p className="text-muted">
              Export your calendar as an .ics file (Google, Outlook, Apple or the UCL timetable) and pick it here. Anything
              already on your timetable is skipped. Importing the same file again updates it rather than doubling up.
            </p>
            <label className={`${primaryButtonClass} cursor-pointer self-start`}>
              Choose .ics file
              <input
                type="file"
                accept=".ics,text/calendar"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void read(file);
                }}
              />
            </label>
          </>
        ) : (
          <>
            <p className="truncate font-medium">{state.fileName}</p>
            <ul className="flex flex-col gap-1.5 rounded-xl border border-line bg-background px-4 py-3">
              <li>{plural(state.plan.found, "event")} found</li>
              {state.plan.duplicates > 0 && <li className="text-muted">{state.plan.duplicates} already on your calendar, skipped</li>}
              <li className="font-medium">{plural(state.plan.add.length, "event")} to add</li>
              {state.plan.clashes > 0 && (
                <li className="text-amber-700 dark:text-amber-400">
                  {plural(state.plan.clashes, "clashes", "clash")} with something already there. They sit side by side.
                </li>
              )}
            </ul>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => save(state.plan)}
                disabled={state.plan.add.length === 0}
                className={primaryButtonClass}
              >
                {state.plan.add.length === 0 ? "Nothing new to add" : `Add ${plural(state.plan.add.length, "event")}`}
              </button>
              <button type="button" onClick={() => setState({ step: "pick" })} className={secondaryButtonClass}>
                Pick another file
              </button>
            </div>
          </>
        )}

        {state.error && (
          <p role="alert" className="text-red-600 dark:text-red-400">
            {state.error}
          </p>
        )}

        {imported > 0 && (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
            <span className="text-muted">{plural(imported, "imported event")} on your calendar</span>
            <DeleteButton
              onDelete={() => {
                if (deleteImported()) onClose();
              }}
              armedText="Tap again to remove"
              className="min-h-10 shrink-0 rounded-lg px-3 text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
            >
              Remove imported
            </DeleteButton>
          </div>
        )}
      </div>
    </SidePanel>
  );
}
