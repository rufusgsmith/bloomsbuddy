import { isDemoMode } from "../config";
import type { Society } from "../types";
import { mockProviders } from "./mock";
import { societyEventsProvider } from "./societies";
import type { EventsProvider, Providers } from "./types";

export { deadlinesFromList } from "./mock";

export type * from "./types";

/** Scraping a few societies plus a Claude call each can take a while, but not this long. */
const EVENTS_TIMEOUT_MS = 20_000;

/**
 * Mock deadlines and events. Society events depend on the student's societies, so the real ones
 * come from eventsFor() instead. Library busyness isn't a provider: see lib/library-busyness.ts.
 */
export function getProviders(): Providers {
  return mockProviders;
}

/**
 * Society events for the student's societies: real SU pages, unless we're in demo mode or
 * they haven't picked any. A throw or timeout falls back to the mock events.
 */
export function eventsFor(societies?: Society[]): EventsProvider {
  if (isDemoMode() || !societies?.length) return mockProviders.events;
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

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
