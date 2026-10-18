// Colours for calendar items, by where an item came from (not its type): the timetable (classes, and
// one-day edits of them), the student's own events, society events, to-dos and exams. Pastel fill, a
// slightly darker border, and the time in the tone's strong ink; titles stay in the page ink. The
// colours are CSS variables in globals.css (light and dark), not Tailwind's scales.
// Green is kept for free gaps and amber for deadline flags, so no tone uses them.
// Shared by the week grid, the day list, the setup editor's day calendar and the legend.

export type EventTone = "timetable" | "mine" | "society" | "todo" | "exam";

export interface ToneClasses {
  /** A calendar block or a strip: fill, border and hover. */
  block: string;
  /** The time line inside a block, and the strong text in a badge. */
  text: string;
  /** The square icon tile on a day-list card. */
  tile: string;
  /** A small kind badge ("Lecture", "Exam"). */
  badge: string;
  /** The legend's dot. */
  dot: string;
}

export const TONE: Record<EventTone, ToneClasses> = {
  timetable: {
    block: "border-timetable-line bg-timetable-fill hover:bg-timetable-hover",
    text: "text-timetable-ink",
    tile: "border-timetable-line bg-timetable-fill text-timetable-ink",
    badge: "border-timetable-line bg-timetable-fill text-timetable-ink",
    dot: "bg-timetable-dot",
  },
  mine: {
    block: "border-mine-line bg-mine-fill hover:bg-mine-hover",
    text: "text-mine-ink",
    tile: "border-mine-line bg-mine-fill text-mine-ink",
    badge: "border-mine-line bg-mine-fill text-mine-ink",
    dot: "bg-mine-dot",
  },
  society: {
    block: "border-society-line bg-society-fill hover:bg-society-hover",
    text: "text-society-ink",
    tile: "border-society-line bg-society-fill text-society-ink",
    badge: "border-society-line bg-society-fill text-society-ink",
    dot: "bg-society-dot",
  },
  todo: {
    block: "border-todo-line bg-todo-fill hover:bg-todo-hover",
    text: "text-todo-ink",
    tile: "border-todo-line bg-todo-fill text-todo-ink",
    badge: "border-todo-line bg-todo-fill text-todo-ink",
    dot: "bg-todo-dot",
  },
  exam: {
    block: "border-exam-line bg-exam-fill hover:bg-exam-hover",
    text: "text-exam-ink",
    tile: "border-exam-line bg-exam-fill text-exam-ink",
    badge: "border-exam-line bg-exam-fill text-exam-ink",
    dot: "bg-exam-dot",
  },
};

/** A free gap: dashed green. */
export const GAP = {
  block: "border-dashed border-gap-line bg-gap-fill/70 hover:bg-gap-hover",
  open: "border-dashed border-gap-ink bg-gap-hover",
  /** Short gaps (no picks): quieter still. */
  plain: "border-dashed border-gap-line/70 bg-gap-fill/40",
  text: "text-gap-ink",
};

export const TONE_LABELS: { tone: EventTone; label: string }[] = [
  { tone: "timetable", label: "Timetable" },
  { tone: "mine", label: "Your events" },
  { tone: "society", label: "Society" },
  { tone: "todo", label: "To-do" },
  { tone: "exam", label: "Exam" },
];
