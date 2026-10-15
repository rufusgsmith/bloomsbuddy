// Asks Claude what to do in a gap. Server-side only (it uses ANTHROPIC_API_KEY).
//
// Claude gets tools backed by the provider interfaces (plus the student's home, to-dos and mock lunch
// spots), so it fetches only the data it needs. The SDK's toolRunner handles the call-tool → send-result loop for us. The final answer
// is constrained by a JSON schema (output_config.format), so we get parseable JSON back.

import Anthropic from "@anthropic-ai/sdk";
import { betaTool } from "@anthropic-ai/sdk/helpers/beta/json-schema";
import { BUILDINGS } from "../buildings";
import { MODEL } from "../claude-json";
import { formatDuration } from "../duration";
import { lunchInfo } from "../lunch";
import { deadlinesFromList, eventsFor, getProviders } from "../providers";
import { todosForGap } from "../todos";
import type {
  BuildingId,
  Deadline,
  Gap,
  HomeLocation,
  Recommendation,
  RecommendationOption,
  Society,
  Todo,
} from "../types";
import { SYSTEM_PROMPT } from "./system-prompt";
import {
  BUILDING_IDS,
  deadlineRows,
  eventLabel,
  eventRows,
  fmt,
  fmtTime,
  foodRows,
  homeRow,
  isOwnPlan,
  LIBRARY_IDS,
  newSeen,
  studySpaceRows,
  studySpaces,
  todoRows,
  USD_PER_MTOK_IN,
  USD_PER_MTOK_OUT,
  type Seen,
} from "./tools";

const RECOMMENDATION_TYPES = ["study", "event", "rest", "home", "food"] as const;

/** Dev-only logging of tool calls and Claude's raw answer. Silent in production. */
const debug = (...args: unknown[]) => {
  if (process.env.NODE_ENV !== "production") {
    console.log("[recommend]", ...args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))));
  }
};

// ---------- Gap tools ----------

function makeTools(
  gap: Gap,
  seen: Seen,
  dayGaps: Gap[],
  userDeadlines?: Deadline[],
  societies?: Society[],
  home?: HomeLocation,
  todos?: Todo[],
  addedEventIds: ReadonlySet<string> = new Set(),
) {
  const providers = getProviders();
  // The student's own Moodle deadlines (from onboarding) replace the mock ones when present.
  const deadlinesProvider = userDeadlines ? deadlinesFromList(userDeadlines) : providers.deadlines;
  const eventsProvider = eventsFor(societies);

  const getStudySpaces = betaTool({
    name: "get_study_spaces",
    description:
      "UCL libraries with how busy each one usually is at the start of the gap (quiet, moderate, busy or packed), sorted by travel time from `near`. Busyness is an estimate from typical patterns, not a live count. Each entry includes travel minutes and mode (walk or tube) from `near` and onward to the student's next lecture.",
    inputSchema: {
      type: "object",
      properties: {
        near: { type: "string", enum: BUILDING_IDS, description: "Building id to measure travel from." },
      },
      required: ["near"],
      additionalProperties: false,
    },
    run: async ({ near }) => {
      debug("tool get_study_spaces", { near });
      return studySpaceRows(gap, near, seen);
    },
  });

  const getEventsInWindow = betaTool({
    name: "get_events_in_window",
    description:
      "Society events that overlap a time window. Pass ISO 8601 timestamps with offset (e.g. the gap's start and end). Travel minutes and mode (walk or tube) are from the student's current location when the venue is a UCL building.",
    inputSchema: {
      type: "object",
      properties: {
        start: { type: "string", description: "ISO 8601 with offset, e.g. 2026-10-16T14:00:00+01:00" },
        end: { type: "string", description: "ISO 8601 with offset" },
      },
      required: ["start", "end"],
      additionalProperties: false,
    },
    run: async ({ start, end }) => {
      debug("tool get_events_in_window", { start, end });
      return eventRows(eventsProvider, gap, start, end, addedEventIds, seen);
    },
  });

  const getDeadlines = betaTool({
    name: "get_deadlines",
    description:
      "The student's upcoming coursework deadlines, due within `within_days` days of the gap starting. location is null, or the place the work has to happen (a lab, a studio) with travel minutes there from where the student is (minsThere), on to their next lecture (minsOnToNext), and minsAtPlace: how long they'd get there in this gap.",
    inputSchema: {
      type: "object",
      properties: {
        within_days: { type: "integer", description: "How many days ahead to look, e.g. 7." },
      },
      required: ["within_days"],
      additionalProperties: false,
    },
    run: async ({ within_days }) => {
      debug("tool get_deadlines", { within_days });
      return deadlineRows(deadlinesProvider, gap, within_days, dayGaps);
    },
  });

  const getFoodSpots = betaTool({
    name: "get_food_spots",
    description:
      "Places to grab lunch near campus, sorted by travel time from `near`. Each has a kind (cafe, canteen, takeaway, meal-deal), a price band, a short note, and travel minutes and mode from `near` and onward to the student's next lecture. The notes are typical patterns, not live queue data.",
    inputSchema: {
      type: "object",
      properties: {
        near: { type: "string", enum: BUILDING_IDS, description: "Building id to measure travel from." },
      },
      required: ["near"],
      additionalProperties: false,
    },
    run: async ({ near }) => {
      debug("tool get_food_spots", { near });
      return foodRows(gap, near);
    },
  });

  // Only offered when some to-dos fit this gap (already filtered by todosForGap), like get_home.
  const getTodos = todos?.length ? betaTool({
    name: "get_todos",
    description:
      "The student's own to-do items that could go in this gap, soonest do-before date first. One-off items say when to do them by (daysUntilDoBefore counts London calendar days from the gap; negative = overdue). Repeating items (repeats is set) only appear when they come up on the gap's day and their preferred time or part of day falls in the gap, so they're timely now. Each has the student's time estimate if they gave one. location is null, or the place it has to be done with travel minutes there from where the student is (minsThere), on to their next lecture (minsOnToNext), and minsAtPlace: how long they'd get there. fitsInGap says whether the estimate fits (in minsAtPlace when there's a location, else the gap's usable minutes), or \"unknown\" with no estimate.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    run: async () => {
      debug("tool get_todos", { count: todos.length });
      return todoRows(gap, todos, seen);
    },
  }) : null;

  const tools = [getStudySpaces, getEventsInWindow, getDeadlines, getFoodSpots, ...(getTodos ? [getTodos] : [])];
  if (!home) return tools;

  const getHome = betaTool({
    name: "get_home",
    description:
      "How long it takes to get from `from` to the student's home and from home on to their next lecture, and how many minutes they'd actually get at home in this gap. worthIt is false when that's under 30 minutes: then never suggest going home.",
    inputSchema: {
      type: "object",
      properties: {
        from: { type: "string", enum: BUILDING_IDS, description: "Building id the student would leave from." },
      },
      required: ["from"],
      additionalProperties: false,
    },
    run: async ({ from }) => {
      debug("tool get_home", { from });
      return homeRow(gap, home, from, seen);
    },
  });

  return [...tools, getHome];
}

const OPTION_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    type: { type: "string", enum: RECOMMENDATION_TYPES },
    place: { type: "string" },
    travelMins: { type: "integer" },
    travelMode: { type: "string", enum: ["walk", "tube"] },
    reason: { type: "string" },
    relatedId: { anyOf: [{ type: "string" }, { type: "null" }] },
    libraryId: { anyOf: [{ type: "string", enum: LIBRARY_IDS }, { type: "null" }] },
    todoId: { anyOf: [{ type: "string" }, { type: "null" }] },
  },
  required: ["title", "type", "place", "travelMins", "travelMode", "reason", "relatedId", "libraryId", "todoId"],
  additionalProperties: false,
} as const;

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    top: OPTION_SCHEMA,
    alternatives: { type: "array", items: OPTION_SCHEMA },
  },
  required: ["top", "alternatives"],
  additionalProperties: false,
};


function describeGap(gap: Gap, dayGaps: Gap[], home?: HomeLocation, todos?: Todo[]): string {
  const where = (id: BuildingId) => BUILDINGS[id].name;
  // Other gaps today, so Claude can save deep work for a longer gap. Kept compact: ~30 tokens each.
  const otherGapsToday = dayGaps
    .filter((g) => g.id !== gap.id)
    .map((g) => ({
      when: `${fmtTime(g.start)}–${fmtTime(g.end)}`,
      usableMins: g.usableMins,
      at: BUILDINGS[g.locationId].shortName,
      isLater: Date.parse(g.start) > Date.parse(gap.start),
    }));
  return JSON.stringify(
    {
      gapStartISO: gap.start,
      gapEndISO: gap.end,
      gap: `${fmt(gap.start)} – ${fmtTime(gap.end)}`,
      durationMins: gap.durationMins,
      usableMins: gap.usableMins,
      // Pre-formatted, so Claude quotes "3 hours and 12 minutes" rather than "192 minutes".
      length: formatDuration(gap.durationMins),
      usableTime: formatDuration(gap.usableMins),
      studentIsAt: { buildingId: gap.locationId, name: where(gap.locationId), source: gap.locationSource },
      justFinished: `${eventLabel(gap.prevEvent)}${gap.prevEvent.room ? ` in ${gap.prevEvent.room}` : ""}`,
      ...(isOwnPlan(gap.prevEvent) ? { justFinishedIsOwnPlan: true } : {}),
      nextUp: {
        what: eventLabel(gap.nextEvent),
        ...(isOwnPlan(gap.nextEvent) ? { ownPlan: true } : {}),
        starts: fmtTime(gap.nextEvent.start),
        room: gap.nextEvent.room || undefined,
        buildingId: gap.nextLocationId,
        travelMinsFromCurrentLocation: gap.travelMins,
        travelMode: gap.travelMode,
      },
      otherGapsToday,
      // Worked out here, not by Claude: it overlaps 12:00–14:00 and there was no lunch-length gap earlier.
      lunch: lunchInfo(gap, dayGaps),
      home: home ? `Saved: ${home.label}. Call get_home to see if it's worth going back.` : "Not set",
      todos: todos?.length ? `${todos.length} that could fit. Call get_todos.` : "None",
    },
    null,
    2,
  );
}

function toOption(raw: unknown, seen: Seen): RecommendationOption {
  const o = raw as Record<string, unknown>;
  if (
    typeof o?.title !== "string" ||
    !(RECOMMENDATION_TYPES as readonly unknown[]).includes(o.type) ||
    typeof o.place !== "string" ||
    typeof o.travelMins !== "number" ||
    !["walk", "tube"].includes(o.travelMode as string) ||
    typeof o.reason !== "string"
  ) {
    throw new Error("Claude returned a malformed option");
  }
  // Never ship a "go home" that breaks the 30-minute rule. Throwing shows the UI's retry fallback.
  if (o.type === "home" && !seen.homeWorthIt) {
    throw new Error("Claude suggested going home without get_home saying it's worth it");
  }
  const isSocietyEvent = typeof o.relatedId === "string" && seen.eventIds.has(o.relatedId);
  const busyness = typeof o.libraryId === "string" ? seen.libraries.get(o.libraryId) : undefined;
  // An unknown todoId just loses its badge. Not worth failing the whole answer over.
  const todoId = typeof o.todoId === "string" && seen.todoIds.has(o.todoId) ? o.todoId : undefined;
  return {
    title: o.title,
    type: isSocietyEvent ? "event" : (o.type as RecommendationOption["type"]),
    place: o.place,
    travelMins: o.travelMins,
    travelMode: o.travelMode as RecommendationOption["travelMode"],
    reason: o.reason,
    ...(typeof o.relatedId === "string" && o.relatedId ? { relatedId: o.relatedId } : {}),
    ...(busyness ? { busyness } : {}),
    ...(todoId ? { todoId } : {}),
  };
}

export async function recommendForGap(
  gap: Gap,
  dayGaps: Gap[] = [],
  opts: {
    deadlines?: Deadline[];
    societies?: Society[];
    home?: HomeLocation;
    todos?: Todo[];
    /** Society event ids the student added to their calendar. */
    addedEventIds?: string[];
  } = {},
): Promise<Recommendation> {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY
  // Done one-offs out, repeating ones only when they come up in this gap.
  const todos = opts.todos ? todosForGap(opts.todos, gap) : undefined;
  const seen = newSeen();

  const runner = client.beta.messages.toolRunner({
    model: MODEL,
    max_tokens: 8000,
    max_iterations: 8,
    system: SYSTEM_PROMPT,
    tools: makeTools(gap, seen, dayGaps, opts.deadlines, opts.societies, opts.home, todos, new Set(opts.addedEventIds)),
    // "low" effort keeps thinking (billed as output) short: picking 3 options doesn't need deep reasoning.
    output_config: { effort: "low", format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
    messages: [
      {
        role: "user",
        content: `Here's my gap. What should I do with it?\n\n${describeGap(gap, dayGaps, opts.home, todos)}`,
      },
    ],
  });

  // Iterate rather than await, so we can add up token usage across every request in the tool loop.
  let requests = 0;
  let tokensIn = 0;
  let tokensOut = 0;
  for await (const message of runner) {
    requests++;
    tokensIn += message.usage.input_tokens;
    tokensOut += message.usage.output_tokens;
  }
  const final = await runner.done();
  const usd = (tokensIn * USD_PER_MTOK_IN + tokensOut * USD_PER_MTOK_OUT) / 1_000_000;
  debug(`usage ${gap.id}: ${requests} requests, ${tokensIn} in / ${tokensOut} out ≈ $${usd.toFixed(4)}`);

  if (final.stop_reason !== "end_turn") {
    throw new Error(`Claude stopped early (${final.stop_reason})`);
  }
  const text = final.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  debug(`raw answer for ${gap.id}:`, text);
  const parsed = JSON.parse(text) as { top: unknown; alternatives: unknown[] };
  if (!Array.isArray(parsed.alternatives) || parsed.alternatives.length !== 2) {
    throw new Error(`Expected 2 alternatives, got ${parsed.alternatives?.length}`);
  }

  // Claude should always call get_study_spaces, but if it didn't, estimate once for the badges.
  if (seen.libraries.size === 0) {
    for (const s of studySpaces(gap.start)) seen.libraries.set(s.libraryId, s.busyness);
  }

  return {
    gapId: gap.id,
    top: toOption(parsed.top, seen),
    alternatives: [toOption(parsed.alternatives[0], seen), toOption(parsed.alternatives[1], seen)],
    generatedAt: new Date().toISOString(),
  };
}
