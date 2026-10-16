import type { Gap, Recommendation } from "./types";

// Claude's picks per gap, kept for the browser session (like the chat), so closing and reopening a
// gap, switching tabs or reloading never asks Claude again. Only "↻ Redo" replaces them.

const KEY = "bloomsbuddy:recs";
/** Oldest entries are dropped past this, so the session store can't grow without limit. */
const MAX_ENTRIES = 50;

/**
 * One gap under one set of inputs. `context` is Today's remount key (timetable, home, events,
 * calendar to-dos), so changing any of them means fresh picks instead of stale ones.
 */
export const recFingerprint = (gap: Gap, context: string) => `${gap.id}|${gap.start}|${gap.end}|${hash(context)}`;

/** A short hash: the context holds every saved event, too long to repeat in each key. */
function hash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = (Math.imul(h, 33) ^ text.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

function readAll(): Record<string, Recommendation> {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(KEY) ?? "{}") as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, Recommendation>) : {};
  } catch {
    return {};
  }
}

export const readRec = (fingerprint: string): Recommendation | undefined => readAll()[fingerprint];

export function saveRec(fingerprint: string, rec: Recommendation) {
  const all = readAll();
  delete all[fingerprint]; // re-added last, so it counts as the newest
  all[fingerprint] = rec;
  const entries = Object.entries(all).slice(-MAX_ENTRIES);
  try {
    sessionStorage.setItem(KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // Storage full or blocked: the picks still live in Today's state until it remounts.
  }
}
