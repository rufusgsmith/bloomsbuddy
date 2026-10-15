import { useEffect, useState, type ReactNode } from "react";
import type { WallTime } from "@/lib/types";

// UI pieces shared across the tabs, setup and the pickers.

export const inputClass =
  "min-h-11 w-full rounded-lg border border-zinc-300 bg-white px-2.5 text-base text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 sm:text-sm";

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
}: {
  onDelete: () => void;
  /** Accessible name when idle, e.g. "Remove ECON0019". */
  label?: string;
  /** What the red armed button says. */
  armedText?: string;
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
      className={
        armed
          ? "min-h-11 shrink-0 whitespace-nowrap rounded-full bg-red-600 px-3 text-sm font-medium text-white hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600"
          : className
      }
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

/** An on/off switch with its label, e.g. "Show on Today". */
export function Switch({
  checked,
  onChange,
  label,
  className = "",
}: {
  checked: boolean;
  onChange: (on: boolean) => void;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`flex min-h-11 items-center gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 ${className}`}
    >
      <span
        aria-hidden
        className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${
          checked ? "bg-emerald-600 dark:bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-700"
        }`}
      >
        <span
          className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-[1.125rem]" : "translate-x-0.5"}`}
        />
      </span>
      {label}
    </button>
  );
}
