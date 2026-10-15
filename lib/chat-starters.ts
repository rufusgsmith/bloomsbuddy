// The 2–3 suggestion chips in an empty chat, worked out from today. Pure, no Claude.

import { dayOfWeek, formatTime } from "./london-time";
import type { DateKey, Gap, IsoDateTime } from "./types";

export function starterPrompts(
  todayKey: DateKey,
  nowIso: IsoDateTime,
  today: { gaps: Gap[]; events: unknown[] } | undefined,
): string[] {
  const now = Date.parse(nowIso);
  // A gap still to come (or under way) today, else something for later today.
  const gap = today?.gaps.find((g) => Date.parse(g.end) > now);
  const first = gap
    ? `What should I do in my ${formatTime(gap.start)} gap?`
    : today?.events.length
      ? "What can I do after my last class today?"
      : "What can I do this evening?";

  const weekday = dayOfWeek(todayKey);
  const weekend =
    weekday <= 5
      ? "What can I do Saturday 14:00–17:00?"
      : weekday === 6
        ? "What can I do tomorrow 14:00–17:00?"
        : "What's my Monday looking like?";

  return [first, weekend, "What's due this week?"];
}
