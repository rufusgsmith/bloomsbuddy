"use client";

import { useState } from "react";
import { ALL_BUILDING_IDS, BUILDINGS, searchBuildings, type BuildingId } from "@/lib/buildings";
import type { LocationDraft } from "@/lib/location";
import { inputClass } from "./form-ui";
import { PickRow } from "./home-picker";

// Pick where something happens: type to filter UCL buildings and libraries (same search as the
// home picker), tap one. "Other place (postcode)" and "No location" sit under the matches.
// Used by the event form, to-dos, deadlines, and (building only) the timetable editor.

/** How many matches show at once. */
const MAX_MATCHES = 6;

const AREA_LABEL = { bloomsbury: "Bloomsbury", "ucl-east": "UCL East", "canary-wharf": "Canary Wharf", elsewhere: "London" };

function buildingSubline(id: BuildingId): string {
  const b = BUILDINGS[id];
  const what = b.kind === "library" ? "Library" : b.kind === "hall" ? "Hall" : "Building";
  return `${what} · ${AREA_LABEL[b.area]}`;
}

export function LocationPicker({
  value,
  onChange,
  buildingOnly = false,
  invalid = false,
  label = "Search UCL buildings and libraries",
}: {
  value: LocationDraft;
  onChange: (patch: Partial<LocationDraft>) => void;
  /** Timetable classes always need a building: no postcode or "No location". */
  buildingOnly?: boolean;
  /** Highlights the search box, e.g. for a building Claude guessed. */
  invalid?: boolean;
  label?: string;
}) {
  const [query, setQuery] = useState("");
  const picked = value.locationChoice === "building" ? value.buildingId : null;
  const matches = query.trim()
    ? searchBuildings(ALL_BUILDING_IDS, query).slice(0, MAX_MATCHES)
    : picked
      ? [picked]
      : [];

  return (
    <div className="flex flex-col gap-2">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={picked ? BUILDINGS[picked].name : "Start typing, e.g. Cruciform"}
        aria-label={label}
        className={`${inputClass} ${invalid ? "ring-2 ring-ochre" : ""}`}
      />
      <ul role="radiogroup" aria-label="Places" className="flex flex-col gap-1">
        {query.trim() && matches.length === 0 && (
          <li className="py-2 text-sm text-muted">
            No UCL building called that.{buildingOnly ? "" : " Somewhere else? Use a postcode."}
          </li>
        )}
        {matches.map((id) => (
          <li key={id}>
            <PickRow
              selected={picked === id}
              onPick={() => {
                onChange({ locationChoice: "building", buildingId: id });
                setQuery("");
              }}
              name={BUILDINGS[id].name}
            >
              {buildingSubline(id)}
            </PickRow>
          </li>
        ))}
        {!buildingOnly && (
          <>
            <li>
              <PickRow
                selected={value.locationChoice === "postcode"}
                onPick={() => onChange({ locationChoice: "postcode" })}
                name="Other place (postcode)"
              >
                Anywhere in the UK
              </PickRow>
            </li>
            <li>
              <PickRow
                selected={value.locationChoice === "none"}
                onPick={() => onChange({ locationChoice: "none" })}
                name="No location"
              >
                Not tied to a place
              </PickRow>
            </li>
          </>
        )}
      </ul>
      {value.locationChoice === "postcode" && !buildingOnly && (
        <input
          value={value.postcode}
          onChange={(e) => onChange({ postcode: e.target.value })}
          placeholder="Postcode, e.g. WC1E 6BT"
          aria-label="Postcode"
          autoComplete="postal-code"
          autoCapitalize="characters"
          className={`${inputClass} uppercase placeholder:normal-case`}
        />
      )}
    </div>
  );
}
