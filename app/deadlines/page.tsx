import type { Metadata } from "next";
import { DeadlinesView } from "./deadlines-view";

export const metadata: Metadata = {
  title: "Deadlines · Bloomsbuddy",
};

export default function DeadlinesPage() {
  return <DeadlinesView />;
}
