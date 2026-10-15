import { Check, TriangleAlert } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type { WallTime } from "@/lib/types";

// UI pieces shared across the tabs, setup and the pickers. The look is "Squares" (see "Visual
// design" in CLAUDE.md): colours are tokens from globals.css, radii are 4px (chips, calendar
// blocks), 8px (buttons, inputs) and 12px (panels, sheets).

export const inputClass =
  "min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-base text-ink placeholder:text-muted sm:text-sm";

const BUTTON =
  "inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40";
/** The one main action on a screen or sheet. */
export const primaryButton = `${BUTTON} bg-square text-on-square hover:bg-square-hover`;
/** Secondary actions next to a primary one. */
export const secondaryButton = `${BUTTON} border border-line bg-surface text-ink hover:bg-sunken`;
/** Quiet actions: links, Cancel, Redo. */
export const ghostButton = `${BUTTON} px-3 text-muted hover:bg-sunken hover:text-ink`;
/** A square icon-only button (close, week arrows). Give it an aria-label. */
export const iconButton =
  "inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-sunken hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent";
/** The red armed state of a two-tap delete. */
export const armedButton = `${BUTTON} whitespace-nowrap bg-danger px-3 text-on-danger`;

/**
 * A bottom sheet on phone, a right side panel on md+. One soft shadow; the backdrop dims, no blur.
 * Used as the <dialog> className by the event form and the chat.
 */
export const SHEET =
  "mb-0 mt-auto h-[min(92dvh,760px)] max-h-none w-full max-w-full overflow-hidden rounded-t-xl bg-surface p-0 text-ink shadow-[0_-4px_24px_rgb(0_0_0/0.12)] backdrop:bg-black/40 md:my-0 md:ml-auto md:mr-0 md:h-dvh md:max-w-sm md:rounded-none md:rounded-l-xl md:shadow-[-4px_0_24px_rgb(0_0_0/0.12)]";

/** The drag-handle look at the top of a phone sheet. Hidden where the sheet is a side panel. */
export function SheetHandle({ hideFrom = "md" }: { hideFrom?: "sm" | "md" }) {
  return <div aria-hidden className={`mx-auto mb-3 h-1 w-10 rounded-full bg-line ${hideFrom === "sm" ? "sm:hidden" : "md:hidden"}`} />;
}

/** Icon sizes: 16 inline with text, 20 in nav and icon buttons. */
export const ICON = { size: 16, strokeWidth: 1.75, "aria-hidden": true } as const;
export const ICON_LG = { size: 20, strokeWidth: 1.75, "aria-hidden": true } as const;

/**
 * The frame of every tab (Today repeats it inline). Phone: a column above the bottom tab bar.
 * md+: the tab bar is a left rail (w-56), and the column sits beside it, left-aligned.
 */
export const PAGE_FRAME =
  "mx-auto flex h-dvh w-full max-w-md flex-col overflow-hidden pb-[calc(4rem+1px+env(safe-area-inset-bottom))] md:ml-56 md:mr-0 md:max-w-2xl md:pb-0";

/**
 * The floating buttons ("+" here, the chat sparkle in chat-sheet.tsx): the column's right edge.
 * Phone: inside the centred max-w-md column. md+: beside the w-56 rail, inside max-w-2xl.
 */
export const FAB_POSITION =
  "fixed right-[max(1rem,calc(50%-14rem+1rem))] md:right-auto md:left-[calc(14rem+min(42rem,100vw-14rem)-2rem-3.5rem)]";

/**
 * The frame of every tab: exactly the screen above the tab bar (min-h-16 + its 1px border + the
 * safe area; dvh, so mobile browser bars don't change it). `top` stays put like the tab bar and
 * only the body scrolls, so the page itself never does.
 */
export function TabPage({ top, bodyClassName = "pb-6 pt-4", children }: { top: ReactNode; bodyClassName?: string; children: ReactNode }) {
  return (
    <main className={PAGE_FRAME}>
      <div className="shrink-0 border-b border-line px-4 pt-8 md:px-8 md:pt-10">{top}</div>
      <div className={`min-h-0 flex-1 overflow-y-auto px-4 md:px-8 ${bodyClassName}`}>{children}</div>
    </main>
  );
}

/** The top of every page: the title (with an optional action on the right), then a subtitle. */
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
    <header className="mb-4">
      <div className="flex items-start justify-between gap-2">
        <h1 className="text-title font-semibold">{title}</h1>
        {action}
      </div>
      {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      {children}
    </header>
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
  armedClassName = armedButton,
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
        <span aria-hidden className="text-muted">:</span>
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
      className={`flex min-h-11 items-center gap-3 text-sm font-medium text-ink ${className}`}
    >
      <span
        aria-hidden
        className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${
          checked ? "bg-square" : "bg-line"
        }`}
      >
        <span
          className={`absolute top-0.5 size-5 rounded-full bg-surface transition-transform ${checked ? "translate-x-[1.125rem]" : "translate-x-0.5"}`}
        />
      </span>
      {label}
    </button>
  );
}

// One fixed width for every state ("Add to my calendar", "Added", "Tap again to remove"), so
// tapping it never changes the card's text column and makes the text beside it re-wrap.
const SMALL_PILL =
  "inline-flex min-h-8 w-36 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-lg px-2 text-xs font-medium transition-colors";

/**
 * The small "Add to calendar" pill in the bottom-right of a card (society events, deadlines).
 * Once added it reads "Added" with a tick, and removing takes two taps, like every delete.
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
      armedClassName={`${SMALL_PILL} bg-danger text-on-danger`}
      className={`${SMALL_PILL} bg-square-tint text-square`}
    >
      <Check {...ICON} size={14} />
      Added
    </DeleteButton>
  ) : (
    <button
      type="button"
      onClick={onAdd}
      aria-label={`Add ${title} to your calendar`}
      className={`${SMALL_PILL} border border-line bg-surface text-ink hover:bg-sunken`}
    >
      {children}
    </button>
  );
}

type Tone = "neutral" | "good" | "warn" | "bad";

const TONE_CLASSES: Record<Tone, string> = {
  neutral: "bg-sunken text-muted",
  good: "bg-square-tint text-square",
  warn: "bg-ochre-tint text-ochre",
  bad: "bg-danger-tint text-danger",
};

/** A small 4px-radius chip: "5 min walk", "Usually quiet", "Daily · 17:00". Put an icon first if it has one. */
export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-xs font-medium tabular-nums ${TONE_CLASSES[tone]}`}>
      {children}
    </span>
  );
}

/** A boxed message inside a page or sheet: a clash warning ("warn") or an error ("bad"). */
export function Notice({ tone, children, className = "" }: { tone: "warn" | "bad"; children: ReactNode; className?: string }) {
  return (
    <div
      role={tone === "bad" ? "alert" : undefined}
      className={`rounded-xl border p-3 text-sm ${
        tone === "warn" ? "border-ochre/30 bg-ochre-tint text-ink" : "border-danger/30 bg-danger-tint text-ink"
      } ${className}`}
    >
      {children}
    </div>
  );
}

/** What an empty list says: what's missing and the one thing to do about it. Left-aligned. */
export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="border-t border-line py-6">
      <p className="font-medium">{title}</p>
      {children && <p className="mt-1 max-w-prose text-sm text-muted">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Loading rows in the shape of a list. */
export function RowsSkeleton({ rows = 3, rowClassName = "h-14" }: { rows?: number; rowClassName?: string }) {
  return (
    <div aria-busy="true" className="flex animate-pulse flex-col gap-2">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={`rounded-lg bg-sunken ${rowClassName}`} />
      ))}
    </div>
  );
}

/** "Clashes with ECON0013 Microeconomics 10:00–11:00", with Cancel / Add anyway (lib/clashes.ts). */
export function ClashNotice({
  message,
  onCancel,
  onConfirm,
  className = "",
}: {
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
  className?: string;
}) {
  return (
    <div role="alert" className={`rounded-xl border border-ochre/30 bg-ochre-tint p-3 ${className}`}>
      <p className="flex gap-2 text-sm font-medium text-ink">
        <TriangleAlert {...ICON} className="mt-0.5 shrink-0 text-ochre" />
        {message}
      </p>
      <div className="mt-3 flex items-center justify-end gap-2">
        <button type="button" onClick={onCancel} className={ghostButton}>
          Cancel
        </button>
        <button type="button" onClick={onConfirm} className={secondaryButton}>
          Add anyway
        </button>
      </div>
    </div>
  );
}
