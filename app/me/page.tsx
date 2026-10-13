import type { Metadata } from "next";
import { Placeholder } from "../placeholder";

export const metadata: Metadata = {
  title: "Me · Bloomsbuddy",
};

export default function MePage() {
  return <Placeholder title="Me" blurb="Your settings and saved stuff will go here. Watch this space." />;
}
