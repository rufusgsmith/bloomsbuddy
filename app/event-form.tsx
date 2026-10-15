"use client";

import { useEffect, useRef, useState } from "react";
import type { BuildingId } from "@/lib/buildings";
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
  type LocationChoice,
} from "@/lib/manual-events";
import { normalisePostcode } from "@/lib/postcode";
import type { DateKey, EventKind, ManualEvent, TimetableEvent, WallTime } from "@/lib/types";
import { BuildingOptions } from "./building-options";
import { DeleteButton, Field, inputClass } from "./form-ui";

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

  /** A postcode's coordinates: reused when it hasn't changed, else looked up on postcodes.io via /api/postcode. */
  async function lookupPostcode(): Promise<{ postcode: string; lat: number; lng: number } | string> {
    const pc = normalisePostcode(draft.postcode);
    const old = target.kind === "manual" ? target.event.location : undefined;
    if (old?.kind === "postcode" && normalisePostcode(old.postcode) === pc) return old;
    try {
      const res = await fetch(`/api/postcode?pc=${encodeURIComponent(pc)}`);
      const body = (await res.json()) as { postcode?: string; lat?: number; lng?: number; error?: string };
      if (!res.ok || typeof body.lat !== "number" || typeof body.lng !== "number") {
        return body.error ?? "Couldn't find that postcode";
      }
      return { postcode: body.postcode ?? pc, lat: body.lat, lng: body.lng };
    } catch {
      return "Couldn't look that postcode up. Check your connection?";
    }
  }

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
    let place: { postcode: string; lat: number; lng: number } | undefined;
    if (draft.locationChoice === "postcode") {
      const found = await lookupPostcode();
      if (typeof found === "string") {
        setBusy(false);
        setSaveError(found);
        return;
      }
      place = found;
    }
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
      className="mb-0 mt-auto h-[min(92dvh,760px)] max-h-none w-full max-w-full overflow-hidden rounded-t-3xl bg-white p-0 text-zinc-900 shadow-xl backdrop:bg-black/50 backdrop:backdrop-blur-[2px] md:my-0 md:ml-auto md:mr-0 md:h-dvh md:max-w-sm md:rounded-none md:rounded-l-3xl dark:bg-zinc-950 dark:text-zinc-100"
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

          <Field label="Location (for travel times)">
            <select
              value={draft.locationChoice === "building" ? draft.buildingId : draft.locationChoice}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "none" || v === "postcode") set({ locationChoice: v as LocationChoice });
                else set({ locationChoice: "building", buildingId: v as BuildingId });
              }}
              className={inputClass}
            >
              <option value="none">None</option>
              <option value="postcode">Other place (postcode)</option>
              <BuildingOptions />
            </select>
          </Field>

          {draft.locationChoice === "postcode" && (
            <Field label="Postcode">
              <input
                value={draft.postcode}
                onChange={(e) => set({ postcode: e.target.value })}
                placeholder="WC1E 6BT"
                autoComplete="postal-code"
                autoCapitalize="characters"
                className={inputClass}
              />
            </Field>
          )}

          {!isClass && (
            <label className="flex min-h-11 items-center justify-between gap-3">
              <span>
                <span className="block text-sm font-medium">Repeats weekly</span>
                <span className="block text-xs text-zinc-500">
                  {draft.weekly ? "Every week on this day, like a class" : "Just this once"}
                </span>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={draft.weekly}
                onChange={(e) => set({ weekly: e.target.checked })}
                className="peer sr-only"
              />
              <span
                aria-hidden
                className="relative h-7 w-12 shrink-0 rounded-full bg-zinc-300 transition-colors after:absolute after:left-0.5 after:top-0.5 after:size-6 after:rounded-full after:bg-white after:transition-transform peer-checked:bg-emerald-600 peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-500 dark:bg-zinc-700 dark:peer-checked:bg-emerald-500"
              />
            </label>
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

const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0"));
const FIVE_MINS = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));

/**
 * A 24-hour time as two selects (hour, minute). <input type="time"> shows AM/PM in some
 * browser locales, and times must always be 24-hour (UI rules in CLAUDE.md).
 */
function TimeField({ label, value, onChange }: { label: string; value: WallTime; onChange: (v: WallTime) => void }) {
  const [hh, mm] = value.split(":");
  // A class at an odd minute (10:13) keeps its own minute as an option.
  const minutes = FIVE_MINS.includes(mm) ? FIVE_MINS : [...FIVE_MINS, mm].sort();
  return (
    <fieldset className="flex min-w-0 flex-col gap-1">
      <legend className="mb-1 text-xs font-medium text-zinc-500">{label}</legend>
      <div className="flex items-center gap-1">
        <select aria-label={`${label} hour`} value={hh} onChange={(e) => onChange(`${e.target.value}:${mm}`)} className={inputClass}>
          {HOURS.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
        <span aria-hidden>:</span>
        <select aria-label={`${label} minute`} value={mm} onChange={(e) => onChange(`${hh}:${e.target.value}`)} className={inputClass}>
          {minutes.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>
    </fieldset>
  );
}
