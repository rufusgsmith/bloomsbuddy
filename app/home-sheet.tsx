"use client";

import { useEffect, useRef, useState } from "react";
import { saveHome } from "@/lib/home";
import type { Home } from "@/lib/types";
import { HomePicker } from "./home-picker";

/**
 * Bottom sheet (a centred card on wider screens) around HomePicker, opened from the Today page's
 * Home button. A native <dialog> opened with showModal() gives us Esc to close, a focus trap and
 * the top layer (above the nav) for free.
 */
export function HomeSheet({ home, onClose }: { home: Home | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [saveFailed, setSaveFailed] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby="home-sheet-title"
      // Esc fires "cancel". We close via React state rather than the "close" event, because
      // StrictMode's mount → unmount → mount would fire "close" and shut the sheet straight away.
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      // A click on the backdrop lands on the <dialog> itself; clicks inside land on its content.
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="mb-0 mt-auto h-[min(88dvh,680px)] max-h-none w-full max-w-full overflow-hidden rounded-t-2xl border-line bg-surface p-0 text-foreground shadow-[0_8px_32px_rgba(16,24,40,0.16)] backdrop:bg-zinc-900/30 sm:mb-auto sm:max-w-md sm:rounded-xl sm:border"
    >
      <div className="flex h-full flex-col px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
        <div aria-hidden className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-zinc-300 sm:hidden dark:bg-zinc-700" />
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id="home-sheet-title" className="text-lg font-semibold tracking-tight">
              Where&apos;s home?
            </h2>
            <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">
              I&apos;ll tell you when a gap&apos;s long enough to pop back.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 flex size-11 shrink-0 items-center justify-center rounded-lg text-xl leading-none text-muted hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            ×
          </button>
        </div>
        {saveFailed && (
          <p role="alert" className="mb-3 text-sm text-red-600 dark:text-red-400">
            Your browser wouldn&apos;t let me save that. Private mode?
          </p>
        )}
        <HomePicker
          initial={home}
          onDone={(next) => (saveHome(next) ? onClose() : setSaveFailed(true))}
        />
      </div>
    </dialog>
  );
}
