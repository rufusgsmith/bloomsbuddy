// The student data the Today page sends with /api/recommend and /api/chat. Checked on the server
// by parseStudentContext (lib/recommend/request.ts).

import { homeLocation } from "./home";
import type { Deadline, Home, ManualEvent, Society, Todo } from "./types";

export function requestContext({
  deadlines,
  societies,
  home,
  todos,
  manualEvents,
}: {
  deadlines?: Deadline[];
  societies?: Society[];
  home: Home | null;
  todos: Todo[];
  manualEvents: ManualEvent[];
}) {
  const homeLoc = homeLocation(home);
  // Repeating to-dos go too, even if ticked: the server works out which come up when.
  const openTodos = todos.filter((t) => !t.done || t.repeat);
  // Society events already on the calendar, so Claude doesn't suggest them again.
  const addedEventIds = manualEvents.flatMap((m) => (m.societyEventId ? [m.societyEventId] : []));
  return {
    ...(deadlines ? { deadlines } : {}),
    ...(societies?.length ? { societies } : {}),
    ...(homeLoc ? { home: homeLoc } : {}),
    ...(openTodos.length ? { todos: openTodos } : {}),
    ...(addedEventIds.length ? { addedEventIds } : {}),
  };
}
