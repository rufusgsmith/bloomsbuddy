import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DEMO_ONLY } from "@/lib/config";
import { SetupFlow } from "./setup-flow";

export const metadata: Metadata = {
  title: "Get set up · Bloomsbuddy",
};

export default function SetupPage() {
  if (DEMO_ONLY) redirect("/");
  return <SetupFlow mode="onboarding" />;
}
