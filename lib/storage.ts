// The student's own data in localStorage. Client-side only.
// Anything unreadable (private mode, old format, hand-edited JSON) counts as "no data",
// so the app falls back to the demo week instead of crashing.

import type { UserData } from "./types";

const KEY = "bloomsbuddy:v1";
/** Fired on this tab after we write. The "storage" event only reaches other tabs. */
const CHANGE_EVENT = "bloomsbuddy:userdata";

function notifyChange(): void {
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** The stored JSON as-is. A string is a stable snapshot for useSyncExternalStore. */
export function readRawUserData(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function parseUserData(raw: string | null): UserData | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<UserData>;
    if (
      data?.version !== 1 ||
      !Array.isArray(data.classes) ||
      !Array.isArray(data.deadlines) ||
      typeof data.termStart !== "string" ||
      typeof data.weeks !== "number"
    ) {
      return null;
    }
    return data as UserData;
  } catch {
    return null;
  }
}

export function loadUserData(): UserData | null {
  return parseUserData(readRawUserData());
}

/** Returns false if the browser refused to save (e.g. storage blocked or full). */
export function saveUserData(data: UserData): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    notifyChange();
    return true;
  } catch {
    return false;
  }
}

export function clearUserData(): void {
  try {
    localStorage.removeItem(KEY);
    notifyChange();
  } catch {
    // Nothing to clear if storage is blocked.
  }
}

/** Calls back when the saved data changes, in this tab or another. */
export function subscribeUserData(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

const SKIPPED_KEY = "bloomsbuddy:onboarding-skipped";

/**
 * True once the student has chosen the demo week over onboarding, so Today stops sending them to /setup.
 * Also true when storage is blocked: onboarding couldn't save anything there, so don't loop them into it.
 */
export function onboardingSkipped(): boolean {
  try {
    return localStorage.getItem(SKIPPED_KEY) === "1";
  } catch {
    return true;
  }
}

export function markOnboardingSkipped(): void {
  try {
    localStorage.setItem(SKIPPED_KEY, "1");
  } catch {
    // Blocked storage already counts as skipped.
  }
}
