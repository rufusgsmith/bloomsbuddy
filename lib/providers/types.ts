// Provider interfaces: every data source has a mock and (eventually) a real implementation.
// See "Architecture rule" in CLAUDE.md.

import type { Deadline, IsoDateTime, SocietyEvent } from "../types";

export interface EventsProvider {
  /** Events that overlap [start, end]. */
  getEvents(start: IsoDateTime, end: IsoDateTime): Promise<SocietyEvent[]>;
}

export interface DeadlinesProvider {
  /** Deadlines due after `from` and within `withinDays` days of it, soonest first. */
  getDeadlines(from: IsoDateTime, withinDays: number): Promise<Deadline[]>;
}

export interface Providers {
  events: EventsProvider;
  deadlines: DeadlinesProvider;
}
