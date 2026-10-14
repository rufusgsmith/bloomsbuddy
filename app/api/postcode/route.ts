// GET /api/postcode?pc=WC1H 0AJ  →  { postcode, lat, lng } | 400 / 404 / 502 { error }
// Turns a UK postcode into coordinates via postcodes.io (free, no key), so a student in private
// housing can set their home. Server-side so the browser only ever talks to us. No Claude call.

import { isPostcodeShape, normalisePostcode } from "@/lib/postcode";

export async function GET(request: Request) {
  const pc = normalisePostcode(new URL(request.url).searchParams.get("pc") ?? "");
  if (!isPostcodeShape(pc)) {
    return Response.json({ error: "That doesn't look like a UK postcode" }, { status: 400 });
  }
  try {
    const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(pc)}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (res.status === 404) return Response.json({ error: "Postcode not found" }, { status: 404 });
    if (!res.ok) throw new Error(`postcodes.io HTTP ${res.status}`);
    const body = (await res.json()) as { result?: { postcode?: string; latitude?: number; longitude?: number } };
    const r = body.result;
    // Some postcodes (e.g. PO boxes) exist but have no coordinates.
    if (!r || typeof r.latitude !== "number" || typeof r.longitude !== "number") {
      return Response.json({ error: "No location for that postcode" }, { status: 404 });
    }
    return Response.json({ postcode: r.postcode ?? pc, lat: r.latitude, lng: r.longitude });
  } catch (err) {
    console.error("[postcode] lookup failed:", err);
    return Response.json({ error: "Couldn't look that postcode up, try again" }, { status: 502 });
  }
}
