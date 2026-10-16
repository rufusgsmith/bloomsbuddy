// One-line tips for gaps too short for Claude (see findShortGaps in lib/gaps.ts). Pure and instant:
// no API call. Plain and factual per the UI rules, 24-hour times, short enough for one line.

import { BUILDINGS } from "./buildings";
import { formatTime, londonWeekdayAndMinutes } from "./london-time";
import type { ShortGap } from "./types";

const LUNCH_START = 12 * 60;
const LUNCH_END = 14 * 60;

export function quickTip(g: ShortGap): string {
  const to = BUILDINGS[g.nextLocationId].shortName;
  const trip = `${g.travelMins} min ${g.travelMode === "tube" ? "by tube" : "walk"}`;

  if (g.tier === "move") {
    return g.usableMins < 0
      ? `You may be a few minutes late: ${trip} to ${to}`
      : `Get moving: ${trip} to ${to} for ${formatTime(g.end)}`;
  }

  const startMin = londonWeekdayAndMinutes(g.start).minutes;
  if (startMin >= LUNCH_START && startMin < LUNCH_END && g.usableMins >= 10) {
    return g.travelMins > 0 ? `Grab a quick snack on the way to ${to}` : "Grab a quick snack nearby";
  }
  if (g.travelMins > 0) return `Head to ${to} early (${trip}) and settle in`;
  const code = g.nextEvent.moduleCode;
  return code ? `Stay put and look over your ${code} notes` : "Stay put and look over your notes";
}
