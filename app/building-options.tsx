import { BUILDINGS, type BuildingId } from "@/lib/buildings";

// The UCL building dropdown's options, shared by the timetable editor and the event form.

const BUILDING_IDS = (Object.keys(BUILDINGS) as BuildingId[]).sort((a, b) =>
  BUILDINGS[a].name.localeCompare(BUILDINGS[b].name),
);
// ~70 buildings is a long list, so the dropdown groups them. Halls go together wherever they are.
const BUILDING_GROUPS: { label: string; ids: BuildingId[] }[] = [
  { label: "Bloomsbury", ids: BUILDING_IDS.filter((id) => BUILDINGS[id].area === "bloomsbury" && BUILDINGS[id].kind !== "hall") },
  { label: "UCL East", ids: BUILDING_IDS.filter((id) => BUILDINGS[id].area === "ucl-east") },
  { label: "Canary Wharf", ids: BUILDING_IDS.filter((id) => BUILDINGS[id].area === "canary-wharf") },
  { label: "Halls", ids: BUILDING_IDS.filter((id) => BUILDINGS[id].kind === "hall") },
];

/** <optgroup>s of every UCL building, for inside a <select>. */
export function BuildingOptions() {
  return BUILDING_GROUPS.map((group) => (
    <optgroup key={group.label} label={group.label}>
      {group.ids.map((id) => (
        <option key={id} value={id}>
          {BUILDINGS[id].name}
        </option>
      ))}
    </optgroup>
  ));
}
