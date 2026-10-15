"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { BusynessLevel, Recommendation, RecommendationOption, RecommendationType } from "@/lib/types";
import { travelLabel } from "@/lib/buildings";

export type RecState = { status: "loading" } | { status: "ok"; rec: Recommendation } | { status: "error" };

const LOADING_LINES = [
  "Checking library busyness…",
  "Checking society events…",
  "Checking your deadlines…",
  "Checking travel time home…",
  "Checking your to-do list…",
];

const TYPE_EMOJI: Record<RecommendationType, string> = { study: "📚", event: "🎉", rest: "☕", home: "🏠", food: "🍜" };

export function RecommendationPanel({ state, onRetry }: { state: RecState; onRetry: () => void }) {
  if (state.status === "loading") return <Loading />;
  if (state.status === "error") return <Fallback onRetry={onRetry} />;

  const { top, alternatives } = state.rec;
  return (
    <div className="flex flex-col gap-3">
      <TopPick option={top} />
      <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">Or…</p>
      {alternatives.map((option) => (
        <Alternative key={option.title} option={option} />
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
      <p aria-live="polite" className="mb-3 text-sm text-emerald-800 dark:text-emerald-200">
        {LOADING_LINES[line]}
      </p>
      <div className="flex animate-pulse flex-col gap-3">
        <div className="h-32 rounded-xl bg-emerald-100 dark:bg-emerald-900/50" />
        <div className="h-16 rounded-xl bg-emerald-100/70 dark:bg-emerald-900/30" />
        <div className="h-16 rounded-xl bg-emerald-100/70 dark:bg-emerald-900/30" />
      </div>
    </div>
  );
}

function Fallback({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="rounded-xl bg-white p-4 text-sm dark:bg-zinc-950">
      <p className="font-semibold">Couldn&apos;t get recommendations</p>
      <p className="mt-1 text-zinc-600 dark:text-zinc-400">
        Something went wrong loading picks for this gap. Try again.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 min-h-11 rounded-full bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:text-emerald-950 dark:hover:bg-emerald-400"
      >
        Try again
      </button>
    </div>
  );
}

function TopPick({ option }: { option: RecommendationOption }) {
  return (
    <article className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-emerald-200 dark:bg-zinc-950 dark:ring-emerald-800">
      <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Top pick</p>
      <h3 className="mt-1 text-lg font-semibold leading-snug">
        <span aria-hidden>{TYPE_EMOJI[option.type]}</span> {option.title}
      </h3>
      <p className="text-sm text-zinc-500">{option.place}</p>
      <Badges option={option} />
      <p className="mt-3 text-sm text-zinc-800 dark:text-zinc-200">{option.reason}</p>
    </article>
  );
}

function Alternative({ option }: { option: RecommendationOption }) {
  return (
    <article className="rounded-xl bg-white/70 p-3 dark:bg-zinc-950/60">
      <h3 className="text-sm font-semibold">
        <span aria-hidden>{TYPE_EMOJI[option.type]}</span> {option.title}{" "}
        <span className="font-normal text-zinc-500">· {option.place}</span>
      </h3>
      <Badges option={option} />
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{option.reason}</p>
    </article>
  );
}

function Badges({ option }: { option: RecommendationOption }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      <Badge tone="neutral">{option.travelMins === 0 ? "Staying put" : travelLabel(option.travelMins, option.travelMode)}</Badge>
      {option.busyness && <Badge tone={BUSYNESS_TONE[option.busyness]}>🪑 Usually {option.busyness}</Badge>}
      {option.todoId && <Badge tone="good">📝 From your to-do</Badge>}
    </div>
  );
}

type Tone = "neutral" | "good" | "warn" | "bad";

const BUSYNESS_TONE: Record<BusynessLevel, Tone> = { quiet: "good", moderate: "neutral", busy: "warn", packed: "bad" };

const TONE_CLASSES: Record<Tone, string> = {
  neutral: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  good: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200",
  warn: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200",
  bad: "bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200",
};

function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${TONE_CLASSES[tone]}`}>
      {children}
    </span>
  );
}
