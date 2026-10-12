import type { Deadline } from "../types";

// Note: deadlines from 25 Oct 2026 onward are on GMT (+00:00) because BST ends that day.
// These are deliberately included to catch timezone bugs.
export const MOCK_DEADLINES: Deadline[] = [
  {
    id: "dl-stat0002-quiz3",
    moduleCode: "STAT0002",
    title: "Moodle Quiz 3: Conditional probability",
    due: "2026-10-15T23:59:00+01:00",
    weight: 2,
    source: "moodle",
    estimatedHours: 1,
  },
  {
    id: "dl-econ0019-ps2",
    moduleCode: "ECON0019",
    title: "Problem Set 2: OLS and hypothesis testing",
    due: "2026-10-16T12:00:00+01:00",
    weight: 5,
    source: "moodle",
    estimatedHours: 4,
  },
  {
    id: "dl-econ0027-ps1",
    moduleCode: "ECON0027",
    title: "Problem Set 1: Nash equilibria",
    due: "2026-10-21T17:00:00+01:00",
    weight: 10,
    source: "moodle",
    estimatedHours: 5,
  },
  {
    id: "dl-econ0013-midterm-essay",
    moduleCode: "ECON0013",
    title: "Mid-term essay: Consumer theory in practice",
    due: "2026-10-26T10:00:00+00:00",
    weight: 30,
    source: "moodle",
    estimatedHours: 12,
  },
  {
    id: "dl-phil0045-final-essay",
    moduleCode: "PHIL0045",
    title: "Final essay (3,000 words)",
    due: "2026-12-14T12:00:00+00:00",
    weight: 50,
    source: "moodle",
    estimatedHours: 25,
  },
];
