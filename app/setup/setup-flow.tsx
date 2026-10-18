"use client";

// Two routes share this file:
// /setup is onboarding, first launch only (Today sends new visitors here):
//   1. Timetable: screenshot or pasted text → Claude → editable weekly classes, plus how many weeks they repeat
//   2. To-do: things to fit into gaps (skippable; added and removed here, ticked on the To-do tab)
//   3. Home: a hall, a postcode or "don't use my home" (skippable)
//   4. Societies: SU page links, checked against the SU website (skippable)
//   5. Deadlines: Moodle screenshot or pasted text → Claude → editable deadlines (skippable)
//   6. Confirm and save to localStorage
// Nothing is saved until step 6, so a bad screenshot can't break anything.
// /timetable ("Edit timetable") is step 1 on its own and saves straight from it. Everything else is
// kept as it was (to-dos, societies and deadlines have their own tabs; home is set from Today).
// Each route redirects to the other if it doesn't fit (/setup with data saved, /timetable without).
// /setup?again=1 (linked from the Deadlines tab) runs the full setup again, prefilled with the saved data.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { BUILDINGS } from "@/lib/buildings";
import { DayCalendar, DayPills } from "../day-calendar";
import { DeleteButton, Field, inputClass, PageHeader, sheetDialogClass } from "../form-ui";
import { HomePicker } from "../home-picker";
import { CameraIcon } from "../icons";
import { LocationPicker } from "../location-picker";
import { SocietyPicker } from "../society-picker";
import { DeadlineKindToggle } from "../deadlines/deadlines-view";
import { TodoEditor } from "../todo/todo-view";
import { blankDraft, deadlineProblem, fromDraft, newId, toDraft, type DraftDeadline } from "@/lib/deadline-draft";
import { homeLabel, parseHome, readRawHome, saveHome } from "@/lib/home";
import { addDays, formatWallTime, isDateKey, isWallTime, londonTodayKey, mondayOf } from "@/lib/london-time";
import {
  clearUserData,
  markOnboardingSkipped,
  parseUserData,
  readRawUserData,
  saveUserData,
  subscribeUserData,
} from "@/lib/storage";
import { prepareImage } from "@/lib/prepare-image";
import { parseTodos, readRawTodos, saveTodos } from "@/lib/todos";
import type { ClassKind, Deadline, Home, Society, Todo, UserData, WeeklyClass } from "@/lib/types";

const DEFAULT_WEEKS = 11; // A UCL term is usually 11 teaching weeks
const MAX_WEEKS = 15;

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const KINDS: ClassKind[] = ["lecture", "seminar", "lab", "tutorial"];

const londonDayMonth = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short" });
const londonWeekdayDayMonth = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  weekday: "short",
  day: "numeric",
  month: "short",
});
// Midday UTC is always the same calendar day in London.
const dayDate = (dateKey: string) => new Date(`${dateKey}T12:00:00Z`);

function classProblem(c: WeeklyClass): string | null {
  if (!c.moduleCode.trim() && !c.title.trim()) return "Give it a module code or a name";
  if (!isWallTime(c.startTime) || !isWallTime(c.endTime)) return "Needs a start and end time";
  if (c.endTime <= c.startTime) return "Ends before it starts";
  return null;
}

// ---------- Top level ----------

/** "onboarding" = /setup, first launch only. "timetable" = /timetable, from "Edit timetable". */
export type SetupMode = "onboarding" | "timetable";

export function SetupFlow({ mode }: { mode: SetupMode }) {
  // localStorage only exists in the browser: null until we've looked, then the raw JSON ("" = nothing saved).
  const raw = useSyncExternalStore(subscribeUserData, () => readRawUserData() ?? "", () => null);
  if (raw === null) return <Loading />;
  return <Editor mode={mode} initial={parseUserData(raw)} />;
}

function Shell({ children }: { children: ReactNode }) {
  return <main className="mx-auto w-full max-w-2xl px-4 pb-24 pt-8 md:px-6">{children}</main>;
}

function Loading() {
  return (
    <Shell>
      <div aria-busy="true" className="h-64 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-900" />
    </Shell>
  );
}

type Step = 0 | 1 | 2 | 3 | 4 | 5;
const STEP_LABELS = ["Timetable", "To-do", "Home", "Societies", "Deadlines", "Confirm"];

function Editor({ mode, initial }: { mode: SetupMode; initial: UserData | null }) {
  const router = useRouter();
  // Decided once on mount: saving changes `initial`, and that mustn't bounce us to the other route.
  // ?again=1 is read here, not with searchParams in the page: that would block prerendering. Editor only
  // renders in the browser (after the localStorage read), so window is safe.
  const [redirectTo] = useState(() =>
    mode === "onboarding" && initial && new URLSearchParams(window.location.search).get("again") !== "1"
      ? "/timetable"
      : mode === "timetable" && !initial
        ? "/setup"
        : null,
  );
  const [step, setStep] = useState<Step>(0);
  const [classes, setClasses] = useState<WeeklyClass[]>(initial?.classes ?? []);
  const [termStart, setTermStart] = useState(initial?.termStart ?? mondayOf(londonTodayKey()));
  const [weeks, setWeeks] = useState(initial?.weeks ?? DEFAULT_WEEKS);
  const [deadlines, setDeadlines] = useState<DraftDeadline[]>(initial?.deadlines.map(toDraft) ?? []);
  const [societies, setSocieties] = useState<Society[]>(initial?.societies ?? []);
  // A draft until Confirm. Starts from any to-dos made while trying the demo week.
  const [todos, setTodos] = useState<Todo[]>(() => parseTodos(readRawTodos()));
  // Also a draft until Confirm. null = skipped (not set).
  const [home, setHome] = useState<Home | null>(() => parseHome(readRawHome()));
  const [saveError, setSaveError] = useState(false);

  useEffect(() => {
    if (redirectTo) router.replace(redirectTo);
  }, [redirectTo, router]);

  // Scroll to the top on step change, so each step starts at its heading.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [step]);

  if (redirectTo) return <Loading />;

  const classesOk = classes.length > 0 && classes.every((c) => !classProblem(c));
  const deadlinesOk = deadlines.every((d) => !deadlineProblem(d));

  function save() {
    const data: UserData = {
      version: 1,
      classes: classes.map((c) => ({ ...c, moduleCode: c.moduleCode.trim().toUpperCase(), title: c.title.trim() })),
      termStart,
      weeks,
      deadlines: deadlines.map((d) => fromDraft(d)).sort((a, b) => Date.parse(a.due) - Date.parse(b.due)),
      societies,
      savedAt: new Date().toISOString(),
    };
    // The timetable editor leaves to-dos and home alone: they're edited on the To-do tab and Today.
    const extrasSaved = mode !== "onboarding" || (saveTodos(todos) && (!home || saveHome(home)));
    if (!saveUserData(data) || !extrasSaved) {
      setSaveError(true);
      return;
    }
    router.push("/");
  }

  function skip() {
    markOnboardingSkipped();
    router.push("/");
  }

  function useDemo() {
    clearUserData();
    markOnboardingSkipped(); // otherwise Today would send them straight back to onboarding
    router.push("/");
  }

  if (mode === "timetable") {
    return (
      <Shell>
        <PageHeader
          title="Edit timetable"
          action={
            <Link
              href="/"
              className="rounded-lg px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
            >
              Cancel
            </Link>
          }
        />
        <div className="flex flex-col gap-5">
          <TimetableStep
            classes={classes}
            setClasses={setClasses}
            termStart={termStart}
            setTermStart={setTermStart}
            weeks={weeks}
            setWeeks={setWeeks}
            canContinue={classesOk}
            onNext={save}
            nextLabel="Save timetable"
          />
          {saveError && <SaveError />}
          <UseDemoButton onClick={useDemo} />
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <PageHeader
        title="Let's get you set up"
        action={
          <button
            type="button"
            onClick={skip}
            className="rounded-lg px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
          >
            Skip, show the demo week
          </button>
        }
      >
        <ol className="mt-4 flex gap-2" aria-label="Steps">
          {STEP_LABELS.map((label, i) => {
            // To-dos, home and societies can't be invalid, so only the timetable gates the middle
            // steps, and Confirm also needs the deadlines to be fine.
            const reachable = i <= step || (i <= 4 && classesOk) || (classesOk && deadlinesOk);
            return (
              <li key={label} className="min-w-0 flex-1">
                <button
                  type="button"
                  disabled={!reachable}
                  onClick={() => setStep(i as Step)}
                  aria-current={i === step ? "step" : undefined}
                  className={`w-full truncate border-t-4 pt-2 text-left text-xs font-medium transition-colors disabled:cursor-not-allowed ${
                    i <= step
                      ? "border-emerald-500 text-emerald-700 dark:text-emerald-300"
                      : "border-line text-muted"
                  }`}
                >
                  {i + 1}. {label}
                </button>
              </li>
            );
          })}
        </ol>
      </PageHeader>

      {step === 0 && (
        <TimetableStep
          classes={classes}
          setClasses={setClasses}
          termStart={termStart}
          setTermStart={setTermStart}
          weeks={weeks}
          setWeeks={setWeeks}
          canContinue={classesOk}
          onNext={() => setStep(1)}
        />
      )}
      {step === 1 && <TodosStep todos={todos} setTodos={setTodos} onBack={() => setStep(0)} onNext={() => setStep(2)} />}
      {step === 2 && (
        <HomeStep
          home={home}
          onPick={(h) => {
            setHome(h);
            setStep(3);
          }}
          onBack={() => setStep(1)}
          onSkip={() => {
            setHome(null);
            setStep(3);
          }}
        />
      )}
      {step === 3 && (
        <SocietiesStep
          societies={societies}
          setSocieties={setSocieties}
          onBack={() => setStep(2)}
          onNext={() => setStep(4)}
        />
      )}
      {step === 4 && (
        <DeadlinesStep
          deadlines={deadlines}
          setDeadlines={setDeadlines}
          canContinue={deadlinesOk}
          onBack={() => setStep(3)}
          onNext={() => setStep(5)}
        />
      )}
      {step === 5 && (
        <ReviewStep
          classes={classes}
          termStart={termStart}
          weeks={weeks}
          todos={todos}
          home={home}
          societies={societies}
          deadlines={deadlines}
          saveError={saveError}
          onBack={() => setStep(4)}
          onSave={save}
        />
      )}
    </Shell>
  );
}

// ---------- Step 1: timetable ----------

function TimetableStep({
  classes,
  setClasses,
  termStart,
  setTermStart,
  weeks,
  setWeeks,
  canContinue,
  onNext,
  nextLabel,
}: {
  classes: WeeklyClass[];
  setClasses: (c: WeeklyClass[]) => void;
  termStart: string;
  setTermStart: (s: string) => void;
  weeks: number;
  setWeeks: (n: number) => void;
  canContinue: boolean;
  onNext: () => void;
  nextLabel?: string;
}) {
  // 1 = Monday … 7 = Sunday. Opens on the first day with classes.
  const [selectedDay, setSelectedDay] = useState(() => (classes.length ? Math.min(...classes.map((c) => c.dayOfWeek)) : 1));
  const [editingId, setEditingId] = useState<string | null>(null);
  /** The class "+ Add a class" just made, so its sheet says "Add class". */
  const [addedId, setAddedId] = useState<string | null>(null);

  const update = (id: string, patch: Partial<WeeklyClass>) => {
    setClasses(classes.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    // Moving a class to another day takes the calendar with it, so the form stays open.
    if (patch.dayOfWeek && id === editingId) setSelectedDay(patch.dayOfWeek);
  };
  const remove = (id: string) => {
    setClasses(classes.filter((c) => c.id !== id));
    if (id === editingId) setEditingId(null);
  };
  const add = () => {
    const id = newId("cls");
    setClasses([
      ...classes,
      {
        id,
        moduleCode: "",
        title: "",
        kind: "lecture",
        dayOfWeek: selectedDay,
        startTime: "09:00",
        endTime: "10:00",
        room: "",
        buildingId: "main-building",
      },
    ]);
    setEditingId(id);
    setAddedId(id);
  };

  // Classes without a usable start and end can't go on the calendar, so they're listed above it to fix.
  // The one being edited stays put (drawn with stand-in times), so the form doesn't jump away mid-edit.
  const placeable = (c: WeeklyClass) =>
    c.id === editingId || (isWallTime(c.startTime) && isWallTime(c.endTime) && c.endTime > c.startTime);
  const unplaced = classes.filter((c) => !placeable(c));
  const dayClasses = classes.filter((c) => c.dayOfWeek === selectedDay && placeable(c));
  const editing = dayClasses.find((c) => c.id === editingId);
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const span = (c: WeeklyClass) => {
    const startMin = isWallTime(c.startTime) ? toMin(c.startTime) : 9 * 60;
    const endMin = isWallTime(c.endTime) ? toMin(c.endTime) : 0;
    return { startMin, endMin: endMin > startMin ? endMin : Math.min(24 * 60, startMin + 30) };
  };

  const lastFriday = addDays(termStart, weeks * 7 - 3);

  return (
    <section className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold">Your weekly timetable</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Screenshot one week from UCL Go or the timetable website and drop it here, or paste/type it below.
          I&apos;ll read it, then you check I got it right.
        </p>
      </div>

      <Uploader
        kind="timetable"
        nouns={["class", "classes"]}
        placeholder="Paste from UCL Go, or type e.g. ECON0013 lecture Mon 10–12, Roberts G06"
        existingCount={classes.length}
        onResult={(rows, mode) => setClasses(mode === "replace" ? rows : [...classes, ...rows])}
      />

      {unplaced.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-red-600 dark:text-red-400">Needs fixing</h3>
          <ul className="flex flex-col gap-3">
            {unplaced.map((c) => (
              <li key={c.id}>
                <ClassRow value={c} onChange={(patch) => update(c.id, patch)} onRemove={() => remove(c.id)} />
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <DayPills
          label="Choose a weekday"
          days={DAYS.map((weekday, i) => ({
            key: String(i + 1),
            weekday,
            dot: classes.some((c) => c.dayOfWeek === i + 1),
            weekend: i >= 5,
          }))}
          active={String(selectedDay)}
          onSelect={(key) => {
            setSelectedDay(Number(key));
            setEditingId(null);
          }}
        />
        <p className="mb-1 text-sm text-zinc-600 dark:text-zinc-400">
          {dayClasses.length === 0
            ? `No classes on ${DAYS[selectedDay - 1]}`
            : "Tap a class to edit it."}
        </p>
        <DayCalendar
          events={dayClasses.map((c) => ({
            id: c.id,
            ...span(c),
            kind: c.kind,
            title: [c.moduleCode, c.title].filter(Boolean).join(" ") || "Untitled class",
            detail: c.room || undefined,
            invalid: !!classProblem(c) || c.buildingGuessed,
          }))}
          openId={editing?.id ?? null}
          onEventTap={(id) => setEditingId(editingId === id ? null : id)}
        />
      </div>

      <button
        type="button"
        onClick={add}
        className="min-h-10 rounded-xl border-2 border-dashed border-zinc-300 text-sm font-medium text-zinc-600 hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900"
      >
        + Add a class on {DAYS[selectedDay - 1]}
      </button>

      {editing && (
        <ClassSheet
          key={editing.id}
          value={editing}
          isNew={editing.id === addedId}
          onChange={(patch) => update(editing.id, patch)}
          onRemove={() => remove(editing.id)}
          onClose={() => setEditingId(null)}
        />
      )}

      <fieldset className="rounded-xl bg-zinc-100 p-4 dark:bg-zinc-900">
        <legend className="sr-only">How long the timetable repeats</legend>
        <h3 className="font-semibold">How long does it repeat?</h3>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Field label="First week starts">
            <input
              type="date"
              value={termStart}
              onChange={(e) => isDateKey(e.target.value) && setTermStart(mondayOf(e.target.value))}
              className={inputClass}
            />
          </Field>
          <Field label="Number of weeks">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_WEEKS}
              value={weeks}
              onChange={(e) => {
                const n = Math.round(Number(e.target.value));
                if (Number.isFinite(n)) setWeeks(Math.min(MAX_WEEKS, Math.max(1, n)));
              }}
              className={inputClass}
            />
          </Field>
        </div>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          {weeks} {weeks === 1 ? "week" : "weeks"}: {londonWeekdayDayMonth.format(dayDate(termStart))} –{" "}
          {londonWeekdayDayMonth.format(dayDate(lastFriday))}. A UCL term is usually 11 weeks.
        </p>
      </fieldset>

      <StepNav canContinue={canContinue} onNext={onNext} nextLabel={nextLabel} blockedHint={classes.length === 0 ? "Add at least one class" : "Fix the highlighted classes first"} />
    </section>
  );
}

// One width for both states ("Delete", "Tap again to delete"), so the first tap never resizes it.
const DELETE_PILL = "min-h-10 w-44 shrink-0 whitespace-nowrap rounded-lg px-3 text-center text-sm font-medium";

function DeletePill({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <DeleteButton
      onDelete={onRemove}
      label={label}
      className={`${DELETE_PILL} text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40`}
      armedClassName={`${DELETE_PILL} bg-red-600 text-white hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600`}
    >
      Delete
    </DeleteButton>
  );
}

/** A class that can't go on the calendar yet, as a card in the "Needs fixing" list. */
function ClassRow({
  value: c,
  onChange,
  onRemove,
}: {
  value: WeeklyClass;
  onChange: (patch: Partial<WeeklyClass>) => void;
  onRemove: () => void;
}) {
  return (
    <div
      className={`rounded-xl border bg-surface p-3 ${
        classProblem(c) ? "border-red-400 dark:border-red-700" : "border-zinc-200 dark:border-zinc-800"
      }`}
    >
      <ClassFields value={c} onChange={onChange} />
      <div className="mt-2 flex justify-end">
        <DeletePill label={`Delete ${c.moduleCode || c.title || "class"}`} onRemove={onRemove} />
      </div>
    </div>
  );
}

/**
 * Edit one class, opened by tapping it on the calendar or "+ Add a class". A bottom sheet on
 * phones, a panel down the right on laptops, like EventSheet. Edits apply as you type, so there's
 * no Save: "Done" just closes it.
 */
function ClassSheet({
  value: c,
  isNew,
  onChange,
  onRemove,
  onClose,
}: {
  value: WeeklyClass;
  isNew: boolean;
  onChange: (patch: Partial<WeeklyClass>) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby="class-sheet-title"
      // Closed via React state, not the "close" event: see HomeSheet for why.
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className={sheetDialogClass}
    >
      <div className="flex h-full flex-col">
        <div className="px-5 pt-3">
          <div aria-hidden className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-zinc-300 md:hidden dark:bg-zinc-700" />
          <div className="mb-3 flex items-start justify-between gap-3 md:mt-4">
            <h2 id="class-sheet-title" className="text-xl font-semibold tracking-tight">
              {isNew ? "Add class" : "Edit class"}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-2 flex size-11 shrink-0 items-center justify-center rounded-lg text-2xl leading-none text-muted hover:bg-zinc-100 dark:hover:bg-zinc-900"
            >
              ×
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">
          <ClassFields value={c} onChange={onChange} />
        </div>

        <div className="flex items-center gap-2 border-t border-line px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
          <DeletePill label={`Delete ${c.moduleCode || c.title || "class"}`} onRemove={onRemove} />
          <button
            type="button"
            onClick={onClose}
            className="ml-auto min-h-10 rounded-lg bg-primary px-6 text-sm font-medium text-on-primary hover:bg-primary-hover"
          >
            Done
          </button>
        </div>
      </div>
    </dialog>
  );
}

/** The class form's inputs, shared by the sheet and the "Needs fixing" cards. */
function ClassFields({ value: c, onChange }: { value: WeeklyClass; onChange: (patch: Partial<WeeklyClass>) => void }) {
  const problem = classProblem(c);
  return (
    <>
      <div className="grid grid-cols-[7rem_1fr] gap-2">
        <Field label="Module">
          <input
            value={c.moduleCode}
            onChange={(e) => onChange({ moduleCode: e.target.value })}
            placeholder="ECON0013"
            className={inputClass}
          />
        </Field>
        <Field label="Name">
          <input
            value={c.title}
            onChange={(e) => onChange({ title: e.target.value })}
            placeholder="Microeconomics"
            className={inputClass}
          />
        </Field>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Field label="Day">
          <select value={c.dayOfWeek} onChange={(e) => onChange({ dayOfWeek: Number(e.target.value) })} className={inputClass}>
            {DAYS.map((d, i) => (
              <option key={d} value={i + 1}>
                {d}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Type">
          <select
            value={c.kind}
            onChange={(e) => onChange({ kind: e.target.value as WeeklyClass["kind"] })}
            className={`${inputClass} capitalize`}
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Starts">
          <input type="time" value={c.startTime} onChange={(e) => onChange({ startTime: e.target.value })} className={inputClass} />
        </Field>
        <Field label="Ends">
          <input type="time" value={c.endTime} onChange={(e) => onChange({ endTime: e.target.value })} className={inputClass} />
        </Field>
      </div>
      <div className="mt-2">
        <Field label="Room">
          <input
            value={c.room}
            onChange={(e) => onChange({ room: e.target.value })}
            placeholder="Roberts G06"
            className={inputClass}
          />
        </Field>
      </div>
      <fieldset className="mt-2 flex min-w-0 flex-col gap-1">
        <legend className="mb-1 text-xs font-medium text-muted">
          {c.buildingGuessed ? "Building: please check, I couldn't tell" : "Building (for travel times)"}
        </legend>
        <LocationPicker
          buildingOnly
          invalid={c.buildingGuessed}
          label="Search UCL buildings"
          value={{ locationChoice: "building", buildingId: c.buildingId, postcode: "" }}
          onChange={(p) => p.buildingId && onChange({ buildingId: p.buildingId, buildingGuessed: false })}
        />
      </fieldset>
      {problem && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{problem}</p>}
    </>
  );
}

// ---------- Step 5: deadlines ----------

function DeadlinesStep({
  deadlines,
  setDeadlines,
  canContinue,
  onBack,
  onNext,
}: {
  deadlines: DraftDeadline[];
  setDeadlines: (d: DraftDeadline[]) => void;
  canContinue: boolean;
  onBack: () => void;
  onNext: () => void;
}) {
  const update = (id: string, patch: Partial<DraftDeadline>) =>
    setDeadlines(deadlines.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  const remove = (id: string) => setDeadlines(deadlines.filter((d) => d.id !== id));
  const add = () =>
    setDeadlines([...deadlines, blankDraft()]);

  return (
    <section className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold">Your deadlines and exams</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Screenshot the Timeline block on your Moodle dashboard, or paste/type them below, tests and exams too. I&apos;ll use these to
          decide when you should actually be studying. You can skip this.
        </p>
      </div>

      <Uploader
        kind="deadlines"
        nouns={["deadline", "deadlines"]}
        placeholder="Paste your Moodle timeline, or type e.g. ECON0019 essay due Fri 30 Oct, 17:00; STAT0002 midterm Thu 5 Nov 10:00–12:00"
        existingCount={deadlines.length}
        onResult={(rows, mode) => {
          const drafts = rows.map(toDraft);
          setDeadlines(mode === "replace" ? drafts : [...deadlines, ...drafts]);
        }}
      />

      {deadlines.length > 0 && (
        <ul className="flex flex-col gap-3">
          {deadlines.map((d) => (
            <li key={d.id}>
              <DeadlineRow value={d} onChange={(patch) => update(d.id, patch)} onRemove={() => remove(d.id)} />
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={add}
        className="min-h-10 rounded-xl border-2 border-dashed border-zinc-300 text-sm font-medium text-zinc-600 hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900"
      >
        + Add a deadline or exam by hand
      </button>

      <StepNav
        onBack={onBack}
        canContinue={canContinue}
        onNext={onNext}
        nextLabel={deadlines.length === 0 ? "Skip for now" : "Next"}
        blockedHint="Fix the highlighted deadlines first"
      />
    </section>
  );
}

function DeadlineRow({
  value: d,
  onChange,
  onRemove,
}: {
  value: DraftDeadline;
  onChange: (patch: Partial<DraftDeadline>) => void;
  onRemove: () => void;
}) {
  const problem = deadlineProblem(d);
  return (
    <div
      className={`rounded-xl border bg-surface p-3 ${
        problem ? "border-red-400 dark:border-red-700" : "border-zinc-200 dark:border-zinc-800"
      }`}
    >
      <DeadlineKindToggle value={d} onChange={onChange} />
      <div className="grid grid-cols-[7rem_1fr] gap-2">
        <Field label="Module">
          <input
            value={d.moduleCode}
            onChange={(e) => onChange({ moduleCode: e.target.value })}
            placeholder="ECON0019"
            className={inputClass}
          />
        </Field>
        <Field label={d.exam ? "What's the exam" : "What's due"}>
          <input
            value={d.title}
            onChange={(e) => onChange({ title: e.target.value })}
            placeholder={d.exam ? "Midterm" : "Problem Set 2"}
            className={inputClass}
          />
        </Field>
      </div>
      {/* An exam has a date on its own row, then start, end and weight: four across is too tight on a phone. */}
      <div className="mt-2 grid grid-cols-[1fr_1fr_4.5rem] gap-2">
        <div className={d.exam ? "col-span-3" : "contents"}>
          <Field label={d.exam ? "Date" : "Due date"}>
            <input type="date" value={d.date} onChange={(e) => onChange({ date: e.target.value })} className={inputClass} />
          </Field>
        </div>
        <Field label={d.exam ? "Starts" : "Time"}>
          <input type="time" value={d.time} onChange={(e) => onChange({ time: e.target.value })} className={inputClass} />
        </Field>
        {d.exam && (
          <Field label="Ends (optional)">
            <input type="time" value={d.endTime} onChange={(e) => onChange({ endTime: e.target.value })} className={inputClass} />
          </Field>
        )}
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
      <div className="mt-2 flex justify-end">
        <DeletePill label={`Delete ${d.title || (d.exam ? "exam" : "deadline")}`} onRemove={onRemove} />
      </div>
      {problem && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{problem}</p>}
    </div>
  );
}

// ---------- Step 2: to-do ----------

function TodosStep({
  todos,
  setTodos,
  onBack,
  onNext,
}: {
  todos: Todo[];
  setTodos: (t: Todo[]) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <section className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold">Your to-do list</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Anything you need to get done? Add how long it takes, a do-before date or a repeat (like a weekly shop),
          and I&apos;ll fit it into a gap. You can skip this.
        </p>
      </div>
      <TodoEditor todos={todos} onChange={setTodos} allowTick={false} />
      <StepNav
        onBack={onBack}
        canContinue
        onNext={onNext}
        nextLabel={todos.some((t) => !t.done) ? "Next" : "Skip for now"}
      />
    </section>
  );
}

// ---------- Step 3: home ----------

function HomeStep({
  home,
  onPick,
  onBack,
  onSkip,
}: {
  home: Home | null;
  onPick: (h: Home) => void;
  onBack: () => void;
  onSkip: () => void;
}) {
  return (
    <section className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold">Where&apos;s home?</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          I&apos;ll tell you when a gap&apos;s long enough to pop back for a nap or a proper lunch. You can skip this
          and add it later from Today.
        </p>
      </div>
      <HomePicker
        initial={home}
        onDone={onPick}
        submitLabel="Next"
        onSkip={onSkip}
        footer={
          <button
            type="button"
            onClick={onBack}
            className="min-h-10 rounded-lg bg-zinc-100 px-5 font-medium text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
          >
            Back
          </button>
        }
      />
    </section>
  );
}

// ---------- Step 4: societies ----------

function SocietiesStep({
  societies,
  setSocieties,
  onBack,
  onNext,
}: {
  societies: Society[];
  setSocieties: (s: Society[]) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <section className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold">My societies</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Which clubs and societies are you in? Paste the link to each one&apos;s SU page and I&apos;ll check it for
          events that fit your gaps (free pizza included). You can skip this.
        </p>
      </div>

      <SocietyPicker existing={societies} onAdd={(s) => setSocieties([...societies, s])} />

      {societies.length > 0 && (
        <ul className="flex flex-col gap-2">
          {societies.map((s) => (
            <li
              key={s.slug}
              className="flex items-center justify-between gap-2 rounded-xl border border-line bg-surface pl-4"
            >
              <span className="min-w-0 truncate text-sm font-medium">{s.name}</span>
              <RemoveButton label={`Remove ${s.name}`} onClick={() => setSocieties(societies.filter((x) => x.slug !== s.slug))} />
            </li>
          ))}
        </ul>
      )}

      <StepNav onBack={onBack} canContinue onNext={onNext} nextLabel={societies.length === 0 ? "Skip for now" : "Next"} />
    </section>
  );
}

// ---------- Step 6: confirm & save ----------

function ReviewStep({
  classes,
  termStart,
  weeks,
  todos,
  home,
  societies,
  deadlines,
  saveError,
  onBack,
  onSave,
}: {
  classes: WeeklyClass[];
  termStart: string;
  weeks: number;
  todos: Todo[];
  home: Home | null;
  societies: Society[];
  deadlines: DraftDeadline[];
  saveError: boolean;
  onBack: () => void;
  onSave: () => void;
}) {
  const byDay = DAYS.map((label, i) => ({
    label,
    rows: classes.filter((c) => c.dayOfWeek === i + 1).sort((a, b) => a.startTime.localeCompare(b.startTime)),
  })).filter((d) => d.rows.length > 0);
  const openTodos = todos.filter((t) => !t.done);
  const sortedDeadlines = [...deadlines].sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));

  return (
    <section className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold">Look right?</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          {classes.length} {classes.length === 1 ? "class" : "classes"} a week, repeating for {weeks}{" "}
          {weeks === 1 ? "week" : "weeks"} from {londonDayMonth.format(dayDate(termStart))}. You can change your
          timetable later from &ldquo;Edit timetable&rdquo;.
        </p>
      </div>

      <div className="rounded-xl border border-line bg-surface p-4">
        <h3 className="font-semibold">Every week</h3>
        <dl className="mt-2 flex flex-col gap-2 text-sm">
          {byDay.map((day) => (
            <div key={day.label} className="grid grid-cols-[2.5rem_1fr] gap-2">
              <dt className="font-medium text-muted">{day.label}</dt>
              <dd className="flex flex-col gap-0.5">
                {day.rows.map((c) => (
                  <span key={c.id}>
                    <span className="tabular-nums text-muted">
                      {c.startTime}–{c.endTime}
                    </span>{" "}
                    {c.moduleCode || c.title} <span className="text-muted">· {BUILDINGS[c.buildingId].shortName}</span>
                  </span>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="rounded-xl border border-line bg-surface p-4">
        <h3 className="font-semibold">To-do</h3>
        {openTodos.length === 0 ? (
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">No to-dos yet</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {openTodos.map((t) => (
              <li key={t.id}>{t.title}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-xl border border-line bg-surface p-4">
        <h3 className="font-semibold">Home</h3>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          {home ? homeLabel(home) : "Not set. You can add it later from Today."}
        </p>
      </div>

      <div className="rounded-xl border border-line bg-surface p-4">
        <h3 className="font-semibold">Societies</h3>
        {societies.length === 0 ? (
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">No societies added</p>
        ) : (
          <p className="mt-1 text-sm">{societies.map((s) => s.name).join(", ")}</p>
        )}
      </div>

      <div className="rounded-xl border border-line bg-surface p-4">
        <h3 className="font-semibold">Deadlines</h3>
        {sortedDeadlines.length === 0 ? (
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">No deadlines added</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {sortedDeadlines.map((d) => (
              <li key={d.id}>
                <span className="tabular-nums text-muted">
                  {isDateKey(d.date) ? londonWeekdayDayMonth.format(dayDate(d.date)) : d.date}{" "}
                  {isWallTime(d.time) ? formatWallTime(d.time) : d.time}
                </span>{" "}
                {d.moduleCode && <span className="text-muted">{d.moduleCode} </span>}
                {d.title}
                {d.exam && <span className="text-muted"> (exam)</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {saveError && <SaveError />}

      <StepNav onBack={onBack} canContinue onNext={onSave} nextLabel="Save and show my gaps" />
    </section>
  );
}

function SaveError() {
  return (
    <p role="alert" className="text-sm text-red-600 dark:text-red-400">
      Your browser wouldn&apos;t let me save (private browsing?). Try a normal window.
    </p>
  );
}

function UseDemoButton({ onClick }: { onClick: () => void }) {
  return (
    <span className="self-center">
      <DeleteButton
        onDelete={onClick}
        className="rounded-lg px-3 py-2 text-sm text-muted underline-offset-4 hover:underline"
      >
        Delete my timetable and use the demo week
      </DeleteButton>
    </span>
  );
}

// ---------- Screenshot / text upload ----------

type UploadState =
  | { status: "idle" }
  | { status: "reading"; from: "image" | "text" }
  | { status: "error"; message: string }
  | { status: "done"; count: number };

function Uploader<K extends "timetable" | "deadlines">({
  kind,
  nouns: [one, many],
  placeholder,
  existingCount,
  onResult,
}: {
  kind: K;
  nouns: [string, string];
  placeholder: string;
  existingCount: number;
  onResult: (rows: K extends "timetable" ? WeeklyClass[] : Deadline[], mode: "replace" | "append") => void;
}) {
  type Rows = K extends "timetable" ? WeeklyClass[] : Deadline[];
  const [state, setState] = useState<UploadState>({ status: "idle" });
  // Results waiting for "replace or add?" when there are already rows.
  const [pending, setPending] = useState<Rows | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const plural = (n: number) => `${n} ${n === 1 ? one : many}`;

  /** Sends a screenshot or text to Claude. Returns true if it found something. */
  async function extract(from: "image" | "text", getPayload: () => Promise<object>): Promise<boolean> {
    const what = from === "image" ? "screenshot" : "text";
    setState({ status: "reading", from });
    setPending(null);
    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, ...(await getPayload()) }),
      });
      const body = (await res.json().catch(() => ({}))) as { classes?: WeeklyClass[]; deadlines?: Deadline[]; error?: string };
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      const rows = ((kind === "timetable" ? body.classes : body.deadlines) ?? []) as Rows;
      if (rows.length === 0) {
        setState({ status: "error", message: `I couldn't spot any ${many} in that one. Is it the right ${what}?` });
        return false;
      }
      setState({ status: "done", count: rows.length });
      if (existingCount > 0) setPending(rows);
      else onResult(rows, "replace");
      return true;
    } catch (err) {
      console.warn("[extract]", err);
      setState({
        status: "error",
        message: `Couldn't read that ${what} right now. Try again, or add your ${many} by hand below.`,
      });
      return false;
    }
  }

  async function handleFile(file: Blob | null | undefined) {
    if (!file || state.status === "reading") return;
    if (!file.type.startsWith("image/")) {
      setState({ status: "error", message: "That doesn't look like an image. Try a PNG or JPEG screenshot." });
      return;
    }
    await extract("image", async () => ({ image: await prepareImage(file) }));
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleText() {
    const trimmed = text.trim();
    if (!trimmed || state.status === "reading") return;
    // Keep the text on failure so they can tweak it and try again.
    if (await extract("text", async () => ({ text: trimmed }))) setText("");
  }

  // Pasting a screenshot (Cmd/Ctrl+V) works too: handy on a laptop.
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith("image/"));
      if (item) void handleFile(item.getAsFile());
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  });

  const reading = state.status === "reading";

  return (
    <div className="flex flex-col gap-3">
      <label
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void handleFile(e.dataTransfer.files[0]);
        }}
        className={`flex min-h-32 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed p-5 text-center transition-colors ${
          reading
            ? "cursor-wait border-emerald-400 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/40"
            : "border-emerald-400 bg-emerald-50/50 hover:bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/20 dark:hover:bg-emerald-950/40"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          disabled={reading}
          onChange={(e) => void handleFile(e.target.files?.[0])}
          className="sr-only"
        />
        {reading ? (
          <span aria-live="polite" className="animate-pulse font-medium text-emerald-800 dark:text-emerald-200">
            {state.from === "image" ? "Reading your screenshot…" : "Reading your text…"}
          </span>
        ) : (
          <>
            <CameraIcon className="size-7 text-emerald-700 dark:text-emerald-300" />
            <span className="font-medium text-emerald-900 dark:text-emerald-100">
              {existingCount > 0 ? "Upload another screenshot" : "Upload a screenshot"}
            </span>
            <span className="text-sm text-emerald-800/80 dark:text-emerald-200/80">Tap to choose, drop it here, or paste</span>
          </>
        )}
      </label>

      <div className="flex items-center gap-3 text-sm text-muted" aria-hidden>
        <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
        or type it
        <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={`${kind}-text`} className="sr-only">
          Paste or type your {many}
        </label>
        <textarea
          id={`${kind}-text`}
          rows={4}
          value={text}
          disabled={reading}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Cmd/Ctrl+Enter sends, like most chat boxes.
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void handleText();
            }
          }}
          className="w-full rounded-xl border border-zinc-300 bg-surface p-3 text-base text-zinc-900 placeholder:text-zinc-400 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-100 sm:text-sm"
        />
        <div className="flex justify-end">
          <SmallButton primary disabled={reading || !text.trim()} onClick={() => void handleText()}>
            Read it
          </SmallButton>
        </div>
      </div>

      {state.status === "error" && (
        <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          {state.message}
        </p>
      )}

      {pending ? (
        <div role="alert" className="rounded-xl bg-surface p-3 text-sm ring-1 ring-emerald-300 dark:ring-emerald-800">
          <p>
            Found {plural(pending.length)}. You&apos;ve already got {plural(existingCount)}. What should I do?
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <SmallButton
              primary
              onClick={() => {
                onResult(pending, "replace");
                setPending(null);
              }}
            >
              Replace them
            </SmallButton>
            <SmallButton
              onClick={() => {
                onResult(pending, "append");
                setPending(null);
              }}
            >
              Add to the list
            </SmallButton>
            <SmallButton
              onClick={() => {
                setPending(null);
                setState({ status: "idle" });
              }}
            >
              Cancel
            </SmallButton>
          </div>
        </div>
      ) : (
        state.status === "done" && (
          <p aria-live="polite" className="text-sm text-emerald-800 dark:text-emerald-200">
            Found {plural(state.count)}. Check them before you continue, as the reading can be wrong.
          </p>
        )
      )}
    </div>
  );
}

// ---------- Small bits ----------



function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <DeleteButton
      onDelete={onClick}
      label={label}
      className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
    >
      ✕
    </DeleteButton>
  );
}

function SmallButton({
  primary,
  disabled,
  onClick,
  children,
}: {
  primary?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`min-h-10 rounded-lg px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
        primary
          ? "bg-primary text-on-primary hover:bg-primary-hover"
          : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
      }`}
    >
      {children}
    </button>
  );
}

function StepNav({
  onBack,
  canContinue,
  onNext,
  nextLabel = "Next",
  blockedHint,
}: {
  onBack?: () => void;
  canContinue: boolean;
  onNext: () => void;
  nextLabel?: string;
  blockedHint?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="min-h-10 rounded-lg bg-zinc-100 px-5 font-medium text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
          >
            Back
          </button>
        )}
        <button
          type="button"
          onClick={onNext}
          disabled={!canContinue}
          className="min-h-10 flex-1 rounded-lg bg-primary px-5 font-medium text-on-primary hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          {nextLabel}
        </button>
      </div>
      {!canContinue && blockedHint && <p className="text-center text-sm text-muted">{blockedHint}</p>}
    </div>
  );
}
