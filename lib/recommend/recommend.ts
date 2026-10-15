// Asks Claude what to do in a gap. Server-side only (it uses ANTHROPIC_API_KEY).
//
// Claude gets tools backed by the provider interfaces (plus the student's home, to-dos and mock lunch
// spots), so it fetches only the data it needs. The SDK's toolRunner handles the call-tool → send-result loop for us. The final answer
// is constrained by a JSON schema (output_config.format), so we get parseable JSON back.

import Anthropic from "@anthropic-ai/sdk";
import { betaTool } from "@anthropic-ai/sdk/helpers/beta/json-schema";
import { BUILDINGS, FOOD_SPOTS, travelTime, travelTimeBetween, type BuildingId, type TravelMode } from "../buildings";
import { estimateBusyness } from "../library-busyness";
import { formatDuration } from "../duration";
import { londonDateKey } from "../gaps";
import { formatTime } from "../london-time";
import { lunchInfo } from "../lunch";
import { byDueThenEstimate, repeatLabel, todosForGap } from "../todos";
import { deadlinesFromList, eventsFor, getProviders } from "../providers";
import type {
  BusynessLevel,
  Deadline,
  Gap,
  HomeLocation,
  IsoDateTime,
  Recommendation,
  RecommendationOption,
  Society,
  TimetableEvent,
  Todo,
} from "../types";
import { SYSTEM_PROMPT } from "./system-prompt";

const MODEL = "claude-sonnet-5-5";
// Sonnet 5.5 prices in USD per million tokens, for the dev cost log. Thinking counts as output.
const USD_PER_MTOK_IN = 2;
const USD_PER_MTOK_OUT = 10;
const BUILDING_IDS = Object.keys(BUILDINGS) as BuildingId[];
const LIBRARY_IDS = BUILDING_IDS.filter((id) => BUILDINGS[id].isLibrary);
const RECOMMENDATION_TYPES = ["study", "event", "rest", "home", "food"] as const;
/** Only suggest going home when the round trip still leaves this long there. */
const MIN_MINS_AT_HOME = 30;
/** How many lunch spots get_food_spots returns. */
const FOOD_SPOTS_SHOWN = 6;
const MS_PER_DAY = 86_400_000;

const londonDay = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  weekday: "short",
  day: "numeric",
  month: "short",
});

/** "Fri 16 Oct, 14:30" in London time, so Claude never does timezone maths. */
const fmt = (iso: IsoDateTime) => `${londonDay.format(new Date(iso))}, ${formatTime(iso)}`;
const fmtTime = formatTime;
/** "Fri 16 Oct", for events whose time isn't known. */
const fmtDay = (iso: IsoDateTime) => londonDay.format(new Date(iso));
/** "Thu 15 Oct" for a London day key. Midday UTC is always the same London day. */
const fmtDateKey = (dateKey: string) => londonDay.format(new Date(`${dateKey}T12:00:00Z`));

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

/** What the tools showed Claude, so we can check its answer against it. */
interface Seen {
  /** Every society event shown, so we can enforce type "event". */
  eventIds: Set<string>;
  /** Busyness levels shown, so the UI's badges match the reason text. */
  libraries: Map<string, BusynessLevel>;
  /** Whether get_home said going home is worth it. Undefined = never asked. */
  homeWorthIt?: boolean;
  /** To-do ids shown, so a pick's todoId can only point at a real one. */
  todoIds: Set<string>;
}

function makeTools(
  gap: Gap,
  seen: Seen,
  dayGaps: Gap[],
  userDeadlines?: Deadline[],
  societies?: Society[],
  home?: HomeLocation,
  todos?: Todo[],
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
          seen.libraries.set(libraryId, busyness);
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
      for (const e of events) seen.eventIds.add(e.id);
      const rows = events.map((e) => ({
        id: e.id,
        society: e.society,
        title: e.title,
        starts: e.timeTBC ? `${fmtDay(e.start)}, ${e.partOfDay ?? "time"} (time TBC)` : fmt(e.start),
        ends: e.endEstimated ? "not stated" : fmtTime(e.end),
        venue: e.venue || "not stated",
        ...(e.buildingId
          ? { ...travelFields("FromHere", here, e.buildingId), ...travelFields("ToNextLecture", e.buildingId, next) }
          : { minsFromHere: "unknown (venue isn't a mapped UCL building)", minsToNextLecture: "unknown" }),
        free: e.free ?? "not stated",
        ...(e.membersOnly ? { membersOnly: true } : {}),
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
      const from = BUILDINGS[isBuildingId(near) ? near : here];
      const rows = FOOD_SPOTS.map((f) => {
        const there = travelTimeBetween(from, f);
        const onward = travelTimeBetween(f, BUILDINGS[next]);
        return {
          foodSpotId: f.id,
          name: f.name,
          kind: f.kind,
          price: f.price,
          note: f.note,
          minsFromNear: there.mins,
          modeFromNear: there.mode,
          minsToNextLecture: onward.mins,
          modeToNextLecture: onward.mode,
        };
      })
        .sort((a, b) => a.minsFromNear - b.minsFromNear)
        .slice(0, FOOD_SPOTS_SHOWN);
      return JSON.stringify(rows);
    },
  });

  // Only offered when some to-dos fit this gap (already filtered by todosForGap), like get_home.
  const getTodos = todos?.length ? betaTool({
    name: "get_todos",
    description:
      "The student's own to-do items that could go in this gap, soonest do-before date first. One-off items say when to do them by (daysUntilDoBefore counts London calendar days from the gap; negative = overdue). Repeating items (repeats is set) only appear when they come up on the gap's day and their preferred time or part of day falls in the gap, so they're timely now. Each has the student's time estimate if they gave one, and fitsInGap (whether the estimate fits the gap's usable minutes, or \"unknown\" with no estimate).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    run: async () => {
      debug("tool get_todos", { count: todos.length });
      const gapDay = londonDateKey(gap.start);
      const rows = [...todos].sort(byDueThenEstimate).map((t) => {
        seen.todoIds.add(t.id);
        return {
          id: t.id,
          title: t.title,
          doBefore: t.doBefore ? fmtDateKey(t.doBefore) : null,
          daysUntilDoBefore: t.doBefore
            ? Math.round((Date.parse(`${t.doBefore}T12:00:00Z`) - Date.parse(`${gapDay}T12:00:00Z`)) / MS_PER_DAY)
            : null,
          repeats: t.repeat ? repeatLabel(t.repeat).replace(/^↻ /, "") : null,
          estMinutes: t.estMinutes ?? null,
          estimate: t.estMinutes ? formatDuration(t.estMinutes) : "not estimated",
          fitsInGap: t.estMinutes ? t.estMinutes <= gap.usableMins : "unknown",
        };
      });
      return JSON.stringify(rows);
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
      const start = isBuildingId(from) ? from : here;
      const toHome = travelTimeBetween(BUILDINGS[start], home);
      const toNext = travelTimeBetween(home, BUILDINGS[next]);
      // Gap length minus both legs. Measured from `from`, which is normally where they are now.
      const minsAtHome = Math.round(gap.durationMins - toHome.mins - toNext.mins);
      const worthIt = minsAtHome >= MIN_MINS_AT_HOME;
      // A "go home" pick is only allowed if at least one answer from this tool said yes.
      seen.homeWorthIt = seen.homeWorthIt || worthIt;
      return JSON.stringify({
        home: home.label,
        minsToHome: toHome.mins,
        modeToHome: toHome.mode,
        minsHomeToNextLecture: toNext.mins,
        modeHomeToNextLecture: toNext.mode,
        minsAtHome: Math.max(0, minsAtHome),
        timeAtHome: formatDuration(minsAtHome),
        worthIt,
        ...(worthIt
          ? {}
          : { advice: `Only ${formatDuration(minsAtHome)} at home after the round trip. Don't suggest going home.` }),
      });
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

/** "ECON0013 Econometrics (lecture)". Manual events usually have no module code. */
const eventLabel = (e: TimetableEvent) => `${[e.moduleCode, e.title].filter(Boolean).join(" ")} (${e.kind})`;

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
      nextUp: {
        what: eventLabel(gap.nextEvent),
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
  opts: { deadlines?: Deadline[]; societies?: Society[]; home?: HomeLocation; todos?: Todo[] } = {},
): Promise<Recommendation> {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY
  // Done one-offs out, repeating ones only when they come up in this gap.
  const todos = opts.todos ? todosForGap(opts.todos, gap) : undefined;
  const seen: Seen = { eventIds: new Set(), libraries: new Map(), todoIds: new Set() };

  const runner = client.beta.messages.toolRunner({
    model: MODEL,
    max_tokens: 8000,
    max_iterations: 8,
    system: SYSTEM_PROMPT,
    tools: makeTools(gap, seen, dayGaps, opts.deadlines, opts.societies, opts.home, todos),
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
