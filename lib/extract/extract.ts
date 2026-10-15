// Reads timetable and Moodle screenshots (Claude vision) or pasted/typed text. Server-side only
// (uses ANTHROPIC_API_KEY).
//
// One request per screenshot or text, no tools. The answer is constrained by a JSON schema
// (output_config.format), then checked again here, because a misread screenshot is the
// likeliest thing to go wrong. The student reviews everything before it's saved anyway.

import { BUILDINGS, type BuildingId } from "../buildings";
import { askClaudeJson } from "../claude-json";
import { isDateKey, isWallTime, londonIso } from "../london-time";
import type { ClassKind, DateKey, Deadline, WeeklyClass } from "../types";

const BUILDING_IDS = Object.keys(BUILDINGS) as BuildingId[];
const KINDS: ClassKind[] = ["lecture", "seminar", "lab", "tutorial"];
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
/** A screenshot, or text the student pasted or typed. Same schema and checks either way. */
export type ExtractInput = { image: ImageInput } | { text: string };

const isBuildingId = (x: unknown): x is BuildingId =>
  typeof x === "string" && (BUILDING_IDS as string[]).includes(x);

const str = (x: unknown) => (typeof x === "string" ? x.trim() : "");

/** "9:00" → "09:00". Claude sometimes drops the leading zero. */
function normaliseTime(x: unknown): string {
  const s = str(x);
  return /^\d:\d\d$/.test(s) ? `0${s}` : s;
}

// "medium" effort: reading a dense timetable grid accurately is worth a bit of thinking.
// Text is wrapped in tags so Claude treats it as data to read, not instructions.
function askClaude(label: string, input: ExtractInput, prompt: string, schema: Record<string, unknown>): Promise<unknown> {
  const source =
    "image" in input
      ? { type: "image" as const, source: { type: "base64" as const, media_type: input.image.mediaType, data: input.image.data } }
      : { type: "text" as const, text: `<student_text>\n${input.text}\n</student_text>` };
  return askClaudeJson(label, [source, { type: "text", text: prompt }], schema, "medium");
}

const isText = (input: ExtractInput) => "text" in input;

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

function timetablePrompt(input: ExtractInput): string {
  const intro = isText(input)
    ? `Above is text a UCL student pasted or typed about their weekly timetable. It may be copied from UCL Go or the UCL timetable website, or written casually (e.g. "econ lecture mon 10-12 roberts G06").`
    : "This is a screenshot of a UCL student's weekly timetable (from UCL Go, the UCL timetable website, or similar).";
  const textRules = isText(input)
    ? `
- Casual day names ("mon", "weds", "thurs") and times ("2pm", "10-12") are fine to interpret.
- If no end time is given, assume the class lasts 1 hour.
- If no room is given, use an empty string for room and null for buildingId.`
    : "";
  return `${intro}

List every class in it as a weekly pattern: one entry per class per weekday it appears on. If the same class shows on the same weekday more than once (e.g. several weeks of a list view), include it only once.

Rules:
- dayOfWeek: 1 = Monday … 7 = Sunday.
- Times in 24-hour HH:MM.
- kind: pick the closest of lecture, seminar, lab or tutorial ("practical" → lab, "workshop" or "problem class" → tutorial).
- buildingId: match the room to one of these UCL buildings by its building name. Use null if none of them fits; don't guess.
${BUILDING_LIST}
- Only include what is actually in the ${isText(input) ? "text" : "screenshot"}. Never invent classes. If there are no classes, return an empty list.${textRules}`;
}

export async function extractTimetable(input: ExtractInput): Promise<WeeklyClass[]> {
  const parsed = (await askClaude("timetable", input, timetablePrompt(input), TIMETABLE_SCHEMA)) as { classes?: unknown };
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
      kind: KINDS.includes(c.kind as ClassKind) ? (c.kind as ClassKind) : "lecture",
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

function deadlinesPrompt(input: ExtractInput, todayKey: DateKey): string {
  const intro = isText(input)
    ? `Above is text a UCL student pasted or typed about their deadlines. It may be copied from Moodle, or written casually (e.g. "econ essay due next fri 5pm").`
    : "This is a screenshot of a UCL student's Moodle timeline (or calendar / upcoming events).";
  const textRules = isText(input)
    ? `
- Resolve relative dates ("next Friday", "tomorrow") against today.`
    : "";
  return `${intro}

Today is ${todayKey} (London). List every assignment, quiz or other deadline in it.

Rules:
- dueDate as YYYY-MM-DD. If the year isn't shown, pick the first date on or after today.
- dueTime in 24-hour HH:MM, or null if no time is shown.
- moduleCode: the UCL module code (like ECON0019) if you can see it, often in the course name. Otherwise an empty string.
- weightPercent only if it is stated; otherwise null.
- Only include what is actually in the ${isText(input) ? "text" : "screenshot"}. Never invent deadlines. If there are none, return an empty list.${textRules}`;
}

export async function extractDeadlines(input: ExtractInput, todayKey: DateKey): Promise<Deadline[]> {
  const parsed = (await askClaude("deadlines", input, deadlinesPrompt(input, todayKey), DEADLINES_SCHEMA)) as {
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
