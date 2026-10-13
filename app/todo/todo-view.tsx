"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { inputClass } from "../form-ui";
import { formatDurationShort } from "@/lib/duration";
import { londonTodayKey } from "@/lib/london-time";
import {
  byDueThenEstimate,
  EST_CHIPS,
  MAX_TITLE,
  parseTodos,
  readRawTodos,
  saveTodos,
  subscribeTodos,
} from "@/lib/todos";
import type { DateKey, Todo } from "@/lib/types";

// The To-do tab. Saved straight to localStorage on every change, in the demo week too.
// Open to-dos are sent with each recommendation request, so Claude can slot one into a gap.

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
  `min-h-9 rounded-full px-3 text-sm font-medium ${
    on
      ? "bg-emerald-600 text-white dark:bg-emerald-500 dark:text-emerald-950"
      : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
  }`;

export function TodoView() {
  // "" = checked, nothing saved. null = not checked yet (server render / hydration).
  const raw = useSyncExternalStore(subscribeTodos, () => readRawTodos() ?? "", () => null);
  const todos = useMemo(() => parseTodos(raw), [raw]);
  const [saveFailed, setSaveFailed] = useState(false);

  function persist(next: Todo[]) {
    setSaveFailed(!saveTodos(next));
  }
  const update = (id: string, patch: Partial<Todo>) =>
    persist(todos.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  const remove = (id: string) => persist(todos.filter((t) => t.id !== id));

  return (
    <main className="mx-auto w-full max-w-md px-4 pb-28 pt-8">
      <header className="mb-5">
        <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">Bloomsbuddy</p>
        <h1 className="text-3xl font-semibold tracking-tight">To-do</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Add a time estimate and I&apos;ll squeeze these into your gaps.
        </p>
      </header>
      {raw === null ? (
        <Skeleton />
      ) : (
        <>
          {saveFailed && (
            <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
              Your browser wouldn&apos;t let us save that. Is private mode or blocked storage on?
            </p>
          )}
          <QuickAdd onAdd={(title) => persist([...todos, { id: crypto.randomUUID(), title, done: false }])} />
          <TodoList todos={todos} update={update} remove={remove} clearDone={() => persist(todos.filter((t) => !t.done))} />
        </>
      )}
    </main>
  );
}

function QuickAdd({ onAdd }: { onAdd: (title: string) => void }) {
  const [title, setTitle] = useState("");
  const trimmed = title.trim();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!trimmed) return;
        onAdd(trimmed);
        setTitle("");
      }}
      className="mb-6 flex gap-2"
    >
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={MAX_TITLE}
        placeholder="Email tutor, read ch. 4, buy milk…"
        aria-label="New to-do"
        className={`${inputClass} rounded-full px-4`}
      />
      <button
        type="submit"
        disabled={!trimmed}
        className="min-h-11 shrink-0 rounded-full bg-emerald-600 px-5 font-medium text-white hover:bg-emerald-700 disabled:opacity-40 dark:bg-emerald-500 dark:text-emerald-950 dark:hover:bg-emerald-400"
      >
        Add
      </button>
    </form>
  );
}

function TodoList({
  todos,
  update,
  remove,
  clearDone,
}: {
  todos: Todo[];
  update: (id: string, patch: Partial<Todo>) => void;
  remove: (id: string) => void;
  clearDone: () => void;
}) {
  // Read the clock once on mount, and only here: this renders after localStorage is read, so never
  // during the server prerender (Next.js rejects Date.now() there). Fresh enough for "Today"/"Tomorrow".
  const [today] = useState(londonTodayKey);
  const [editingId, setEditingId] = useState<string | null>(null);
  const open = todos.filter((t) => !t.done).sort(byDueThenEstimate);
  const done = todos.filter((t) => t.done);

  return (
    <div className="flex flex-col gap-6">
      {open.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
          {done.length ? "All done. Look at you go 🎉" : "Nothing on the list. Add something above and I'll find it a gap."}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {open.map((t) => (
            <li key={t.id}>
              <TodoRow
                todo={t}
                today={today}
                editing={editingId === t.id}
                onToggleEdit={() => setEditingId(editingId === t.id ? null : t.id)}
                onComplete={() => {
                  update(t.id, { done: true });
                  if (editingId === t.id) setEditingId(null);
                }}
                update={(patch) => update(t.id, patch)}
                onDelete={() => remove(t.id)}
              />
            </li>
          ))}
        </ul>
      )}
      {done.length > 0 && (
        <details className="group">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            <span aria-hidden className="transition-transform group-open:rotate-90">
              ›
            </span>
            Done ({done.length})
          </summary>
          <ul className="mt-2 flex flex-col gap-2">
            {done.map((t) => (
              <li key={t.id} className="flex items-center gap-3 rounded-2xl border border-zinc-200 px-3 py-2 dark:border-zinc-800">
                <CheckButton done label={`Mark ${t.title} not done`} onClick={() => update(t.id, { done: false })} />
                <span className="min-w-0 flex-1 truncate text-zinc-500 line-through">{t.title}</span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={clearDone}
            className="mt-2 min-h-11 rounded-full px-4 text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
          >
            Clear done
          </button>
        </details>
      )}
    </div>
  );
}

function TodoRow({
  todo: t,
  today,
  editing,
  onToggleEdit,
  onComplete,
  update,
  onDelete,
}: {
  todo: Todo;
  today: DateKey;
  editing: boolean;
  onToggleEdit: () => void;
  onComplete: () => void;
  update: (patch: Partial<Todo>) => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`rounded-2xl border ${
        editing ? "border-emerald-400 dark:border-emerald-700" : "border-zinc-200 dark:border-zinc-800"
      }`}
    >
      <div className="flex items-center gap-3 px-3 py-2">
        <CheckButton done={false} label={`Mark ${t.title} done`} onClick={onComplete} />
        <button
          type="button"
          onClick={onToggleEdit}
          aria-expanded={editing}
          aria-label={`Edit ${t.title}`}
          className="flex min-h-11 min-w-0 flex-1 flex-col items-start justify-center text-left"
        >
          <span className="w-full truncate font-medium">{t.title}</span>
          {(t.due || t.estMinutes) && (
            <span className="mt-1 flex flex-wrap gap-1.5">
              {t.due && <DueChip due={t.due} today={today} />}
              {t.estMinutes && (
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                  ⏱ {formatDurationShort(t.estMinutes)}
                </span>
              )}
            </span>
          )}
        </button>
      </div>
      {editing && <Editor todo={t} update={update} onDelete={onDelete} onClose={onToggleEdit} />}
    </div>
  );
}

/** Inline editor. Every change saves straight away; the title saves when it isn't blank. */
function Editor({
  todo: t,
  update,
  onDelete,
  onClose,
}: {
  todo: Todo;
  update: (patch: Partial<Todo>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(t.title);
  // Delete takes two taps instead of a browser confirm() dialog.
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="flex flex-col gap-3 border-t border-zinc-200 p-3 dark:border-zinc-800">
      <input
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          if (e.target.value.trim()) update({ title: e.target.value.trim() });
        }}
        maxLength={MAX_TITLE}
        aria-label="Title"
        className={inputClass}
      />
      <div>
        <p className="mb-1 text-xs font-medium text-zinc-500">Due</p>
        <div className="flex gap-2">
          <input
            type="date"
            value={t.due ?? ""}
            onChange={(e) => update({ due: e.target.value || undefined })}
            aria-label="Due date"
            className={inputClass}
          />
          {t.due && (
            <button type="button" onClick={() => update({ due: undefined })} className={chipClass(false)}>
              Clear
            </button>
          )}
        </div>
      </div>
      <div>
        <p className="mb-1 text-xs font-medium text-zinc-500">How long?</p>
        <div className="flex flex-wrap gap-2">
          {EST_CHIPS.map((mins) => (
            <button
              key={mins}
              type="button"
              aria-pressed={t.estMinutes === mins}
              onClick={() => update({ estMinutes: t.estMinutes === mins ? undefined : mins })}
              className={chipClass(t.estMinutes === mins)}
            >
              {formatDurationShort(mins)}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={t.estMinutes === undefined}
            onClick={() => update({ estMinutes: undefined })}
            className={chipClass(t.estMinutes === undefined)}
          >
            No idea
          </button>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => (confirmDelete ? onDelete() : setConfirmDelete(true))}
          className="min-h-11 rounded-full px-4 text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
        >
          {confirmDelete ? "Tap again to delete" : "Delete"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto min-h-11 rounded-full bg-zinc-100 px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
        >
          Close
        </button>
      </div>
    </div>
  );
}

function CheckButton({ done, label, onClick }: { done: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="-m-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
    >
      <span
        className={`flex h-6 w-6 items-center justify-center rounded-full border-2 text-sm font-bold ${
          done
            ? "border-emerald-600 bg-emerald-600 text-white dark:border-emerald-500 dark:bg-emerald-500 dark:text-emerald-950"
            : "border-zinc-400 text-transparent hover:border-emerald-600 hover:text-emerald-600 dark:border-zinc-600"
        }`}
      >
        ✓
      </span>
    </button>
  );
}

function DueChip({ due, today }: { due: DateKey; today: DateKey }) {
  const days = daysBetween(today, due);
  const label = days < 0 ? "Overdue" : days === 0 ? "Today" : days === 1 ? "Tomorrow" : londonDay.format(new Date(`${due}T12:00:00Z`));
  const tone =
    days <= 0
      ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
      : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>📅 {label}</span>;
}

function Skeleton() {
  return (
    <div aria-busy="true" className="flex animate-pulse flex-col gap-3">
      <div className="h-11 rounded-full bg-zinc-100 dark:bg-zinc-900" />
      <div className="h-16 rounded-2xl bg-zinc-100 dark:bg-zinc-900" />
      <div className="h-16 rounded-2xl bg-zinc-100 dark:bg-zinc-900" />
    </div>
  );
}
