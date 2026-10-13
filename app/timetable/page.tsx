import type { Metadata } from "next";
import { SetupFlow } from "../setup/setup-flow";

export const metadata: Metadata = {
  title: "Edit timetable · Bloomsbuddy",
};

export default function TimetablePage() {
  return <SetupFlow mode="timetable" />;
}
