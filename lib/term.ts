// When term ends: how far ahead the Societies tab looks for events. Pure, so the server and
// client components can both use it.

import { addDays, londonTodayKey } from "./london-time";
import type { DateKey, UserData } from "./types";

/** Last day of UCL Term 1 2026–27 (approximate: the Friday of teaching week 11). Used without a saved timetable. */
const UCL_TERM_END: DateKey = "2026-12-11";
/** Once the fallback date has passed, look this far ahead instead. */
const FALLBACK_DAYS = 90;

/** The last day of the student's term: their timetable's last week, else UCL's term end. Never before today. */
export function termEndKey(user?: Pick<UserData, "termStart" | "weeks"> | null): DateKey {
  const today = londonTodayKey();
  const end = user ? addDays(user.termStart, user.weeks * 7 - 1) : UCL_TERM_END;
  return end >= today ? end : addDays(today, FALLBACK_DAYS);
}
