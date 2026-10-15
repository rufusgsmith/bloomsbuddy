// The chat assistant on Today. Server-side only (it uses ANTHROPIC_API_KEY).
//
// Same data as the gap picks (recommend.ts), but for any time the student asks about, so the window
// tools take a start and end instead of a fixed gap. get_schedule shows a day's events and gaps from
// the days the browser sent. propose_event / propose_todo don't save anything: they're checked in
// code, then shown as cards the student can Add or Dismiss.

import { randomUUID } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { betaTool } from "@anthropic-ai/sdk/helpers/beta/json-schema";
import { BUILDINGS, nearestBuilding, travelTime, type BuildingId } from "../buildings";
import { findClashes, clashMessage } from "../clashes";
import { MODEL } from "../claude-json";
import { formatDuration } from "../duration";
import { findGaps, londonDateKey } from "../gaps";
import { addDays, formatTime, isDateKey, londonIso } from "../london-time";
import { EVENT_KINDS, eventFromDraft, validateEventDraft, type EventDraft } from "../manual-events";
import { deadlinesFromList, eventsFor, getProviders } from "../providers";
import { EST_STEP, MAX_EST_MINS, todosForGap, validateTodoDraft, type TodoDraft } from "../todos";
import type { ChatProposal, DateKey, EventKind, TimetableEvent } from "../types";
import {
  BUILDING_IDS,
  deadlineRows,
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
  todoRows,
  USD_PER_MTOK_IN,
  USD_PER_MTOK_OUT,
  type ToolWindow,
} from "./tools";
import type { StudentContext } from "./request";
import { CHAT_SECTION, SYSTEM_PROMPT } from "./system-prompt";

/** Cards per reply, so one message can't flood the chat. */
const MAX_PROPOSALS = 3;
const MS_PER_MIN = 60_000;

export interface ChatDay {
  dateKey: DateKey;
  events: TimetableEvent[];
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

/** "Thu 15 Oct = 2026-10-15 (+01:00)": so Claude never has to work out dates or the BST switch. */
function dayList(today: DateKey): string {
  return Array.from({ length: 14 }, (_, i) => {
    const key = addDays(today, i);
    const label = i === 0 ? " (today)" : i === 1 ? " (tomorrow)" : "";
    return `- ${fmtDateKey(key)} = ${key}, offset ${londonIso(key, "12:00").slice(-6)}${label}`;
  }).join("\n");
}

function makeChatTools(ctx: ChatContext, proposals: ChatProposal[], today: DateKey) {
  const seen = newSeen();
  const providers = getProviders();
  const deadlinesProvider = ctx.deadlines ? deadlinesFromList(ctx.deadlines) : providers.deadlines;
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
      enum: BUILDING_IDS,
      description: "Optional building id the student starts from. Leave out to use where they'll be.",
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
      "What's on one London day: the student's classes and their own plans (ownPlan: true = something they added, like office hours or a society event; treat it as fixed), with times and where, plus the free gaps between them (usable minutes after the walk to the next thing). Time before the first event and after the last is free too.",
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
      if (!events) return `I can't see ${fmtDateKey(date)}: it's outside the weeks the app has loaded.`;
      if (!events.length) return `${fmtDateKey(date)}: nothing scheduled, the whole day is free.`;
      const sorted = [...events].sort(byStart);
      return JSON.stringify({
        day: fmtDateKey(date),
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

  const getDeadlines = betaTool({
    name: "get_deadlines",
    description:
      "The student's coursework deadlines due within `within_days` days of the window's start. laterGapsTodayBeforeDue lists that day's later gaps before each deadline. location is null, or where the work has to happen with the trip there (minsThere) and minsAtPlace in the window.",
    inputSchema: {
      type: "object",
      properties: { ...windowProps, within_days: { type: "integer", description: "How many days ahead to look, e.g. 7." } },
      required: ["start", "end", "within_days"],
      additionalProperties: false,
    },
    run: async (input) =>
      inWindow("get_deadlines", (win) =>
        deadlineRows(deadlinesProvider, win, input.within_days, findGaps(dayEvents(londonDateKey(win.start)) ?? [])),
      )(input),
  });

  const getFoodSpots = betaTool({
    name: "get_food_spots",
    description:
      "Places to eat near campus, sorted by travel time from where the student is: kind, price band, a short note (typical patterns, not live queues), and travel there and on to what's next.",
    inputSchema: { type: "object", properties: windowProps, required: ["start", "end"], additionalProperties: false },
    run: inWindow("get_food_spots", (win, { from }) => foodRows(win, from)),
  });

  const getTodos = betaTool({
    name: "get_todos",
    description:
      "The student's own to-dos that could go in the window: open one-offs (daysUntilDoBefore counts days from the window; negative = overdue) and repeating ones that come up then. fitsInGap says whether the estimate fits the window's usable minutes (or minsAtPlace when it has a location), or \"unknown\".",
    inputSchema: { type: "object", properties: windowProps, required: ["start", "end"], additionalProperties: false },
    run: inWindow("get_todos", (win) => todoRows(win, todosForGap(ctx.todos ?? [], win), seen)),
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
        buildingId: { anyOf: [{ type: "string", enum: BUILDING_IDS }, { type: "null" }] },
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
      return `Shown as a card. Nothing is saved until they tap Add.${clashes.length ? ` Heads up: ${clashMessage(clashes)}.` : ""}`;
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
        buildingId: { anyOf: [{ type: "string", enum: BUILDING_IDS }, { type: "null" }] },
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
      return "Shown as a card. Nothing is saved until they tap Add.";
    },
  });

  return [
    getSchedule,
    getStudySpaces,
    getEventsInWindow,
    getDeadlines,
    getFoodSpots,
    ...(ctx.todos?.length ? [getTodos] : []),
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
  const context = [
    `## Right now`,
    `It's ${fmt(nowIso)} in London.`,
    `Days (London date = YYYY-MM-DD, and the ISO offset to use):`,
    dayList(today),
    `Home: ${ctx.home ? ctx.home.label : "not set"}.`,
    ctx.societies?.length ? `Their societies: ${ctx.societies.map((s) => s.name).join(", ")}.` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const runner = client.beta.messages.toolRunner({
    model: MODEL,
    max_tokens: 4000,
    max_iterations: 8,
    system: `${SYSTEM_PROMPT}\n\n${CHAT_SECTION}\n\n${context}`,
    tools: makeChatTools(ctx, proposals, today),
    output_config: { effort: "low" },
    messages,
  });

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
  debug(`usage: ${requests} requests, ${tokensIn} in / ${tokensOut} out ≈ $${usd.toFixed(4)}`);

  if (final.stop_reason !== "end_turn") {
    throw new Error(`Claude stopped early (${final.stop_reason})`);
  }
  const reply = final.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();
  if (!reply && !proposals.length) throw new Error("Claude gave an empty reply");
  return { reply: reply || "Here you go:", proposals };
}
