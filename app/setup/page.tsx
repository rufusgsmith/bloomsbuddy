import type { Metadata } from "next";
import { SetupFlow } from "./setup-flow";

export const metadata: Metadata = {
  title: "Your timetable · Bloomsbuddy",
};

export default function SetupPage() {
  return <SetupFlow />;
}
