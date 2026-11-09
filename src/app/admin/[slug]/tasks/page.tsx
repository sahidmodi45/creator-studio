import { asc, eq, sql } from "drizzle-orm";
import Link from "next/link";
import { NewTaskForm, TaskStatusControl } from "@/components/admin-forms";
import { db } from "@/db";
import { tasks, users } from "@/db/schema";
import { requireTeam } from "@/lib/auth";
import { formatDayShort, todayString } from "@/lib/format";
import { workspaceTeam } from "@/lib/queries";

export default async function TasksPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { workspace } = await requireTeam(slug);
  const today = todayString();
  const [rows, team] = await Promise.all([
    db
      .select({
        id: tasks.id,
        title: tasks.title,
        description: tasks.description,
        status: tasks.status,
        dueDate: tasks.dueDate,
        contentItemId: tasks.contentItemId,
        assignee: users.name,
      })
      .from(tasks)
      .leftJoin(users, eq(users.id, tasks.assigneeId))
      .where(eq(tasks.workspaceId, workspace.id))
      .orderBy(sql`${tasks.dueDate} ASC NULLS LAST`, asc(tasks.createdAt)),
    workspaceTeam(workspace.id),
  ]);

  const groups = [
    { title: "To do", rows: rows.filter((row) => row.status === "todo") },
    { title: "Doing", rows: rows.filter((row) => row.status === "doing") },
    { title: "Done", rows: rows.filter((row) => row.status === "done") },
  ];

  return (
    <div className="stack-lg">
      <div className="stack-sm">
        <p className="kicker">Team</p>
        <h1 className="display-sm">Tasks</h1>
      </div>
      <NewTaskForm slug={slug} team={team} />
      {groups.map((group) => (
        <section key={group.title} className="stack-sm">
          <h2 className="section-title">{group.title} <span className="muted small">{group.rows.length}</span></h2>
          {group.rows.length === 0 ? (
            <p className="muted small">Nothing here.</p>
          ) : (
            <div>
              {group.rows.map((task) => (
                <div key={task.id} className="list-row" data-testid="task-row">
                  <div className="grow">
                    {task.contentItemId ? (
                      <Link href={`/admin/${slug}/content/${task.contentItemId}`} className="list-title plain-link">{task.title}</Link>
                    ) : (
                      <p className="list-title">{task.title}</p>
                    )}
                    <p className="muted small">
                      {[
                        task.description,
                        task.assignee,
                        task.dueDate && `${task.status !== "done" && task.dueDate < today ? "Overdue, was " : "Due "}${formatDayShort(task.dueDate)}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <TaskStatusControl slug={slug} taskId={task.id} status={task.status} />
                </div>
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
