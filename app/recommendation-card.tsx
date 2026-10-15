"use client";

import {
  Armchair,
  BookOpen,
  Coffee,
  Footprints,
  House,
  ListTodo,
  RotateCw,
  Ticket,
  TrainFront,
  Utensils,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { BusynessLevel, Recommendation, RecommendationOption, RecommendationType } from "@/lib/types";
import { travelLabel } from "@/lib/buildings";
import { Badge, ghostButton, ICON, secondaryButton } from "./form-ui";

export type RecState = { status: "loading" } | { status: "ok"; rec: Recommendation } | { status: "error" };

const LOADING_LINES = [
  "Checking library busyness…",
  "Checking society events…",
  "Checking your deadlines…",
  "Checking travel time home…",
  "Checking your to-do list…",
];

const TYPE_ICON: Record<RecommendationType, LucideIcon> = {
  study: BookOpen,
  event: Ticket,
  rest: Coffee,
  home: House,
  food: Utensils,
};

/** onReload asks Claude again, skipping the cached picks: "Try again" after an error, "Redo" after picks. */
export function RecommendationPanel({ state, onReload }: { state: RecState; onReload: () => void }) {
  if (state.status === "loading") return <Loading />;
  if (state.status === "error") return <Fallback onRetry={onReload} />;

  const { top, alternatives } = state.rec;
  return (
    <div>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted">Top pick</h3>
        <button
          type="button"
          onClick={onReload}
          aria-label="Redo: get fresh picks for this gap"
          className={`${ghostButton} -mr-3 min-h-9`}
        >
          <RotateCw {...ICON} />
          Redo
        </button>
      </div>
      <TopPick option={top} />
      <h3 className="mt-4 text-sm font-medium text-muted">Or</h3>
      <ul className="divide-y divide-line">
        {alternatives.map((option) => (
          <Alternative key={option.title} option={option} />
        ))}
      </ul>
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
      <div className="flex animate-pulse flex-col gap-2">
        <div className="hatch h-28 rounded-lg" />
        <div className="h-12 rounded-lg bg-sunken" />
        <div className="h-12 rounded-lg bg-sunken" />
      </div>
    </div>
  );
}

function Fallback({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="text-sm">
      <p className="font-medium">Couldn&apos;t get picks for this gap</p>
      <p className="mt-1 text-muted">The request didn&apos;t go through. Try again in a moment.</p>
      <button type="button" onClick={onRetry} className={`${secondaryButton} mt-3`}>
        <RotateCw {...ICON} />
        Try again
      </button>
    </div>
  );
}

function TypeIcon({ type, large }: { type: RecommendationType; large?: boolean }) {
  const Icon = TYPE_ICON[type];
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-lg ${
        large ? "size-10 bg-square text-on-square" : "size-8 bg-sunken text-muted"
      }`}
    >
      <Icon size={large ? 20 : 16} strokeWidth={1.75} />
    </span>
  );
}

function TopPick({ option }: { option: RecommendationOption }) {
  return (
    <article className="mt-2 flex gap-3 rounded-lg bg-square-tint p-3">
      <TypeIcon type={option.type} large />
      <div className="min-w-0">
        <h4 className="text-base font-semibold leading-snug">{option.title}</h4>
        <p className="text-sm text-muted">{option.place}</p>
        <Badges option={option} />
        <p className="mt-2 text-sm">{option.reason}</p>
      </div>
    </article>
  );
}

function Alternative({ option }: { option: RecommendationOption }) {
  return (
    <li className="flex gap-3 py-3">
      <TypeIcon type={option.type} />
      <div className="min-w-0">
        <h4 className="text-sm font-semibold">
          {option.title} <span className="font-normal text-muted">at {option.place}</span>
        </h4>
        <Badges option={option} />
        <p className="mt-1 text-sm text-muted">{option.reason}</p>
      </div>
    </li>
  );
}

function Badges({ option }: { option: RecommendationOption }) {
  const Travel = option.travelMode === "tube" ? TrainFront : Footprints;
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      <Badge>
        {option.travelMins !== 0 && <Travel {...ICON} size={12} />}
        {option.travelMins === 0 ? "Staying put" : travelLabel(option.travelMins, option.travelMode)}
      </Badge>
      {option.busyness && (
        <Badge tone={BUSYNESS_TONE[option.busyness]}>
          <Armchair {...ICON} size={12} />
          Usually {option.busyness}
        </Badge>
      )}
      {option.todoId && (
        <Badge tone="good">
          <ListTodo {...ICON} size={12} />
          From your to-do
        </Badge>
      )}
    </div>
  );
}

const BUSYNESS_TONE: Record<BusynessLevel, "neutral" | "good" | "warn" | "bad"> = {
  quiet: "good",
  moderate: "neutral",
  busy: "warn",
  packed: "bad",
};
