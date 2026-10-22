import type { Todo } from "../types";
import { toDemoDay } from "./week";

// The demo week's to-do list, written against the week of Mon 12 Oct 2026 and moved by mockTodos().
// None has a time or a slot on Today, so they never change the demo gaps (the canned picks in
// recommendations.ts are keyed by those gaps).
const TODOS: Todo[] = [
  {
    id: "todo-demo-email-tutor",
    title: "Email personal tutor about switching to PHIL0045",
    estMinutes: 10,
    doBefore: "2026-10-13",
    done: false,
  },
  {
    id: "todo-demo-varian",
    title: "Read Varian ch. 5 (choice) for the micro tutorial",
    estMinutes: 45,
    doBefore: "2026-10-19",
    done: false,
  },
  {
    id: "todo-demo-print-ps",
    title: "Print the Game Theory problem set",
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
