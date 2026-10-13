import { toSlug } from "../societies/slug";
import type { Society } from "../types";
import { mockProviders } from "./mock";
import { societyEventsProvider } from "./societies";
import type { EventsProvider, Providers } from "./types";

export { deadlinesFromList } from "./mock";

export type * from "./types";

/** Scraping a few societies and their event pages can take a while, but not this long. */
const EVENTS_TIMEOUT_MS = 20_000;

/**
 * Mock deadlines and events. Society events depend on the student's societies, so the real ones
 * come from eventsFor() instead. Library busyness isn't a provider: see lib/library-busyness.ts.
 */
export function getProviders(): Providers {
  return mockProviders;
}

/**
 * Society events for the student's societies: real SU pages, even in demo mode (scraping
 * costs no API tokens). Mock events when they haven't picked any, or on a throw or timeout.
 */
export function eventsFor(societies?: Society[]): EventsProvider {
  if (!societies?.length) return mockProviders.events;
  const real = societyEventsProvider(societies);
  return {
    async getEvents(start, end) {
      try {
        return await withTimeout(real.getEvents(start, end), EVENTS_TIMEOUT_MS);
      } catch (err) {
        console.error("[providers] society events failed, using mock:", err);
        return mockProviders.events.getEvents(start, end);
      }
    },
  };
}

/**
 * One society's events, for the Societies tab (which loads each society on its own).
 * Unlike eventsFor(), the mock fallback only has this society's mock events, if any.
 */
export function eventsForSociety(society: Society): EventsProvider {
  const mock: EventsProvider = {
    async getEvents(start, end) {
      const events = await mockProviders.events.getEvents(start, end);
      return events.filter((ev) => toSlug(ev.society) === society.slug);
    },
  };
  const real = societyEventsProvider([society]);
  return {
    async getEvents(start, end) {
      try {
        return await withTimeout(real.getEvents(start, end), EVENTS_TIMEOUT_MS);
      } catch (err) {
        console.error(`[providers] ${society.slug} events failed, using mock:`, err);
        return mock.getEvents(start, end);
      }
    },
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
