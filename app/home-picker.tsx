"use client";

import { Ban, Building2, Check, House, type LucideIcon } from "lucide-react";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { BUILDINGS, getBuilding, HALL_IDS, searchBuildings, travelLabel, travelTime, type Area, type BuildingId } from "@/lib/buildings";
import { isPostcodeShape } from "@/lib/postcode";
import type { Home } from "@/lib/types";
import { ICON_LG, inputClass, primaryButton } from "./form-ui";
import { lookupPostcode } from "./postcode-lookup";

// Picks where the student lives: a UCL hall, private accommodation (a postcode), or no home.
// Used by the Today page's Home sheet and the Home step in onboarding. Plain form controls checked
// in code; the only network call is /api/postcode (postcodes.io) to turn a postcode into lat/lng.

type Choice = Home["kind"];

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

export function HomePicker({
  initial,
  onDone,
  submitLabel = "Save",
  footer,
}: {
  initial: Home | null;
  /** Called with a valid home. Saving it is up to the caller. */
  onDone: (home: Home) => void;
  submitLabel?: string;
  /** Extra buttons next to submit, e.g. onboarding's Back. */
  footer?: ReactNode;
}) {
  const [choice, setChoice] = useState<Choice | null>(initial?.kind ?? null);
  const [hallId, setHallId] = useState<BuildingId | null>(initial?.kind === "hall" ? initial.buildingId : null);
  const [query, setQuery] = useState("");
  const [postcode, setPostcode] = useState(initial?.kind === "private" ? initial.postcode : "");
  const [postcodeTouched, setPostcodeTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const postcodeError = !postcode.trim()
    ? "Enter your postcode"
    : !isPostcodeShape(postcode)
      ? "That doesn't look like a UK postcode (e.g. WC1E 6BT)"
      : null;

  const groups = useMemo(() => {
    const matches = searchBuildings(HALL_IDS, query);
    return AREA_GROUPS.map((g) => ({
      label: g.label,
      ids: matches.filter((id) => (g.areas as string[]).includes(BUILDINGS[id].area)),
    })).filter((g) => g.ids.length > 0);
  }, [query]);

  const canSubmit =
    !busy && (choice === "none" || (choice === "hall" && !!hallId) || (choice === "private" && !postcodeError));

  function pick(next: Choice) {
    setChoice(next);
    setError(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (choice === "none") return onDone({ kind: "none" });
    if (choice === "hall") return hallId ? onDone({ kind: "hall", buildingId: hallId }) : setError("Pick your hall first.");
    if (choice !== "private") return;
    setPostcodeTouched(true);
    if (postcodeError) return;

    setBusy(true);
    const place = await lookupPostcode(postcode);
    setBusy(false);
    if (typeof place === "string") setError(place);
    else onDone({ kind: "private", ...place });
  }

  return (
    <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
      <div role="radiogroup" aria-label="Where do you live?" className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        <OptionCard
          selected={choice === "hall"}
          onPick={() => pick("hall")}
          icon={Building2}
          title="UCL hall"
          subtitle={hallId && choice === "hall" ? BUILDINGS[hallId].name : "Including intercollegiate halls"}
        >
          <input
            type="search"
            className={inputClass}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Start typing your hall…"
            aria-label="Search halls"
          />
          <div role="radiogroup" aria-label="Halls" className="mt-3 flex flex-col gap-3">
            {groups.length === 0 && (
              <p className="py-4 text-sm text-muted">
                No hall called that. Living privately? Pick Private accommodation.
              </p>
            )}
            {groups.map((g) => (
              <section key={g.label}>
                <h3 className="mb-1 text-sm font-semibold text-muted">{g.label}</h3>
                <ul className="flex flex-col gap-1">
                  {g.ids.map((id) => (
                    <li key={id}>
                      <PickRow selected={hallId === id} onPick={() => setHallId(id)} name={BUILDINGS[id].name}>
                        {hallSubline(id)}
                      </PickRow>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </OptionCard>

        <OptionCard
          selected={choice === "private"}
          onPick={() => pick("private")}
          icon={House}
          title="Private accommodation"
          subtitle="Flat, house share, living with family"
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Your postcode</span>
            <input
              className={`${inputClass} uppercase placeholder:normal-case aria-invalid:border-danger`}
              value={postcode}
              onChange={(e) => setPostcode(e.target.value)}
              onBlur={() => setPostcodeTouched(true)}
              placeholder="e.g. WC1E 6BT"
              autoComplete="postal-code"
              maxLength={10}
              aria-invalid={postcodeTouched && !!postcodeError}
            />
            {postcodeTouched && postcodeError ? (
              <span role="alert" className="text-sm text-danger">
                {postcodeError}
              </span>
            ) : (
              <span className="text-xs text-muted">Only used to work out travel times. Saved on this device.</span>
            )}
          </label>
        </OptionCard>

        <OptionCard
          selected={choice === "none"}
          onPick={() => pick("none")}
          icon={Ban}
          title="Skip / don't use my home"
          subtitle="I won't suggest heading home. Switch it on any time."
        />
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="mt-4 flex gap-2">
        {footer}
        <button
          type="submit"
          disabled={!canSubmit}
          className={`${primaryButton} flex-1`}
        >
          {busy ? "Finding it…" : submitLabel}
        </button>
      </div>
    </form>
  );
}

/** One of the three choices. Its extra fields (children) open underneath when it's picked. */
function OptionCard({
  selected,
  onPick,
  icon,
  title,
  subtitle,
  children,
}: {
  selected: boolean;
  onPick: () => void;
  icon: LucideIcon;
  title: string;
  subtitle: string;
  children?: ReactNode;
}) {
  const Icon = icon;
  return (
    <div
      className={`shrink-0 rounded-lg border transition-colors ${selected ? "border-ink bg-surface" : "border-line bg-surface"}`}
    >
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        onClick={onPick}
        className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-sunken text-muted">
          <Icon {...ICON_LG} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{title}</span>
          <span className="block truncate text-sm text-muted">{subtitle}</span>
        </span>
        <span
          aria-hidden
          className={`flex size-5 shrink-0 items-center justify-center rounded-full ${
            selected ? "border-[6px] border-ink" : "border-2 border-line"
          }`}
        />
      </button>
      {selected && children && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

/** One tappable row with a tick: a hall here, a building or place in the location picker. */
export function PickRow({
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
      className={`flex min-h-14 w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
        selected ? "bg-sunken ring-1 ring-ink" : "hover:bg-sunken"
      }`}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{name}</span>
        <span className="block truncate text-xs text-muted">{children}</span>
      </span>
      <span
        aria-hidden
        className={`flex size-5 shrink-0 items-center justify-center rounded-full ${
          selected ? "bg-ink text-paper" : "ring-1 ring-line"
        }`}
      >
        {selected && <Check size={12} strokeWidth={2.5} />}
      </span>
    </button>
  );
}
