// The student's home (a UCL hall or a private postcode) in localStorage. Kept apart from UserData
// so it works in the demo week too. Same pattern as storage.ts: anything unreadable counts as "not set".

import { BUILDINGS, type BuildingId } from "./buildings";
import type { Home, HomeLocation } from "./types";

const KEY = "bloomsbuddy:home";
/** Fired on this tab after we write. The "storage" event only reaches other tabs. */
const CHANGE_EVENT = "bloomsbuddy:home";

export function readRawHome(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function parseHome(raw: string | null): Home | null {
  if (!raw) return null;
  try {
    const h = JSON.parse(raw) as Partial<Home> & Record<string, unknown>;
    if (h.kind === "none") return { kind: "none" };
    if (h.kind === "hall" && typeof h.buildingId === "string" && h.buildingId in BUILDINGS) {
      return { kind: "hall", buildingId: h.buildingId as BuildingId };
    }
    if (
      h.kind === "private" &&
      typeof h.postcode === "string" &&
      Number.isFinite(h.lat) &&
      Number.isFinite(h.lng)
    ) {
      return { kind: "private", postcode: h.postcode, lat: h.lat as number, lng: h.lng as number };
    }
    return null;
  } catch {
    return null;
  }
}

/** Returns false if the browser refused to save. */
export function saveHome(home: Home): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(home));
    window.dispatchEvent(new Event(CHANGE_EVENT));
    return true;
  } catch {
    return false;
  }
}

export function subscribeHome(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/** Name for the Home button and setup, e.g. "Ifor Evans Hall" or "NW3 2QG". */
export function homeLabel(home: Home): string {
  if (home.kind === "hall") return BUILDINGS[home.buildingId].name;
  if (home.kind === "private") return home.postcode;
  return "Not using my home";
}

/** What /api/recommend needs, or undefined when there's no home to use. */
export function homeLocation(home: Home | null): HomeLocation | undefined {
  if (!home || home.kind === "none") return undefined;
  if (home.kind === "hall") {
    const b = BUILDINGS[home.buildingId];
    return { label: b.name, lat: b.lat, lng: b.lng };
  }
  return { label: `your place (${home.postcode})`, lat: home.lat, lng: home.lng };
}
