import type { Metadata } from "next";
import { SocietiesView } from "./societies-view";

export const metadata: Metadata = {
  title: "Societies · Bloomsbuddy",
};

export default function SocietiesPage() {
  return <SocietiesView />;
}
