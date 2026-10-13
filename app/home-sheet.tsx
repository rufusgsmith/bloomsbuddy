"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { BUILDINGS, getBuilding, HALL_IDS, travelLabel, travelTime, type Area, type BuildingId } from "@/lib/buildings";
import { saveHome } from "@/lib/home";
import type { Home } from "@/lib/types";
import { inputClass } from "./form-ui";

type Choice = Home["kind"];

const CHOICES: { value: Choice; label: string }[] = [
  { value: "hall", label: "Hall" },
  { value: "private", label: "Postcode" },
  { value: "none", label: "Don't use" },
];

const AREA_GROUPS: { label: string; areas: Area[] }[] = [
  { label: "Bloomsbury", areas: ["bloomsbury"] },
  { label: "UCL East", areas: ["ucl-east"] },
  { label: "Elsewhere in London", areas: ["elsewhere", "canary-wharf"] },
];

/** How far a hall is from the Main Building, so students can sanity-check the pick. */
function hallSubline(id: BuildingId): string {
  const { mins, mode } = travelTime(id, "main-building");
  const trip = `${travelLabel(mins, mode)} to Main Building`;
  return getBuilding(id).intercollegiate ? `Intercollegiate · ${trip}` : trip;
}

/**
 * Bottom sheet (a centred card on wider screens) for setting where the student lives: a hall,
 * a private postcode, or "don't use my home". A native <dialog> opened with showModal() gives us
 * Esc to close, a focus trap and the top layer (above the tab bar) for free.
 */
export function HomeSheet({ home, onClose }: { home: Home | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [choice, setChoice] = useState<Choice>(home?.kind ?? "hall");
  const [hallId, setHallId] = useState<BuildingId | null>(home?.kind === "hall" ? home.buildingId : null);
  const [query, setQuery] = useState("");
  const [postcode, setPostcode] = useState(home?.kind === "private" ? home.postcode : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = HALL_IDS.filter(
      (id) => !q || BUILDINGS[id].name.toLowerCase().includes(q) || BUILDINGS[id].shortName.toLowerCase().includes(q),
    );
    return AREA_GROUPS.map((g) => ({
      label: g.label,
      ids: matches.filter((id) => (g.areas as string[]).includes(BUILDINGS[id].area)),
    })).filter((g) => g.ids.length > 0);
  }, [query]);

  function pick(next: Choice) {
    setChoice(next);
    setError(null);
  }

  function save(next: Home) {
    if (!saveHome(next)) {
      setError("Your browser wouldn't let me save that. Private mode?");
      return;
    }
    onClose();
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (choice === "none") return save({ kind: "none" });
    if (choice === "hall") {
      if (!hallId) return setError("Pick your hall first.");
      return save({ kind: "hall", buildingId: hallId });
    }

    // Private: postcode → lat/lng on our server (postcodes.io).
    setBusy(true);
    try {
      const res = await fetch(`/api/postcode?pc=${encodeURIComponent(postcode)}`);
      const body = (await res.json()) as { postcode?: string; lat?: number; lng?: number; error?: string };
      if (!res.ok || typeof body.lat !== "number" || typeof body.lng !== "number") {
        setError(body.error ?? "Couldn't find that postcode");
        return;
      }
      save({ kind: "private", postcode: body.postcode ?? postcode, lat: body.lat, lng: body.lng });
    } catch {
      setError("Couldn't look that postcode up. Check your connection?");
    } finally {
      setBusy(false);
    }
  }

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
      // A click on the backdrop lands on the <dialog> itself; clicks inside land on the form.
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="mb-0 mt-auto h-[min(88dvh,680px)] max-h-none w-full max-w-full overflow-hidden rounded-t-3xl bg-white p-0 text-zinc-900 shadow-xl backdrop:bg-black/50 backdrop:backdrop-blur-[2px] sm:mb-auto sm:max-w-md sm:rounded-3xl dark:bg-zinc-950 dark:text-zinc-100"
    >
      {/* Fixed height, so switching tabs doesn't make the sheet jump. */}
      <form onSubmit={onSubmit} className="flex h-full flex-col">
        <div className="px-5 pt-3">
          <div aria-hidden className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-zinc-300 sm:hidden dark:bg-zinc-700" />
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="home-sheet-title" className="text-xl font-semibold tracking-tight">
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
              className="-mr-2 flex size-11 shrink-0 items-center justify-center rounded-full text-2xl leading-none text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"
            >
              ×
            </button>
          </div>

          <div role="radiogroup" aria-label="Home type" className="mt-4 grid grid-cols-3 gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-900">
            {CHOICES.map((c) => (
              <button
                key={c.value}
                type="button"
                role="radio"
                aria-checked={choice === c.value}
                onClick={() => pick(c.value)}
                className={`min-h-10 rounded-lg text-sm font-medium transition-colors ${
                  choice === c.value
                    ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-50"
                    : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {choice === "hall" && (
            <>
              <input
                type="search"
                className={inputClass}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search halls"
                aria-label="Search halls"
              />
              <div role="radiogroup" aria-label="Halls" className="mt-3 flex flex-col gap-4">
                {groups.length === 0 && (
                  <p className="py-6 text-center text-sm text-zinc-500">
                    No hall called that. Living privately? Use Postcode.
                  </p>
                )}
                {groups.map((g) => (
                  <section key={g.label}>
                    <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500">{g.label}</h3>
                    <ul className="flex flex-col gap-1">
                      {g.ids.map((id) => (
                        <li key={id}>
                          <HallRow selected={hallId === id} onPick={() => setHallId(id)} name={BUILDINGS[id].name}>
                            {hallSubline(id)}
                          </HallRow>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            </>
          )}

          {choice === "private" && (
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Your postcode</span>
              <input
                className={`${inputClass} uppercase placeholder:normal-case`}
                value={postcode}
                onChange={(e) => setPostcode(e.target.value)}
                placeholder="e.g. NW1 2HE"
                autoComplete="postal-code"
                autoFocus
                required
                maxLength={10}
              />
              <span className="text-xs text-zinc-500">
                Only used to work out travel times. Saved on this device.
              </span>
            </label>
          )}

          {choice === "none" && (
            <p className="rounded-xl bg-zinc-100 p-4 text-sm text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
              No worries. I won&apos;t suggest heading home. You can switch this back on any time.
            </p>
          )}

          {error && (
            <p role="alert" className="mt-3 text-sm text-rose-700 dark:text-rose-300">
              {error}
            </p>
          )}
        </div>

        <div className="border-t border-zinc-200 px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 dark:border-zinc-800">
          <button
            type="submit"
            disabled={busy}
            className="min-h-12 w-full rounded-full bg-emerald-600 px-4 font-medium text-white hover:bg-emerald-700 disabled:opacity-60 dark:bg-emerald-500 dark:text-emerald-950 dark:hover:bg-emerald-400"
          >
            {busy ? "Finding it…" : "Save"}
          </button>
        </div>
      </form>
    </dialog>
  );
}

function HallRow({
  selected,
  onPick,
  name,
  children,
}: {
  selected: boolean;
  onPick: () => void;
  name: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onPick}
      className={`flex min-h-14 w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors ${
        selected
          ? "bg-emerald-50 ring-2 ring-emerald-500 dark:bg-emerald-950/50"
          : "hover:bg-zinc-100 dark:hover:bg-zinc-900"
      }`}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{name}</span>
        <span className="block truncate text-xs text-zinc-500">{children}</span>
      </span>
      <span
        aria-hidden
        className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs ${
          selected ? "bg-emerald-600 text-white dark:bg-emerald-500 dark:text-emerald-950" : "ring-1 ring-zinc-300 dark:ring-zinc-700"
        }`}
      >
        {selected ? "✓" : ""}
      </span>
    </button>
  );
}
