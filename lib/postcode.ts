// UK postcode shape check, shared by the home picker (instant inline error) and /api/postcode.
// Loose: outward code, optional space, inward code. postcodes.io does the real check.

const POSTCODE = /^[A-Z]{1,2}[0-9][A-Z0-9]? ?[0-9][A-Z]{2}$/;

/** Upper-case, trimmed, single spaces: "nw1  2he " → "NW1 2HE". */
export function normalisePostcode(pc: string): string {
  return pc.trim().toUpperCase().replace(/\s+/g, " ");
}

export function isPostcodeShape(pc: string): boolean {
  return POSTCODE.test(normalisePostcode(pc));
}
