// POST /api/chat  body: { messages, days, deadlines?, societies?, home?, todos?, addedEventIds? }
//   →  { reply: string, proposals: ChatProposal[] }
// messages: the conversation so far, oldest first, ending with the student's new message.
// days: [{ dateKey, events, allDay? }] the Today page can see, for get_schedule and travel.
// allDay is that day's all-day society strips as text: not busy time, only context.
// The other fields are the same as /api/recommend (parseStudentContext).
import { isDateKey } from "@/lib/london-time";
import { chatReply, type ChatDay, type ChatTurn } from "@/lib/recommend/chat";
import { parseAllDay, parseStudentContext } from "@/lib/recommend/request";
import type { TimetableEvent } from "@/lib/types";

/** Older turns are dropped: keeps each request (and its cost) small. */
const MAX_TURNS = 20;
const MAX_CHARS = 2000;
const MAX_DAYS = 35;
const MAX_EVENTS_PER_DAY = 30;

function isTurn(x: unknown): x is ChatTurn {
  const t = x as Partial<ChatTurn> | null;
  return (t?.role === "user" || t?.role === "assistant") && typeof t.content === "string" && t.content.trim() !== "";
}

function isEvent(x: unknown): x is TimetableEvent {
  const e = x as Partial<TimetableEvent> | null;
  return (
    typeof e?.id === "string" &&
    typeof e.title === "string" &&
    typeof e.kind === "string" &&
    typeof e.moduleCode === "string" &&
    typeof e.room === "string" &&
    typeof e.start === "string" &&
    typeof e.end === "string" &&
    !Number.isNaN(Date.parse(e.start)) &&
    !Number.isNaN(Date.parse(e.end))
  );
}

function parseDays(x: unknown): ChatDay[] {
  if (!Array.isArray(x)) return [];
  return x.slice(0, MAX_DAYS).flatMap((d) => {
    if (!d || !isDateKey(d.dateKey) || !Array.isArray(d.events)) return [];
    const allDay = parseAllDay(d.allDay);
    return [{ dateKey: d.dateKey, events: d.events.filter(isEvent).slice(0, MAX_EVENTS_PER_DAY), ...(allDay ? { allDay } : {}) }];
  });
}

/** The last turns, trimmed, starting with the student and alternating (the API needs both). */
function parseTurns(x: unknown): ChatTurn[] {
  if (!Array.isArray(x)) return [];
  const turns: ChatTurn[] = [];
  for (const t of x.filter(isTurn).slice(-MAX_TURNS)) {
    const turn = { role: t.role, content: t.content.slice(0, MAX_CHARS) };
    if (turns.at(-1)?.role === turn.role) turns[turns.length - 1] = turn;
    else turns.push(turn);
  }
  while (turns[0]?.role === "assistant") turns.shift();
  return turns;
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body must be JSON: { messages }" }, { status: 400 });
  }
  const messages = parseTurns(body?.messages);
  if (messages.at(-1)?.role !== "user") {
    return Response.json({ error: "`messages` must end with the student's message" }, { status: 400 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("[chat] ANTHROPIC_API_KEY is not set");
    return Response.json({ error: "Chat is unavailable right now" }, { status: 502 });
  }

  try {
    return Response.json(await chatReply(messages, { ...parseStudentContext(body), days: parseDays(body.days) }));
  } catch (err) {
    console.error("[chat] failed:", err);
    return Response.json({ error: "Couldn't get an answer, try again" }, { status: 502 });
  }
}
