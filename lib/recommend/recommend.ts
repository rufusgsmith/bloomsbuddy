// Asks Claude what to do in a gap. Server-side only (it uses ANTHROPIC_API_KEY).
//
// Claude gets three tools backed by the provider interfaces, so it fetches only the data it
// needs. The SDK's toolRunner handles the call-tool → send-result loop for us. The final answer
// is constrained by a JSON schema (output_config.format), so we get parseable JSON back.

import Anthropic from "@anthropic-ai/sdk";
import { betaTool } from "@anthropic-ai/sdk/helpers/beta/json-schema";
import { BUILDINGS, travelTime, type BuildingId, type TravelMode } from "../buildings";
import { estimateBusyness } from "../library-busyness";
import { deadlinesFromList, eventsFor, getProviders } from "../providers";
import type {
  BusynessLevel,
  Deadline,
  Gap,
  IsoDateTime,
  Recommendation,
  RecommendationOption,
  Society,
} from "../types";
import { SYSTEM_PROMPT } from "./system-prompt";

const MODEL = "claude-sonnet-5-5";
// Sonnet 5.5 prices in USD per million tokens, for the dev cost log. Thinking counts as output.
const USD_PER_MTOK_IN = 2;
const USD_PER_MTOK_OUT = 10;
const BUILDING_IDS = Object.keys(BUILDINGS) as BuildingId[];
const LIBRARY_IDS = BUILDING_IDS.filter((id) => BUILDINGS[id].isLibrary);

const londonDateTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
const londonTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  hour: "2-digit",
  minute: "2-digit",
});

/** "Fri 16 Oct, 14:30" in London time, so Claude never does timezone maths. */
const fmt = (iso: IsoDateTime) => londonDateTime.format(new Date(iso));
const fmtTime = (iso: IsoDateTime) => londonTime.format(new Date(iso));

/** Dev-only logging of tool calls and Claude's raw answer. Silent in production. */
const debug = (...args: unknown[]) => {
  if (process.env.NODE_ENV !== "production") {
    console.log("[recommend]", ...args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))));
  }
};

const isBuildingId = (x: unknown): x is BuildingId =>
  typeof x === "string" && (BUILDING_IDS as string[]).includes(x);

/** Libraries we have a busyness estimate for, at the given instant. */
function studySpaces(at: IsoDateTime): { libraryId: BuildingId; busyness: BusynessLevel }[] {
  return LIBRARY_IDS.flatMap((libraryId) => {
    const estimate = estimateBusyness(libraryId, at);
    return estimate ? [{ libraryId, busyness: estimate.level }] : [];
  });
}

/** travelTime as tool-result fields, e.g. suffix "FromNear" gives { minsFromNear, modeFromNear }. */
function travelFields<S extends string>(suffix: S, from: BuildingId, to: BuildingId) {
  const { mins, mode } = travelTime(from, to);
  return { [`mins${suffix}`]: mins, [`mode${suffix}`]: mode } as Record<`mins${S}`, number> &
    Record<`mode${S}`, TravelMode>;
}

/**
 * `eventIds` collects every society event Claude was shown, so we can enforce type "event".
 * `librariesSeen` keeps the busyness levels Claude was shown, so the UI's badges match the reason text.
 */
function makeTools(
  gap: Gap,
  eventIds: Set<string>,
  librariesSeen: Map<string, BusynessLevel>,
  dayGaps: Gap[],
  userDeadlines?: Deadline[],
  societies?: Society[],
) {
  const providers = getProviders();
  // The student's own Moodle deadlines (from onboarding) replace the mock ones when present.
  const deadlinesProvider = userDeadlines ? deadlinesFromList(userDeadlines) : providers.deadlines;
  const eventsProvider = eventsFor(societies);
  const here = gap.locationId;
  const next = gap.nextLocationId;

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
      const from = isBuildingId(near) ? near : here;
      const rows = studySpaces(gap.start)
        .map(({ libraryId, busyness }) => {
          librariesSeen.set(libraryId, busyness);
          return {
            libraryId,
            name: BUILDINGS[libraryId].shortName,
            busyness,
            ...travelFields("FromNear", from, libraryId),
            ...travelFields("ToNextLecture", libraryId, next),
          };
        })
        .sort((a, b) => a.minsFromNear - b.minsFromNear);
      return JSON.stringify(rows);
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
      if (Number.isNaN(Date.parse(start)) || Number.isNaN(Date.parse(end))) {
        return "Error: start and end must be ISO 8601 timestamps with an offset.";
      }
      const events = await eventsProvider.getEvents(start, end);
      for (const e of events) eventIds.add(e.id);
      const rows = events.map((e) => ({
        id: e.id,
        society: e.society,
        title: e.title,
        starts: fmt(e.start),
        ends: fmtTime(e.end),
        venue: e.venue,
        ...(e.buildingId
          ? { ...travelFields("FromHere", here, e.buildingId), ...travelFields("ToNextLecture", e.buildingId, next) }
          : { minsFromHere: "off campus", minsToNextLecture: "off campus" }),
        free: e.free,
        tags: e.tags,
      }));
      return rows.length ? JSON.stringify(rows) : "No society events in that window.";
    },
  });

  const getDeadlines = betaTool({
    name: "get_deadlines",
    description: "The student's upcoming coursework deadlines, due within `within_days` days of the gap starting.",
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
      const days = Math.min(Math.max(Number(within_days) || 7, 1), 60);
      const deadlines = await deadlinesProvider.getDeadlines(gap.start, days);
      const gapStart = Date.parse(gap.start);
      const laterGaps = dayGaps.filter((g) => Date.parse(g.start) > gapStart);
      const rows = deadlines.map((d) => {
        const due = Date.parse(d.due);
        // Do the overlap maths here so Claude doesn't have to (it got this wrong once).
        const laterGapsTodayBeforeDue = laterGaps
          .filter((g) => Date.parse(g.start) < due)
          .map((g) => ({
            when: `${fmtTime(g.start)}–${fmtTime(g.end)}`,
            usableMinsBeforeDue: Math.min(
              g.usableMins,
              Math.round((Math.min(due, Date.parse(g.end)) - Date.parse(g.start)) / 60_000),
            ),
          }));
        return {
          id: d.id,
          module: d.moduleCode,
          title: d.title,
          due: fmt(d.due),
          hoursUntilDueFromGapStart: Math.round((Date.parse(d.due) - Date.parse(gap.start)) / 3_600_000),
          weightPercent: d.weight ?? null,
          estimatedHours: d.estimatedHours ?? null,
          laterGapsTodayBeforeDue,
          totalLaterMinsBeforeDue: laterGapsTodayBeforeDue.reduce((sum, g) => sum + g.usableMinsBeforeDue, 0),
        };
      });
      return rows.length ? JSON.stringify(rows) : `No deadlines in the next ${days} days.`;
    },
  });

  return [getStudySpaces, getEventsInWindow, getDeadlines];
}

const OPTION_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    type: { type: "string", enum: ["study", "event", "rest"] },
    place: { type: "string" },
    travelMins: { type: "integer" },
    travelMode: { type: "string", enum: ["walk", "tube"] },
    reason: { type: "string" },
    relatedId: { anyOf: [{ type: "string" }, { type: "null" }] },
    libraryId: { anyOf: [{ type: "string", enum: LIBRARY_IDS }, { type: "null" }] },
  },
  required: ["title", "type", "place", "travelMins", "travelMode", "reason", "relatedId", "libraryId"],
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

function describeGap(gap: Gap, dayGaps: Gap[]): string {
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
      studentIsAt: { buildingId: gap.locationId, name: where(gap.locationId), source: gap.locationSource },
      justFinished: `${gap.prevEvent.moduleCode} ${gap.prevEvent.title} (${gap.prevEvent.kind}) in ${gap.prevEvent.room}`,
      nextUp: {
        what: `${gap.nextEvent.moduleCode} ${gap.nextEvent.title} (${gap.nextEvent.kind})`,
        starts: fmtTime(gap.nextEvent.start),
        room: gap.nextEvent.room,
        buildingId: gap.nextLocationId,
        travelMinsFromCurrentLocation: gap.travelMins,
        travelMode: gap.travelMode,
      },
      otherGapsToday,
    },
    null,
    2,
  );
}

function toOption(
  raw: unknown,
  eventIds: Set<string>,
  librariesSeen: Map<string, BusynessLevel>,
): RecommendationOption {
  const o = raw as Record<string, unknown>;
  if (
    typeof o?.title !== "string" ||
    !["study", "event", "rest"].includes(o.type as string) ||
    typeof o.place !== "string" ||
    typeof o.travelMins !== "number" ||
    !["walk", "tube"].includes(o.travelMode as string) ||
    typeof o.reason !== "string"
  ) {
    throw new Error("Claude returned a malformed option");
  }
  const isSocietyEvent = typeof o.relatedId === "string" && eventIds.has(o.relatedId);
  const busyness = typeof o.libraryId === "string" ? librariesSeen.get(o.libraryId) : undefined;
  return {
    title: o.title,
    type: isSocietyEvent ? "event" : (o.type as RecommendationOption["type"]),
    place: o.place,
    travelMins: o.travelMins,
    travelMode: o.travelMode as RecommendationOption["travelMode"],
    reason: o.reason,
    ...(typeof o.relatedId === "string" && o.relatedId ? { relatedId: o.relatedId } : {}),
    ...(busyness ? { busyness } : {}),
  };
}

export async function recommendForGap(
  gap: Gap,
  dayGaps: Gap[] = [],
  opts: { deadlines?: Deadline[]; societies?: Society[] } = {},
): Promise<Recommendation> {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY
  const eventIds = new Set<string>();
  const librariesSeen = new Map<string, BusynessLevel>();

  const runner = client.beta.messages.toolRunner({
    model: MODEL,
    max_tokens: 8000,
    max_iterations: 6,
    system: SYSTEM_PROMPT,
    tools: makeTools(gap, eventIds, librariesSeen, dayGaps, opts.deadlines, opts.societies),
    // "low" effort keeps thinking (billed as output) short: picking 3 options doesn't need deep reasoning.
    output_config: { effort: "low", format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
    messages: [
      {
        role: "user",
        content: `Here's my gap. What should I do with it?\n\n${describeGap(gap, dayGaps)}`,
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
  if (librariesSeen.size === 0) {
    for (const s of studySpaces(gap.start)) librariesSeen.set(s.libraryId, s.busyness);
  }

  return {
    gapId: gap.id,
    top: toOption(parsed.top, eventIds, librariesSeen),
    alternatives: [
      toOption(parsed.alternatives[0], eventIds, librariesSeen),
      toOption(parsed.alternatives[1], eventIds, librariesSeen),
    ],
    generatedAt: new Date().toISOString(),
  };
}
