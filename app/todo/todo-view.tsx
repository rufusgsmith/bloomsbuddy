"use client";

import { useMemo, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import { DeleteButton, inputClass, PageHeader, Switch, TabPage, TimeField } from "../form-ui";
import { TODO_DEFAULT_MINS } from "@/lib/calendar-items";
import { formatDurationShort } from "@/lib/duration";
import { locationLabel } from "@/lib/location";
import { londonTodayKey, relativeDayLabel } from "@/lib/london-time";
import {
  byDueThenEstimate,
  draftMinutes,
  EST_STEP,
  isTimedDraft,
  isDoneNow,
  MAX_EST_HOURS,
  MAX_EST_MINS,
  MAX_TITLE,
  nextOccurrence,
  PARTS_OF_DAY,
  parseTodos,
  readRawTodos,
  repeatLabel,
  saveTodos,
  setDone,
  subscribeTodos,
  toDraft,
  validateTodoDraft,
  WEEKDAY_SHORT,
  type TodoDraft,
} from "@/lib/todos";
import type { DateKey, Todo, Weekday } from "@/lib/types";
import { LocationPicker } from "../location-picker";
import { resolveLocation } from "../postcode-lookup";

// The To-do tab. Saved straight to localStorage on every change, in the demo week too.
// Open to-dos are sent with each recommendation request, so Claude can slot one into a gap.
// Everything here is plain form controls checked in code: no Claude calls.

const MS_PER_DAY = 86_400_000;

const londonDay = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  weekday: "short",
  day: "numeric",
  month: "short",
});

/** Whole London calendar days from one day key to another. */
const daysBetween = (from: DateKey, to: DateKey) =>
  Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / MS_PER_DAY);

const chipClass = (on: boolean) =>
  `min-h-11 rounded-full px-3 text-sm font-medium transition-colors ${
    on
      ? "bg-emerald-600 text-white dark:bg-emerald-500 dark:text-emerald-950"
      : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
  }`;

const primaryButton =
  "min-h-11 rounded-full bg-emerald-600 px-5 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-emerald-500 dark:text-emerald-950 dark:hover:bg-emerald-400";
const secondaryButton =
  "min-h-11 rounded-full bg-zinc-100 px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700";

export function TodoView() {
  // "" = checked, nothing saved. null = not checked yet (server render / hydration).
  const raw = useSyncExternalStore(subscribeTodos, () => readRawTodos() ?? "", () => null);
  const todos = useMemo(() => parseTodos(raw), [raw]);
  const [saveFailed, setSaveFailed] = useState(false);

  function persist(next: Todo[]) {
    setSaveFailed(!saveTodos(next));
  }

  return (
    <TabPage top={<PageHeader title="To-do" subtitle="Add a time estimate and I'll squeeze these into your gaps." />}>
      {raw === null ? (
        <Skeleton />
      ) : (
        <>
          {saveFailed && (
            <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
              Your browser wouldn&apos;t let us save that. Is private mode or blocked storage on?
            </p>
          )}
          <TodoEditor todos={todos} onChange={persist} />
        </>
      )}
    </TabPage>
  );
}

/**
 * Add form + list. Controlled, so onboarding can use it on a draft list that isn't saved yet.
 * allowTick=false (onboarding): items can be added, edited and removed, but not ticked done.
 */
export function TodoEditor({
  todos,
  onChange,
  allowTick = true,
}: {
  todos: Todo[];
  onChange: (next: Todo[]) => void;
  allowTick?: boolean;
}) {
  // Read the clock once on mount, and only here: this renders after localStorage is read, so never
  // during the server prerender (Next.js rejects Date.now() there).
  const [today] = useState(londonTodayKey);
  const [editingId, setEditingId] = useState<string | null>(null);

  const replace = (t: Todo) => onChange(todos.map((x) => (x.id === t.id ? t : x)));
  const remove = (id: string) => {
    onChange(todos.filter((t) => t.id !== id));
    if (editingId === id) setEditingId(null);
  };
  const open = todos.filter((t) => !isDoneNow(t, today)).sort(byDueThenEstimate);
  const done = todos.filter((t) => isDoneNow(t, today));

  const row = (t: Todo) =>
    editingId === t.id ? (
      <TodoForm
        initial={t}
        today={today}
        onSubmit={(next) => {
          replace(next);
          setEditingId(null);
        }}
        onCancel={() => setEditingId(null)}
        onDelete={() => remove(t.id)}
      />
    ) : (
      <TodoRow
        todo={t}
        today={today}
        done={isDoneNow(t, today)}
        allowTick={allowTick}
        onToggle={() => replace(setDone(t, !isDoneNow(t, today), today))}
        onEdit={() => setEditingId(t.id)}
        onRemove={() => remove(t.id)}
      />
    );

  return (
    <div className="flex flex-col gap-6">
      <AddTodo today={today} onAdd={(t) => onChange([...todos, t])} />
      {open.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
          {done.length ? "All done" : "No to-dos yet. Add one above."}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {open.map((t) => (
            <li key={t.id}>{row(t)}</li>
          ))}
        </ul>
      )}
      {done.length > 0 && (
        <details className="group">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-semibold text-zinc-600 dark:text-zinc-400">
            <span aria-hidden className="transition-transform group-open:rotate-90">
              ›
            </span>
            Done ({done.length})
          </summary>
          <ul className="mt-2 flex flex-col gap-2">
            {done.map((t) => (
              <li key={t.id}>{row(t)}</li>
            ))}
          </ul>
          {/* Repeating to-dos stay: they come back on their next day. */}
          {done.some((t) => !t.repeat) && (
            <button
              type="button"
              onClick={() => onChange(todos.filter((t) => t.repeat || !t.done))}
              className="mt-2 min-h-11 rounded-full px-4 text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
            >
              Clear done
            </button>
          )}
        </details>
      )}
    </div>
  );
}

/** Collapsed: just a title box. Typing in it opens the full form underneath. */
function AddTodo({ today, onAdd }: { today: DateKey; onAdd: (t: Todo) => void }) {
  // Bumped after each add so the form starts fresh.
  const [formKey, setFormKey] = useState(0);
  return (
    <TodoForm
      key={formKey}
      today={today}
      onSubmit={(t) => {
        onAdd({ ...t, id: crypto.randomUUID() });
        setFormKey((k) => k + 1);
      }}
      onCancel={() => setFormKey((k) => k + 1)}
    />
  );
}

/**
 * The one form for adding and editing. Adding: only the title shows until the student starts
 * typing. Editing (initial set): everything shows, with Save and Delete.
 */
function TodoForm({
  initial,
  today,
  onSubmit,
  onCancel,
  onDelete,
}: {
  initial?: Todo;
  today: DateKey;
  onSubmit: (t: Todo) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const editing = !!initial;
  const [draft, setDraft] = useState<TodoDraft>(() => toDraft(initial, today));
  // Errors only show once a field has been touched (or on submit), so a fresh form isn't red.
  const [touched, setTouched] = useState({ duration: false, doBefore: false, repeat: false, location: false, onToday: false });
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const set = (patch: Partial<TodoDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const touch = (k: keyof typeof touched) => setTouched((t) => ({ ...t, [k]: true }));

  const { todo, errors } = validateTodoDraft(draft, today, initial ?? { id: "", done: false });
  const expanded = editing || draft.title.length > 0;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTouched({ duration: true, doBefore: true, repeat: true, location: true, onToday: true });
    if (!todo || busy) return;
    // A postcode's coordinates: reused when it hasn't changed, else looked up via /api/postcode.
    setBusy(true);
    const location = await resolveLocation(draft, initial?.location);
    setBusy(false);
    if (typeof location === "string") return setSaveError(location);
    onSubmit({ ...todo, ...(location ? { location } : {}) });
  }

  return (
    <form
      onSubmit={submit}
      className={`rounded-2xl border bg-white transition-colors dark:bg-zinc-950 ${
        expanded ? "border-emerald-400 dark:border-emerald-700" : "border-zinc-200 dark:border-zinc-800"
      }`}
    >
      <div className="p-2">
        <input
          value={draft.title}
          onChange={(e) => set({ title: e.target.value })}
          maxLength={MAX_TITLE}
          placeholder="Email tutor, read ch. 4, weekly shop…"
          aria-label={editing ? "Title" : "New to-do"}
          autoFocus={editing}
          className={`${inputClass} border-0 bg-transparent px-2 text-base font-medium dark:bg-transparent`}
        />
      </div>

      {expanded && (
        <div className="flex flex-col gap-5 border-t border-zinc-200 p-4 dark:border-zinc-800">
          <DurationField draft={draft} set={set} error={touched.duration ? errors.duration : undefined} onTouch={() => touch("duration")} />

          {draft.freq === "none" && (
            <Section label="Do before" hint="Optional">
              <div className="flex gap-2">
                <input
                  type="date"
                  value={draft.doBefore}
                  min={today}
                  onChange={(e) => {
                    set({ doBefore: e.target.value });
                    touch("doBefore");
                  }}
                  aria-label="Do before"
                  aria-invalid={touched.doBefore && !!errors.doBefore}
                  className={inputClass}
                />
                {draft.doBefore && (
                  <button type="button" onClick={() => set({ doBefore: "" })} className={chipClass(false)}>
                    Clear
                  </button>
                )}
              </div>
              {touched.doBefore && <FieldError>{errors.doBefore}</FieldError>}
            </Section>
          )}

          <RepeatField draft={draft} set={set} error={touched.repeat ? errors.repeat : undefined} onTouch={() => touch("repeat")} />

          <OnTodayField draft={draft} set={set} today={today} error={touched.onToday ? errors.onToday : undefined} onTouch={() => touch("onToday")} />

          <Section label="Where?" hint="Optional">
            <LocationPicker
              value={draft}
              onChange={(patch) => {
                set(patch);
                setSaveError(null);
              }}
            />
            <FieldError>{(touched.location && errors.location) || saveError}</FieldError>
          </Section>

          <div className="flex items-center gap-2">
            {onDelete && (
              <DeleteButton
                onDelete={onDelete}
                className="min-h-11 rounded-full px-3 text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
              >
                Delete
              </DeleteButton>
            )}
            <button type="button" onClick={onCancel} className={`ml-auto ${secondaryButton}`}>
              Cancel
            </button>
            <button type="submit" disabled={!!errors.title || busy} className={primaryButton}>
              {busy ? "Saving…" : editing ? "Save" : "Add"}
            </button>
          </div>
        </div>
      )}
    </form>
  );
}

/**
 * "Show on Today": a to-do with a repeat time sits at that time on each day it comes up.
 * One without a time needs a day and start time.
 */
function OnTodayField({
  draft,
  set,
  today,
  error,
  onTouch,
}: {
  draft: TodoDraft;
  set: (patch: Partial<TodoDraft>) => void;
  today: DateKey;
  error?: string;
  onTouch: () => void;
}) {
  const est = draftMinutes(draft);
  const length = formatDurationShort(typeof est === "number" ? est : TODO_DEFAULT_MINS);
  const timed = isTimedDraft(draft);
  const on = timed ? draft.showTimed : draft.placeOnToday;
  return (
    <Section label="Calendar" hint={timed ? `At ${draft.time}, ${length} block` : `A ${length} block`}>
      <Switch
        checked={on}
        onChange={(v) => {
          set(timed ? { showTimed: v } : { placeOnToday: v });
          onTouch();
        }}
        label="Show on Today"
      />
      {on && !timed && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <fieldset className="flex min-w-0 flex-col gap-1">
            <legend className="mb-1 text-xs font-medium text-zinc-500">Day</legend>
            <input
              type="date"
              value={draft.placeDate}
              min={today}
              onChange={(e) => set({ placeDate: e.target.value })}
              aria-label="Day"
              aria-invalid={!!error}
              className={inputClass}
            />
          </fieldset>
          <TimeField label="Start" value={draft.placeTime} onChange={(placeTime) => set({ placeTime })} />
        </div>
      )}
      <FieldError>{error}</FieldError>
    </Section>
  );
}

function Section({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-2 text-sm font-medium">
        {label} {hint && <span className="font-normal text-zinc-500">· {hint}</span>}
      </legend>
      {children}
    </fieldset>
  );
}

function FieldError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="text-sm text-red-600 dark:text-red-400">
      {children}
    </p>
  );
}

/** Hours and minutes boxes with −/+ steppers. Minutes move in 5s and carry into hours. */
function DurationField({
  draft,
  set,
  error,
  onTouch,
}: {
  draft: TodoDraft;
  set: (p: Partial<TodoDraft>) => void;
  error?: string;
  onTouch: () => void;
}) {
  const current = draftMinutes(draft);
  const total = typeof current === "number" ? current : 0;
  const setTotal = (mins: number) => {
    const clamped = Math.max(0, Math.min(MAX_EST_MINS, mins));
    set({ hours: String(Math.floor(clamped / 60)), minutes: String(clamped % 60) });
    onTouch();
  };
  // Steppers start from a clean value even if the boxes hold something invalid.
  const stepBase = typeof current === "number" ? total : 0;
  return (
    <Section label="How long?" hint="Optional">
      <div className="grid grid-cols-2 gap-3">
        <Stepper
          label="Hours"
          value={draft.hours}
          max={MAX_EST_HOURS}
          onChange={(v) => {
            set({ hours: v });
            onTouch();
          }}
          onDec={() => setTotal(stepBase - 60)}
          onInc={() => setTotal(stepBase + 60)}
          canDec={stepBase >= 60}
          canInc={stepBase + 60 <= MAX_EST_MINS}
          invalid={!!error}
        />
        <Stepper
          label="Minutes"
          value={draft.minutes}
          max={55}
          step={EST_STEP}
          onChange={(v) => {
            set({ minutes: v });
            onTouch();
          }}
          onDec={() => setTotal(stepBase - EST_STEP)}
          onInc={() => setTotal(stepBase + EST_STEP)}
          canDec={stepBase >= EST_STEP}
          canInc={stepBase + EST_STEP <= MAX_EST_MINS}
          invalid={!!error}
        />
      </div>
      {error ? (
        <FieldError>{error}</FieldError>
      ) : (
        total > 0 && <p className="text-xs text-zinc-500">That&apos;s {formatDurationShort(total)}.</p>
      )}
    </Section>
  );
}

function Stepper({
  label,
  value,
  max,
  step = 1,
  onChange,
  onDec,
  onInc,
  canDec,
  canInc,
  invalid,
}: {
  label: string;
  value: string;
  max: number;
  step?: number;
  onChange: (v: string) => void;
  onDec: () => void;
  onInc: () => void;
  canDec: boolean;
  canInc: boolean;
  invalid: boolean;
}) {
  const btn =
    "flex size-11 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-lg font-medium text-zinc-700 hover:bg-zinc-200 disabled:opacity-30 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700";
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-zinc-500">{label}</span>
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={onDec} disabled={!canDec} aria-label={`Less (${label.toLowerCase()})`} className={btn}>
          −
        </button>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={max}
          step={step}
          value={value}
          placeholder="0"
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
          aria-invalid={invalid}
          className={`${inputClass} min-w-0 text-center tabular-nums aria-invalid:border-red-500`}
        />
        <button type="button" onClick={onInc} disabled={!canInc} aria-label={`More (${label.toLowerCase()})`} className={btn}>
          +
        </button>
      </div>
    </div>
  );
}

const FREQS: { value: TodoDraft["freq"]; label: string }[] = [
  { value: "none", label: "None" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

function RepeatField({
  draft,
  set,
  error,
  onTouch,
}: {
  draft: TodoDraft;
  set: (p: Partial<TodoDraft>) => void;
  error?: string;
  onTouch: () => void;
}) {
  const toggleDay = (d: Weekday) => {
    set({ days: draft.days.includes(d) ? draft.days.filter((x) => x !== d) : [...draft.days, d].sort() });
    onTouch();
  };
  return (
    <Section label="Repeat">
      <div role="radiogroup" aria-label="Repeat" className="grid grid-cols-4 gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-900">
        {FREQS.map((f) => (
          <button
            key={f.value}
            type="button"
            role="radio"
            aria-checked={draft.freq === f.value}
            // A repeating to-do has no do-before date.
            onClick={() => set({ freq: f.value, ...(f.value !== "none" ? { doBefore: "" } : {}) })}
            className={`min-h-10 rounded-lg text-sm font-medium transition-colors ${
              draft.freq === f.value
                ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-50"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {draft.freq === "weekly" && (
        <div className="grid grid-cols-7 gap-1" aria-label="Days of the week">
          {WEEKDAY_SHORT.map((label, i) => {
            const d = (i + 1) as Weekday;
            const on = draft.days.includes(d);
            return (
              <button key={label} type="button" aria-pressed={on} onClick={() => toggleDay(d)} className={`${chipClass(on)} px-0`}>
                {label}
              </button>
            );
          })}
        </div>
      )}

      {draft.freq === "monthly" && (
        <div>
          <p className="mb-1 text-xs text-zinc-500">On day</p>
          <div className="grid grid-cols-7 gap-1" role="radiogroup" aria-label="Day of the month">
            {Array.from({ length: 31 }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={draft.dayOfMonth === n}
                onClick={() => {
                  set({ dayOfMonth: n });
                  onTouch();
                }}
                className={`${chipClass(draft.dayOfMonth === n)} px-0 tabular-nums`}
              >
                {n}
              </button>
            ))}
          </div>
          {(draft.dayOfMonth ?? 0) > 28 && (
            <p className="mt-1 text-xs text-zinc-500">In shorter months it&apos;ll land on the last day.</p>
          )}
        </div>
      )}

      {draft.freq !== "none" && (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-zinc-500">At a time · Optional</span>
            <div className="flex gap-2">
              <input
                type="time"
                value={draft.time}
                // A set time replaces the part of day.
                onChange={(e) => {
                  set({ time: e.target.value, ...(e.target.value ? { partOfDay: null } : {}) });
                  onTouch();
                }}
                className={inputClass}
              />
              {draft.time && (
                <button type="button" onClick={() => set({ time: "" })} className={chipClass(false)}>
                  Clear
                </button>
              )}
            </div>
          </label>
          <div>
            <p className="mb-1 text-xs font-medium text-zinc-500">Or a part of the day · Optional</p>
            <div className="flex flex-wrap gap-2">
              {PARTS_OF_DAY.map((p) => {
                const on = draft.partOfDay === p.value;
                return (
                  <button
                    key={p.value}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set({ partOfDay: on ? null : p.value, time: "" })}
                    className={chipClass(on)}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
      <FieldError>{error}</FieldError>
    </Section>
  );
}

function TodoRow({
  todo: t,
  today,
  done,
  allowTick,
  onToggle,
  onEdit,
  onRemove,
}: {
  todo: Todo;
  today: DateKey;
  done: boolean;
  allowTick: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const body = (
    <>
      {allowTick && <CheckMark done={done} />}
      <span className="flex min-w-0 flex-1 flex-col items-start">
        <span className={`w-full truncate font-medium ${done ? "text-zinc-500 line-through" : ""}`}>{t.title}</span>
        <Badges todo={t} today={today} done={done} />
      </span>
    </>
  );
  return (
    <div className="flex items-center rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      {allowTick ? (
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={done}
          aria-label={`${t.title}: mark ${done ? "not done" : "done"}`}
          className="flex min-h-14 min-w-0 flex-1 items-center gap-3 py-2 pl-3 text-left"
        >
          {body}
        </button>
      ) : (
        <div className="flex min-h-14 min-w-0 flex-1 items-center gap-3 py-2 pl-4">{body}</div>
      )}
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Edit ${t.title}`}
        className="flex size-11 shrink-0 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-900 dark:hover:text-zinc-200"
      >
        <PencilIcon />
      </button>
      {!allowTick && (
        <DeleteButton
          onDelete={onRemove}
          label={`Remove ${t.title}`}
          className="mr-1 flex size-11 shrink-0 items-center justify-center rounded-full text-xl text-zinc-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950 dark:hover:text-red-400"
        >
          ×
        </DeleteButton>
      )}
    </div>
  );
}

function Badges({ todo: t, today, done }: { todo: Todo; today: DateKey; done: boolean }) {
  const badge = "rounded-full px-2 py-0.5 text-xs font-medium";
  const plain = `${badge} bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300`;
  const back = done && t.repeat && t.doneOn ? nextOccurrence(t.repeat, t.doneOn) : null;
  const slot = t.onToday || undefined;
  if (!t.estMinutes && !t.doBefore && !t.repeat && !t.location && !slot) return null;
  return (
    <span className="mt-1 flex flex-wrap gap-1.5">
      {t.estMinutes && <span className={plain}>⏱ {formatDurationShort(t.estMinutes)}</span>}
      {t.doBefore && !done && <DoBeforeBadge doBefore={t.doBefore} today={today} className={badge} />}
      {t.repeat && <span className={plain}>{repeatLabel(t.repeat)}</span>}
      {t.location && <span className={plain}>📍 {locationLabel(t.location)}</span>}
      {slot && !done && (
        <span className={plain}>
          📅 {londonDay.format(new Date(`${slot.date}T12:00:00Z`))} {slot.time}
        </span>
      )}
      {back && <span className={plain}>Back {relativeDayLabel(back, today).replace(/^Tomorrow$/, "tomorrow")}</span>}
    </span>
  );
}

function DoBeforeBadge({ doBefore, today, className }: { doBefore: DateKey; today: DateKey; className: string }) {
  const days = daysBetween(today, doBefore);
  const label =
    days < 0 ? "Overdue" : days === 0 ? "Today" : days === 1 ? "Tomorrow" : londonDay.format(new Date(`${doBefore}T12:00:00Z`));
  const tone =
    days <= 2
      ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
      : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
  return <span className={`${className} ${tone}`}>📅 {label}</span>;
}

function CheckMark({ done }: { done: boolean }) {
  return (
    <span
      aria-hidden
      className={`flex size-6 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold ${
        done
          ? "border-emerald-600 bg-emerald-600 text-white dark:border-emerald-500 dark:bg-emerald-500 dark:text-emerald-950"
          : "border-zinc-400 text-transparent dark:border-zinc-600"
      }`}
    >
      ✓
    </span>
  );
}

function PencilIcon() {
  return (
    <svg aria-hidden viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.75} className="size-5">
      <path d="M13.5 3.5l3 3L7 16H4v-3l9.5-9.5z" strokeLinejoin="round" />
      <path d="M11.5 5.5l3 3" />
    </svg>
  );
}

function Skeleton() {
  return (
    <div aria-busy="true" className="flex animate-pulse flex-col gap-3">
      <div className="h-14 rounded-2xl bg-zinc-100 dark:bg-zinc-900" />
      <div className="h-16 rounded-2xl bg-zinc-100 dark:bg-zinc-900" />
      <div className="h-16 rounded-2xl bg-zinc-100 dark:bg-zinc-900" />
    </div>
  );
}
