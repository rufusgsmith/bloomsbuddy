"use client";

import { useEffect, useRef, useState } from "react";
import { clashMessage, findClashes } from "@/lib/clashes";
import { newId } from "@/lib/deadline-draft";
import { londonIso } from "@/lib/london-time";
import {
  deleteManualEvent,
  EVENT_KINDS,
  eventFromDraft,
  occurrenceKey,
  replaceOccurrence,
  saveManualEvent,
  validateEventDraft,
  type EventDraft,
} from "@/lib/manual-events";
import type { DateKey, EventKind, ManualEvent, TimetableEvent } from "@/lib/types";
import { DeleteButton, Field, inputClass, sheetDialogClass, Switch, TimeField } from "./form-ui";
import { LocationPicker } from "./location-picker";
import { resolveLocation } from "./postcode-lookup";

/** What the form is open for: a new event, one of the student's own, or one day of a timetable class. */
export type EventFormTarget =
  | { kind: "new"; draft: EventDraft }
  | { kind: "manual"; event: ManualEvent; draft: EventDraft }
  | { kind: "class"; event: TimetableEvent; dateKey: DateKey; draft: EventDraft };

/**
 * Add or edit an event. A bottom sheet on phones, a panel down the right on laptops.
 * A native <dialog> opened with showModal() gives Esc to close, a focus trap and the top layer
 * (above the tab bar), like HomeSheet. Validation is plain code (validateEventDraft), no Claude.
 */
export function EventSheet({
  target,
  eventsOn,
  onClose,
}: {
  target: EventFormTarget;
  /** A day's events (timetable and manual), to warn about clashes. Empty for days we don't show. */
  eventsOn: (dateKey: DateKey) => TimetableEvent[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(target.draft);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  /** Set when saving would overlap other events: the footer asks "Add anyway" / "Cancel". */
  const [clash, setClash] = useState<string | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  const problem = validateEventDraft(draft);
  const set = (patch: Partial<EventDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setClash(null);
  };
  const isClass = target.kind === "class";
  const title = target.kind === "new" ? "Add event" : "Edit event";

  /** Events the draft would overlap on its date (the first one, if weekly), leaving out the one being edited. */
  function clashes() {
    const skip = (e: TimetableEvent) =>
      target.kind === "manual" ? e.manualId === target.event.id : target.kind === "class" && e.id === target.event.id;
    return findClashes(
      eventsOn(draft.date),
      londonIso(draft.date, draft.startTime),
      londonIso(draft.date, draft.endTime),
      skip,
    );
  }

  async function save(anyway = false) {
    setTried(true);
    setSaveError(null);
    if (problem) return;
    if (!anyway) {
      const found = clashes();
      if (found.length) {
        setClash(clashMessage(found));
        return;
      }
    }
    setClash(null);
    setBusy(true);
    // A postcode's coordinates: reused when it hasn't changed, else looked up via /api/postcode.
    const location = await resolveLocation(draft, target.kind === "manual" ? target.event.location : undefined);
    if (typeof location === "string") {
      setBusy(false);
      setSaveError(location);
      return;
    }
    const place = location?.kind === "postcode" ? location : undefined;
    const ok =
      target.kind === "new"
        ? saveManualEvent(eventFromDraft(newId("ev"), draft, place))
        : target.kind === "manual"
          ? saveManualEvent(eventFromDraft(target.event.id, draft, place))
          : // Only this day changes: the class is hidden and the edited copy takes its place.
            replaceOccurrence(
              occurrenceKey(target.event, target.dateKey),
              eventFromDraft(newId("ev"), { ...draft, weekly: false }, place),
            );
    setBusy(false);
    if (ok) onClose();
    else setSaveError("Your browser wouldn't let me save that. Private mode?");
  }

  function remove() {
    const ok =
      target.kind === "manual"
        ? deleteManualEvent(target.event.id)
        : target.kind === "class" && replaceOccurrence(occurrenceKey(target.event, target.dateKey));
    if (ok) onClose();
    else setSaveError("Your browser wouldn't let me save that. Private mode?");
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby="event-sheet-title"
      // Closed via React state, not the "close" event: see HomeSheet for why.
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className={sheetDialogClass}
    >
      <form
        className="flex h-full flex-col"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="px-5 pt-3">
          <div aria-hidden className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-zinc-300 md:hidden dark:bg-zinc-700" />
          <div className="mb-3 flex items-start justify-between gap-3 md:mt-4">
            <div>
              <h2 id="event-sheet-title" className="text-xl font-semibold tracking-tight">
                {title}
              </h2>
              {isClass && (
                <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">
                  {target.event.moduleCode ? `${target.event.moduleCode} · ` : ""}Changes this day only
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-2 flex size-11 shrink-0 items-center justify-center rounded-full text-2xl leading-none text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"
            >
              ×
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 pb-4">
          <Field label="Title">
            <input
              value={draft.title}
              onChange={(e) => set({ title: e.target.value })}
              placeholder="Office hours with Dr Patel"
              autoFocus={target.kind === "new"}
              aria-invalid={tried && !draft.title.trim()}
              className={inputClass}
            />
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Type">
              <select value={draft.kind} onChange={(e) => set({ kind: e.target.value as EventKind })} className={inputClass}>
                {EVENT_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Date">
              <input type="date" value={draft.date} onChange={(e) => set({ date: e.target.value })} className={inputClass} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <TimeField label="Start" value={draft.startTime} onChange={(startTime) => set({ startTime })} />
            <TimeField label="End" value={draft.endTime} onChange={(endTime) => set({ endTime })} />
          </div>

          <Field label="Room (optional)">
            <input value={draft.room} onChange={(e) => set({ room: e.target.value })} placeholder="Roberts 309" className={inputClass} />
          </Field>

          <fieldset className="flex min-w-0 flex-col gap-1">
            <legend className="mb-1 text-xs font-medium text-zinc-500">Location (for travel times)</legend>
            <LocationPicker value={draft} onChange={set} />
          </fieldset>

          {!isClass && (
            <Switch
              checked={draft.weekly}
              onChange={(weekly) => set({ weekly })}
              label="Repeats weekly"
              hint={draft.weekly ? "Every week on this day, like a class" : "Just this once"}
            />
          )}

          {((tried && problem) || saveError) && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {saveError ?? problem}
            </p>
          )}
        </div>

        {clash ? (
          <div
            role="alert"
            className="border-t border-amber-300 bg-amber-50 px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 dark:border-amber-800 dark:bg-amber-950/40"
          >
            <p className="mb-3 text-sm font-medium text-amber-900 dark:text-amber-100">⚠️ {clash}</p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setClash(null)}
                className="min-h-11 rounded-full px-4 text-sm font-medium text-zinc-700 hover:bg-amber-100 dark:text-zinc-300 dark:hover:bg-amber-900/40"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void save(true)}
                className="min-h-11 rounded-full bg-zinc-900 px-6 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
              >
                {busy ? "Saving…" : target.kind === "new" ? "Add anyway" : "Save anyway"}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 border-t border-zinc-200 px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 dark:border-zinc-800">
            {target.kind !== "new" && (
              <DeleteButton
                onDelete={remove}
                label={isClass ? "Remove this class on this day" : "Delete event"}
                className="min-h-11 shrink-0 rounded-full px-4 text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
              >
                Delete
              </DeleteButton>
            )}
            <button
              type="submit"
              disabled={busy}
              className="ml-auto min-h-11 rounded-full bg-zinc-900 px-6 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        )}
      </form>
    </dialog>
  );
}
