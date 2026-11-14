import type { Todo } from "../types";
import { toDemoDay } from "./week";

// The demo week's to-do list, written against the week of Mon 12 Oct 2026 and moved by mockTodos().
// None has a time or a slot on Today, so they never change the demo gaps (the canned picks in
// recommendations.ts are keyed by those gaps).
const TODOS: Todo[] = [
  {
    id: "todo-demo-email-tutor",
    title: "Email personal tutor to book a catch-up",
    estMinutes: 10,
    doBefore: "2026-10-13",
    done: false,
  },
  {
    id: "todo-demo-reading",
    title: "Read chapter 3 of the calculus textbook",
    estMinutes: 45,
    doBefore: "2026-10-19",
    done: false,
  },
  {
    id: "todo-demo-print",
    title: "Print the Mechanics homework",
    estMinutes: 10,
    doBefore: "2026-10-15",
    location: { kind: "building", buildingId: "students-union" },
    done: false,
  },
  {
    id: "todo-demo-notes",
    title: "Tidy up this week's lecture notes",
    estMinutes: 30,
    repeat: { freq: "weekly", days: [5], partOfDay: "afternoon" },
    done: false,
  },
];

/** The demo to-dos, moved to the demo week. */
export function mockTodos(): Todo[] {
  return TODOS.map((t) => (t.doBefore ? { ...t, doBefore: toDemoDay(t.doBefore) } : t));
}
