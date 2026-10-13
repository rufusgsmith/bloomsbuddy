import type { ReactNode } from "react";

// Form pieces shared by setup, the Deadlines tab and the society picker.

export const inputClass =
  "min-h-11 w-full rounded-lg border border-zinc-300 bg-white px-2.5 text-base text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 sm:text-sm";

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-xs font-medium text-zinc-500">{label}</span>
      {children}
    </label>
  );
}
