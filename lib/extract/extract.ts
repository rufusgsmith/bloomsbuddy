// Reads timetable and Moodle screenshots with Claude vision. Server-side only (uses ANTHROPIC_API_KEY).
//
// One request per screenshot, no tools. The answer is constrained by a JSON schema
// (output_config.format), then checked again here, because a misread screenshot is the
// likeliest thing to go wrong. The student reviews everything before it's saved anyway.

import { BUILDINGS, type BuildingId } from "../buildings";
import { askClaudeJson } from "../claude-json";
import { isDateKey, isWallTime, londonIso } from "../london-time";
import type { DateKey, Deadline, TimetableEvent, WeeklyClass } from "../types";

const BUILDING_IDS = Object.keys(BUILDINGS) as BuildingId[];
const KINDS: TimetableEvent["kind"][] = ["lecture", "seminar", "lab", "tutorial"];
/** Used when Claude can't match a room to a known building. The UI flags it for the student to fix. */
const FALLBACK_BUILDING: BuildingId = "main-building";
/** Moodle often shows a date with no time. Treat it as end of day. */
const DEFAULT_DUE_TIME = "23:59";

export type ImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";
export interface ImageInput {
  mediaType: ImageMediaType;
  /** Base64, without the "data:...;base64," prefix. */
  data: string;
}

const isBuildingId = (x: unknown): x is BuildingId =>
  typeof x === "string" && (BUILDING_IDS as string[]).includes(x);

const str = (x: unknown) => (typeof x === "string" ? x.trim() : "");

/** "9:00" → "09:00". Claude sometimes drops the leading zero. */
function normaliseTime(x: unknown): string {
  const s = str(x);
  return /^\d:\d\d$/.test(s) ? `0${s}` : s;
}

// "medium" effort: reading a dense timetable grid accurately is worth a bit of thinking.
function askClaude(label: string, image: ImageInput, prompt: string, schema: Record<string, unknown>): Promise<unknown> {
  return askClaudeJson(
    label,
    [
      { type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } },
      { type: "text", text: prompt },
    ],
    schema,
    "medium",
  );
}

// ---------- Timetable ----------

const CLASS_SCHEMA = {
  type: "object",
  properties: {
    moduleCode: { type: "string", description: "e.g. ECON0013. Empty string if not shown." },
    title: { type: "string", description: "Module or session name, e.g. Microeconomics" },
    kind: { type: "string", enum: KINDS },
    dayOfWeek: { type: "integer", enum: [1, 2, 3, 4, 5, 6, 7], description: "1 = Monday … 7 = Sunday" },
    startTime: { type: "string", description: "24-hour HH:MM, e.g. 09:00 or 14:00" },
    endTime: { type: "string", description: "24-hour HH:MM" },
    room: { type: "string", description: "Room as written, e.g. Roberts G06 Sir Ambrose Fleming LT" },
    buildingId: { anyOf: [{ type: "string", enum: BUILDING_IDS }, { type: "null" }] },
  },
  required: ["moduleCode", "title", "kind", "dayOfWeek", "startTime", "endTime", "room", "buildingId"],
  additionalProperties: false,
} as const;

const TIMETABLE_SCHEMA = {
  type: "object",
  properties: { classes: { type: "array", items: CLASS_SCHEMA } },
  required: ["classes"],
  additionalProperties: false,
};

const BUILDING_LIST = BUILDING_IDS.map((id) => `- ${id}: ${BUILDINGS[id].name}`).join("\n");

const TIMETABLE_PROMPT = `This is a screenshot of a UCL student's weekly timetable (from UCL Go, the UCL timetable website, or similar).

List every class in it as a weekly pattern: one entry per class per weekday it appears on. If the same class shows on the same weekday more than once (e.g. several weeks of a list view), include it only once.

Rules:
- dayOfWeek: 1 = Monday … 7 = Sunday.
- Times in 24-hour HH:MM.
- kind: pick the closest of lecture, seminar, lab or tutorial ("practical" → lab, "workshop" or "problem class" → tutorial).
- buildingId: match the room to one of these UCL buildings by its building name. Use null if none of them fits; don't guess.
${BUILDING_LIST}
- Only include what is actually in the screenshot. Never invent classes. If there are no classes, return an empty list.`;

export async function extractTimetable(image: ImageInput): Promise<WeeklyClass[]> {
  const parsed = (await askClaude("timetable", image, TIMETABLE_PROMPT, TIMETABLE_SCHEMA)) as { classes?: unknown };
  const raw = Array.isArray(parsed.classes) ? parsed.classes : [];

  const classes: WeeklyClass[] = [];
  raw.forEach((item, i) => {
    const c = item as Record<string, unknown>;
    const startTime = normaliseTime(c.startTime);
    const endTime = normaliseTime(c.endTime);
    const day = Number(c.dayOfWeek);
    // Drop rows we can't place in the week. The student can add them by hand.
    if (!isWallTime(startTime) || !isWallTime(endTime) || endTime <= startTime) return;
    if (!Number.isInteger(day) || day < 1 || day > 7) return;
    const matched = isBuildingId(c.buildingId);
    classes.push({
      id: `cls-${Date.now().toString(36)}-${i}`,
      moduleCode: str(c.moduleCode).toUpperCase(),
      title: str(c.title) || str(c.moduleCode) || "Class",
      kind: KINDS.includes(c.kind as TimetableEvent["kind"]) ? (c.kind as TimetableEvent["kind"]) : "lecture",
      dayOfWeek: day,
      startTime,
      endTime,
      room: str(c.room),
      buildingId: matched ? (c.buildingId as BuildingId) : FALLBACK_BUILDING,
      ...(matched ? {} : { buildingGuessed: true }),
    });
  });

  return classes.sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime));
}

// ---------- Moodle deadlines ----------

const DEADLINE_SCHEMA = {
  type: "object",
  properties: {
    moduleCode: { type: "string", description: "e.g. ECON0019. Empty string if not shown." },
    title: { type: "string", description: "Assignment or quiz name" },
    dueDate: { type: "string", description: "YYYY-MM-DD" },
    dueTime: { anyOf: [{ type: "string", description: "24-hour HH:MM" }, { type: "null" }] },
    weightPercent: { anyOf: [{ type: "number" }, { type: "null" }] },
  },
  required: ["moduleCode", "title", "dueDate", "dueTime", "weightPercent"],
  additionalProperties: false,
} as const;

const DEADLINES_SCHEMA = {
  type: "object",
  properties: { deadlines: { type: "array", items: DEADLINE_SCHEMA } },
  required: ["deadlines"],
  additionalProperties: false,
};

function deadlinesPrompt(todayKey: DateKey): string {
  return `This is a screenshot of a UCL student's Moodle timeline (or calendar / upcoming events).

Today is ${todayKey} (London). List every assignment, quiz or other deadline in it.

Rules:
- dueDate as YYYY-MM-DD. If the year isn't shown, pick the first date on or after today.
- dueTime in 24-hour HH:MM, or null if no time is shown.
- moduleCode: the UCL module code (like ECON0019) if you can see it, often in the course name. Otherwise an empty string.
- weightPercent only if the screenshot states it; otherwise null.
- Only include what is actually in the screenshot. Never invent deadlines. If there are none, return an empty list.`;
}

export async function extractDeadlines(image: ImageInput, todayKey: DateKey): Promise<Deadline[]> {
  const parsed = (await askClaude("deadlines", image, deadlinesPrompt(todayKey), DEADLINES_SCHEMA)) as {
    deadlines?: unknown;
  };
  const raw = Array.isArray(parsed.deadlines) ? parsed.deadlines : [];

  const deadlines: Deadline[] = [];
  raw.forEach((item, i) => {
    const d = item as Record<string, unknown>;
    const dueDate = str(d.dueDate);
    const dueTime = normaliseTime(d.dueTime);
    if (!isDateKey(dueDate)) return;
    const weight = typeof d.weightPercent === "number" ? d.weightPercent : undefined;
    deadlines.push({
      id: `dl-${Date.now().toString(36)}-${i}`,
      moduleCode: str(d.moduleCode).toUpperCase(),
      title: str(d.title) || "Deadline",
      due: londonIso(dueDate, isWallTime(dueTime) ? dueTime : DEFAULT_DUE_TIME),
      ...(weight !== undefined ? { weight } : {}),
      source: "moodle",
    });
  });

  return deadlines.sort((a, b) => Date.parse(a.due) - Date.parse(b.due));
}
