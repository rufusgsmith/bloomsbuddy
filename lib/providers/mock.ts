// Mock providers over the demo week in lib/mock. Time maths uses Date.parse, which
// respects the ISO offset, so the server's timezone never matters.

import { MOCK_DEADLINES, MOCK_SOCIETY_EVENTS } from "../mock";
import type { Deadline } from "../types";
import type { DeadlinesProvider, Providers } from "./types";

const MS_PER_DAY = 86_400_000;

export const mockProviders: Providers = {
  events: {
    async getEvents(start, end) {
      const s = Date.parse(start);
      const e = Date.parse(end);
      return MOCK_SOCIETY_EVENTS.filter((ev) => Date.parse(ev.start) < e && Date.parse(ev.end) > s);
    },
  },
  deadlines: deadlinesFromList(MOCK_DEADLINES),
};

/** A deadlines provider over a fixed list: the mock week's, or the student's own from onboarding. */
export function deadlinesFromList(list: Deadline[]): DeadlinesProvider {
  return {
    async getDeadlines(from, withinDays) {
      const f = Date.parse(from);
      const until = f + withinDays * MS_PER_DAY;
      return list
        .filter((d) => {
          const due = Date.parse(d.due);
          return due > f && due <= until;
        })
        .sort((a, b) => Date.parse(a.due) - Date.parse(b.due));
    },
  };
}
