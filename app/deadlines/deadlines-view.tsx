"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { DeleteButton, Field, inputClass, PageHeader } from "../form-ui";
import { blankDraft, deadlineProblem, fromDraft, toDraft, type DraftDeadline } from "@/lib/deadline-draft";
import { londonDateKey } from "@/lib/gaps";
import { addDays, formatTime, londonTodayKey, mondayOf } from "@/lib/london-time";
import { mockDeadlines } from "@/lib/mock";
import { prepareImage } from "@/lib/prepare-image";
import { parseUserData, readRawUserData, saveUserData, subscribeUserData } from "@/lib/storage";
import type { DateKey, Deadline, UserData } from "@/lib/types";

// The Deadlines tab. With a saved timetable the student can add, edit and delete deadlines
// (saved straight to localStorage). Without one it shows the demo deadlines read-only:
// deadlines live inside UserData, which needs a timetable first.
// Hand-added and Moodle-scanned deadlines share one list; a re-scan merges into it.

const MS_PER_DAY = 86_400_000;
/** Badges turn red at this many days left or fewer. */
const URGENT_DAYS = 2;

const londonDueDay = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  weekday: "short",
  day: "numeric",
  month: "short",
});
/** "Fri 16 Oct, 5pm". */
const dueLabel = (iso: string) => `${londonDueDay.format(new Date(iso))}, ${formatTime(iso)}`;


/** Whole London calendar days from one day key to another. */
const daysBetween = (from: DateKey, to: DateKey) =>
  Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / MS_PER_DAY);

const byDue = (a: Deadline, b: Deadline) => Date.parse(a.due) - Date.parse(b.due);

/** Module + title, lowercased with punctuation dropped: how a re-scan spots a deadline it already has. */
const matchKey = (d: Deadline) => `${d.moduleCode}|${d.title}`.toLowerCase().replace(/[^a-z0-9|]/g, "");

/**
 * A Moodle re-scan merged into the saved list. A deadline seen before gets the new due date
 * and weight but keeps its id and anything else the student set; a new one is added.
 * Nothing is removed: a deadline missing from the screenshot may just be scrolled off it.
 */
function mergeScan(existing: Deadline[], scanned: Deadline[]): { merged: Deadline[]; added: number; updated: number } {
  const merged = [...existing];
  let added = 0;
  let updated = 0;
  for (const s of scanned) {
    const i = merged.findIndex((d) => matchKey(d) === matchKey(s));
    if (i === -1) {
      merged.push(s);
      added++;
    } else {
      merged[i] = { ...merged[i], due: s.due, ...(s.weight !== undefined ? { weight: s.weight } : {}) };
      updated++;
    }
  }
  return { merged, added, updated };
}

type ScanState =
  | { status: "idle" }
  | { status: "reading" }
  | { status: "done"; added: number; updated: number }
  | { status: "error"; message: string };

export function DeadlinesView() {
  // "" = checked, nothing saved. null = not checked yet (server render / hydration).
  const raw = useSyncExternalStore(subscribeUserData, () => readRawUserData() ?? "", () => null);
  const user = useMemo(() => parseUserData(raw), [raw]);
  // Built in the browser only, so the server never moves the demo week with its own clock.
  const demo = useMemo(() => (raw !== null && !user ? mockDeadlines() : null), [raw, user]);

  return (
    <main className="mx-auto w-full max-w-md px-4 pb-28 pt-8">
      <PageHeader title="Deadlines" />
      {raw === null ? (
        <Skeleton />
      ) : user ? (
        <Editor user={user} />
      ) : (
        <>
          <Link
            href="/setup"
            className="mb-5 flex items-center justify-between gap-3 rounded-2xl bg-emerald-600 p-4 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:text-emerald-950 dark:hover:bg-emerald-400"
          >
            <span>
              <span className="block font-semibold">These are demo deadlines</span>
              <span className="block text-sm opacity-90">Snap your timetable and Moodle to track your own.</span>
            </span>
            <span aria-hidden className="text-xl">
              →
            </span>
          </Link>
          <Groups deadlines={demo ?? []} />
        </>
      )}
    </main>
  );
}

/** The saved deadlines, editable. One form open at a time: a row being edited, or a new one. */
function Editor({ user }: { user: UserData }) {
  const [draft, setDraft] = useState<DraftDeadline | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  function persist(deadlines: Deadline[]): boolean {
    const ok = saveUserData({ ...user, deadlines: [...deadlines].sort(byDue), savedAt: new Date().toISOString() });
    setSaveFailed(!ok);
    return ok;
  }

  function save(d: DraftDeadline) {
    const original = user.deadlines.find((x) => x.id === d.id);
    const saved = fromDraft(d, original);
    if (persist([...user.deadlines.filter((x) => x.id !== d.id), saved])) setDraft(null);
  }

  function remove(id: string) {
    if (persist(user.deadlines.filter((x) => x.id !== id))) setDraft(null);
  }

  function addScanned(scanned: Deadline[]): { added: number; updated: number } | null {
    const { merged, added, updated } = mergeScan(user.deadlines, scanned);
    return persist(merged) ? { added, updated } : null;
  }

  const form = (d: DraftDeadline) => (
    <DeadlineForm
      value={d}
      isNew={isNew}
      onChange={(patch) => setDraft({ ...d, ...patch })}
      onCancel={() => setDraft(null)}
      onSave={() => save(d)}
      onDelete={() => remove(d.id)}
    />
  );

  return (
    <>
      {saveFailed && (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          Your browser wouldn&apos;t let us save that. Is private mode or blocked storage on?
        </p>
      )}
      {draft && isNew ? (
        <div className="mb-5">{form(draft)}</div>
      ) : (
        <div className="mb-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setIsNew(true);
              setDraft(blankDraft());
            }}
            className="min-h-12 flex-1 rounded-full bg-emerald-600 px-4 font-medium text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:text-emerald-950 dark:hover:bg-emerald-400"
          >
            + Add deadline
          </button>
          <RescanButton onScanned={addScanned} />
        </div>
      )}
      {user.deadlines.length === 0 && !draft ? (
        <p className="rounded-2xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
          Nothing due. Suspiciously calm. Add one above, or snap your Moodle in{" "}
          <Link href="/setup" className="font-medium text-emerald-700 underline dark:text-emerald-400">
            setup
          </Link>
          .
        </p>
      ) : (
        <Groups
          deadlines={user.deadlines}
          renderRow={(d, row) =>
            draft && !isNew && draft.id === d.id ? (
              form(draft)
            ) : (
              <button
                type="button"
                onClick={() => {
                  setIsNew(false);
                  setDraft(toDraft(d));
                }}
                aria-label={`Edit ${d.title}`}
                className="block w-full rounded-2xl text-left hover:bg-zinc-50 dark:hover:bg-zinc-900"
              >
                {row}
              </button>
            )
          }
        />
      )}
    </>
  );
}

/**
 * "Re-scan Moodle screenshot": pick a screenshot, Claude reads it (/api/extract), and the
 * deadlines found are merged into the list. The result shows underneath until the next scan.
 */
function RescanButton({ onScanned }: { onScanned: (d: Deadline[]) => { added: number; updated: number } | null }) {
  const [state, setState] = useState<ScanState>({ status: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);
  const reading = state.status === "reading";

  async function scan(file: File | undefined) {
    if (!file || reading) return;
    if (!file.type.startsWith("image/")) {
      setState({ status: "error", message: "That doesn't look like an image. Try a PNG or JPEG screenshot." });
      return;
    }
    setState({ status: "reading" });
    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "deadlines", image: await prepareImage(file) }),
      });
      const body = (await res.json().catch(() => ({}))) as { deadlines?: Deadline[]; error?: string };
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      const found = body.deadlines ?? [];
      if (found.length === 0) {
        setState({ status: "error", message: "I couldn't spot any deadlines in that one. Is it your Moodle timeline?" });
        return;
      }
      const result = onScanned(found);
      setState(result ? { status: "done", ...result } : { status: "idle" }); // a failed save shows its own alert
    } catch (err) {
      console.warn("[extract]", err);
      setState({ status: "error", message: "Couldn't read that screenshot right now. Try again, or add them by hand." });
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <>
      <label
        className={`flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-full border border-emerald-500 px-4 text-center text-sm font-medium text-emerald-800 hover:bg-emerald-50 dark:text-emerald-200 dark:hover:bg-emerald-950/40 ${
          reading ? "cursor-wait animate-pulse" : "cursor-pointer"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          disabled={reading}
          onChange={(e) => void scan(e.target.files?.[0])}
          className="sr-only"
        />
        <span aria-hidden>📸</span>
        <span aria-live="polite">{reading ? "Squinting…" : "Re-scan Moodle screenshot"}</span>
      </label>
      {(state.status === "done" || state.status === "error") && (
        <p
          role={state.status === "error" ? "alert" : "status"}
          className={`basis-full text-sm ${state.status === "error" ? "text-red-600 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"}`}
        >
          {state.status === "error" ? state.message : scanSummary(state.added, state.updated)}
        </p>
      )}
    </>
  );
}

function scanSummary(added: number, updated: number): string {
  const total = added + updated;
  const parts = [added > 0 && `${added} new`, updated > 0 && `${updated} updated`].filter(Boolean).join(", ");
  return `Found ${total} ${total === 1 ? "deadline" : "deadlines"}: ${parts}.`;
}

/** "This week" (up to Sunday), "Later", then anything already past. Empty groups are hidden. */
function Groups({
  deadlines,
  renderRow = (_, row) => row,
}: {
  deadlines: Deadline[];
  renderRow?: (d: Deadline, row: ReactNode) => ReactNode;
}) {
  // Read the clock once on mount. Switching tabs remounts, which is fresh enough for days-left.
  const [{ now, today }] = useState(() => ({ now: Date.now(), today: londonTodayKey() }));
  const sunday = addDays(mondayOf(today), 6);
  const sorted = [...deadlines].sort(byDue);

  const groups: { title: string; items: Deadline[] }[] = [
    { title: "This week", items: sorted.filter((d) => Date.parse(d.due) >= now && londonDateKey(d.due) <= sunday) },
    { title: "Later", items: sorted.filter((d) => Date.parse(d.due) >= now && londonDateKey(d.due) > sunday) },
    { title: "Past", items: sorted.filter((d) => Date.parse(d.due) < now) },
  ];

  return (
    <div className="flex flex-col gap-6">
      {groups
        .filter((g) => g.items.length > 0)
        .map((g) => (
          <section key={g.title}>
            <h2 className="mb-2 text-sm font-semibold text-zinc-600 dark:text-zinc-400">{g.title}</h2>
            <ul className="flex flex-col gap-2">
              {g.items.map((d) => (
                <li key={d.id}>{renderRow(d, <DeadlineRow deadline={d} today={today} past={g.title === "Past"} />)}</li>
              ))}
            </ul>
          </section>
        ))}
    </div>
  );
}

function DeadlineRow({ deadline: d, today, past }: { deadline: Deadline; today: DateKey; past: boolean }) {
  return (
    <div
      className={`flex items-start justify-between gap-3 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800 ${
        past ? "opacity-60" : ""
      }`}
    >
      <div className="min-w-0">
        {d.moduleCode && <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">{d.moduleCode}</p>}
        <p className="font-medium">{d.title}</p>
        <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">
          {dueLabel(d.due)}
          {d.weight !== undefined && ` · ${d.weight}%`}
        </p>
      </div>
      <DaysLeft days={daysBetween(today, londonDateKey(d.due))} past={past} />
    </div>
  );
}

function DaysLeft({ days, past }: { days: number; past: boolean }) {
  const label = past ? "Overdue" : days === 0 ? "Today" : days === 1 ? "Tomorrow" : `${days} days`;
  const tone = past
    ? "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
    : days <= URGENT_DAYS
      ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
      : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
  return <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>{label}</span>;
}

function DeadlineForm({
  value: d,
  isNew,
  onChange,
  onCancel,
  onSave,
  onDelete,
}: {
  value: DraftDeadline;
  isNew: boolean;
  onChange: (patch: Partial<DraftDeadline>) => void;
  onCancel: () => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  const problem = deadlineProblem(d);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!problem) onSave();
      }}
      className="rounded-2xl border border-emerald-400 bg-white p-3 dark:border-emerald-700 dark:bg-zinc-950"
    >
      <div className="grid grid-cols-[7rem_1fr] gap-2">
        <Field label="Module">
          <input
            value={d.moduleCode}
            onChange={(e) => onChange({ moduleCode: e.target.value })}
            placeholder="ECON0019"
            className={inputClass}
          />
        </Field>
        <Field label="What's due">
          <input
            value={d.title}
            onChange={(e) => onChange({ title: e.target.value })}
            placeholder="Problem Set 2"
            autoFocus={isNew}
            className={inputClass}
          />
        </Field>
      </div>
      <div className="mt-2 grid grid-cols-[1fr_1fr_4.5rem] gap-2">
        <Field label="Due date">
          <input type="date" value={d.date} onChange={(e) => onChange({ date: e.target.value })} className={inputClass} />
        </Field>
        <Field label="Time">
          <input type="time" value={d.time} onChange={(e) => onChange({ time: e.target.value })} className={inputClass} />
        </Field>
        <Field label="Weight %">
          <input
            type="number"
            inputMode="decimal"
            min={0}
            max={100}
            value={d.weight}
            onChange={(e) => onChange({ weight: e.target.value })}
            placeholder="–"
            className={inputClass}
          />
        </Field>
      </div>
      {problem && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{problem}</p>}
      <div className="mt-3 flex gap-2">
        {!isNew && (
          <DeleteButton
            onDelete={onDelete}
            className="min-h-11 rounded-full px-4 text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
          >
            Delete
          </DeleteButton>
        )}
        <button
          type="button"
          onClick={onCancel}
          className="ml-auto min-h-11 rounded-full bg-zinc-100 px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!!problem}
          className="min-h-11 rounded-full bg-emerald-600 px-5 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-emerald-500 dark:text-emerald-950 dark:hover:bg-emerald-400"
        >
          {isNew ? "Add" : "Save"}
        </button>
      </div>
    </form>
  );
}


function Skeleton() {
  return (
    <div aria-busy="true" className="flex animate-pulse flex-col gap-3">
      <div className="h-12 rounded-full bg-zinc-100 dark:bg-zinc-900" />
      <div className="h-20 rounded-2xl bg-zinc-100 dark:bg-zinc-900" />
      <div className="h-20 rounded-2xl bg-zinc-100 dark:bg-zinc-900" />
    </div>
  );
}
