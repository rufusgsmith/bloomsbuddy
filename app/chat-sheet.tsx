"use client";

import { CalendarDays, Check, ListTodo, MapPin, Repeat, RotateCw, SendHorizontal, Sparkles, X } from "lucide-react";
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
import { ClashNotice, FAB_POSITION, ghostButton, ICON, ICON_LG, iconButton, primaryButton, secondaryButton, SHEET, SheetHandle } from "./form-ui";
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
        className={`${FAB_POSITION} bottom-[calc(9.5rem+env(safe-area-inset-bottom))] z-30 flex size-14 items-center justify-center rounded-full bg-square text-on-square shadow-[0_2px_8px_rgb(0_0_0/0.15)] transition-colors hover:bg-square-hover md:bottom-24`}
      >
        {/* Sparkle: the assistant. Not a speech bubble. */}
        <Sparkles size={24} strokeWidth={1.75} aria-hidden />
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
      className={SHEET}
    >
      <div className="flex h-full flex-col">
        <div className="border-b border-line px-5 pt-3">
          <SheetHandle />
          <div className="mb-3 flex items-start justify-between gap-3 md:mt-4">
            <div>
              <h2 id="chat-sheet-title" className="text-xl font-semibold">
                Ask Bloomsbuddy
              </h2>
              <p className="mt-0.5 text-sm text-muted">Any day, any time, not just gaps</p>
            </div>
            <div className="-mr-2 flex shrink-0 items-center">
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={onClear}
                  disabled={status === "loading"}
                  className={ghostButton}
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className={iconButton}
              >
                <X {...ICON_LG} />
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
                className={secondaryButton}
              >
                <RotateCw {...ICON} />
                Retry
              </button>
            </div>
          )}
        </div>

        <form
          onSubmit={submit}
          className="flex items-end gap-2 border-t border-line px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3"
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
            className="max-h-32 min-h-11 flex-1 resize-none rounded-xl border border-line bg-surface px-3 py-2.5 text-base text-ink sm:text-sm"
          />
          <button
            type="submit"
            disabled={status === "loading" || !draft.trim()}
            aria-label="Send"
            className={`${primaryButton} w-11 px-0`}
          >
            <SendHorizontal {...ICON_LG} />
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
    <p className="max-w-[85%] self-end whitespace-pre-wrap rounded-xl rounded-br-sm bg-ink px-3 py-2 text-sm text-paper">
      {children}
    </p>
  ) : (
    <p className="max-w-[90%] self-start whitespace-pre-wrap rounded-xl rounded-bl-sm bg-sunken px-3 py-2 text-sm text-ink">
      {children}
    </p>
  );
}

function TypingIndicator() {
  return (
    <div
      role="status"
      aria-label="Bloomsbuddy is typing"
      className="flex items-center gap-1 self-start rounded-xl rounded-bl-sm bg-sunken px-4 py-3"
    >
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          aria-hidden
          style={{ animationDelay: `${delay}ms` }}
          className="size-1.5 animate-bounce rounded-full bg-muted"
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
          ...(p.event.weekly ? ["Weekly"] : []),
          ...(p.event.room ? [p.event.room] : []),
        ]
      : [
          ...(p.todo.estMinutes ? [formatDurationShort(p.todo.estMinutes)] : []),
          ...(p.todo.doBefore ? [`Do before ${relativeDayLabel(p.todo.doBefore, todayKey).toLowerCase()}`] : []),
        ];

  return (
    <div className="ml-4 border-l-2 border-line py-1 pl-3">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
        {p.kind === "event" ? <CalendarDays {...ICON} size={14} /> : <ListTodo {...ICON} size={14} />}
        {p.kind === "event" ? "Add to calendar" : "Add to to-do"}
      </p>
      <p className="mt-1 font-semibold">{p.kind === "event" ? p.event.title : p.todo.title}</p>
      {(details.length > 0 || location || (p.kind === "event" && p.event.weekly)) && (
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-sm tabular-nums text-muted">
          {p.kind === "event" && p.event.weekly && <Repeat {...ICON} size={14} />}
          {details.join(" · ")}
          {location && (
            <span className="inline-flex items-center gap-1">
              {details.length > 0 && <span aria-hidden>·</span>}
              <MapPin {...ICON} size={14} />
              {locationLabel(location)}
            </span>
          )}
        </p>
      )}

      {p.status ? (
        <p className="mt-2 flex items-center gap-1 text-sm font-medium text-muted">
          {p.status === "added" ? (
            <span className="inline-flex items-center gap-1 text-square">
              <Check {...ICON} />
              Added
            </span>
          ) : (
            "Dismissed"
          )}
        </p>
      ) : clash ? (
        <ClashNotice className="mt-3" message={clash} onCancel={() => setClash(null)} onConfirm={() => add(true)} />
      ) : (
        <div className="mt-2 flex items-center gap-2">
          <button type="button" onClick={() => add()} className={primaryButton}>
            Add
          </button>
          <button type="button" onClick={() => onDone("dismissed")} className={ghostButton}>
            Dismiss
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
