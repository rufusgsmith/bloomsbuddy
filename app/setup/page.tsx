import type { Metadata } from "next";
import { SetupFlow } from "./setup-flow";

export const metadata: Metadata = {
  title: "Get set up · Bloomsbuddy",
};

export default function SetupPage() {
  return <SetupFlow mode="onboarding" />;
}
