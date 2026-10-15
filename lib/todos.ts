// The student's to-do list in localStorage. Kept apart from UserData so it works in the demo
// week too. Same pattern as home.ts: anything unreadable is dropped rather than crashing.
// The pure helpers below (validation, repeats, which to-dos fit a gap) are shared with /api/recommend.

import { londonDateKey } from "./gaps";
import { addDays, dayOfWeek, formatWallTime, isDateKey, isWallTime, londonWeekdayAndMinutes } from "./london-time";
import type { DateKey, Gap, PartOfDay, Todo, TodoRepeat, Weekday } from "./types";

const KEY = "bloomsbuddy:todos";
/** Fired on this tab after we write. The "storage" event only reaches other tabs. */
const CHANGE_EVENT = "bloomsbuddy:todos";

/** Longest title we keep (and the most /api/recommend accepts). */
export const MAX_TITLE = 200;
/** Longest estimate we accept: 12 hours. */
export const MAX_EST_MINS = 720;
export const MAX_EST_HOURS = MAX_EST_MINS / 60;
/** The minutes field moves in 5-minute steps. */
export const EST_STEP = 5;

export const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export const PARTS_OF_DAY: { value: PartOfDay; label: string }[] = [
  { value: "morning", label: "Morning" },
  { value: "afternoon", label: "Afternoon" },
  { value: "evening", label: "Evening" },
];
/** London minutes-since-midnight windows for each part of day. */
const PART_WINDOWS: Record<PartOfDay, [number, number]> = {
  morning: [0, 12 * 60],
  afternoon: [12 * 60, 17 * 60],
  evening: [17 * 60, 24 * 60],
};

// ---------- Shape checks ----------

const isWeekday = (d: unknown): d is Weekday => Number.isInteger(d) && (d as number) >= 1 && (d as number) <= 7;

export function isRepeat(x: unknown): x is TodoRepeat {
  const r = x as Partial<TodoRepeat> | null;
  if (!r || (r.freq !== "daily" && r.freq !== "weekly" && r.freq !== "monthly")) return false;
  if (r.freq === "weekly" && !(Array.isArray(r.days) && r.days.length > 0 && r.days.every(isWeekday))) return false;
  if (r.freq === "monthly" && !(Number.isInteger(r.dayOfMonth) && r.dayOfMonth! >= 1 && r.dayOfMonth! <= 31)) {
    return false;
  }
  if (r.time !== undefined && !isWallTime(r.time)) return false;
  if (r.partOfDay !== undefined && !(r.partOfDay in PART_WINDOWS)) return false;
  return true;
}

/** Shape check shared by the client and /api/recommend. */
export function isTodo(x: unknown): x is Todo {
  const t = x as Partial<Todo> | null;
  return (
    typeof t?.id === "string" &&
    typeof t.title === "string" &&
    t.title.trim().length > 0 &&
    t.title.length <= MAX_TITLE &&
    typeof t.done === "boolean" &&
    (t.doBefore === undefined || isDateKey(t.doBefore)) &&
    (t.doneOn === undefined || isDateKey(t.doneOn)) &&
    (t.repeat === undefined || isRepeat(t.repeat)) &&
    (t.estMinutes === undefined ||
      (Number.isInteger(t.estMinutes) && t.estMinutes > 0 && t.estMinutes <= MAX_EST_MINS))
  );
}

/**
 * Brings a saved to-do up to the current shape: the old `due` field becomes `doBefore`, and
 * unknown fields are dropped. Anything still invalid is filtered out by isTodo afterwards.
 */
export function migrateTodo(x: unknown): unknown {
  if (!x || typeof x !== "object") return x;
  const o = x as Record<string, unknown>;
  const repeat = isRepeat(o.repeat) ? cleanRepeat(o.repeat) : undefined;
  const doBefore = o.doBefore ?? o.due;
  return {
    id: o.id,
    title: o.title,
    done: o.done,
    ...(o.estMinutes !== undefined ? { estMinutes: o.estMinutes } : {}),
    ...(doBefore !== undefined && !repeat ? { doBefore } : {}),
    ...(repeat ? { repeat } : {}),
    ...(repeat && o.doneOn !== undefined ? { doneOn: o.doneOn } : {}),
  };
}

/** Only the fields that matter for this frequency. */
function cleanRepeat(r: TodoRepeat): TodoRepeat {
  return {
    freq: r.freq,
    ...(r.freq === "weekly" ? { days: [...new Set(r.days)].sort((a, b) => a - b) } : {}),
    ...(r.freq === "monthly" ? { dayOfMonth: r.dayOfMonth } : {}),
    ...(r.time ? { time: r.time } : {}),
    ...(!r.time && r.partOfDay ? { partOfDay: r.partOfDay } : {}),
  };
}

// ---------- localStorage ----------

export function readRawTodos(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function parseTodos(raw: string | null): Todo[] {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as unknown;
    return Array.isArray(list) ? list.map(migrateTodo).filter(isTodo) : [];
  } catch {
    return [];
  }
}

/** Returns false if the browser refused to save. */
export function saveTodos(todos: Todo[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(todos));
    window.dispatchEvent(new Event(CHANGE_EVENT));
    return true;
  } catch {
    return false;
  }
}

export function subscribeTodos(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/** Open to-dos first by do-before day (undated last), then by estimate (quickest first). */
export function byDueThenEstimate(a: Todo, b: Todo): number {
  const dueA = a.doBefore ?? "9999-12-31";
  const dueB = b.doBefore ?? "9999-12-31";
  if (dueA !== dueB) return dueA < dueB ? -1 : 1;
  return (a.estMinutes ?? MAX_EST_MINS + 1) - (b.estMinutes ?? MAX_EST_MINS + 1);
}

// ---------- Repeats ----------

const daysInMonth = (dateKey: DateKey) => {
  const [y, m] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

/** Whether a repeating to-do comes up on this London day. */
export function occursOn(repeat: TodoRepeat, dateKey: DateKey): boolean {
  if (repeat.freq === "daily") return true;
  if (repeat.freq === "weekly") return (repeat.days ?? []).includes(dayOfWeek(dateKey) as Weekday);
  const day = Number(dateKey.slice(8, 10));
  return day === Math.min(repeat.dayOfMonth ?? 1, daysInMonth(dateKey));
}

/** The first day strictly after `after` that the to-do comes up on. */
export function nextOccurrence(repeat: TodoRepeat, after: DateKey): DateKey {
  let d = addDays(after, 1);
  // A monthly repeat always comes up within 31 days.
  for (let i = 0; i < 31 && !occursOn(repeat, d); i++) d = addDays(d, 1);
  return d;
}

/**
 * Whether the to-do counts as done on this day. A ticked repeating to-do comes back
 * on its next occurrence after the day it was ticked.
 */
export function isDoneNow(t: Todo, today: DateKey): boolean {
  if (!t.done) return false;
  if (!t.repeat) return true;
  if (!t.doneOn) return false;
  return nextOccurrence(t.repeat, t.doneOn) > today;
}

/** Ticks or unticks. Repeating to-dos remember the day, so they know when to come back. */
export function setDone(t: Todo, done: boolean, today: DateKey): Todo {
  const { doneOn: _drop, ...rest } = t;
  void _drop;
  return done && t.repeat ? { ...rest, done, doneOn: today } : { ...rest, done };
}

const ordinal = (n: number) => {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${n}${s}`;
};

/** Badge text, e.g. "↻ Thu · Afternoon", "↻ Daily · 17:00", "↻ 15th of the month". */
export function repeatLabel(r: TodoRepeat): string {
  const when =
    r.freq === "daily"
      ? "Daily"
      : r.freq === "weekly"
        ? (r.days ?? []).length === 7
          ? "Every day"
          : (r.days ?? []).map((d) => WEEKDAY_SHORT[d - 1]).join(", ")
        : `${ordinal(r.dayOfMonth ?? 1)} of the month`;
  const at = r.time ? formatWallTime(r.time) : (r.partOfDay ? PARTS_OF_DAY.find((p) => p.value === r.partOfDay)?.label : undefined);
  return `↻ ${when}${at ? ` · ${at}` : ""}`;
}

// ---------- Recommendations ----------

/**
 * The to-dos worth showing Claude for one gap: open one-off to-dos, plus repeating ones that come
 * up on the gap's London day, aren't done for that occurrence, and whose time or part of day
 * falls in the gap.
 */
export function todosForGap(todos: Todo[], gap: Pick<Gap, "start" | "end">): Todo[] {
  const gapDay = londonDateKey(gap.start);
  const start = londonWeekdayAndMinutes(gap.start).minutes;
  // A gap never crosses midnight, but be safe if one ends exactly at it.
  const end = londonDateKey(gap.end) === gapDay ? londonWeekdayAndMinutes(gap.end).minutes : 24 * 60;
  return todos.filter((t) => {
    if (!t.repeat) return !t.done;
    if (!occursOn(t.repeat, gapDay) || isDoneNow(t, gapDay)) return false;
    if (t.repeat.time) {
      const [h, m] = t.repeat.time.split(":").map(Number);
      const at = h * 60 + m;
      return at >= start && at < end;
    }
    if (t.repeat.partOfDay) {
      const [from, to] = PART_WINDOWS[t.repeat.partOfDay];
      return start < to && end > from;
    }
    return true;
  });
}

// ---------- The form ----------

/** What the to-do form edits. Number fields are strings so half-typed input can be validated. */
export interface TodoDraft {
  title: string;
  hours: string;
  minutes: string;
  doBefore: string;
  freq: "none" | TodoRepeat["freq"];
  days: Weekday[];
  dayOfMonth: number | null;
  time: string;
  partOfDay: PartOfDay | null;
}

export interface TodoDraftErrors {
  title?: string;
  duration?: string;
  doBefore?: string;
  repeat?: string;
}

export function toDraft(t?: Todo): TodoDraft {
  const est = t?.estMinutes;
  return {
    title: t?.title ?? "",
    hours: est ? String(Math.floor(est / 60)) : "",
    minutes: est ? String(est % 60) : "",
    doBefore: t?.doBefore ?? "",
    freq: t?.repeat?.freq ?? "none",
    days: t?.repeat?.days ?? [],
    dayOfMonth: t?.repeat?.dayOfMonth ?? null,
    time: t?.repeat?.time ?? "",
    partOfDay: t?.repeat?.partOfDay ?? null,
  };
}

const wholeNumber = (s: string) => (/^\d+$/.test(s.trim()) ? Number(s) : NaN);

/** Estimate in minutes (undefined = none given), or an error message. */
export function draftMinutes(d: Pick<TodoDraft, "hours" | "minutes">): number | undefined | string {
  if (!d.hours.trim() && !d.minutes.trim()) return undefined;
  const h = d.hours.trim() ? wholeNumber(d.hours) : 0;
  const m = d.minutes.trim() ? wholeNumber(d.minutes) : 0;
  if (Number.isNaN(h) || Number.isNaN(m)) return "Use whole numbers";
  if (m > 59) return "Minutes go up to 55. Use the hours box for more";
  if (m % EST_STEP !== 0) return `Minutes go in steps of ${EST_STEP}`;
  const total = h * 60 + m;
  if (total > MAX_EST_MINS) return `${MAX_EST_HOURS} hours max. Maybe split it up?`;
  return total === 0 ? undefined : total;
}

/**
 * Checks the form in code (no Claude). Returns the to-do fields when valid, plus any errors.
 * `id` and `done` are kept from `base` when editing.
 */
export function validateTodoDraft(
  d: TodoDraft,
  today: DateKey,
  base: Pick<Todo, "id" | "done" | "doneOn"> = { id: "", done: false },
): { todo?: Todo; errors: TodoDraftErrors } {
  const errors: TodoDraftErrors = {};
  const title = d.title.trim();
  if (!title) errors.title = "Give it a name";
  else if (title.length > MAX_TITLE) errors.title = `${MAX_TITLE} characters max`;

  const est = draftMinutes(d);
  if (typeof est === "string") errors.duration = est;

  if (d.freq === "none" && d.doBefore) {
    if (!isDateKey(d.doBefore)) errors.doBefore = "That's not a real date";
    else if (d.doBefore < today) errors.doBefore = "That's in the past";
  }

  let repeat: TodoRepeat | undefined;
  if (d.freq !== "none") {
    if (d.freq === "weekly" && d.days.length === 0) errors.repeat = "Pick at least one day";
    else if (d.freq === "monthly" && !d.dayOfMonth) errors.repeat = "Pick a day of the month";
    else if (d.time && !isWallTime(d.time)) errors.repeat = "That's not a real time";
    else {
      repeat = cleanRepeat({
        freq: d.freq,
        days: d.days,
        dayOfMonth: d.dayOfMonth ?? undefined,
        time: d.time || undefined,
        partOfDay: d.partOfDay ?? undefined,
      });
    }
  }

  if (Object.keys(errors).length > 0) return { errors };
  const todo: Todo = {
    id: base.id,
    title,
    done: base.done,
    ...(typeof est === "number" ? { estMinutes: est } : {}),
    ...(d.freq === "none" && d.doBefore ? { doBefore: d.doBefore } : {}),
    ...(repeat ? { repeat } : {}),
    // Keep the done-day only while it still means something.
    ...(repeat && base.done && base.doneOn ? { doneOn: base.doneOn } : {}),
  };
  return { todo, errors };
}
