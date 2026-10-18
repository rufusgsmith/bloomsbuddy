import { useEffect, useRef, useState, type ReactNode } from "react";
import type { WallTime } from "@/lib/types";

// UI pieces shared across the tabs, setup and the pickers.

export const inputClass =
  "min-h-10 w-full rounded-lg border border-zinc-300 bg-surface px-2.5 text-base text-foreground dark:border-zinc-700 sm:text-sm";

/** The height of every page: the screen under the phone's top bar, or the full screen beside the sidebar (dvh, so mobile browser bars don't change it). */
export const PAGE_HEIGHT = "h-[calc(100dvh-var(--nav-h))]";

/** A white card on the grey page: the one container style for lists, forms and panels. */
export const cardClass = "rounded-xl border border-line bg-surface";

/**
 * The frame of every tab: exactly the screen beside (or under) the nav. `top` stays put like the nav and
 * only the body scrolls, so the page itself never does. `width` is the content column.
 */
export function TabPage({
  top,
  bodyClassName = "pb-10 pt-5",
  width = "max-w-3xl",
  children,
}: {
  top: ReactNode;
  bodyClassName?: string;
  width?: string;
  children: ReactNode;
}) {
  return (
    <main className={`flex ${PAGE_HEIGHT} w-full flex-col overflow-hidden`}>
      <div className="shrink-0 border-b border-line">
        <div className={`mx-auto w-full ${width} px-4 pt-6 md:px-6`}>{top}</div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={`mx-auto min-h-full w-full ${width} px-4 md:px-6 ${bodyClassName}`}>{children}</div>
      </div>
    </main>
  );
}

/** The top of every page: the title (and subtitle) on the left, an optional action on the right. */
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
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold leading-tight tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
        </div>
        {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
      </div>
      {children}
    </header>
  );
}

/** A primary button (dark) and a quiet one (white with a border), sized for header actions. */
export const primaryButtonClass =
  "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-primary px-3.5 text-sm font-medium text-on-primary hover:bg-primary-hover disabled:opacity-50";
export const secondaryButtonClass =
  "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-line bg-surface px-3.5 text-sm font-medium text-foreground hover:bg-zinc-50 disabled:opacity-50 dark:hover:bg-zinc-800";

/** A grey track with the chosen option as a white pill (Week / Day, Coursework / Exam). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className = "",
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={`inline-flex gap-0.5 rounded-xl border border-line bg-background p-1 ${className}`}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={`flex min-h-8 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition-colors ${
              on ? "bg-surface text-foreground shadow-[0_1px_3px_rgba(16,24,40,0.07)]" : "text-muted hover:text-foreground"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

/** A form sheet's <dialog>: a bottom sheet on phones, a panel down the right on laptops (EventSheet, ClassSheet). */
export const sheetDialogClass =
  "mb-0 mt-auto h-[min(92dvh,760px)] max-h-none w-full max-w-full overflow-hidden rounded-t-2xl border-line bg-surface p-0 text-foreground shadow-[0_8px_32px_rgba(16,24,40,0.16)] backdrop:bg-zinc-900/30 md:my-0 md:ml-auto md:mr-0 md:h-dvh md:max-w-md md:rounded-none md:border-l";

/**
 * A read-only panel in the sheet's place (a bottom sheet on phones, down the right on laptops): Today's
 * gap picks and the to-do / exam / deadline panels. Esc, the ×, or a click on the backdrop closes it.
 * Closed via React state, not the "close" event: see HomeSheet for why.
 */
export function SidePanel({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
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
      aria-labelledby="side-panel-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className={sheetDialogClass}
    >
      <div className="flex h-full flex-col">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-5 pb-3 pt-4">
          <div className="min-w-0">
            <h2 id="side-panel-title" className="text-base font-semibold leading-snug">
              {title}
            </h2>
            {subtitle && <p className="mt-0.5 text-sm tabular-nums text-muted">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 -mt-1 flex size-10 shrink-0 items-center justify-center rounded-lg text-xl leading-none text-muted hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            ×
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-4">{children}</div>
      </div>
    </dialog>
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
  armedClassName = "min-h-10 shrink-0 whitespace-nowrap rounded-lg bg-red-600 px-3 text-sm font-medium text-white hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600",
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
      <legend className="mb-1 text-xs font-medium text-muted">{label}</legend>
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
const SMALL_PILL = "min-h-8 w-36 shrink-0 whitespace-nowrap rounded-lg border border-transparent px-2 text-center text-xs font-medium";

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
      className={`${SMALL_PILL} !border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:!border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200 dark:hover:bg-emerald-900`}
    >
      Added ✓
    </DeleteButton>
  ) : (
    <button
      type="button"
      onClick={onAdd}
      aria-label={`Add ${title} to your calendar`}
      className={`${SMALL_PILL} !border-line bg-surface text-foreground hover:bg-zinc-50 dark:hover:bg-zinc-800`}
    >
      {children}
    </button>
  );
}
