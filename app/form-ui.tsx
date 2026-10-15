import { useEffect, useState, type ReactNode } from "react";

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
}: {
  onDelete: () => void;
  /** Accessible name when idle, e.g. "Remove ECON0019". */
  label?: string;
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
      {armed ? "Tap again to delete" : children}
    </button>
  );
}
