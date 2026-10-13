import type { Metadata } from "next";
import { Placeholder } from "../placeholder";

export const metadata: Metadata = {
  title: "To-do · Bloomsbuddy",
};

export default function TodoPage() {
  return <Placeholder title="To-do" blurb="Your to-do list will live here. Still sharpening the pencils." />;
}
