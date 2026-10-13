import { Home } from "./home";

// The demo week follows the calendar (lib/mock/week.ts), so <Home> builds it in the browser
// instead of baking a week in at build time.
export default function TodayPage() {
  return <Home />;
}
