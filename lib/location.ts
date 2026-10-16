// A place picked in a form: a UCL building, anywhere else by postcode, or nowhere.
// Shared by manual events, to-dos and deadlines (all store an EventLocation), and by /api/recommend.

import { BUILDINGS, type BuildingId, type LatLng } from "./buildings";
import { isPostcodeShape, normalisePostcode } from "./postcode";
import type { EventLocation } from "./types";

export type LocationChoice = "none" | "building" | "postcode";

/** What the location picker edits. Plain strings, like the inputs. */
export interface LocationDraft {
  locationChoice: LocationChoice;
  buildingId: BuildingId;
  postcode: string;
}

/** A postcode's coordinates, from /api/postcode. */
export interface PostcodePlace {
  postcode: string;
  lat: number;
  lng: number;
}

export function isLocation(x: unknown): x is EventLocation {
  const l = x as Partial<Record<string, unknown>> | null;
  if (l?.kind === "building") return typeof l.buildingId === "string" && l.buildingId in BUILDINGS;
  return (
    l?.kind === "postcode" && typeof l.postcode === "string" && Number.isFinite(l.lat) && Number.isFinite(l.lng)
  );
}

export function locationDraftFrom(loc?: EventLocation): LocationDraft {
  return {
    locationChoice: loc?.kind ?? "none",
    buildingId: loc?.kind === "building" ? loc.buildingId : "main-building",
    postcode: loc?.kind === "postcode" ? loc.postcode : "",
  };
}

/** The problem with a picked location, or null. Checked in code, no Claude. */
export function locationDraftProblem(d: LocationDraft): string | null {
  if (d.locationChoice === "postcode" && !isPostcodeShape(d.postcode)) {
    return "That doesn't look like a UK postcode (e.g. WC1E 6BT)";
  }
  return null;
}

/** A valid draft as a location. A postcode needs its coordinates from /api/postcode first. */
export function locationFromDraft(d: LocationDraft, place?: PostcodePlace): EventLocation | undefined {
  if (d.locationChoice === "building") return { kind: "building", buildingId: d.buildingId };
  if (d.locationChoice === "postcode" && place) return { kind: "postcode", ...place };
  return undefined;
}

/** The saved coordinates, when the postcode hasn't changed: saves a lookup. */
export function samePostcode(d: LocationDraft, old?: EventLocation): PostcodePlace | undefined {
  return old?.kind === "postcode" && normalisePostcode(old.postcode) === normalisePostcode(d.postcode) ? old : undefined;
}

/** Short text for a badge: "Cruciform", "NW1 2HE". */
export function locationLabel(loc: EventLocation): string {
  return loc.kind === "building" ? BUILDINGS[loc.buildingId].shortName : loc.postcode;
}

/** Full name for Claude: "Cruciform Building", "NW1 2HE". */
export function locationName(loc: EventLocation): string {
  return loc.kind === "building" ? BUILDINGS[loc.buildingId].name : loc.postcode;
}

export function locationPoint(loc: EventLocation): LatLng {
  return loc.kind === "building" ? BUILDINGS[loc.buildingId] : loc;
}
