import { addDays, subDays } from "date-fns";
import { describe, expect, it } from "vitest";

import type { Task } from "../types";
import { filterTasks } from "./taskTabs";

const task = (id: number, due: Date, done = false): Task => ({
  id,
  contact_id: 1,
  type: "call",
  text: `task ${id}`,
  due_date: due.toISOString(),
  done_date: done ? new Date().toISOString() : null,
});

describe("filterTasks", () => {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const tasks = [
    task(1, subDays(today, 3)),
    task(2, today),
    task(3, addDays(today, 3)),
    task(4, subDays(today, 1), true),
  ];

  it("mine: every open task", () => {
    expect(filterTasks(tasks, "mine").map((t) => t.id)).toEqual([1, 2, 3]);
  });

  it("today: open tasks due today", () => {
    expect(filterTasks(tasks, "today").map((t) => t.id)).toEqual([2]);
  });

  it("overdue: open tasks due before today", () => {
    expect(filterTasks(tasks, "overdue").map((t) => t.id)).toEqual([1]);
  });

  it("done: finished tasks only", () => {
    expect(filterTasks(tasks, "done").map((t) => t.id)).toEqual([4]);
  });
});
