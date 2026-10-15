"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * What opens when a gap, to-do block or deadline flag on Today is tapped: a bottom sheet on
 * phones, a panel down the right on laptops (same shell as EventSheet). The Today page itself
 * never scrolls, so this is where the picks go. Only the sheet's body scrolls.
 */
export function DaySheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-label={title}
      // Closed via React state, not the "close" event: see HomeSheet for why.
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="mb-0 mt-auto max-h-[85dvh] w-full max-w-full overflow-hidden rounded-t-3xl bg-white p-0 text-zinc-900 shadow-xl backdrop:bg-black/50 backdrop:backdrop-blur-[2px] md:my-0 md:ml-auto md:mr-0 md:h-dvh md:max-h-none md:max-w-sm md:rounded-none md:rounded-l-3xl dark:bg-zinc-950 dark:text-zinc-100"
    >
      <div className="flex max-h-[85dvh] flex-col md:h-full md:max-h-none">
        <div className="relative flex justify-end px-5 pt-1 md:pt-4">
          <div aria-hidden className="absolute left-1/2 top-3 h-1.5 w-10 -translate-x-1/2 rounded-full bg-zinc-300 md:hidden dark:bg-zinc-700" />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 flex size-11 shrink-0 items-center justify-center rounded-full text-2xl leading-none text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"
          >
            ×
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">{children}</div>
      </div>
    </dialog>
  );
}
