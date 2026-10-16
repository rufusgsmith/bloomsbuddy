import { useEffect, useState, type ReactNode } from "react";
import type { WallTime } from "@/lib/types";

// UI pieces shared across the tabs, setup and the pickers.

export const inputClass =
  "min-h-11 w-full rounded-lg border border-zinc-300 bg-white px-2.5 text-base text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 sm:text-sm";

/**
 * The frame of every tab: exactly the screen above the tab bar (min-h-16 + its 1px border + the
 * safe area; dvh, so mobile browser bars don't change it). `top` stays put like the tab bar and
 * only the body scrolls, so the page itself never does.
 */
export function TabPage({ top, bodyClassName = "pb-6 pt-4", children }: { top: ReactNode; bodyClassName?: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex h-dvh w-full max-w-md flex-col overflow-hidden pb-[calc(4rem+1px+env(safe-area-inset-bottom))]">
      <div className="shrink-0 border-b border-zinc-200 px-4 pt-8 dark:border-zinc-800">{top}</div>
      <div className={`min-h-0 flex-1 overflow-y-auto px-4 ${bodyClassName}`}>{children}</div>
    </main>
  );
}

/** The top of every page: the small "Bloomsbuddy" line (with an optional action on the right), then the title. */
export function PageHeader({
  title,
  subtitle,
  action,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="mb-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">Bloomsbuddy</p>
        {action}
      </div>
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{subtitle}</p>}
      {children}
    </header>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-xs font-medium text-zinc-500">{label}</span>
      {children}
    </label>
  );
}

/** A form sheet's <dialog>: a bottom sheet on phones, a panel down the right on laptops (EventSheet, ClassSheet). */
export const sheetDialogClass =
  "mb-0 mt-auto h-[min(92dvh,760px)] max-h-none w-full max-w-full overflow-hidden rounded-t-3xl bg-white p-0 text-zinc-900 shadow-xl backdrop:bg-black/50 backdrop:backdrop-blur-[2px] md:my-0 md:ml-auto md:mr-0 md:h-dvh md:max-w-sm md:rounded-none md:rounded-l-3xl dark:bg-zinc-950 dark:text-zinc-100";

/** How long an armed delete button waits for the second tap. */
const ARM_MS = 3000;

/**
 * Delete in two taps (see "UI rules" in CLAUDE.md): the first tap turns the button red with
 * "Tap again to delete", the second deletes. Resets after 3s. No confirm dialog.
 * `children` is the idle look ("Delete", "×", …); `className` styles the idle button.
 */
export function DeleteButton({
  onDelete,
  label,
  className,
  children,
  armedText = "Tap again to delete",
  armedClassName = "min-h-11 shrink-0 whitespace-nowrap rounded-full bg-red-600 px-3 text-sm font-medium text-white hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600",
}: {
  onDelete: () => void;
  /** Accessible name when idle, e.g. "Remove ECON0019". */
  label?: string;
  /** What the red armed button says. */
  armedText?: string;
  /** Styles the red armed button, for buttons smaller than the usual size. */
  armedClassName?: string;
  className: string;
  children: ReactNode;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), ARM_MS);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      type="button"
      aria-label={armed ? undefined : label}
      onClick={() => (armed ? onDelete() : setArmed(true))}
      className={armed ? armedClassName : className}
    >
      {armed ? armedText : children}
    </button>
  );
}

const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0"));
const FIVE_MINS = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));

/**
 * A 24-hour time as two selects (hour, minute). <input type="time"> shows AM/PM in some
 * browser locales, and times must always be 24-hour (UI rules in CLAUDE.md).
 */
export function TimeField({ label, value, onChange }: { label: string; value: WallTime; onChange: (v: WallTime) => void }) {
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

/**
 * An on/off switch with its label, e.g. "Show on Today". With `hint`, the label and hint sit on
 * the left and the switch on the right (EventSheet's "Repeats weekly").
 */
export function Switch({
  checked,
  onChange,
  label,
  hint,
  className = "",
}: {
  checked: boolean;
  onChange: (on: boolean) => void;
  label: string;
  hint?: string;
  className?: string;
}) {
  // The knob sits in a flex track with even padding, not absolutely positioned, so it can never
  // land outside the track: 2px padding + 20px knob + 20px travel + 2px padding = the 44px track.
  const track = (
    <span
      aria-hidden
      className={`flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors ${
        checked ? "bg-emerald-600 dark:bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-700"
      }`}
    >
      <span className={`size-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : "translate-x-0"}`} />
    </span>
  );
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`flex min-h-11 items-center gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 ${
        hint ? "w-full justify-between gap-3 text-left" : ""
      } ${className}`}
    >
      {hint ? (
        <>
          <span>
            <span className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">{label}</span>
            <span className="block text-xs font-normal text-zinc-500">{hint}</span>
          </span>
          {track}
        </>
      ) : (
        <>
          {track}
          {label}
        </>
      )}
    </button>
  );
}

// One fixed width for every state ("Add to my calendar", "Added ✓", "Tap again to remove"), so
// tapping it never changes the card's text column and makes the text beside it re-wrap.
const SMALL_PILL = "min-h-8 w-36 shrink-0 whitespace-nowrap rounded-full px-2 text-center text-xs font-medium";

/**
 * The small "Add to calendar" pill in the bottom-right of a card (society events, deadlines).
 * Once added it reads "Added ✓", and removing takes two taps, like every delete.
 */
export function CalendarButton({
  added,
  onAdd,
  onRemove,
  title,
  children = "Add to calendar",
}: {
  added: boolean;
  onAdd: () => void;
  onRemove: () => void;
  /** What's being added, for the screen-reader label. */
  title: string;
  children?: ReactNode;
}) {
  return added ? (
    <DeleteButton
      onDelete={onRemove}
      armedText="Tap again to remove"
      label={`Added to your calendar. Remove ${title}`}
      armedClassName={`${SMALL_PILL} bg-red-600 text-white hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600`}
      className={`${SMALL_PILL} bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:hover:bg-emerald-900`}
    >
      Added ✓
    </DeleteButton>
  ) : (
    <button
      type="button"
      onClick={onAdd}
      aria-label={`Add ${title} to your calendar`}
      className={`${SMALL_PILL} bg-zinc-100 text-zinc-800 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700`}
    >
      {children}
    </button>
  );
}
