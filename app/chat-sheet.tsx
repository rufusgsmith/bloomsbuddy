"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { clashMessage, findClashes } from "@/lib/clashes";
import { newId } from "@/lib/deadline-draft";
import { formatDurationShort } from "@/lib/duration";
import { londonDateKey } from "@/lib/gaps";
import { locationLabel } from "@/lib/location";
import { addDays, formatWallTime, londonIso, relativeDayLabel } from "@/lib/london-time";
import { EVENT_KINDS, saveManualEvent } from "@/lib/manual-events";
import { requestContext } from "@/lib/request-context";
import { parseTodos, readRawTodos, saveTodos } from "@/lib/todos";
import type { ChatMessage, ChatProposal, DateKey, Deadline, Home, ManualEvent, Society, TimetableEvent, Todo } from "@/lib/types";
import type { Day } from "./today-timeline";

// The chat assistant on Today. Session-only: the conversation lives in sessionStorage, so it survives
// switching tabs (and Today rebuilding after Add saves an event) but is gone when the tab closes.

const KEY = "bloomsbuddy:chat";
/** Days sent for get_schedule: last week to three weeks ahead. */
const DAYS_BACK = 7;
const DAYS_AHEAD = 21;
const SAVE_FAILED = "Your browser wouldn't let me save that. Private mode?";

function readChat(): ChatMessage[] {
  try {
    const list = JSON.parse(sessionStorage.getItem(KEY) ?? "[]") as unknown;
    return Array.isArray(list) ? (list as ChatMessage[]) : [];
  } catch {
    return [];
  }
}

function writeChat(messages: ChatMessage[]) {
  try {
    if (messages.length) sessionStorage.setItem(KEY, JSON.stringify(messages));
    else sessionStorage.removeItem(KEY);
  } catch {
    // Private mode: the chat still works, it just won't survive a reload.
  }
}

/** The chat button (above the "+" on Today) and the chat it opens. */
export function ChatAssistant({
  days,
  deadlines,
  societies,
  home,
  todos,
  manualEvents,
}: {
  days: Day[];
  deadlines?: Deadline[];
  societies?: Society[];
  home: Home | null;
  todos: Todo[];
  manualEvents: ManualEvent[];
}) {
  const [open, setOpen] = useState(false);
  // Only rendered in the browser (Home shows a skeleton on the server), so reading storage here is safe.
  const [messages, setMessages] = useState<ChatMessage[]>(readChat);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  useEffect(() => writeChat(messages), [messages]);

  const nowIso = new Date().toISOString();
  const todayKey = londonDateKey(nowIso);
  const eventsOn = (k: DateKey) => days.find((d) => d.dateKey === k)?.events ?? [];

  /** Sends the conversation (ending with the student's message) and adds the reply. */
  async function ask(turns: ChatMessage[]) {
    setStatus("loading");
    const from = addDays(todayKey, -DAYS_BACK);
    const to = addDays(todayKey, DAYS_AHEAD);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: turns.map(({ role, content }) => ({ role, content })),
          days: days
            .filter((d) => d.dateKey >= from && d.dateKey <= to)
            .map(({ dateKey, events }) => ({ dateKey, events })),
          ...requestContext({ deadlines, societies, home, todos, manualEvents }),
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { reply: string; proposals: ChatProposal[] };
      setMessages([...turns, { role: "assistant", content: data.reply, proposals: data.proposals }]);
      setStatus("idle");
    } catch (err) {
      console.warn("[chat]", err); // warn, not error: the error bubble handles it
      setStatus("error");
    }
  }

  function send(text: string) {
    const content = text.trim();
    if (!content || status === "loading") return;
    const turns: ChatMessage[] = [...messages, { role: "user", content }];
    setMessages(turns);
    void ask(turns);
  }

  function setProposalStatus(id: string, s: NonNullable<ChatProposal["status"]>) {
    setMessages((ms) =>
      ms.map((m) =>
        m.proposals?.some((p) => p.id === id)
          ? { ...m, proposals: m.proposals.map((p) => (p.id === id ? { ...p, status: s } : p)) }
          : m,
      ),
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Ask Bloomsbuddy"
        aria-haspopup="dialog"
        className="fixed bottom-[calc(9.5rem+env(safe-area-inset-bottom))] right-[max(1rem,calc(50%-14rem+1rem))] z-30 flex size-14 items-center justify-center rounded-full bg-emerald-600 text-2xl text-white shadow-lg hover:bg-emerald-700 dark:bg-emerald-500 dark:text-emerald-950 dark:hover:bg-emerald-400"
      >
        {/* Sparkle: the assistant. Not a speech bubble. */}
        <svg aria-hidden viewBox="0 0 24 24" fill="currentColor" className="size-7">
          <path d="M12 2.5l1.9 5.6 5.6 1.9-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.9L12 2.5z" />
          <path d="M18.5 14.5l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9.9-2.6z" />
        </svg>
      </button>
      {open && (
        <ChatSheet
          messages={messages}
          status={status}
          todayKey={todayKey}
          eventsOn={eventsOn}
          onSend={send}
          onRetry={() => void ask(messages)}
          onClear={() => {
            setMessages([]);
            setStatus("idle");
          }}
          onProposal={setProposalStatus}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

/**
 * A bottom sheet on phones, a panel down the right on laptops (same as EventSheet).
 * A native <dialog> with showModal() gives Esc to close, a focus trap and the top layer.
 */
function ChatSheet({
  messages,
  status,
  todayKey,
  eventsOn,
  onSend,
  onRetry,
  onClear,
  onProposal,
  onClose,
}: {
  messages: ChatMessage[];
  status: "idle" | "loading" | "error";
  todayKey: DateKey;
  eventsOn: (dateKey: DateKey) => TimetableEvent[];
  onSend: (text: string) => void;
  onRetry: () => void;
  onClear: () => void;
  onProposal: (id: string, status: NonNullable<ChatProposal["status"]>) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  // Keep the newest message in view.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, status]);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (status === "loading" || !draft.trim()) return;
    onSend(draft);
    setDraft("");
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby="chat-sheet-title"
      // Closed via React state, not the "close" event: see HomeSheet for why.
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="mb-0 mt-auto h-[min(92dvh,760px)] max-h-none w-full max-w-full overflow-hidden rounded-t-3xl bg-white p-0 text-zinc-900 shadow-xl backdrop:bg-black/50 backdrop:backdrop-blur-[2px] md:my-0 md:ml-auto md:mr-0 md:h-dvh md:max-w-sm md:rounded-none md:rounded-l-3xl dark:bg-zinc-950 dark:text-zinc-100"
    >
      <div className="flex h-full flex-col">
        <div className="border-b border-zinc-200 px-5 pt-3 dark:border-zinc-800">
          <div aria-hidden className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-zinc-300 md:hidden dark:bg-zinc-700" />
          <div className="mb-3 flex items-start justify-between gap-3 md:mt-4">
            <div>
              <h2 id="chat-sheet-title" className="text-xl font-semibold tracking-tight">
                Ask Bloomsbuddy
              </h2>
              <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">Any day, any time, not just gaps</p>
            </div>
            <div className="-mr-2 flex shrink-0 items-center">
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={onClear}
                  disabled={status === "loading"}
                  className="min-h-11 rounded-full px-3 text-sm text-zinc-600 hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-zinc-900"
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex size-11 items-center justify-center rounded-full text-2xl leading-none text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"
              >
                ×
              </button>
            </div>
          </div>
        </div>

        <div ref={scrollRef} aria-live="polite" className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">
          {messages.length === 0 && (
            <Bubble role="assistant">
              Hiya! Ask me about any bit of your week: a gap, an evening, your Saturday afternoon. I can add things to
              your calendar or to-do list too.
            </Bubble>
          )}

          {messages.map((m, i) => (
            <div key={i} className="flex flex-col gap-2">
              <Bubble role={m.role}>{m.role === "assistant" ? plainText(m.content) : m.content}</Bubble>
              {m.proposals?.map((p) => (
                <ProposalCard
                  key={p.id}
                  proposal={p}
                  todayKey={todayKey}
                  eventsOn={eventsOn}
                  onDone={(s) => onProposal(p.id, s)}
                />
              ))}
            </div>
          ))}

          {status === "loading" && <TypingIndicator />}
          {status === "error" && (
            <div role="alert" className="flex flex-col items-start gap-2">
              <Bubble role="assistant">Sorry, I couldn&apos;t get an answer just then. Try again?</Bubble>
              <button
                type="button"
                onClick={onRetry}
                className="min-h-11 rounded-full bg-zinc-100 px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
              >
                ↻ Retry
              </button>
            </div>
          )}
        </div>

        <form
          onSubmit={submit}
          className="flex items-end gap-2 border-t border-zinc-200 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 dark:border-zinc-800"
        >
          <label htmlFor="chat-input" className="sr-only">
            Message
          </label>
          <textarea
            id="chat-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends, Shift+Enter adds a line.
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) submit(e);
            }}
            rows={1}
            maxLength={2000}
            placeholder="What can I do Saturday 14:00–17:00?"
            className="max-h-32 min-h-11 flex-1 resize-none rounded-2xl border border-zinc-300 bg-white px-3 py-2.5 text-base text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 sm:text-sm"
          />
          <button
            type="submit"
            disabled={status === "loading" || !draft.trim()}
            className="min-h-11 shrink-0 rounded-full bg-emerald-600 px-5 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-emerald-500 dark:text-emerald-950 dark:hover:bg-emerald-400"
          >
            Send
          </button>
        </form>
      </div>
    </dialog>
  );
}

/** Claude is told not to use markdown, but if **bold** slips through, show the words without the stars. */
const plainText = (s: string) => s.replace(/\*\*(.+?)\*\*/g, "$1").replace(/^#+\s+/gm, "");

function Bubble({ role, children }: { role: ChatMessage["role"]; children: ReactNode }) {
  return role === "user" ? (
    <p className="max-w-[85%] self-end whitespace-pre-wrap rounded-2xl rounded-br-md bg-emerald-600 px-3.5 py-2 text-sm text-white dark:bg-emerald-500 dark:text-emerald-950">
      {children}
    </p>
  ) : (
    <p className="max-w-[90%] self-start whitespace-pre-wrap rounded-2xl rounded-bl-md bg-zinc-100 px-3.5 py-2 text-sm text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">
      {children}
    </p>
  );
}

function TypingIndicator() {
  return (
    <div
      role="status"
      aria-label="Bloomsbuddy is typing"
      className="flex items-center gap-1 self-start rounded-2xl rounded-bl-md bg-zinc-100 px-4 py-3 dark:bg-zinc-900"
    >
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          aria-hidden
          style={{ animationDelay: `${delay}ms` }}
          className="size-2 animate-bounce rounded-full bg-zinc-400 dark:bg-zinc-500"
        />
      ))}
    </div>
  );
}

const kindLabel = (k: string) => EVENT_KINDS.find((x) => x.value === k)?.label ?? k;

/** An event or to-do Claude offered. Nothing is saved until Add; a clash asks first, like EventSheet. */
function ProposalCard({
  proposal: p,
  todayKey,
  eventsOn,
  onDone,
}: {
  proposal: ChatProposal;
  todayKey: DateKey;
  eventsOn: (dateKey: DateKey) => TimetableEvent[];
  onDone: (status: NonNullable<ChatProposal["status"]>) => void;
}) {
  const [clash, setClash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function add(anyway = false) {
    setError(null);
    let ok: boolean;
    if (p.kind === "event") {
      const e = p.event;
      if (!anyway) {
        const found = findClashes(eventsOn(e.date), londonIso(e.date, e.startTime), londonIso(e.date, e.endTime));
        if (found.length) {
          setClash(clashMessage(found));
          return;
        }
      }
      ok = saveManualEvent({ id: newId("ev"), ...e });
    } else {
      ok = saveTodos([...parseTodos(readRawTodos()), { id: newId("todo"), done: false, ...p.todo }]);
    }
    setClash(null);
    if (ok) onDone("added");
    else setError(SAVE_FAILED);
  }

  const location = p.kind === "event" ? p.event.location : p.todo.location;
  const details =
    p.kind === "event"
      ? [
          relativeDayLabel(p.event.date, todayKey),
          `${formatWallTime(p.event.startTime)}–${formatWallTime(p.event.endTime)}`,
          kindLabel(p.event.kind),
          ...(p.event.weekly ? ["↻ Weekly"] : []),
          ...(p.event.room ? [p.event.room] : []),
        ]
      : [
          ...(p.todo.estMinutes ? [formatDurationShort(p.todo.estMinutes)] : []),
          ...(p.todo.doBefore ? [`Do before ${relativeDayLabel(p.todo.doBefore, todayKey).toLowerCase()}`] : []),
        ];

  return (
    <div className="ml-2 rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-xs font-medium text-zinc-500">{p.kind === "event" ? "📅 Add to calendar" : "📝 Add to to-do"}</p>
      <p className="mt-0.5 font-semibold">{p.kind === "event" ? p.event.title : p.todo.title}</p>
      {(details.length > 0 || location) && (
        <p className="mt-0.5 text-sm tabular-nums text-zinc-600 dark:text-zinc-400">
          {details.join(" · ")}
          {location && `${details.length ? " · " : ""}📍 ${locationLabel(location)}`}
        </p>
      )}

      {p.status ? (
        <p className="mt-2 text-sm font-medium text-zinc-600 dark:text-zinc-400">
          {p.status === "added" ? <span className="text-emerald-700 dark:text-emerald-300">Added ✓</span> : "Dismissed"}
        </p>
      ) : clash ? (
        <div role="alert" className="mt-3 rounded-xl bg-amber-50 p-3 dark:bg-amber-950/40">
          <p className="mb-2 text-sm font-medium text-amber-900 dark:text-amber-100">⚠️ {clash}</p>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setClash(null)}
              className="min-h-11 rounded-full px-4 text-sm font-medium text-zinc-700 hover:bg-amber-100 dark:text-zinc-300 dark:hover:bg-amber-900/40"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => add(true)}
              className="min-h-11 rounded-full bg-zinc-900 px-5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              Add anyway
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => onDone("dismissed")}
            className="min-h-11 rounded-full px-4 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
          >
            Dismiss
          </button>
          <button
            type="button"
            onClick={() => add()}
            className="min-h-11 rounded-full bg-emerald-600 px-5 text-sm font-medium text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:text-emerald-950 dark:hover:bg-emerald-400"
          >
            Add
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
