import { locationFromDraft, samePostcode, type LocationDraft, type PostcodePlace } from "@/lib/location";
import { normalisePostcode } from "@/lib/postcode";
import type { EventLocation } from "@/lib/types";

// Turns a postcode into lat/lng via /api/postcode (postcodes.io). Browser only.
// Shared by the home picker and every form with a location picker.

/** The place, or an error message to show. */
export async function lookupPostcode(postcode: string): Promise<PostcodePlace | string> {
  const pc = normalisePostcode(postcode);
  try {
    const res = await fetch(`/api/postcode?pc=${encodeURIComponent(pc)}`);
    const body = (await res.json()) as { postcode?: string; lat?: number; lng?: number; error?: string };
    if (!res.ok || typeof body.lat !== "number" || typeof body.lng !== "number") {
      return body.error ?? "Couldn't find that postcode";
    }
    return { postcode: body.postcode ?? pc, lat: body.lat, lng: body.lng };
  } catch {
    return "Couldn't look that postcode up. Check your connection?";
  }
}

/**
 * A picked location ready to save, or an error message. A postcode reuses `old`'s coordinates when
 * it hasn't changed, else it's looked up.
 */
export async function resolveLocation(d: LocationDraft, old?: EventLocation): Promise<EventLocation | undefined | string> {
  if (d.locationChoice !== "postcode") return locationFromDraft(d);
  const place = samePostcode(d, old) ?? (await lookupPostcode(d.postcode));
  return typeof place === "string" ? place : locationFromDraft(d, place);
}
