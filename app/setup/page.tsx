import type { Metadata } from "next";
import { SetupFlow } from "./setup-flow";

export const metadata: Metadata = {
  title: "Get set up · Bloomsbuddy",
};

/** ?again=1: run setup again with the saved data, instead of being sent to /timetable. */
export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { again } = await searchParams;
  return <SetupFlow mode="onboarding" again={again === "1"} />;
}
