import { eventsOnDay, findGaps, londonDateKey } from "@/lib/gaps";
import { MOCK_TIMETABLE } from "@/lib/mock";
import { TodayTimeline, type Day } from "./today-timeline";

// Mock data only for now. Everything here is static, so the page prerenders at build time.
// Fri 16 Oct is the hackathon demo day, so the timeline opens on it.
const DEMO_DAY = "2026-10-16";

export default function TodayPage() {
  const dateKeys = [...new Set(MOCK_TIMETABLE.map((e) => londonDateKey(e.start)))].sort();
  const days: Day[] = dateKeys.map((dateKey) => {
    const events = eventsOnDay(MOCK_TIMETABLE, dateKey);
    return { dateKey, events, gaps: findGaps(events) };
  });

  return <TodayTimeline days={days} initialDateKey={DEMO_DAY} />;
}
