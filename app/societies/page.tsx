import type { Metadata } from "next";
import { Placeholder } from "../placeholder";

export const metadata: Metadata = {
  title: "Societies · Bloomsbuddy",
};

export default function SocietiesPage() {
  return <Placeholder title="Societies" blurb="Your societies and their events will show up here. Free pizza radar pending." />;
}
