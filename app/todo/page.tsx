import type { Metadata } from "next";
import { TodoView } from "./todo-view";

export const metadata: Metadata = {
  title: "To-do · Bloomsbuddy",
};

export default function TodoPage() {
  return <TodoView />;
}
