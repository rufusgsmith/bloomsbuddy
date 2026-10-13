// Estimated library busyness. UCL's live seat page sits behind a Cloudflare bot check, so a
// server can't read it. Instead we keep one real snapshot (Tue 13 Oct 2026, 11:40) and scale it
// by a typical shape of the day and a day-of-week factor. Only the level ever leaves this file:
// Claude and the UI never see seat numbers, because they'd be guesses dressed up as facts.

import type { BuildingId } from "./buildings";
import { londonWeekdayAndMinutes } from "./london-time";
import type { BusynessLevel, IsoDateTime } from "./types";

interface Snapshot {
  libraryId: BuildingId;
  name: string;
  free: number;
  total: number;
}

/** When the snapshot was taken: Tuesday, 11:40 London time. */
export const SNAPSHOT_AT: IsoDateTime = "2026-10-13T11:40:00+01:00";
const SNAPSHOT_WEEKDAY = 2;
const SNAPSHOT_MINS = 11 * 60 + 40;

// Copied from the UCL Library "Current space availability" page.
// Graduate Hub is left out: it's postgrad only.
export const LIBRARY_SNAPSHOT: Snapshot[] = [
  { libraryId: "bartlett-library", name: "Bartlett Library", free: 29, total: 69 },
  { libraryId: "cruciform-hub", name: "Cruciform Hub", free: 91, total: 247 },
  { libraryId: "child-health-library", name: "Great Ormond Street Institute of Child Health Library", free: 22, total: 112 },
  { libraryId: "archaeology-library", name: "Institute of Archaeology Library", free: 14, total: 58 },
  { libraryId: "ioe-library", name: "IOE Library", free: 189, total: 475 },
  { libraryId: "ophthalmology-library", name: "The Joint Library of Ophthalmology", free: 33, total: 44 },
  { libraryId: "lss-library", name: "Language & Speech Science Library", free: 48, total: 57 },
  { libraryId: "main-library", name: "Main Library", free: 184, total: 624 },
  { libraryId: "queen-square-library", name: "Queen Square Library", free: 15, total: 29 },
  { libraryId: "pharmacy-library", name: "School of Pharmacy Library", free: 13, total: 55 },
  { libraryId: "ssees-library", name: "SSEES Library", free: 112, total: 176 },
  { libraryId: "science-library", name: "Science Library", free: 455, total: 907 },
  { libraryId: "student-centre", name: "Student Centre", free: 120, total: 647 },
  { libraryId: "ucl-east-library", name: "UCL East Library", free: 104, total: 156 },
];

// How full a typical library is through the day, relative to its peak (1.0).
// [hour, level]; we interpolate between hours and hold the ends flat outside 08:00–22:00.
const HOUR_CURVE: [number, number][] = [
  [8, 0.3], [9, 0.5], [10, 0.72], [11, 0.88], [12, 0.97], [13, 1], [14, 1], [15, 0.98],
  [16, 0.92], [17, 0.82], [18, 0.68], [19, 0.55], [20, 0.45], [21, 0.36], [22, 0.28],
];

// Midweek is busiest; Friday afternoons empty out; weekends are quiet. 1 = Monday … 7 = Sunday.
const DAY_FACTOR: Record<number, number> = { 1: 0.95, 2: 1, 3: 1, 4: 0.95, 5: 0.8, 6: 0.55, 7: 0.65 };

function hourCurve(minutes: number): number {
  const h = minutes / 60;
  if (h <= HOUR_CURVE[0][0]) return HOUR_CURVE[0][1];
  for (let i = 1; i < HOUR_CURVE.length; i++) {
    const [h1, v1] = HOUR_CURVE[i];
    if (h <= h1) {
      const [h0, v0] = HOUR_CURVE[i - 1];
      return v0 + ((v1 - v0) * (h - h0)) / (h1 - h0);
    }
  }
  return HOUR_CURVE[HOUR_CURVE.length - 1][1];
}

function levelFor(occupancy: number): BusynessLevel {
  if (occupancy < 0.4) return "quiet";
  if (occupancy < 0.65) return "moderate";
  if (occupancy < 0.85) return "busy";
  return "packed";
}

const byId = new Map(LIBRARY_SNAPSHOT.map((s) => [s.libraryId as string, s]));

/** Estimated busyness of a library at an instant, or undefined if we have no snapshot for it. */
export function estimateBusyness(
  libraryId: string,
  at: IsoDateTime,
): { level: BusynessLevel; occupancy: number } | undefined {
  const snap = byId.get(libraryId);
  if (!snap) return undefined;
  const { weekday, minutes } = londonWeekdayAndMinutes(at);
  const base = 1 - snap.free / snap.total;
  const scale = (hourCurve(minutes) / hourCurve(SNAPSHOT_MINS)) * (DAY_FACTOR[weekday] / DAY_FACTOR[SNAPSHOT_WEEKDAY]);
  const occupancy = Math.min(1, Math.max(0, base * scale));
  return { level: levelFor(occupancy), occupancy };
}
