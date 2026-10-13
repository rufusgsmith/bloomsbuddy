import type { TimetableEvent } from "../types";
import { toDemoWeek } from "./week";

// One week for a 2nd-year BSc Economics student, written as Mon 12 – Fri 16 Oct 2026 and
// moved to the current week by mockTimetable() (see week.ts).
//
// Gap mix by design:
//   Mon: 30m, 1h30
//   Tue: 4h (big one)
//   Wed: 1h, then a free afternoon (Wednesday is sports afternoon at UCL)
//   Thu: 1h, 2h
//   Fri: 30m, 1h30, 3h
const WEEK: TimetableEvent[] = [
  // Monday 12 Oct
  {
    id: "tt-mon-1",
    moduleCode: "ECON0013",
    title: "Microeconomics",
    kind: "lecture",
    start: "2026-10-12T09:00:00+01:00",
    end: "2026-10-12T11:00:00+01:00",
    buildingId: "roberts",
    room: "Roberts G06 Sir Ambrose Fleming LT",
  },
  {
    id: "tt-mon-2",
    moduleCode: "ECON0013",
    title: "Microeconomics tutorial",
    kind: "tutorial",
    start: "2026-10-12T11:30:00+01:00",
    end: "2026-10-12T12:30:00+01:00",
    buildingId: "drayton-house",
    room: "Drayton House B20",
  },
  {
    id: "tt-mon-3",
    moduleCode: "ECON0019",
    title: "Quantitative Economics and Econometrics",
    kind: "lecture",
    start: "2026-10-12T14:00:00+01:00",
    end: "2026-10-12T16:00:00+01:00",
    buildingId: "ioe-bedford-way",
    room: "IOE Logan Hall",
  },

  // Tuesday 13 Oct
  {
    id: "tt-tue-1",
    moduleCode: "STAT0002",
    title: "Introduction to Probability and Statistics",
    kind: "lecture",
    start: "2026-10-13T10:00:00+01:00",
    end: "2026-10-13T11:00:00+01:00",
    buildingId: "christopher-ingold",
    room: "Christopher Ingold XLG1 Chemistry LT",
  },
  {
    id: "tt-tue-2",
    moduleCode: "ECON0027",
    title: "Game Theory",
    kind: "lecture",
    start: "2026-10-13T15:00:00+01:00",
    end: "2026-10-13T17:00:00+01:00",
    buildingId: "cruciform",
    room: "Cruciform B304 LT1",
  },

  // Wednesday 14 Oct
  {
    id: "tt-wed-1",
    moduleCode: "ECON0019",
    title: "Econometrics computer lab (Stata)",
    kind: "lab",
    start: "2026-10-14T09:00:00+01:00",
    end: "2026-10-14T10:00:00+01:00",
    buildingId: "gordon-street-25",
    room: "25 Gordon Street, Room 105 (cluster)",
  },
  {
    id: "tt-wed-2",
    moduleCode: "STAT0002",
    title: "Probability problem class",
    kind: "tutorial",
    start: "2026-10-14T11:00:00+01:00",
    end: "2026-10-14T12:00:00+01:00",
    buildingId: "darwin",
    room: "Darwin B05",
  },

  // Thursday 15 Oct
  {
    id: "tt-thu-1",
    moduleCode: "PHIL0045",
    title: "Philosophy of Economics",
    kind: "seminar",
    start: "2026-10-15T10:00:00+01:00",
    end: "2026-10-15T11:00:00+01:00",
    buildingId: "bentham-house",
    room: "Bentham House 1.04",
  },
  {
    id: "tt-thu-2",
    moduleCode: "ECON0013",
    title: "Microeconomics",
    kind: "lecture",
    start: "2026-10-15T12:00:00+01:00",
    end: "2026-10-15T14:00:00+01:00",
    buildingId: "roberts",
    room: "Roberts G06 Sir Ambrose Fleming LT",
  },
  {
    id: "tt-thu-3",
    moduleCode: "ECON0027",
    title: "Game Theory tutorial",
    kind: "tutorial",
    start: "2026-10-15T16:00:00+01:00",
    end: "2026-10-15T17:00:00+01:00",
    buildingId: "ioe-bedford-way",
    room: "IOE 20 Bedford Way, Room 822",
  },

  // Friday 16 Oct
  {
    id: "tt-fri-1",
    moduleCode: "ECON0019",
    title: "Quantitative Economics and Econometrics",
    kind: "lecture",
    start: "2026-10-16T09:00:00+01:00",
    end: "2026-10-16T10:00:00+01:00",
    buildingId: "ioe-bedford-way",
    room: "IOE Logan Hall",
  },
  {
    id: "tt-fri-2",
    moduleCode: "ECON0013",
    title: "Microeconomics tutorial",
    kind: "tutorial",
    start: "2026-10-16T10:30:00+01:00",
    end: "2026-10-16T11:30:00+01:00",
    buildingId: "drayton-house",
    room: "Drayton House B20",
  },
  {
    id: "tt-fri-3",
    moduleCode: "STAT0002",
    title: "Introduction to Probability and Statistics",
    kind: "lecture",
    start: "2026-10-16T13:00:00+01:00",
    end: "2026-10-16T14:00:00+01:00",
    buildingId: "christopher-ingold",
    room: "Christopher Ingold XLG1 Chemistry LT",
  },
  {
    id: "tt-fri-4",
    moduleCode: "PHIL0045",
    title: "Philosophy of Economics",
    kind: "lecture",
    start: "2026-10-16T17:00:00+01:00",
    end: "2026-10-16T18:00:00+01:00",
    buildingId: "bentham-house",
    room: "Bentham House Gideon Schreier LT",
  },
];

/** The mock timetable, dated to the current demo week. */
export function mockTimetable(): TimetableEvent[] {
  return WEEK.map((e) => ({ ...e, start: toDemoWeek(e.start), end: toDemoWeek(e.end) }));
}
