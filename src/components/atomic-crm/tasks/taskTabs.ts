import type { Task as TaskRecord } from "../types";
import { isDone, isDueToday, isOverdue } from "./tasksPredicate";

export type TaskTab = "mine" | "today" | "overdue" | "done";

export const filterTasks = (tasks: TaskRecord[], tab: TaskTab) => {
  switch (tab) {
    case "mine":
      return tasks.filter((task) => !isDone(task));
    case "today":
      return tasks.filter((task) => !isDone(task) && isDueToday(task.due_date));
    case "overdue":
      return tasks.filter((task) => !isDone(task) && isOverdue(task.due_date));
    case "done":
      return tasks.filter((task) => isDone(task));
  }
};
