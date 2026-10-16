// The chat assistant on Today. Server-side only (it uses ANTHROPIC_API_KEY).
//
// Built to answer in ONE Claude call where it can: the student's week (events and free gaps), deadlines
// and to-dos go straight into the prompt, so "what should I do Saturday?" needs no tool round trip.
// Tools are only for extras (study spaces, food, society events, home, days beyond the week); they
// take a start and end instead of a fixed gap. The fixed part (prompt + tools) is prompt-cached.
// propose_event / propose_todo don't save anything: they're checked in code, then shown as cards
// the student can Add or Dismiss.

import { randomUUID } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { betaTool } from "@anthropic-ai/sdk/helpers/beta/json-schema";
import { BUILDINGS, nearestBuilding, travelTime, type BuildingId } from "../buildings";
import { findClashes, clashMessage } from "../clashes";
import { MODEL } from "../claude-json";
import { formatDuration, formatDurationShort } from "../duration";
import { findGaps, londonDateKey } from "../gaps";
import { addDays, formatTime, isDateKey, londonIso } from "../london-time";
import { EVENT_KINDS, eventFromDraft, validateEventDraft, type EventDraft } from "../manual-events";
import { locationLabel } from "../location";
import { deadlinesFromList, eventsFor, getProviders } from "../providers";
import { byDueThenEstimate, EST_STEP, isDoneNow, MAX_EST_MINS, repeatLabel, validateTodoDraft, type TodoDraft } from "../todos";
import type { ChatProposal, DateKey, Deadline, EventKind, TimetableEvent, Todo } from "../types";
import {
  BUILDING_IDS,
  eventLabel,
  eventRows,
  fmt,
  fmtDateKey,
  foodRows,
  homeRow,
  isBuildingId,
  isOwnPlan,
  newSeen,
  studySpaceRows,
  USD_PER_MTOK_IN,
  USD_PER_MTOK_OUT,
  type ToolWindow,
} from "./tools";
import type { StudentContext } from "./request";
import { CHAT_PROMPT } from "./system-prompt";

/** Cards per reply, so one message can't flood the chat. */
const MAX_PROPOSALS = 3;
const MS_PER_MIN = 60_000;
const MS_PER_DAY = 86_400_000;
/** Days of schedule written into the prompt. Later ones come from get_schedule. */
const WEEK_DAYS = 7;
/** Days listed with their date and offset, so Claude never works out dates or the BST switch. */
const DATE_LIST_DAYS = 14;
const DEADLINE_DAYS = 30;
// Prompt-caching prices, as multiples of the input price.
const CACHE_WRITE = 1.25;
const CACHE_READ = 0.1;
/** Claude calls per question, at most. */
const MAX_CALLS = 6;
/** How a propose_* result starts when the card was made. */
const SHOWN = "Shown as a card.";

export interface ChatDay {
  dateKey: DateKey;
  events: TimetableEvent[];
  /** All-day society strips as text ("Seven Sisters hike (Time TBC)"). Not busy time. */
  allDay?: string[];
}

export interface ChatContext extends StudentContext {
  /** The days the browser can see (timetable plus the student's own events), for get_schedule. */
  days: ChatDay[];
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

const debug = (...args: unknown[]) => {
  if (process.env.NODE_ENV !== "production") {
    console.log("[chat]", ...args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))));
  }
};

const fmtTime = formatTime;
const byStart = (a: TimetableEvent, b: TimetableEvent) => Date.parse(a.start) - Date.parse(b.start);

/** Where an event is, as a building id the tools understand. Undefined when it has no location. */
const spotOf = (e: TimetableEvent): BuildingId | undefined =>
  e.buildingId ?? (e.place ? nearestBuilding(e.place) : undefined);

const daysFrom = (from: DateKey, to: DateKey) =>
  Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / MS_PER_DAY);

/** One event as a compact line: "09:00–10:00 ECON0013 Micro (lecture), Roberts 106 @roberts-building". */
function eventLine(e: TimetableEvent): string {
  const spot = spotOf(e);
  const where = [e.room, spot ? `@${spot}` : e.place?.label].filter(Boolean).join(" ");
  return `${fmtTime(e.start)}–${fmtTime(e.end)} ${eventLabel(e)}${where ? `, ${where}` : ""}${isOwnPlan(e) ? " [own plan]" : ""}`;
}

/** A day's events and free gaps as indented lines. Undefined events = not loaded. */
function scheduleLines(events: TimetableEvent[] | undefined, allDay: string[] = []): string[] {
  if (!events) return ["  (not loaded)"];
  const allDayLines = allDay.map((a) => `  all day: ${a}`);
  if (!events.length) return [...allDayLines, allDayLines.length ? "  nothing timed" : "  nothing on"];
  const sorted = [...events].sort(byStart);
  return [
    ...allDayLines,
    ...sorted.map((e) => `  ${eventLine(e)}`),
    ...findGaps(sorted).map(
      (g) => `  free ${fmtTime(g.start)}–${fmtTime(g.end)} (${formatDurationShort(g.usableMins)} usable after the walk)`,
    ),
  ];
}

/**
 * Everything the student's usual questions need, as compact text: the week (detailed), more dates
 * with their offsets, deadlines and open to-dos. A few hundred tokens instead of a tool round trip.
 */
function studentContext(ctx: ChatContext, today: DateKey, nowIso: string, deadlines: Deadline[]): string {
  const dayOf = (k: DateKey) => ctx.days.find((d) => d.dateKey === k);
  const days = Array.from({ length: DATE_LIST_DAYS }, (_, i) => {
    const key = addDays(today, i);
    const label = i === 0 ? " (today)" : i === 1 ? " (tomorrow)" : "";
    const head = `${fmtDateKey(key)} = ${key}, offset ${londonIso(key, "12:00").slice(-6)}${label}`;
    return i < WEEK_DAYS ? [`${head}:`, ...scheduleLines(dayOf(key)?.events, dayOf(key)?.allDay)].join("\n") : head;
  });

  const deadlineLines = deadlines.map((d) => {
    const inDays = daysFrom(today, londonDateKey(d.due));
    const extra = [
      d.weight ? `${d.weight}%` : "",
      d.estimatedHours ? `~${formatDuration(d.estimatedHours * 60)}` : "",
      d.location ? `at ${locationLabel(d.location)}` : "",
    ].filter(Boolean);
    return `- ${d.moduleCode} ${d.title}: due ${fmt(d.due)} (${inDays === 0 ? "today" : `in ${inDays} days`})${extra.length ? `. ${extra.join(", ")}` : ""}`;
  });

  const todos = (ctx.todos ?? []).filter((t) => !isDoneNow(t, today)).sort(byDueThenEstimate);
  const todoLine = (t: Todo) =>
    [
      `- ${t.title}`,
      t.estMinutes ? formatDuration(t.estMinutes) : "no estimate",
      t.doBefore ? `do before ${fmtDateKey(t.doBefore)}${t.doBefore < today ? " (overdue)" : ""}` : "",
      t.repeat ? repeatLabel(t.repeat).replace(/^↻ /, "repeats ") : "",
      t.location ? `at ${locationLabel(t.location)}` : "",
    ]
      .filter(Boolean)
      .join(", ");

  return [
    `## Right now`,
    `It's ${fmt(nowIso)} in London. Home: ${ctx.home ? ctx.home.label : "not set"}.`,
    ctx.societies?.length ? `Societies: ${ctx.societies.map((s) => s.name).join(", ")}.` : "",
    `## Their days (date = YYYY-MM-DD, ISO offset; @ = building id)`,
    ...days,
    `## Deadlines (next ${DEADLINE_DAYS} days)`,
    ...(deadlineLines.length ? deadlineLines : ["None."]),
    `## To-dos (open)`,
    ...(todos.length ? todos.map(todoLine) : ["None."]),
  ]
    .filter(Boolean)
    .join("\n");
}

function makeChatTools(ctx: ChatContext, proposals: ChatProposal[], today: DateKey) {
  const seen = newSeen();
  const eventsProvider = eventsFor(ctx.societies);
  const addedEventIds = new Set(ctx.addedEventIds);
  const dayEvents = (dateKey: DateKey) => ctx.days.find((d) => d.dateKey === dateKey)?.events;
  const homeSpot = ctx.home ? nearestBuilding(ctx.home) : undefined;

  /**
   * A window as the tools see it. The student starts at `from`, else at the event before it that
   * day, else near home, else the Wilkins Building. "Next" is the event after it, else back where they started.
   */
  function windowFor(start: string, end: string, from: unknown): ToolWindow | string {
    const s = Date.parse(start);
    const e = Date.parse(end);
    if (Number.isNaN(s) || Number.isNaN(e) || e <= s) {
      return "Error: start and end must be ISO 8601 timestamps with an offset, end after start.";
    }
    const events = [...(dayEvents(londonDateKey(start)) ?? [])].sort(byStart);
    const prev = events.filter((x) => Date.parse(x.end) <= s).map(spotOf).filter(Boolean).at(-1);
    const next = events.filter((x) => Date.parse(x.start) >= e).map(spotOf).find(Boolean);
    const locationId: BuildingId = isBuildingId(from) ? from : (prev ?? homeSpot ?? "main-building");
    const nextLocationId = next ?? locationId;
    const durationMins = Math.round((e - s) / MS_PER_MIN);
    return {
      start,
      end,
      durationMins,
      usableMins: Math.max(0, durationMins - travelTime(locationId, nextLocationId).mins),
      locationId,
      nextLocationId,
    };
  }

  const windowProps = {
    start: { type: "string", description: "Window start, ISO 8601 with offset, e.g. 2026-10-17T14:00:00+01:00" },
    end: { type: "string", description: "Window end, ISO 8601 with offset" },
    from: {
      type: "string",
      description: "Optional building id they start from. Leave out to use where they'll be.",
    },
  } as const;

  /** Runs a window tool, or returns the window's error to Claude. */
  const inWindow =
    (name: string, body: (win: ToolWindow, input: { start: string; end: string; from?: string }) => string | Promise<string>) =>
    async (input: { start: string; end: string; from?: string }) => {
      debug(`tool ${name}`, input);
      const win = windowFor(input.start, input.end, input.from);
      return typeof win === "string" ? win : body(win, input);
    };

  const getSchedule = betaTool({
    name: "get_schedule",
    description:
      "Only for days beyond the week in the prompt. What's on one London day: the student's classes and their own plans (ownPlan: true = something they added, like office hours or a society event; treat it as fixed), with times and where, plus the free gaps between them (usable minutes after the walk to the next thing). Time before the first event and after the last is free too.",
    inputSchema: {
      type: "object",
      properties: { date: { type: "string", description: "London day, YYYY-MM-DD" } },
      required: ["date"],
      additionalProperties: false,
    },
    run: async ({ date }) => {
      debug("tool get_schedule", { date });
      if (!isDateKey(date)) return "Error: date must be YYYY-MM-DD.";
      const events = dayEvents(date);
      const allDay = ctx.days.find((d) => d.dateKey === date)?.allDay;
      if (!events) return `I can't see ${fmtDateKey(date)}: it's outside the weeks the app has loaded.`;
      if (!events.length && !allDay) return `${fmtDateKey(date)}: nothing scheduled, the whole day is free.`;
      const sorted = [...events].sort(byStart);
      return JSON.stringify({
        day: fmtDateKey(date),
        ...(allDay ? { allDay } : {}),
        events: sorted.map((e) => {
          const spot = spotOf(e);
          return {
            what: eventLabel(e),
            when: `${fmtTime(e.start)}–${fmtTime(e.end)}`,
            where: [e.room, spot ? BUILDINGS[spot].shortName : e.place?.label].filter(Boolean).join(", ") || "not set",
            ...(isOwnPlan(e) ? { ownPlan: true } : {}),
          };
        }),
        gaps: findGaps(sorted).map((g) => ({
          when: `${fmtTime(g.start)}–${fmtTime(g.end)}`,
          usableTime: formatDuration(g.usableMins),
          at: BUILDINGS[g.locationId].shortName,
        })),
      });
    },
  });

  const getStudySpaces = betaTool({
    name: "get_study_spaces",
    description:
      "UCL libraries with how busy each one usually is at the window's start (quiet, moderate, busy or packed), sorted by travel time from where the student is. Busyness is an estimate from typical patterns, not a live count. Includes travel minutes and mode there and on to whatever's next.",
    inputSchema: { type: "object", properties: windowProps, required: ["start", "end"], additionalProperties: false },
    run: inWindow("get_study_spaces", (win, { from }) => studySpaceRows(win, from, seen)),
  });

  const getEventsInWindow = betaTool({
    name: "get_events_in_window",
    description:
      "Society events that overlap the window, with travel from where the student is when the venue is a UCL building. Leaves out ones they've already added to their calendar.",
    inputSchema: { type: "object", properties: windowProps, required: ["start", "end"], additionalProperties: false },
    run: inWindow("get_events_in_window", (win) =>
      eventRows(eventsProvider, win, win.start, win.end, addedEventIds, seen),
    ),
  });

  const getFoodSpots = betaTool({
    name: "get_food_spots",
    description:
      "Places to eat near campus, sorted by travel time from where the student is: kind, price band, a short note (typical patterns, not live queues), and travel there and on to what's next.",
    inputSchema: { type: "object", properties: windowProps, required: ["start", "end"], additionalProperties: false },
    run: inWindow("get_food_spots", (win, { from }) => foodRows(win, from)),
  });

  const { home } = ctx;
  const getHome = home
    ? betaTool({
        name: "get_home",
        description:
          "The trip to the student's home and back on to whatever's next, and how long they'd get at home in the window. worthIt is false under 30 minutes: then never suggest going home.",
        inputSchema: { type: "object", properties: windowProps, required: ["start", "end"], additionalProperties: false },
        run: inWindow("get_home", (win, { from }) => homeRow(win, home, from, seen)),
      })
    : null;

  const full = () => `You've already offered ${MAX_PROPOSALS} cards. Don't offer more in this reply.`;

  const proposeEvent = betaTool({
    name: "propose_event",
    description:
      "Offers to put something at a fixed time on the student's calendar. Shows a card with Add / Dismiss; nothing is saved unless they tap Add. Times are London 24-hour HH:MM on one day.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        kind: { type: "string", enum: EVENT_KINDS.map((k) => k.value) },
        date: { type: "string", description: "YYYY-MM-DD" },
        startTime: { type: "string", description: "HH:MM" },
        endTime: { type: "string", description: "HH:MM, after startTime" },
        room: { type: "string", description: "Room or short place note, or empty" },
        buildingId: { anyOf: [{ type: "string" }, { type: "null" }], description: "Building id, or null" },
        weekly: { type: "boolean", description: "Repeats every week on this weekday" },
      },
      required: ["title", "kind", "date", "startTime", "endTime", "room", "buildingId", "weekly"],
      additionalProperties: false,
    },
    run: async (input) => {
      debug("tool propose_event", input);
      if (proposals.length >= MAX_PROPOSALS) return full();
      const draft: EventDraft = {
        title: String(input.title ?? ""),
        kind: input.kind as EventKind,
        date: input.date,
        startTime: input.startTime,
        endTime: input.endTime,
        room: String(input.room ?? ""),
        weekly: Boolean(input.weekly),
        locationChoice: isBuildingId(input.buildingId) ? "building" : "none",
        buildingId: isBuildingId(input.buildingId) ? input.buildingId : "main-building",
        postcode: "",
      };
      const problem = validateEventDraft(draft) ?? (draft.date < today ? "That date is in the past" : null);
      if (problem) return `Not offered: ${problem}. Fix it and try again.`;
      const { id: _id, ...event } = eventFromDraft("", draft);
      void _id;
      proposals.push({ id: randomUUID(), kind: "event", event });
      const clashes = findClashes(
        dayEvents(draft.date) ?? [],
        londonIso(draft.date, draft.startTime),
        londonIso(draft.date, draft.endTime),
      );
      return `${SHOWN} Nothing is saved until they tap Add.${clashes.length ? ` Heads up: ${clashMessage(clashes)}.` : ""}`;
    },
  });

  const proposeTodo = betaTool({
    name: "propose_todo",
    description:
      "Offers to add a task to the student's To-do list (no fixed time). Shows a card with Add / Dismiss; nothing is saved unless they tap Add.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        estMinutes: { anyOf: [{ type: "integer", description: `How long it takes, up to ${MAX_EST_MINS}` }, { type: "null" }] },
        doBefore: { anyOf: [{ type: "string", description: "YYYY-MM-DD to get it done by" }, { type: "null" }] },
        buildingId: { anyOf: [{ type: "string" }, { type: "null" }], description: "Building id, or null" },
      },
      required: ["title", "estMinutes", "doBefore", "buildingId"],
      additionalProperties: false,
    },
    run: async (input) => {
      debug("tool propose_todo", input);
      if (proposals.length >= MAX_PROPOSALS) return full();
      // The form takes minutes in steps of 5.
      const est = typeof input.estMinutes === "number" ? Math.max(EST_STEP, Math.round(input.estMinutes / EST_STEP) * EST_STEP) : 0;
      const draft: TodoDraft = {
        title: String(input.title ?? ""),
        hours: est ? String(Math.floor(est / 60)) : "",
        minutes: est ? String(est % 60) : "",
        doBefore: typeof input.doBefore === "string" ? input.doBefore : "",
        freq: "none",
        days: [],
        dayOfMonth: null,
        time: "",
        partOfDay: null,
        showTimed: true,
        placeOnToday: false,
        placeDate: "",
        placeTime: "09:00",
        locationChoice: isBuildingId(input.buildingId) ? "building" : "none",
        buildingId: isBuildingId(input.buildingId) ? input.buildingId : "main-building",
        postcode: "",
      };
      const { todo, errors } = validateTodoDraft(draft, today);
      if (!todo) return `Not offered: ${Object.values(errors).join(". ")}. Fix it and try again.`;
      const { id: _id, done: _done, ...rest } = todo;
      void _id;
      void _done;
      proposals.push({
        id: randomUUID(),
        kind: "todo",
        todo: { ...rest, ...(isBuildingId(input.buildingId) ? { location: { kind: "building", buildingId: input.buildingId } } : {}) },
      });
      return `${SHOWN} Nothing is saved until they tap Add.`;
    },
  });

  return [
    getSchedule,
    getStudySpaces,
    getEventsInWindow,
    getFoodSpots,
    ...(getHome ? [getHome] : []),
    proposeEvent,
    proposeTodo,
  ];
}

export async function chatReply(
  messages: ChatTurn[],
  ctx: ChatContext,
): Promise<{ reply: string; proposals: ChatProposal[] }> {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY
  const nowIso = new Date().toISOString();
  const today = londonDateKey(nowIso);
  const proposals: ChatProposal[] = [];
  const providers = getProviders();
  const deadlinesProvider = ctx.deadlines ? deadlinesFromList(ctx.deadlines) : providers.deadlines;
  const deadlines = await deadlinesProvider.getDeadlines(nowIso, DEADLINE_DAYS);

  const tools = makeChatTools(ctx, proposals, today);
  const params = {
    model: MODEL,
    max_tokens: 4000,
    system: [
      // The fixed part, cached with the tools (which come before it): later calls pay a tenth for it.
      {
        type: "text" as const,
        text: `${CHAT_PROMPT}\n\nBuilding ids: ${BUILDING_IDS.join(", ")}`,
        cache_control: { type: "ephemeral" as const },
      },
      // Cached too, so a second call in the tool loop (or a follow-up within the minute) reads it cheaply.
      {
        type: "text" as const,
        text: studentContext(ctx, today, nowIso, deadlines),
        cache_control: { type: "ephemeral" as const },
      },
    ],
    // Just the definitions: run and parse are ours, not the API's.
    tools: tools.map((t) => {
      const { name, description, input_schema } = t as Anthropic.Beta.BetaTool;
      return { name, description, input_schema };
    }),
    output_config: { effort: "low" as const },
  };

  // Our own tool loop rather than toolRunner, so a turn that only offers cards can stop there:
  // Claude writes its reply before calling propose_*, and asking again would just cost a second call.
  const convo: Anthropic.Beta.BetaMessageParam[] = [...messages];
  let reply = "";
  let requests = 0;
  let tokensIn = 0;
  let tokensOut = 0;
  let cacheWrite = 0;
  let cacheRead = 0;
  for (;;) {
    if (requests >= MAX_CALLS) throw new Error(`No answer after ${MAX_CALLS} calls`);
    const message = await client.beta.messages.create({ ...params, messages: convo });
    requests++;
    tokensIn += message.usage.input_tokens;
    tokensOut += message.usage.output_tokens;
    cacheWrite += message.usage.cache_creation_input_tokens ?? 0;
    cacheRead += message.usage.cache_read_input_tokens ?? 0;
    const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();

    if (message.stop_reason !== "tool_use") {
      if (message.stop_reason !== "end_turn") throw new Error(`Claude stopped early (${message.stop_reason})`);
      reply = text;
      break;
    }
    const uses = message.content.flatMap((b) => (b.type === "tool_use" ? [b] : []));
    const results = await Promise.all(
      uses.map(async (use) => {
        const tool = tools.find((t) => t.name === use.name);
        let content: string;
        try {
          const out = tool ? await tool.run(use.input as never) : `Error: no tool called ${use.name}`;
          content = typeof out === "string" ? out : JSON.stringify(out);
        } catch (err) {
          content = `Error: ${err instanceof Error ? err.message : String(err)}`;
        }
        return { type: "tool_result" as const, tool_use_id: use.id, content };
      }),
    );
    const onlyCards = uses.every((u) => u.name.startsWith("propose_")) && results.every((r) => r.content.startsWith(SHOWN));
    if (onlyCards && text) {
      // Any clash propose_event found goes on the end, since Claude won't see it.
      const clashes = results.flatMap((r) => r.content.match(/Heads up: (.*)$/)?.[1] ?? []);
      reply = [text, ...clashes.map((c) => `Heads up: ${c}`)].join("\n\n");
      break;
    }
    convo.push({ role: "assistant", content: message.content }, { role: "user", content: results });
  }

  const usd =
    ((tokensIn + cacheWrite * CACHE_WRITE + cacheRead * CACHE_READ) * USD_PER_MTOK_IN + tokensOut * USD_PER_MTOK_OUT) /
    1_000_000;
  debug(
    `usage: ${requests} requests, ${tokensIn} in + ${cacheWrite} cache write + ${cacheRead} cache read / ${tokensOut} out ≈ $${usd.toFixed(4)}`,
  );

  if (!reply && !proposals.length) throw new Error("Claude gave an empty reply");
  return { reply: reply || "Here you go:", proposals };
}
