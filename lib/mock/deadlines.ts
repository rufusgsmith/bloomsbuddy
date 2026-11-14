import type { Deadline } from "../types";
import { toDemoWeek } from "./week";

// Written against the week of Mon 12 Oct 2026, like the timetable, and moved by mockDeadlines().
// They spread over several weeks, so some land after BST ends (25 Oct 2026) and some before
// whichever week it is: good for catching timezone bugs.
// No module codes: the title alone says what it is.
const DEADLINES: Deadline[] = [
  {
    id: "dl-probability-quiz",
    moduleCode: "",
    title: "Probability quiz: coins and dice",
    due: "2026-10-15T23:59:00+01:00",
    weight: 2,
    source: "moodle",
    estimatedHours: 1,
  },
  {
    id: "dl-matrices-homework",
    moduleCode: "",
    title: "Matrices homework",
    due: "2026-10-16T12:00:00+01:00",
    weight: 5,
    source: "moodle",
    estimatedHours: 4,
  },
  {
    // An exam: a block on Today at its time, and revision picks in the days before.
    id: "dl-probability-test",
    moduleCode: "",
    title: "Probability test",
    exam: true,
    due: "2026-10-16T15:00:00+01:00",
    end: "2026-10-16T16:00:00+01:00",
    weight: 20,
    source: "manual",
    location: { kind: "building", buildingId: "cruciform" },
  },
  {
    id: "dl-mechanics-homework",
    moduleCode: "",
    title: "Mechanics homework: Newton's laws",
    due: "2026-10-21T17:00:00+01:00",
    weight: 10,
    source: "moodle",
    estimatedHours: 5,
  },
  {
    id: "dl-calculus-coursework",
    moduleCode: "",
    title: "Calculus coursework: rates of change",
    due: "2026-10-26T10:00:00+00:00",
    weight: 30,
    source: "moodle",
    estimatedHours: 12,
  },
  {
    id: "dl-history-essay",
    moduleCode: "",
    title: "History of Maths essay (3,000 words)",
    due: "2026-12-14T12:00:00+00:00",
    weight: 50,
    source: "moodle",
    estimatedHours: 25,
  },
];

/** The mock deadlines, moved by the same number of weeks as the timetable. */
export function mockDeadlines(): Deadline[] {
  return DEADLINES.map((d) => ({ ...d, due: toDemoWeek(d.due), ...(d.end ? { end: toDemoWeek(d.end) } : {}) }));
}
