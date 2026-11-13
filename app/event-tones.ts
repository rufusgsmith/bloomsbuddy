// Colours for calendar items, by where an item came from (not its type): the timetable (classes, and
// one-day edits of them), the student's own events, society events, to-dos and exams. On the calendar a
// block is filled with the tone's solid colour and its text is white; on the Day list's white cards the
// icon tile and kind badge use a pastel version. The colours are CSS variables in globals.css (light and
// dark), not Tailwind's scales.
// Green is kept for free gaps and yellow for deadline flags, so no tone uses them.
// Shared by the week grid, the day list, the setup editor's day calendar and the legend.

export type EventTone = "timetable" | "mine" | "society" | "todo" | "exam";

export interface ToneClasses {
  /** A calendar block or a strip: solid fill, white text, darker on hover. */
  block: string;
  /** The time line inside a block. */
  text: string;
  /** The square icon tile on a day-list card. */
  tile: string;
  /** A small kind badge ("Lecture", "Exam"). */
  badge: string;
  /** The legend's swatch. */
  dot: string;
}

// The same for every tone: blocks are solid, so their secondary text is a softer white.
const ON_SOLID = "text-white/85";

export const TONE: Record<EventTone, ToneClasses> = {
  timetable: {
    block: "border-transparent bg-timetable-dot text-white hover:bg-timetable-hover",
    text: ON_SOLID,
    tile: "border-timetable-line bg-timetable-fill text-timetable-ink",
    badge: "border-timetable-line bg-timetable-fill text-timetable-ink",
    dot: "bg-timetable-dot",
  },
  mine: {
    block: "border-transparent bg-mine-dot text-white hover:bg-mine-hover",
    text: ON_SOLID,
    tile: "border-mine-line bg-mine-fill text-mine-ink",
    badge: "border-mine-line bg-mine-fill text-mine-ink",
    dot: "bg-mine-dot",
  },
  society: {
    block: "border-transparent bg-society-dot text-white hover:bg-society-hover",
    text: ON_SOLID,
    tile: "border-society-line bg-society-fill text-society-ink",
    badge: "border-society-line bg-society-fill text-society-ink",
    dot: "bg-society-dot",
  },
  todo: {
    block: "border-transparent bg-todo-dot text-white hover:bg-todo-hover",
    text: ON_SOLID,
    tile: "border-todo-line bg-todo-fill text-todo-ink",
    badge: "border-todo-line bg-todo-fill text-todo-ink",
    dot: "bg-todo-dot",
  },
  exam: {
    block: "border-transparent bg-exam-dot text-white hover:bg-exam-hover",
    text: ON_SOLID,
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
