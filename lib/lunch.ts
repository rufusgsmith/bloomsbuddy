// Is this gap a good time to eat lunch? Pure and timezone-safe: London wall-clock minutes come
// from londonWeekdayAndMinutes, never the machine's clock.

import { londonWeekdayAndMinutes } from "./london-time";
import type { Gap } from "./types";

const LUNCH_START = 12 * 60;
const LUNCH_END = 14 * 60;
/** Enough time inside the lunch window to actually sit down and eat. */
export const LUNCH_LENGTH_MINS = 30;
/** Less overlap than this (e.g. a gap starting at 13:55) doesn't count as a lunch gap at all. */
const MIN_OVERLAP_MINS = 15;

/** Minutes of the gap's usable time that fall inside 12:00–14:00. */
function lunchMins(gap: Gap): number {
  const start = londonWeekdayAndMinutes(gap.start).minutes;
  const usableEnd = start + gap.usableMins;
  return Math.max(0, Math.min(usableEnd, LUNCH_END) - Math.max(start, LUNCH_START));
}

export interface LunchInfo {
  /** Usable minutes of this gap between 12:00 and 14:00. */
  minsInLunchWindow: number;
  /** An earlier gap today already had a lunch-length slot in the window. */
  hadLunchGapEarlier: boolean;
  /** This gap overlaps lunchtime and nothing earlier did: usually offer food. */
  suggestFood: boolean;
}

export function lunchInfo(gap: Gap, dayGaps: Gap[]): LunchInfo {
  const minsInLunchWindow = lunchMins(gap);
  const hadLunchGapEarlier = dayGaps.some(
    (g) => g.id !== gap.id && Date.parse(g.start) < Date.parse(gap.start) && lunchMins(g) >= LUNCH_LENGTH_MINS,
  );
  return { minsInLunchWindow, hadLunchGapEarlier, suggestFood: minsInLunchWindow >= MIN_OVERLAP_MINS && !hadLunchGapEarlier };
}
