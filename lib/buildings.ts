// UCL Bloomsbury buildings and libraries.
// Coordinates are APPROXIMATE (good to ~30m), which is plenty for walking-time estimates.

export interface Building {
  name: string;
  shortName: string;
  lat: number;
  lng: number;
  isLibrary: boolean;
}

export const BUILDINGS = {
  "main-building": { name: "Wilkins Building (Main Building)", shortName: "Wilkins", lat: 51.5246, lng: -0.1340, isLibrary: false },
  "main-library": { name: "Main Library", shortName: "Main Library", lat: 51.5248, lng: -0.1336, isLibrary: true },
  "student-centre": { name: "UCL Student Centre", shortName: "Student Centre", lat: 51.5252, lng: -0.1325, isLibrary: true },
  "science-library": { name: "Science Library (DMS Watson)", shortName: "Science Library", lat: 51.5236, lng: -0.1328, isLibrary: true },
  "cruciform": { name: "Cruciform Building", shortName: "Cruciform", lat: 51.5242, lng: -0.1352, isLibrary: false },
  "cruciform-hub": { name: "Cruciform Hub (library)", shortName: "Cruciform Hub", lat: 51.5243, lng: -0.1354, isLibrary: true },
  "roberts": { name: "Roberts Building", shortName: "Roberts", lat: 51.5229, lng: -0.1323, isLibrary: false },
  "chadwick": { name: "Chadwick Building", shortName: "Chadwick", lat: 51.5241, lng: -0.1333, isLibrary: false },
  "darwin": { name: "Darwin Building", shortName: "Darwin", lat: 51.5233, lng: -0.1336, isLibrary: false },
  "drayton-house": { name: "Drayton House", shortName: "Drayton House", lat: 51.5256, lng: -0.1331, isLibrary: false },
  "christopher-ingold": { name: "Christopher Ingold Building", shortName: "Chris Ingold", lat: 51.5252, lng: -0.1316, isLibrary: false },
  "gordon-street-25": { name: "25 Gordon Street", shortName: "25 Gordon St", lat: 51.5246, lng: -0.1318, isLibrary: false },
  "bartlett-library": { name: "Bartlett Library (22 Gordon St)", shortName: "Bartlett Library", lat: 51.5244, lng: -0.1317, isLibrary: true },
  "bentham-house": { name: "Bentham House", shortName: "Bentham House", lat: 51.5263, lng: -0.1310, isLibrary: false },
  "ioe-bedford-way": { name: "IOE, 20 Bedford Way", shortName: "IOE", lat: 51.5226, lng: -0.1286, isLibrary: false },
  "ioe-library": { name: "IOE Library (Newsam)", shortName: "IOE Library", lat: 51.5227, lng: -0.1288, isLibrary: true },
  "ssees-library": { name: "SSEES Library (Taviton St)", shortName: "SSEES Library", lat: 51.5248, lng: -0.1300, isLibrary: true },
  "senate-house-library": { name: "Senate House Library", shortName: "Senate House", lat: 51.5211, lng: -0.1287, isLibrary: true },
  "students-union": { name: "Students' Union (Bloomsbury, Gordon St)", shortName: "SU / Print Room Cafe", lat: 51.5250, lng: -0.1320, isLibrary: false },
} as const satisfies Record<string, Building>;

export type BuildingId = keyof typeof BUILDINGS;

export function getBuilding(id: BuildingId): Building {
  return BUILDINGS[id];
}

/** Straight-line ("as the crow flies") distance in metres, via the haversine formula. */
export function distanceMetres(a: BuildingId, b: BuildingId): number {
  const A = BUILDINGS[a];
  const B = BUILDINGS[b];
  const R = 6_371_000; // Earth radius, metres
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(B.lat - A.lat);
  const dLng = toRad(B.lng - A.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(A.lat)) * Math.cos(toRad(B.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Real streets aren't straight lines: ×1.3 is a common detour factor for a city grid.
const DETOUR_FACTOR = 1.3;
// ~4.8 km/h, a normal walking pace.
const WALK_METRES_PER_MIN = 80;
// Getting out of a lecture theatre and down the stairs takes a couple of minutes, wherever you're going.
const MIN_WALK_MINS = 2;

/** Estimated walking time in whole minutes (rounded up). The same building gives 0. */
export function walkingMins(from: BuildingId, to: BuildingId): number {
  if (from === to) return 0;
  const mins = (distanceMetres(from, to) * DETOUR_FACTOR) / WALK_METRES_PER_MIN;
  return Math.max(MIN_WALK_MINS, Math.ceil(mins));
}
