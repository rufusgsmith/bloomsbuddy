import { mockProviders } from "./mock";
import type { Providers } from "./types";

export type * from "./types";

/**
 * Real providers (library seat scraper, SU events scraper) aren't built yet, so this
 * always returns mocks. When they exist: pick them when !isDemoMode(), and wrap each
 * so a throw or timeout falls back to its mock.
 */
export function getProviders(): Providers {
  return mockProviders;
}
