// The student's own data in localStorage. Client-side only.
// Anything unreadable (private mode, old format, hand-edited JSON) counts as "no data",
// so the app falls back to the demo week instead of crashing.

import type { UserData } from "./types";

const KEY = "bloomsbuddy:v1";

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
    return true;
  } catch {
    return false;
  }
}

export function clearUserData(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear if storage is blocked.
  }
}

/** Calls back when another tab changes storage. */
export function subscribeUserData(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}
