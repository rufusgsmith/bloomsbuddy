"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { BusynessLevel, Recommendation, RecommendationOption, RecommendationType } from "@/lib/types";
import { travelLabel } from "@/lib/buildings";
import { NotConnectedNote } from "./claude-status";
import { BookIcon, CupIcon, HomeIcon, MoonIcon, PeopleIcon } from "./icons";

// One icon tile per pick type, in the same card language as Today's day list.
const TYPE_ICON: Record<RecommendationType, (p: { className?: string }) => ReactNode> = {
  study: BookIcon,
  event: PeopleIcon,
  rest: MoonIcon,
  home: HomeIcon,
  food: CupIcon,
};

/** offline: Claude isn't connected (no API key), so there are no picks to show. */
export type RecState = { status: "loading" } | { status: "ok"; rec: Recommendation } | { status: "error" } | { status: "offline" };

const LOADING_LINES = [
  "Checking library busyness…",
  "Checking society events…",
  "Checking your deadlines…",
  "Checking travel time home…",
  "Checking your to-do list…",
];

/** onReload asks Claude again, skipping the cached picks: "Try again" after an error, "↻ Redo" after picks. */
export function RecommendationPanel({ state, onReload }: { state: RecState; onReload: () => void }) {
  if (state.status === "loading") return <Loading />;
  if (state.status === "error") return <Fallback onRetry={onReload} />;
  if (state.status === "offline") return <NotConnectedNote>The demo week&apos;s gaps still have picks.</NotConnectedNote>;

  const { top, alternatives } = state.rec;
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Top pick</h3>
        <button
          type="button"
          onClick={onReload}
          aria-label="Redo: get fresh picks for this gap"
          className="min-h-8 rounded-lg px-2.5 text-sm font-medium text-muted hover:bg-zinc-100 hover:text-foreground dark:hover:bg-zinc-800"
        >
          ↻ Redo
        </button>
      </div>
      <Pick option={top} top />
      <h3 className="mt-3 text-sm font-semibold">Or</h3>
      {alternatives.map((option) => (
        <Pick key={option.title} option={option} />
      ))}
    </div>
  );
}

function Loading() {
  const [line, setLine] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setLine((i) => (i + 1) % LOADING_LINES.length), 1500);
    return () => clearInterval(id);
  }, []);

  return (
    <div aria-busy="true">
      <p aria-live="polite" className="mb-3 text-sm text-muted">
        {LOADING_LINES[line]}
      </p>
      <div className="flex animate-pulse flex-col gap-3">
        <div className="h-32 rounded-xl bg-zinc-100 dark:bg-zinc-800" />
        <div className="h-20 rounded-xl bg-zinc-100 dark:bg-zinc-800" />
        <div className="h-20 rounded-xl bg-zinc-100 dark:bg-zinc-800" />
      </div>
    </div>
  );
}

function Fallback({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="rounded-xl border border-line bg-surface p-4 text-sm">
      <p className="font-semibold">Couldn&apos;t get recommendations</p>
      <p className="mt-1 text-muted">
        Something went wrong loading picks for this gap. Try again.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 min-h-10 rounded-lg bg-primary px-3.5 text-sm font-medium text-on-primary hover:bg-primary-hover"
      >
        Try again
      </button>
    </div>
  );
}

function Pick({ option, top = false }: { option: RecommendationOption; top?: boolean }) {
  const Icon = TYPE_ICON[option.type];
  return (
    <article
      className={`flex gap-3 rounded-xl border bg-surface p-4 ${
        top ? "border-emerald-300 ring-1 ring-emerald-300 dark:border-emerald-500/60 dark:ring-emerald-500/60" : "border-line"
      }`}
    >
      <span
        aria-hidden
        className={`flex size-10 shrink-0 items-center justify-center rounded-lg border ${
          top
            ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-300"
            : "border-line bg-background text-muted"
        }`}
      >
        <Icon className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <h4 className="font-medium leading-snug">{option.title}</h4>
        <p className="text-sm text-muted">{option.place}</p>
        <Badges option={option} />
        <p className={`mt-2.5 text-sm ${top ? "text-foreground" : "text-muted"}`}>{option.reason}</p>
      </div>
    </article>
  );
}

function Badges({ option }: { option: RecommendationOption }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      <Badge tone="neutral">{option.travelMins === 0 ? "Staying put" : travelLabel(option.travelMins, option.travelMode)}</Badge>
      {option.busyness && <Badge tone={BUSYNESS_TONE[option.busyness]}>Usually {option.busyness}</Badge>}
      {option.todoId && <Badge tone="good">From your to-do</Badge>}
    </div>
  );
}

type Tone = "neutral" | "good" | "warn" | "bad";

const BUSYNESS_TONE: Record<BusynessLevel, Tone> = { quiet: "good", moderate: "neutral", busy: "warn", packed: "bad" };

const TONE_CLASSES: Record<Tone, string> = {
  neutral: "border-line bg-background text-zinc-600 dark:text-zinc-300",
  good: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-300",
  warn: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-300",
  bad: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/15 dark:text-rose-300",
};

function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={`rounded-md border px-1.5 py-px text-xs font-medium tabular-nums ${TONE_CLASSES[tone]}`}>
      {children}
    </span>
  );
}
