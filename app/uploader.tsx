"use client";

// Screenshot or pasted/typed text → Claude (/api/extract) → rows for a list. Shared by the setup
// steps (timetable, deadlines) and the to-do list. With existing rows, it asks "replace or add?".

import { useEffect, useRef, useState, type ReactNode } from "react";
import { NotConnectedNote, useClaudeConnected } from "./claude-status";
import { noAutofill } from "./form-ui";
import { CameraIcon } from "./icons";
import { prepareImage } from "@/lib/prepare-image";
import type { Deadline, Todo, WeeklyClass } from "@/lib/types";

type Kind = "timetable" | "deadlines" | "todos";
type Rows<K extends Kind> = K extends "timetable" ? WeeklyClass[] : K extends "deadlines" ? Deadline[] : Todo[];
/** Where /api/extract puts the rows for each kind. */
const RESULT_FIELD: Record<Kind, string> = { timetable: "classes", deadlines: "deadlines", todos: "todos" };

type UploadState =
  | { status: "idle" }
  | { status: "reading"; from: "image" | "text" }
  | { status: "error"; message: string }
  | { status: "done"; count: number };

export function Uploader<K extends Kind>({
  kind,
  nouns: [one, many],
  placeholder,
  existingCount,
  onResult,
}: {
  kind: K;
  nouns: [string, string];
  placeholder: string;
  existingCount: number;
  onResult: (rows: Rows<K>, mode: "replace" | "append") => void;
}) {
  const [state, setState] = useState<UploadState>({ status: "idle" });
  // Results waiting for "replace or add?" when there are already rows.
  const [pending, setPending] = useState<Rows<K> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const plural = (n: number) => `${n} ${n === 1 ? one : many}`;

  /** Sends a screenshot or text to Claude. Returns true if it found something. */
  async function extract(from: "image" | "text", getPayload: () => Promise<object>): Promise<boolean> {
    const what = from === "image" ? "screenshot" : "text";
    setState({ status: "reading", from });
    setPending(null);
    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, ...(await getPayload()) }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string } & Partial<Record<string, unknown[]>>;
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      const rows = (body[RESULT_FIELD[kind]] ?? []) as Rows<K>;
      if (rows.length === 0) {
        setState({ status: "error", message: `I couldn't spot any ${many} in that one. Is it the right ${what}?` });
        return false;
      }
      setState({ status: "done", count: rows.length });
      if (existingCount > 0) setPending(rows);
      else onResult(rows, "replace");
      return true;
    } catch (err) {
      console.warn("[extract]", err);
      setState({
        status: "error",
        message: `Couldn't read that ${what} right now. Try again, or add your ${many} by hand below.`,
      });
      return false;
    }
  }

  async function handleFile(file: Blob | null | undefined) {
    if (!file || state.status === "reading") return;
    if (!file.type.startsWith("image/")) {
      setState({ status: "error", message: "That doesn't look like an image. Try a PNG or JPEG screenshot." });
      return;
    }
    await extract("image", async () => ({ image: await prepareImage(file) }));
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleText() {
    const trimmed = text.trim();
    if (!trimmed || state.status === "reading") return;
    // Keep the text on failure so they can tweak it and try again.
    if (await extract("text", async () => ({ text: trimmed }))) setText("");
  }

  // Reading screenshots and text is a Claude call: off when the site has no API key.
  const connected = useClaudeConnected();

  // Pasting a screenshot (Cmd/Ctrl+V) works too: handy on a laptop.
  useEffect(() => {
    if (!connected) return;
    function onPaste(e: ClipboardEvent) {
      const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith("image/"));
      if (item) void handleFile(item.getAsFile());
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  });

  const reading = state.status === "reading";

  if (!connected) return <NotConnectedNote>Add your {many} by hand below instead.</NotConnectedNote>;

  return (
    <div className="flex flex-col gap-3">
      <label
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void handleFile(e.dataTransfer.files[0]);
        }}
        className={`flex min-h-32 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed p-5 text-center transition-colors ${
          reading
            ? "cursor-wait border-emerald-400 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/40"
            : "border-emerald-400 bg-emerald-50/50 hover:bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/20 dark:hover:bg-emerald-950/40"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          disabled={reading}
          onChange={(e) => void handleFile(e.target.files?.[0])}
          className="sr-only"
        />
        {reading ? (
          <span aria-live="polite" className="animate-pulse font-medium text-emerald-800 dark:text-emerald-200">
            {state.from === "image" ? "Reading your screenshot…" : "Reading your text…"}
          </span>
        ) : (
          <>
            <CameraIcon className="size-7 text-emerald-700 dark:text-emerald-300" />
            <span className="font-medium text-emerald-900 dark:text-emerald-100">
              {existingCount > 0 ? "Upload another screenshot" : "Upload a screenshot"}
            </span>
            <span className="text-sm text-emerald-800/80 dark:text-emerald-200/80">Tap to choose, drop it here, or paste</span>
          </>
        )}
      </label>

      <div className="flex items-center gap-3 text-sm text-muted" aria-hidden>
        <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
        or type it
        <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={`${kind}-text`} className="sr-only">
          Paste or type your {many}
        </label>
        <textarea {...noAutofill}
          id={`${kind}-text`}
          rows={4}
          value={text}
          disabled={reading}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Cmd/Ctrl+Enter sends, like most chat boxes.
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void handleText();
            }
          }}
          className="w-full rounded-xl border border-zinc-300 bg-surface p-3 text-base text-zinc-900 placeholder:text-zinc-400 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-100 sm:text-sm"
        />
        <div className="flex justify-end">
          <SmallButton primary disabled={reading || !text.trim()} onClick={() => void handleText()}>
            Read it
          </SmallButton>
        </div>
      </div>

      {state.status === "error" && (
        <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          {state.message}
        </p>
      )}

      {pending ? (
        <div role="alert" className="rounded-xl bg-surface p-3 text-sm ring-1 ring-emerald-300 dark:ring-emerald-800">
          <p>
            Found {plural(pending.length)}. You&apos;ve already got {plural(existingCount)}. What should I do?
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <SmallButton
              primary
              onClick={() => {
                onResult(pending, "replace");
                setPending(null);
              }}
            >
              Replace them
            </SmallButton>
            <SmallButton
              onClick={() => {
                onResult(pending, "append");
                setPending(null);
              }}
            >
              Add to the list
            </SmallButton>
            <SmallButton
              onClick={() => {
                setPending(null);
                setState({ status: "idle" });
              }}
            >
              Cancel
            </SmallButton>
          </div>
        </div>
      ) : (
        state.status === "done" && (
          <p aria-live="polite" className="text-sm text-emerald-800 dark:text-emerald-200">
            Found {plural(state.count)}. Check them before you continue, as the reading can be wrong.
          </p>
        )
      )}
    </div>
  );
}

function SmallButton({
  primary,
  disabled,
  onClick,
  children,
}: {
  primary?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`min-h-10 rounded-lg px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
        primary
          ? "bg-primary text-on-primary hover:bg-primary-hover"
          : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
      }`}
    >
      {children}
    </button>
  );
}
