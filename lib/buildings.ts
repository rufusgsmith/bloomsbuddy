// UCL buildings, libraries and halls: Bloomsbury, UCL East (Stratford), the School of Management
// (Canary Wharf) and halls across north and central London.
// Coordinates are APPROXIMATE. Bloomsbury buildings are estimated to ~30m. Halls, UCL East and
// Canary Wharf were placed from their street addresses (~50-100m). Either is plenty for travel estimates.

export type Area = "bloomsbury" | "ucl-east" | "canary-wharf" | "elsewhere";
export type BuildingKind = "teaching" | "library" | "hall" | "other";

export interface Building {
  name: string;
  shortName: string;
  lat: number;
  lng: number;
  isLibrary: boolean;
  area: Area;
  kind: BuildingKind;
}

export const BUILDINGS = {
  // ---- Bloomsbury: teaching and other buildings ----
  "main-building": { name: "Wilkins Building (Main Building)", shortName: "Wilkins", lat: 51.5246, lng: -0.1340, isLibrary: false, area: "bloomsbury", kind: "teaching" },
  "cruciform": { name: "Cruciform Building", shortName: "Cruciform", lat: 51.5242, lng: -0.1352, isLibrary: false, area: "bloomsbury", kind: "teaching" },
  "roberts": { name: "Roberts Building", shortName: "Roberts", lat: 51.5229, lng: -0.1323, isLibrary: false, area: "bloomsbury", kind: "teaching" },
  "chadwick": { name: "Chadwick Building", shortName: "Chadwick", lat: 51.5241, lng: -0.1333, isLibrary: false, area: "bloomsbury", kind: "teaching" },
  "darwin": { name: "Darwin Building", shortName: "Darwin", lat: 51.5233, lng: -0.1336, isLibrary: false, area: "bloomsbury", kind: "teaching" },
  "drayton-house": { name: "Drayton House", shortName: "Drayton House", lat: 51.5256, lng: -0.1331, isLibrary: false, area: "bloomsbury", kind: "teaching" },
  "christopher-ingold": { name: "Christopher Ingold Building", shortName: "Chris Ingold", lat: 51.5252, lng: -0.1316, isLibrary: false, area: "bloomsbury", kind: "teaching" },
  "gordon-street-25": { name: "25 Gordon Street", shortName: "25 Gordon St", lat: 51.5246, lng: -0.1318, isLibrary: false, area: "bloomsbury", kind: "teaching" },
  "gordon-street-22": { name: "22 Gordon Street (Bartlett)", shortName: "22 Gordon St", lat: 51.5244, lng: -0.1317, isLibrary: false, area: "bloomsbury", kind: "teaching" },
  "bentham-house": { name: "Bentham House", shortName: "Bentham House", lat: 51.5263, lng: -0.1310, isLibrary: false, area: "bloomsbury", kind: "teaching" },
  "ioe-bedford-way": { name: "IOE, 20 Bedford Way", shortName: "IOE", lat: 51.5226, lng: -0.1286, isLibrary: false, area: "bloomsbury", kind: "teaching" },
  "bedford-way-26": { name: "26 Bedford Way", shortName: "26 Bedford Way", lat: 51.5232, lng: -0.1284, isLibrary: false, area: "bloomsbury", kind: "teaching" },
  "torrington-place": { name: "1–19 Torrington Place", shortName: "Torrington Pl", lat: 51.5215, lng: -0.1338, isLibrary: false, area: "bloomsbury", kind: "teaching" },
  "taviton-street-16": { name: "16 Taviton Street (SSEES)", shortName: "16 Taviton St", lat: 51.5249, lng: -0.1299, isLibrary: false, area: "bloomsbury", kind: "teaching" },
  "tavistock-square": { name: "29–31 Tavistock Square", shortName: "Tavistock Sq", lat: 51.5251, lng: -0.1288, isLibrary: false, area: "bloomsbury", kind: "teaching" },
  "gower-street-66": { name: "66–72 Gower Street", shortName: "66 Gower St", lat: 51.5212, lng: -0.1323, isLibrary: false, area: "bloomsbury", kind: "teaching" },
  "anatomy": { name: "Anatomy Building", shortName: "Anatomy", lat: 51.5248, lng: -0.1343, isLibrary: false, area: "bloomsbury", kind: "teaching" },
  "chandler-house": { name: "Chandler House", shortName: "Chandler House", lat: 51.5250, lng: -0.1215, isLibrary: false, area: "bloomsbury", kind: "teaching" },
  "endsleigh-gardens": { name: "Endsleigh Gardens", shortName: "Endsleigh Gdns", lat: 51.5265, lng: -0.1310, isLibrary: false, area: "bloomsbury", kind: "teaching" },
  "engineering-front": { name: "Engineering Front Building", shortName: "Engineering Front", lat: 51.5228, lng: -0.1325, isLibrary: false, area: "bloomsbury", kind: "teaching" },
  "foster-court": { name: "Foster Court", shortName: "Foster Court", lat: 51.5232, lng: -0.1330, isLibrary: false, area: "bloomsbury", kind: "teaching" },
  "gordon-house": { name: "Gordon House", shortName: "Gordon House", lat: 51.5245, lng: -0.1310, isLibrary: false, area: "bloomsbury", kind: "teaching" },
  "henry-morley": { name: "Henry Morley Building", shortName: "Henry Morley", lat: 51.5237, lng: -0.1343, isLibrary: false, area: "bloomsbury", kind: "teaching" },
  "institute-of-archaeology": { name: "Institute of Archaeology (Gordon Square)", shortName: "Archaeology", lat: 51.5248, lng: -0.1307, isLibrary: false, area: "bloomsbury", kind: "teaching" },
  "institute-of-child-health": { name: "Institute of Child Health (Guilford St)", shortName: "Child Health", lat: 51.5225, lng: -0.1212, isLibrary: false, area: "bloomsbury", kind: "teaching" },
  "kathleen-lonsdale": { name: "Kathleen Lonsdale Building", shortName: "Kathleen Lonsdale", lat: 51.5257, lng: -0.1338, isLibrary: false, area: "bloomsbury", kind: "teaching" },
  "lewis-building": { name: "Lewis Building", shortName: "Lewis", lat: 51.5258, lng: -0.1344, isLibrary: false, area: "bloomsbury", kind: "teaching" },
  "mpeb": { name: "Malet Place Engineering Building", shortName: "MPEB", lat: 51.5228, lng: -0.1328, isLibrary: false, area: "bloomsbury", kind: "teaching" },
  "medawar": { name: "Medawar Building", shortName: "Medawar", lat: 51.5235, lng: -0.1335, isLibrary: false, area: "bloomsbury", kind: "teaching" },
  "medical-sciences": { name: "Medical Sciences Building", shortName: "Medical Sciences", lat: 51.5250, lng: -0.1347, isLibrary: false, area: "bloomsbury", kind: "teaching" },
  "north-west-wing": { name: "North-West Wing", shortName: "North-West Wing", lat: 51.5250, lng: -0.1342, isLibrary: false, area: "bloomsbury", kind: "teaching" },
  "south-wing": { name: "South Wing", shortName: "South Wing", lat: 51.5240, lng: -0.1338, isLibrary: false, area: "bloomsbury", kind: "teaching" },
  "pearson": { name: "Pearson Building", shortName: "Pearson", lat: 51.5244, lng: -0.1334, isLibrary: false, area: "bloomsbury", kind: "teaching" },
  "queen-square": { name: "Queen Square", shortName: "Queen Square", lat: 51.5221, lng: -0.1222, isLibrary: false, area: "bloomsbury", kind: "teaching" },
  "rockefeller": { name: "Rockefeller Building", shortName: "Rockefeller", lat: 51.5233, lng: -0.1355, isLibrary: false, area: "bloomsbury", kind: "teaching" },
  "wolfson-house": { name: "Wolfson House", shortName: "Wolfson House", lat: 51.5262, lng: -0.1360, isLibrary: false, area: "bloomsbury", kind: "teaching" },
  "bloomsbury-theatre": { name: "Bloomsbury Theatre", shortName: "Bloomsbury Theatre", lat: 51.5254, lng: -0.1325, isLibrary: false, area: "bloomsbury", kind: "other" },
  "students-union": { name: "Students' Union (Bloomsbury, Gordon St)", shortName: "SU / Print Room Cafe", lat: 51.5250, lng: -0.1320, isLibrary: false, area: "bloomsbury", kind: "other" },

  // ---- Bloomsbury: libraries and study spaces ----
  "main-library": { name: "Main Library", shortName: "Main Library", lat: 51.5248, lng: -0.1336, isLibrary: true, area: "bloomsbury", kind: "library" },
  "student-centre": { name: "UCL Student Centre", shortName: "Student Centre", lat: 51.5252, lng: -0.1325, isLibrary: true, area: "bloomsbury", kind: "library" },
  "science-library": { name: "Science Library (DMS Watson)", shortName: "Science Library", lat: 51.5236, lng: -0.1328, isLibrary: true, area: "bloomsbury", kind: "library" },
  "cruciform-hub": { name: "Cruciform Hub (library)", shortName: "Cruciform Hub", lat: 51.5243, lng: -0.1354, isLibrary: true, area: "bloomsbury", kind: "library" },
  "bartlett-library": { name: "Bartlett Library (22 Gordon St)", shortName: "Bartlett Library", lat: 51.5244, lng: -0.1317, isLibrary: true, area: "bloomsbury", kind: "library" },
  "ioe-library": { name: "IOE Library (Newsam)", shortName: "IOE Library", lat: 51.5227, lng: -0.1288, isLibrary: true, area: "bloomsbury", kind: "library" },
  "ssees-library": { name: "SSEES Library (Taviton St)", shortName: "SSEES Library", lat: 51.5248, lng: -0.1300, isLibrary: true, area: "bloomsbury", kind: "library" },
  "senate-house-library": { name: "Senate House Library", shortName: "Senate House", lat: 51.5211, lng: -0.1287, isLibrary: true, area: "bloomsbury", kind: "library" },
  // Smaller site libraries. Each shares its coordinates with the building it sits in.
  "archaeology-library": { name: "Institute of Archaeology Library", shortName: "Archaeology Library", lat: 51.5248, lng: -0.1307, isLibrary: true, area: "bloomsbury", kind: "library" },
  "child-health-library": { name: "Great Ormond Street Institute of Child Health Library", shortName: "Child Health Library", lat: 51.5225, lng: -0.1212, isLibrary: true, area: "bloomsbury", kind: "library" },
  "lss-library": { name: "Language & Speech Science Library (Chandler House)", shortName: "LSS Library", lat: 51.5250, lng: -0.1215, isLibrary: true, area: "bloomsbury", kind: "library" },
  "queen-square-library": { name: "Queen Square Library (Institute of Neurology)", shortName: "Queen Square Library", lat: 51.5221, lng: -0.1222, isLibrary: true, area: "bloomsbury", kind: "library" },
  "pharmacy-library": { name: "School of Pharmacy Library (Brunswick Sq)", shortName: "Pharmacy Library", lat: 51.5242, lng: -0.1225, isLibrary: true, area: "bloomsbury", kind: "library" },
  "ophthalmology-library": { name: "Joint Library of Ophthalmology (Bath St)", shortName: "Ophthalmology Library", lat: 51.5275, lng: -0.0905, isLibrary: true, area: "elsewhere", kind: "library" },

  // ---- UCL East (Queen Elizabeth Olympic Park) ----
  "marshgate": { name: "Marshgate (UCL East)", shortName: "Marshgate", lat: 51.5386, lng: -0.0109, isLibrary: false, area: "ucl-east", kind: "teaching" },
  "one-pool-street": { name: "One Pool Street (UCL East)", shortName: "One Pool St", lat: 51.5394, lng: -0.0088, isLibrary: false, area: "ucl-east", kind: "teaching" },
  "here-east": { name: "UCL at Here East", shortName: "Here East", lat: 51.5466, lng: -0.0229, isLibrary: false, area: "ucl-east", kind: "teaching" },
  "ucl-east-library": { name: "UCL East Library (Marshgate)", shortName: "UCL East Library", lat: 51.5386, lng: -0.0109, isLibrary: true, area: "ucl-east", kind: "library" },

  // ---- Canary Wharf ----
  "one-canada-square": { name: "One Canada Square (School of Management)", shortName: "One Canada Sq", lat: 51.5049, lng: -0.0195, isLibrary: false, area: "canary-wharf", kind: "teaching" },

  // ---- Halls (placed from their addresses) ----
  "arthur-tattersall-house": { name: "Arthur Tattersall House", shortName: "Arthur Tattersall", lat: 51.5255, lng: -0.1347, isLibrary: false, area: "bloomsbury", kind: "hall" }, // 115–131 Gower St
  "john-tovell-house": { name: "John Tovell House", shortName: "John Tovell", lat: 51.5243, lng: -0.1338, isLibrary: false, area: "bloomsbury", kind: "hall" }, // 89–97 Gower St
  "campbell-house-east": { name: "Campbell House East", shortName: "Campbell East", lat: 51.5258, lng: -0.1303, isLibrary: false, area: "bloomsbury", kind: "hall" }, // Taviton St
  "campbell-house-west": { name: "Campbell House West", shortName: "Campbell West", lat: 51.5256, lng: -0.1306, isLibrary: false, area: "bloomsbury", kind: "hall" }, // Taviton St
  "john-adams-hall": { name: "John Adams Hall", shortName: "John Adams", lat: 51.5263, lng: -0.1293, isLibrary: false, area: "bloomsbury", kind: "hall" }, // Endsleigh St
  "john-dodgson-house": { name: "John Dodgson House", shortName: "John Dodgson", lat: 51.5278, lng: -0.1253, isLibrary: false, area: "bloomsbury", kind: "hall" }, // Bidborough St
  "bidborough-house": { name: "Bidborough House", shortName: "Bidborough", lat: 51.5279, lng: -0.1259, isLibrary: false, area: "bloomsbury", kind: "hall" }, // Bidborough St
  "astor-college": { name: "Astor College", shortName: "Astor", lat: 51.5213, lng: -0.1366, isLibrary: false, area: "bloomsbury", kind: "hall" }, // 99 Charlotte St
  "ramsay-hall": { name: "Ramsay Hall", shortName: "Ramsay", lat: 51.5222, lng: -0.1393, isLibrary: false, area: "bloomsbury", kind: "hall" }, // 20 Maple St
  "ian-baker-house": { name: "Ian Baker House", shortName: "Ian Baker", lat: 51.5224, lng: -0.1396, isLibrary: false, area: "bloomsbury", kind: "hall" }, // Ramsay Hall grounds, Maple St
  "schafer-house": { name: "Schafer House", shortName: "Schafer", lat: 51.5267, lng: -0.1378, isLibrary: false, area: "bloomsbury", kind: "hall" }, // 168 Drummond St
  "prankerd-house": { name: "Prankerd House", shortName: "Prankerd", lat: 51.5275, lng: -0.1375, isLibrary: false, area: "bloomsbury", kind: "hall" }, // 195 North Gower St
  "frances-gardner-house": { name: "Frances Gardner House", shortName: "Frances Gardner", lat: 51.5257, lng: -0.1163, isLibrary: false, area: "elsewhere", kind: "hall" }, // Wren St, WC1X
  "langton-close": { name: "Langton Close", shortName: "Langton Close", lat: 51.5262, lng: -0.1165, isLibrary: false, area: "elsewhere", kind: "hall" }, // Wren St, WC1X
  "james-lighthill-house": { name: "James Lighthill House", shortName: "James Lighthill", lat: 51.5300, lng: -0.1155, isLibrary: false, area: "elsewhere", kind: "hall" }, // Penton Rise, King's Cross
  "ifor-evans-hall": { name: "Ifor Evans Hall", shortName: "Ifor Evans", lat: 51.5436, lng: -0.1330, isLibrary: false, area: "elsewhere", kind: "hall" }, // 109 Camden Rd
  "ann-stephenson-house": { name: "Ann Stephenson House", shortName: "Ann Stephenson", lat: 51.5436, lng: -0.1325, isLibrary: false, area: "elsewhere", kind: "hall" }, // 109 Camden Rd
  "max-rayne-house": { name: "Max Rayne House", shortName: "Max Rayne", lat: 51.5430, lng: -0.1320, isLibrary: false, area: "elsewhere", kind: "hall" }, // Camden Rd
  "new-hall": { name: "New Hall", shortName: "New Hall", lat: 51.5513, lng: -0.1180, isLibrary: false, area: "elsewhere", kind: "hall" }, // 465 Caledonian Rd, N7
  "goldsmid-house": { name: "Goldsmid House", shortName: "Goldsmid", lat: 51.5136, lng: -0.1580, isLibrary: false, area: "elsewhere", kind: "hall" }, // North Row, Mayfair
  "bernard-johnson-house": { name: "Bernard Johnson House", shortName: "Bernard Johnson", lat: 51.5900, lng: -0.1600, isLibrary: false, area: "elsewhere", kind: "hall" }, // 78 Fortis Green, N2
} as const satisfies Record<string, Building>;

export type BuildingId = keyof typeof BUILDINGS;

export function getBuilding(id: BuildingId): Building {
  return BUILDINGS[id];
}

/**
 * The UCL building a free-text venue is in, e.g. "Roberts G06 Sir Ambrose Fleming LT" → "roberts".
 * Matches whole words of a building's name or short name; the longest match wins, so
 * "Main Library" beats "Main Building". Undefined when nothing matches: we never guess.
 */
export function matchBuilding(venue: string): BuildingId | undefined {
  const text = ` ${venue.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
  let best: { id: BuildingId; length: number } | undefined;
  for (const id of Object.keys(BUILDINGS) as BuildingId[]) {
    for (const label of [BUILDINGS[id].name, BUILDINGS[id].shortName]) {
      const words = label.toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z0-9]+/g, " ").trim();
      if (words && text.includes(` ${words} `) && (!best || words.length > best.length)) {
        best = { id, length: words.length };
      }
    }
  }
  return best?.id;
}

interface LatLng {
  lat: number;
  lng: number;
}

/** Straight-line ("as the crow flies") distance in metres between two points, via the haversine formula. */
function metresBetween(A: LatLng, B: LatLng): number {
  const R = 6_371_000; // Earth radius, metres
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(B.lat - A.lat);
  const dLng = toRad(B.lng - A.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(A.lat)) * Math.cos(toRad(B.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Straight-line distance in metres between two buildings. */
export function distanceMetres(a: BuildingId, b: BuildingId): number {
  return metresBetween(BUILDINGS[a], BUILDINGS[b]);
}

// Real streets aren't straight lines: ×1.3 is a common detour factor for a city grid.
const DETOUR_FACTOR = 1.3;
// ~4.8 km/h, a normal walking pace.
const WALK_METRES_PER_MIN = 80;
// Getting out of a lecture theatre and down the stairs takes a couple of minutes, wherever you're going.
const MIN_WALK_MINS = 2;

/** Unrounded walking minutes for a straight-line distance. */
const walkMinsFor = (metres: number) => (metres * DETOUR_FACTOR) / WALK_METRES_PER_MIN;

/** Estimated walking time in whole minutes (rounded up). The same building gives 0. */
export function walkingMins(from: BuildingId, to: BuildingId): number {
  if (from === to) return 0;
  return Math.max(MIN_WALK_MINS, Math.ceil(walkMinsFor(distanceMetres(from, to))));
}

// ---- Tube estimate ----
// We don't model lines or timetables. A trip is: walk to the station nearest the start,
// ride "as the crow flies" to the station nearest the destination, then walk from there.
// It's deliberately pessimistic: better to leave early than be late.

const STATIONS: (LatLng & { name: string })[] = [
  { name: "Euston Square", lat: 51.5258, lng: -0.1359 },
  { name: "Warren Street", lat: 51.5247, lng: -0.1384 },
  { name: "Goodge Street", lat: 51.5205, lng: -0.1347 },
  { name: "Russell Square", lat: 51.5230, lng: -0.1244 },
  { name: "Euston", lat: 51.5282, lng: -0.1337 },
  { name: "King's Cross St Pancras", lat: 51.5308, lng: -0.1238 },
  { name: "Tottenham Court Road", lat: 51.5165, lng: -0.1310 },
  { name: "Holborn", lat: 51.5174, lng: -0.1201 },
  { name: "Camden Town", lat: 51.5392, lng: -0.1426 },
  { name: "Kentish Town", lat: 51.5503, lng: -0.1405 },
  { name: "Mornington Crescent", lat: 51.5342, lng: -0.1387 },
  { name: "Caledonian Road", lat: 51.5482, lng: -0.1185 },
  { name: "Marble Arch", lat: 51.5136, lng: -0.1586 },
  { name: "East Finchley", lat: 51.5874, lng: -0.1650 },
  { name: "Stratford", lat: 51.5416, lng: -0.0033 },
  { name: "Hackney Wick", lat: 51.5434, lng: -0.0249 },
  { name: "Canary Wharf", lat: 51.5036, lng: -0.0187 },
];

// Average tube speed including stops (~30 km/h).
const TUBE_METRES_PER_MIN = 500;
// Trains don't run in straight lines either, and they're sometimes slow.
const TUBE_OVERESTIMATE = 1.2;
// Waiting on the platform plus (usually) one change.
const TUBE_WAIT_AND_CHANGE_MINS = 5;
// Up to this, we always walk. Past it, we pick whichever of walk and tube is faster.
const MAX_ALWAYS_WALK_MINS = 20;

function nearestStation(p: LatLng) {
  let best = STATIONS[0];
  let bestMetres = Infinity;
  for (const s of STATIONS) {
    const m = metresBetween(p, s);
    if (m < bestMetres) {
      best = s;
      bestMetres = m;
    }
  }
  return { station: best, metres: bestMetres };
}

/** Unrounded tube minutes, or Infinity when both ends share a station (the tube doesn't help). */
function tubeMins(from: BuildingId, to: BuildingId): number {
  const start = nearestStation(BUILDINGS[from]);
  const end = nearestStation(BUILDINGS[to]);
  if (start.station === end.station) return Infinity;
  const ride = (metresBetween(start.station, end.station) / TUBE_METRES_PER_MIN) * TUBE_OVERESTIMATE;
  return walkMinsFor(start.metres) + ride + TUBE_WAIT_AND_CHANGE_MINS + walkMinsFor(end.metres);
}

export type TravelMode = "walk" | "tube";

/**
 * Door-to-door estimate in whole minutes. Walks when that's 20 min or less;
 * otherwise picks whichever of walking and the tube is faster.
 */
export function travelTime(from: BuildingId, to: BuildingId): { mins: number; mode: TravelMode } {
  const walk = walkingMins(from, to);
  if (walk <= MAX_ALWAYS_WALK_MINS) return { mins: walk, mode: "walk" };
  const tube = Math.ceil(tubeMins(from, to));
  return tube < walk ? { mins: tube, mode: "tube" } : { mins: walk, mode: "walk" };
}

/** "🚶 5 min walk" / "🚇 40 min by tube". */
export function travelLabel(mins: number, mode: TravelMode): string {
  return mode === "tube" ? `🚇 ${mins} min by tube` : `🚶 ${mins} min walk`;
}
