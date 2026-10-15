"use client";

import { useMemo, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import { CalendarDays, Check, ChevronRight, Clock, MapPin, Pencil, Repeat, X } from "lucide-react";
import {
  Badge,
  DeleteButton,
  EmptyState,
  ghostButton,
  ICON,
  ICON_LG,
  iconButton,
  inputClass,
  Notice,
  PageHeader,
  primaryButton,
  RowsSkeleton,
  secondaryButton,
  Switch,
  TabPage,
  TimeField,
} from "../form-ui";
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

/** A toggle chip (days, parts of the day). Selected = ink fill, like the day pills. */
const chipClass = (on: boolean) =>
  `min-h-11 rounded-lg px-3 text-sm font-medium transition-colors ${
    on ? "bg-ink text-paper" : "border border-line bg-surface text-ink hover:bg-sunken"
  }`;

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
        <RowsSkeleton rows={4} />
      ) : (
        <>
          {saveFailed && (
            <Notice tone="bad" className="mb-4">
              Your browser wouldn&apos;t let us save that. Is private mode or blocked storage on?
            </Notice>
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
        done.length ? (
          <EmptyState title="All done">Ticked-off to-dos are below. Repeating ones come back on their next day.</EmptyState>
        ) : (
          <EmptyState title="No to-dos yet">
            Type one in the box above. Give it a time estimate and I&apos;ll fit it into a gap.
          </EmptyState>
        )
      ) : (
        <ul className="border-b border-line">
          {open.map((t) => (
            <li key={t.id} className="border-t border-line">
              {row(t)}
            </li>
          ))}
        </ul>
      )}
      {done.length > 0 && (
        <details className="group">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-medium text-muted">
            <ChevronRight {...ICON} className="transition-transform group-open:rotate-90" />
            Done ({done.length})
          </summary>
          <ul className="mt-2 border-b border-line">
            {done.map((t) => (
              <li key={t.id} className="border-t border-line">
                {row(t)}
              </li>
            ))}
          </ul>
          {/* Repeating to-dos stay: they come back on their next day. */}
          {done.some((t) => !t.repeat) && (
            <button
              type="button"
              onClick={() => onChange(todos.filter((t) => t.repeat || !t.done))}
              className={`${ghostButton} mt-2 text-danger hover:bg-danger-tint hover:text-danger`}
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
      className={`rounded-xl border bg-surface transition-colors ${editing ? "my-2 " : ""}${
        expanded ? "border-ink/30" : "border-line"
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
          className={`${inputClass} border-0 bg-transparent px-2 text-base font-medium`}
        />
      </div>

      {expanded && (
        <div className="flex flex-col gap-5 border-t border-line p-4">
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
                className={`${ghostButton} text-danger hover:bg-danger-tint hover:text-danger`}
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
            <legend className="mb-1 text-xs font-medium text-muted">Day</legend>
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
        {label} {hint && <span className="font-normal text-muted">· {hint}</span>}
      </legend>
      {children}
    </fieldset>
  );
}

function FieldError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="text-sm text-danger">
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
        total > 0 && <p className="text-xs text-muted">That&apos;s {formatDurationShort(total)}.</p>
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
    "flex size-11 shrink-0 items-center justify-center rounded-lg border border-line bg-surface text-base font-medium text-ink hover:bg-sunken disabled:opacity-30";
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted">{label}</span>
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
          className={`${inputClass} min-w-0 text-center tabular-nums aria-invalid:border-danger`}
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
      <div role="radiogroup" aria-label="Repeat" className="grid grid-cols-4 gap-1 rounded-lg bg-sunken p-1">
        {FREQS.map((f) => (
          <button
            key={f.value}
            type="button"
            role="radio"
            aria-checked={draft.freq === f.value}
            // A repeating to-do has no do-before date.
            onClick={() => set({ freq: f.value, ...(f.value !== "none" ? { doBefore: "" } : {}) })}
            className={`min-h-10 rounded-sm text-sm font-medium transition-colors ${
              draft.freq === f.value ? "bg-surface text-ink ring-1 ring-line" : "text-muted hover:text-ink"
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
          <p className="mb-1 text-xs text-muted">On day</p>
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
            <p className="mt-1 text-xs text-muted">In shorter months it&apos;ll land on the last day.</p>
          )}
        </div>
      )}

      {draft.freq !== "none" && (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">At a time · Optional</span>
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
            <p className="mb-1 text-xs font-medium text-muted">Or a part of the day · Optional</p>
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
        <span className={`w-full truncate font-medium ${done ? "text-muted line-through" : ""}`}>{t.title}</span>
        <Badges todo={t} today={today} done={done} />
      </span>
    </>
  );
  return (
    <div className="flex items-center">
      {allowTick ? (
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={done}
          aria-label={`${t.title}: mark ${done ? "not done" : "done"}`}
          className="flex min-h-14 min-w-0 flex-1 items-center gap-3 py-3 text-left"
        >
          {body}
        </button>
      ) : (
        <div className="flex min-h-14 min-w-0 flex-1 items-center gap-3 py-3">{body}</div>
      )}
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Edit ${t.title}`}
        className={iconButton}
      >
        <Pencil {...ICON} />
      </button>
      {!allowTick && (
        <DeleteButton
          onDelete={onRemove}
          label={`Remove ${t.title}`}
          className={`${iconButton} hover:bg-danger-tint hover:text-danger`}
        >
          <X {...ICON_LG} />
        </DeleteButton>
      )}
    </div>
  );
}

function Badges({ todo: t, today, done }: { todo: Todo; today: DateKey; done: boolean }) {
  const back = done && t.repeat && t.doneOn ? nextOccurrence(t.repeat, t.doneOn) : null;
  const slot = t.onToday || undefined;
  if (!t.estMinutes && !t.doBefore && !t.repeat && !t.location && !slot) return null;
  return (
    <span className="mt-1 flex flex-wrap gap-1">
      {t.estMinutes && (
        <Badge>
          <Clock {...ICON} size={12} />
          {formatDurationShort(t.estMinutes)}
        </Badge>
      )}
      {t.doBefore && !done && <DoBeforeBadge doBefore={t.doBefore} today={today} />}
      {t.repeat && (
        <Badge>
          <Repeat {...ICON} size={12} />
          {repeatLabel(t.repeat)}
        </Badge>
      )}
      {t.location && (
        <Badge>
          <MapPin {...ICON} size={12} />
          {locationLabel(t.location)}
        </Badge>
      )}
      {slot && !done && (
        <Badge>
          <CalendarDays {...ICON} size={12} />
          On Today {londonDay.format(new Date(`${slot.date}T12:00:00Z`))} {slot.time}
        </Badge>
      )}
      {back && <Badge>Back {relativeDayLabel(back, today).replace(/^Tomorrow$/, "tomorrow")}</Badge>}
    </span>
  );
}

function DoBeforeBadge({ doBefore, today }: { doBefore: DateKey; today: DateKey }) {
  const days = daysBetween(today, doBefore);
  const label =
    days < 0 ? "Overdue" : days === 0 ? "Today" : days === 1 ? "Tomorrow" : londonDay.format(new Date(`${doBefore}T12:00:00Z`));
  return (
    <Badge tone={days <= 2 ? "bad" : "neutral"}>
      <CalendarDays {...ICON} size={12} />
      {days < 0 ? label : `Do by ${days <= 1 ? label.toLowerCase() : label}`}
    </Badge>
  );
}

function CheckMark({ done }: { done: boolean }) {
  return (
    <span
      aria-hidden
      className={`flex size-6 shrink-0 items-center justify-center rounded-full border-2 ${
        done ? "border-square bg-square text-on-square" : "border-muted/50 text-transparent"
      }`}
    >
      <Check size={14} strokeWidth={2.5} />
    </span>
  );
}
