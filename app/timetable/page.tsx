import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DEMO_ONLY } from "@/lib/config";
import { SetupFlow } from "../setup/setup-flow";

export const metadata: Metadata = {
  title: "Edit timetable · Bloomsbuddy",
};

export default function TimetablePage() {
  if (DEMO_ONLY) redirect("/");
  return <SetupFlow mode="timetable" />;
}
