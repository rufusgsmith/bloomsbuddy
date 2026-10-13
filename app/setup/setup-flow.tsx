"use client";

// Two routes share this file:
// /setup is onboarding, first launch only (Today sends new visitors here):
//   1. Timetable: screenshot or pasted text → Claude → editable weekly classes, plus how many weeks they repeat
//   2. To-do: things to fit into gaps (skippable)
//   3. Societies: SU page links, checked against the SU website (skippable)
//   4. Deadlines: Moodle screenshot or pasted text → Claude → editable deadlines (skippable)
//   5. Confirm and save to localStorage
// Nothing is saved until step 5, so a bad screenshot can't break anything.
// /timetable ("Edit timetable") is step 1 on its own and saves straight from it. Everything else is
// kept as it was (to-dos, societies and deadlines have their own tabs).
// Each route redirects to the other if it doesn't fit (/setup with data saved, /timetable without).

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { BUILDINGS, type BuildingId } from "@/lib/buildings";
import { Field, inputClass } from "../form-ui";
import { SocietyPicker } from "../society-picker";
import { TodoEditor } from "../todo/todo-view";
import { blankDraft, deadlineProblem, fromDraft, newId, toDraft, type DraftDeadline } from "@/lib/deadline-draft";
import { addDays, isDateKey, isWallTime, londonTodayKey, mondayOf } from "@/lib/london-time";
import {
  clearUserData,
  markOnboardingSkipped,
  parseUserData,
  readRawUserData,
  saveUserData,
  subscribeUserData,
} from "@/lib/storage";
import { parseTodos, readRawTodos, saveTodos } from "@/lib/todos";
import type { Deadline, Society, TimetableEvent, Todo, UserData, WeeklyClass } from "@/lib/types";

const DEFAULT_WEEKS = 11; // A UCL term is usually 11 teaching weeks
const MAX_WEEKS = 15;
// Long edge in pixels after shrinking. Keeps uploads small but timetable text still legible.
const MAX_IMAGE_EDGE = 2000;

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const KINDS: TimetableEvent["kind"][] = ["lecture", "seminar", "lab", "tutorial"];
const BUILDING_IDS = (Object.keys(BUILDINGS) as BuildingId[]).sort((a, b) =>
  BUILDINGS[a].name.localeCompare(BUILDINGS[b].name),
);
// ~70 buildings is a long list, so the dropdown groups them. Halls go together wherever they are.
const BUILDING_GROUPS: { label: string; ids: BuildingId[] }[] = [
  { label: "Bloomsbury", ids: BUILDING_IDS.filter((id) => BUILDINGS[id].area === "bloomsbury" && BUILDINGS[id].kind !== "hall") },
  { label: "UCL East", ids: BUILDING_IDS.filter((id) => BUILDINGS[id].area === "ucl-east") },
  { label: "Canary Wharf", ids: BUILDING_IDS.filter((id) => BUILDINGS[id].area === "canary-wharf") },
  { label: "Halls", ids: BUILDING_IDS.filter((id) => BUILDINGS[id].kind === "hall") },
];

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

/** Shrinks a screenshot to a JPEG and returns it as base64 for /api/extract. */
async function prepareImage(file: Blob): Promise<{ mediaType: "image/jpeg"; data: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.fillStyle = "#fff"; // transparent PNGs would otherwise turn black
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  return { mediaType: "image/jpeg", data: dataUrl.slice(dataUrl.indexOf(",") + 1) };
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
  return <main className="mx-auto w-full max-w-md px-4 pb-24 pt-8">{children}</main>;
}

function Loading() {
  return (
    <Shell>
      <div aria-busy="true" className="h-64 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-900" />
    </Shell>
  );
}

type Step = 0 | 1 | 2 | 3 | 4;
const STEP_LABELS = ["Timetable", "To-do", "Societies", "Deadlines", "Confirm"];

function Editor({ mode, initial }: { mode: SetupMode; initial: UserData | null }) {
  const router = useRouter();
  // Decided once on mount: saving changes `initial`, and that mustn't bounce us to the other route.
  const [redirectTo] = useState(() =>
    mode === "onboarding" && initial ? "/timetable" : mode === "timetable" && !initial ? "/setup" : null,
  );
  const [step, setStep] = useState<Step>(0);
  const [classes, setClasses] = useState<WeeklyClass[]>(initial?.classes ?? []);
  const [termStart, setTermStart] = useState(initial?.termStart ?? mondayOf(londonTodayKey()));
  const [weeks, setWeeks] = useState(initial?.weeks ?? DEFAULT_WEEKS);
  const [deadlines, setDeadlines] = useState<DraftDeadline[]>(initial?.deadlines.map(toDraft) ?? []);
  const [societies, setSocieties] = useState<Society[]>(initial?.societies ?? []);
  // A draft until Confirm. Starts from any to-dos made while trying the demo week.
  const [todos, setTodos] = useState<Todo[]>(() => parseTodos(readRawTodos()));
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
    // The timetable editor leaves to-dos alone: they're edited on the To-do tab.
    if (!saveUserData(data) || (mode === "onboarding" && !saveTodos(todos))) {
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
        <header className="mb-6">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">Bloomsbuddy</p>
            <Link
              href="/"
              className="rounded-full px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
            >
              Cancel
            </Link>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">Edit timetable</h1>
        </header>
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
      <header className="mb-6">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">Bloomsbuddy</p>
          <button
            type="button"
            onClick={skip}
            className="rounded-full px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
          >
            Skip, show the demo week
          </button>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">Let&apos;s get you set up</h1>
        <ol className="mt-4 flex gap-2" aria-label="Steps">
          {STEP_LABELS.map((label, i) => {
            // To-dos and societies can't be invalid, so only the timetable gates the middle steps,
            // and Confirm also needs the deadlines to be fine.
            const reachable = i <= step || (i <= 3 && classesOk) || (classesOk && deadlinesOk);
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
                      : "border-zinc-200 text-zinc-500 dark:border-zinc-800"
                  }`}
                >
                  {i + 1}. {label}
                </button>
              </li>
            );
          })}
        </ol>
      </header>

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
        <SocietiesStep
          societies={societies}
          setSocieties={setSocieties}
          onBack={() => setStep(1)}
          onNext={() => setStep(3)}
        />
      )}
      {step === 3 && (
        <DeadlinesStep
          deadlines={deadlines}
          setDeadlines={setDeadlines}
          canContinue={deadlinesOk}
          onBack={() => setStep(2)}
          onNext={() => setStep(4)}
        />
      )}
      {step === 4 && (
        <ReviewStep
          classes={classes}
          termStart={termStart}
          weeks={weeks}
          todos={todos}
          societies={societies}
          deadlines={deadlines}
          saveError={saveError}
          onBack={() => setStep(3)}
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
  const update = (id: string, patch: Partial<WeeklyClass>) =>
    setClasses(classes.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const remove = (id: string) => setClasses(classes.filter((c) => c.id !== id));
  const add = () =>
    setClasses([
      ...classes,
      {
        id: newId("cls"),
        moduleCode: "",
        title: "",
        kind: "lecture",
        dayOfWeek: 1,
        startTime: "09:00",
        endTime: "10:00",
        room: "",
        buildingId: "main-building",
      },
    ]);

  // Group by weekday for display, keeping each row's place in the list stable while typing.
  const byDay = DAYS.map((label, i) => ({
    label,
    rows: classes
      .filter((c) => c.dayOfWeek === i + 1)
      .sort((a, b) => a.startTime.localeCompare(b.startTime)),
  })).filter((d) => d.rows.length > 0);

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

      {byDay.length > 0 && (
        <div className="flex flex-col gap-4">
          {byDay.map((day) => (
            <div key={day.label}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">{day.label}</h3>
              <ul className="flex flex-col gap-3">
                {day.rows.map((c) => (
                  <li key={c.id}>
                    <ClassRow value={c} onChange={(patch) => update(c.id, patch)} onRemove={() => remove(c.id)} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={add}
        className="min-h-11 rounded-xl border-2 border-dashed border-zinc-300 text-sm font-medium text-zinc-600 hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900"
      >
        + Add a class by hand
      </button>

      <fieldset className="rounded-2xl bg-zinc-100 p-4 dark:bg-zinc-900">
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

function ClassRow({
  value: c,
  onChange,
  onRemove,
}: {
  value: WeeklyClass;
  onChange: (patch: Partial<WeeklyClass>) => void;
  onRemove: () => void;
}) {
  const problem = classProblem(c);
  return (
    <div
      className={`rounded-2xl border bg-white p-3 dark:bg-zinc-950 ${
        problem ? "border-red-400 dark:border-red-700" : "border-zinc-200 dark:border-zinc-800"
      }`}
    >
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
      <div className="mt-2 flex items-end gap-2">
        <div className="flex-1">
          <Field label={c.buildingGuessed ? "Building: please check, I couldn't tell" : "Building (for travel times)"}>
            <select
              value={c.buildingId}
              onChange={(e) => onChange({ buildingId: e.target.value as BuildingId, buildingGuessed: false })}
              className={`${inputClass} ${c.buildingGuessed ? "ring-2 ring-amber-400" : ""}`}
            >
              {BUILDING_GROUPS.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.ids.map((id) => (
                    <option key={id} value={id}>
                      {BUILDINGS[id].name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Field>
        </div>
        <RemoveButton label={`Remove ${c.moduleCode || c.title || "class"}`} onClick={onRemove} />
      </div>
      {problem && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{problem}</p>}
    </div>
  );
}

// ---------- Step 4: deadlines ----------

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
        <h2 className="text-lg font-semibold">Your Moodle deadlines</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Screenshot the Timeline block on your Moodle dashboard, or paste/type them below. I&apos;ll use these to decide when you should
          actually be studying. You can skip this.
        </p>
      </div>

      <Uploader
        kind="deadlines"
        nouns={["deadline", "deadlines"]}
        placeholder="Paste your Moodle timeline, or type e.g. ECON0019 essay due Fri 30 Oct, 5pm"
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
        className="min-h-11 rounded-xl border-2 border-dashed border-zinc-300 text-sm font-medium text-zinc-600 hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900"
      >
        + Add a deadline by hand
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
      className={`rounded-2xl border bg-white p-3 dark:bg-zinc-950 ${
        problem ? "border-red-400 dark:border-red-700" : "border-zinc-200 dark:border-zinc-800"
      }`}
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
            className={inputClass}
          />
        </Field>
      </div>
      <div className="mt-2 flex items-end gap-2">
        <div className="grid flex-1 grid-cols-[1fr_1fr_4.5rem] gap-2">
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
        <RemoveButton label={`Remove ${d.title || "deadline"}`} onClick={onRemove} />
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
          Anything you need to get done? Tap one to add a due date and a time estimate, and I&apos;ll fit it into a
          gap. You can skip this.
        </p>
      </div>
      <TodoEditor todos={todos} onChange={setTodos} />
      <StepNav
        onBack={onBack}
        canContinue
        onNext={onNext}
        nextLabel={todos.some((t) => !t.done) ? "Next" : "Skip for now"}
      />
    </section>
  );
}

// ---------- Step 3: societies ----------

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
              className="flex items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white pl-4 dark:border-zinc-800 dark:bg-zinc-950"
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

// ---------- Step 5: confirm & save ----------

function ReviewStep({
  classes,
  termStart,
  weeks,
  todos,
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

      <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h3 className="font-semibold">Every week</h3>
        <dl className="mt-2 flex flex-col gap-2 text-sm">
          {byDay.map((day) => (
            <div key={day.label} className="grid grid-cols-[2.5rem_1fr] gap-2">
              <dt className="font-medium text-zinc-500">{day.label}</dt>
              <dd className="flex flex-col gap-0.5">
                {day.rows.map((c) => (
                  <span key={c.id}>
                    <span className="tabular-nums text-zinc-500">
                      {c.startTime}–{c.endTime}
                    </span>{" "}
                    {c.moduleCode || c.title} <span className="text-zinc-500">· {BUILDINGS[c.buildingId].shortName}</span>
                  </span>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h3 className="font-semibold">To-do</h3>
        {openTodos.length === 0 ? (
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Nothing yet. Enjoy it while it lasts ✨</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {openTodos.map((t) => (
              <li key={t.id}>{t.title}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h3 className="font-semibold">Societies</h3>
        {societies.length === 0 ? (
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">None yet. Free pizza waits for no one 🍕</p>
        ) : (
          <p className="mt-1 text-sm">{societies.map((s) => s.name).join(", ")}</p>
        )}
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h3 className="font-semibold">Deadlines</h3>
        {sortedDeadlines.length === 0 ? (
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">None added. Lucky you, or in denial? 👀</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {sortedDeadlines.map((d) => (
              <li key={d.id}>
                <span className="tabular-nums text-zinc-500">
                  {isDateKey(d.date) ? londonWeekdayDayMonth.format(dayDate(d.date)) : d.date} {d.time}
                </span>{" "}
                {d.moduleCode && <span className="text-zinc-500">{d.moduleCode} </span>}
                {d.title}
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
    <button
      type="button"
      onClick={onClick}
      className="self-center rounded-full px-3 py-2 text-sm text-zinc-500 underline-offset-4 hover:underline"
    >
      Delete my timetable and use the demo week
    </button>
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
        className={`flex min-h-32 cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed p-5 text-center transition-colors ${
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
            {state.from === "image" ? "Squinting at your screenshot…" : "Reading your text…"}
          </span>
        ) : (
          <>
            <span aria-hidden className="text-2xl">
              📸
            </span>
            <span className="font-medium text-emerald-900 dark:text-emerald-100">
              {existingCount > 0 ? "Upload another screenshot" : "Upload a screenshot"}
            </span>
            <span className="text-sm text-emerald-800/80 dark:text-emerald-200/80">Tap to choose, drop it here, or paste</span>
          </>
        )}
      </label>

      <div className="flex items-center gap-3 text-xs font-medium uppercase tracking-wide text-zinc-500" aria-hidden>
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
          className="w-full rounded-xl border border-zinc-300 bg-white p-3 text-base text-zinc-900 placeholder:text-zinc-400 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 sm:text-sm"
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
        <div role="alert" className="rounded-xl bg-white p-3 text-sm ring-1 ring-emerald-300 dark:bg-zinc-950 dark:ring-emerald-800">
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
            Got {plural(state.count)} ✨ Give them a quick check. I can get things wrong.
          </p>
        )
      )}
    </div>
  );
}

// ---------- Small bits ----------



function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex size-11 shrink-0 items-center justify-center rounded-lg text-zinc-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
    >
      ✕
    </button>
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
      className={`min-h-10 rounded-full px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
        primary
          ? "bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:text-emerald-950 dark:hover:bg-emerald-400"
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
            className="min-h-12 rounded-full bg-zinc-100 px-5 font-medium text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
          >
            Back
          </button>
        )}
        <button
          type="button"
          onClick={onNext}
          disabled={!canContinue}
          className="min-h-12 flex-1 rounded-full bg-emerald-600 px-5 font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-emerald-500 dark:text-emerald-950 dark:hover:bg-emerald-400"
        >
          {nextLabel}
        </button>
      </div>
      {!canContinue && blockedHint && <p className="text-center text-sm text-zinc-500">{blockedHint}</p>}
    </div>
  );
}
