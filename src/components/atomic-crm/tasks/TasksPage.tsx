import { useGetIdentity, useGetList, useTranslate } from "ra-core";
import { useState } from "react";
import { Link } from "react-router";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import type { Task as TaskRecord } from "../types";
import { Task } from "./Task";
import { filterTasks, type TaskTab } from "./taskTabs";

/** Desktop screen of the person's own tasks: sales tasks and the tasks of their deals. */
export const TasksPage = () => {
  const translate = useTranslate();
  const { identity } = useGetIdentity();
  const [tab, setTab] = useState<TaskTab>("mine");

  const { data, isPending } = useGetList<TaskRecord>(
    "tasks",
    {
      filter: { sales_id: identity?.id },
      pagination: { page: 1, perPage: 500 },
      sort: { field: "due_date", order: "ASC" },
    },
    { enabled: identity?.id != null },
  );

  const tasks = filterTasks(data ?? [], tab);
  const tabs: TaskTab[] = ["mine", "today", "overdue", "done"];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">
        {translate("crm.tasks_page.title")}
      </h1>
      <Tabs value={tab} onValueChange={(value) => setTab(value as TaskTab)}>
        <TabsList>
          {tabs.map((value) => (
            <TabsTrigger key={value} value={value}>
              {translate(`crm.tasks_page.${value}`)}
              {data ? ` · ${filterTasks(data, value).length}` : ""}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <Card className="p-4">
        {isPending ? null : tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {translate("crm.tasks_page.empty")}
          </p>
        ) : (
          <div className="space-y-3">
            {tasks.map((task) => (
              <div key={task.id}>
                <Task task={task} showContact />
                {task.deal_id != null && (
                  <Link
                    to={`/deals/${task.deal_id}/show`}
                    className="ml-9 text-xs text-muted-foreground hover:underline"
                  >
                    {translate("crm.tasks_page.deal")} #{task.deal_id}
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};

TasksPage.path = "/my-tasks";
