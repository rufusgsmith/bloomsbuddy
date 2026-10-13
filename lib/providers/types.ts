// Provider interfaces: every data source has a mock and (eventually) a real implementation.
// See "Architecture rule" in CLAUDE.md.

import type { Deadline, IsoDateTime, SeatAvailability, SocietyEvent } from "../types";

export interface SeatsProvider {
  getSeats(): Promise<SeatAvailability[]>;
}

export interface EventsProvider {
  /** Events that overlap [start, end]. */
  getEvents(start: IsoDateTime, end: IsoDateTime): Promise<SocietyEvent[]>;
}

export interface DeadlinesProvider {
  /** Deadlines due after `from` and within `withinDays` days of it, soonest first. */
  getDeadlines(from: IsoDateTime, withinDays: number): Promise<Deadline[]>;
}

export interface Providers {
  seats: SeatsProvider;
  events: EventsProvider;
  deadlines: DeadlinesProvider;
}
