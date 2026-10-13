import { eventsOnDay, findGaps, londonDateKey } from "@/lib/gaps";
import { MOCK_TIMETABLE } from "@/lib/mock";
import { Home } from "./home";
import type { Day } from "./today-timeline";

// The demo week is static, so it's built here at build time. <Home> swaps in the
// student's own timetable (from localStorage) when they've saved one.
// Fri 16 Oct is the hackathon demo day, so the demo timeline opens on it.
const DEMO_DAY = "2026-10-16";

export default function TodayPage() {
  const dateKeys = [...new Set(MOCK_TIMETABLE.map((e) => londonDateKey(e.start)))].sort();
  const days: Day[] = dateKeys.map((dateKey) => {
    const events = eventsOnDay(MOCK_TIMETABLE, dateKey);
    return { dateKey, events, gaps: findGaps(events) };
  });

  return <Home demoDays={days} demoDateKey={DEMO_DAY} />;
}
