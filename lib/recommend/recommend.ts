// Asks Claude what to do in a gap. Server-side only (it uses ANTHROPIC_API_KEY).
//
// Claude gets three tools backed by the provider interfaces, so it fetches only the data it
// needs. The SDK's toolRunner handles the call-tool → send-result loop for us. The final answer
// is constrained by a JSON schema (output_config.format), so we get parseable JSON back.

import Anthropic from "@anthropic-ai/sdk";
import { betaTool } from "@anthropic-ai/sdk/helpers/beta/json-schema";
import { BUILDINGS, walkingMins, type BuildingId } from "../buildings";
import { deadlinesFromList, getProviders } from "../providers";
import type { Deadline, Gap, IsoDateTime, Recommendation, RecommendationOption, SeatAvailability } from "../types";
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

/**
 * `eventIds` collects every society event Claude was shown, so we can enforce type "event".
 * `seatsSeen` keeps the seat counts Claude was shown, so the UI's badges match the reason text.
 */
function makeTools(
  gap: Gap,
  eventIds: Set<string>,
  seatsSeen: Map<string, SeatAvailability>,
  dayGaps: Gap[],
  userDeadlines?: Deadline[],
) {
  const providers = getProviders();
  // The student's own Moodle deadlines (from onboarding) replace the mock ones when present.
  const deadlinesProvider = userDeadlines ? deadlinesFromList(userDeadlines) : providers.deadlines;
  const here = gap.locationId;
  const next = gap.nextLocationId;

  const getFreeSeats = betaTool({
    name: "get_free_seats",
    description:
      "Live free-seat counts for UCL libraries, sorted by walking time from `near`. Each entry includes walk minutes from `near` and onward to the student's next lecture.",
    inputSchema: {
      type: "object",
      properties: {
        near: { type: "string", enum: BUILDING_IDS, description: "Building id to measure walks from." },
      },
      required: ["near"],
      additionalProperties: false,
    },
    run: async ({ near }) => {
      debug("tool get_free_seats", { near });
      const from = isBuildingId(near) ? near : here;
      const seats = await providers.seats.getSeats();
      for (const s of seats) seatsSeen.set(s.libraryId, s);
      const rows = seats
        .map((s) => ({
          libraryId: s.libraryId,
          name: s.name,
          available: s.available,
          total: s.total,
          walkMinsFromNear: walkingMins(from, s.libraryId),
          walkMinsToNextLecture: walkingMins(s.libraryId, next),
          updatedAt: fmt(s.updatedAt),
        }))
        .sort((a, b) => a.walkMinsFromNear - b.walkMinsFromNear);
      return JSON.stringify(rows);
    },
  });

  const getEventsInWindow = betaTool({
    name: "get_events_in_window",
    description:
      "Society events that overlap a time window. Pass ISO 8601 timestamps with offset (e.g. the gap's start and end). Walk minutes are from the student's current location when the venue is on campus.",
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
      const events = await providers.events.getEvents(start, end);
      for (const e of events) eventIds.add(e.id);
      const rows = events.map((e) => ({
        id: e.id,
        society: e.society,
        title: e.title,
        starts: fmt(e.start),
        ends: fmtTime(e.end),
        venue: e.venue,
        walkMinsFromHere: e.buildingId ? walkingMins(here, e.buildingId) : "off campus",
        walkMinsToNextLecture: e.buildingId ? walkingMins(e.buildingId, next) : "off campus",
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

  return [getFreeSeats, getEventsInWindow, getDeadlines];
}

const OPTION_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    type: { type: "string", enum: ["study", "event", "rest"] },
    place: { type: "string" },
    walkMins: { type: "integer" },
    reason: { type: "string" },
    relatedId: { anyOf: [{ type: "string" }, { type: "null" }] },
    libraryId: { anyOf: [{ type: "string", enum: LIBRARY_IDS }, { type: "null" }] },
  },
  required: ["title", "type", "place", "walkMins", "reason", "relatedId", "libraryId"],
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
        walkMinsFromCurrentLocation: gap.walkMins,
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
  seatsSeen: Map<string, SeatAvailability>,
): RecommendationOption {
  const o = raw as Record<string, unknown>;
  if (
    typeof o?.title !== "string" ||
    !["study", "event", "rest"].includes(o.type as string) ||
    typeof o.place !== "string" ||
    typeof o.walkMins !== "number" ||
    typeof o.reason !== "string"
  ) {
    throw new Error("Claude returned a malformed option");
  }
  const isSocietyEvent = typeof o.relatedId === "string" && eventIds.has(o.relatedId);
  const seat = typeof o.libraryId === "string" ? seatsSeen.get(o.libraryId) : undefined;
  return {
    title: o.title,
    type: isSocietyEvent ? "event" : (o.type as RecommendationOption["type"]),
    place: o.place,
    walkMins: o.walkMins,
    reason: o.reason,
    ...(typeof o.relatedId === "string" && o.relatedId ? { relatedId: o.relatedId } : {}),
    ...(seat ? { seats: { available: seat.available, total: seat.total, updatedAt: seat.updatedAt } } : {}),
  };
}

export async function recommendForGap(
  gap: Gap,
  dayGaps: Gap[] = [],
  opts: { deadlines?: Deadline[] } = {},
): Promise<Recommendation> {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY
  const eventIds = new Set<string>();
  const seatsSeen = new Map<string, SeatAvailability>();

  const runner = client.beta.messages.toolRunner({
    model: MODEL,
    max_tokens: 8000,
    max_iterations: 6,
    system: SYSTEM_PROMPT,
    tools: makeTools(gap, eventIds, seatsSeen, dayGaps, opts.deadlines),
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

  // Claude should always call get_free_seats, but if it didn't, fetch counts once for the badges.
  if (seatsSeen.size === 0) {
    for (const s of await getProviders().seats.getSeats()) seatsSeen.set(s.libraryId, s);
  }

  return {
    gapId: gap.id,
    top: toOption(parsed.top, eventIds, seatsSeen),
    alternatives: [
      toOption(parsed.alternatives[0], eventIds, seatsSeen),
      toOption(parsed.alternatives[1], eventIds, seatsSeen),
    ],
    generatedAt: new Date().toISOString(),
  };
}
