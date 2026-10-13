// Mock providers over the demo week in lib/mock (always the current week). Time maths uses Date.parse, which
// respects the ISO offset, so the server's timezone never matters.

import { mockDeadlines, mockSocietyEvents } from "../mock";
import type { Deadline } from "../types";
import type { DeadlinesProvider, Providers } from "./types";

const MS_PER_DAY = 86_400_000;

export const mockProviders: Providers = {
  events: {
    async getEvents(start, end) {
      const s = Date.parse(start);
      const e = Date.parse(end);
      return mockSocietyEvents().filter((ev) => Date.parse(ev.start) < e && Date.parse(ev.end) > s);
    },
  },
  deadlines: {
    // Rebuilt per call, so the mock week follows the calendar.
    getDeadlines: (from, withinDays) => deadlinesFromList(mockDeadlines()).getDeadlines(from, withinDays),
  },
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
