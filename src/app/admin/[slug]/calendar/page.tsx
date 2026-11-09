import { and, eq, isNotNull, isNull } from "drizzle-orm";
import Link from "next/link";
import { NewContentForm } from "@/components/admin-forms";
import { CalendarBoard } from "@/components/calendar-board";
import { db } from "@/db";
import { contentItems } from "@/db/schema";
import { requireTeam } from "@/lib/auth";
import { monthDays, monthParam, monthTitle, shiftMonth } from "@/lib/calendar";
import { STATUS_LABEL } from "@/lib/constants";
import { todayString } from "@/lib/format";

export default async function AdminCalendar({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ m?: string }> }) {
  const { slug } = await params;
  const { workspace } = await requireTeam(slug);
  const today = todayString();
  const month = monthParam((await searchParams).m, today);
  const rows = await db
    .select({ id: contentItems.id, title: contentItems.title, status: contentItems.status, scheduledDate: contentItems.scheduledDate, scheduledTime: contentItems.scheduledTime })
    .from(contentItems)
    .where(and(eq(contentItems.workspaceId, workspace.id), isNull(contentItems.deletedAt), isNotNull(contentItems.scheduledDate)));
  const unscheduled = await db
    .select({ id: contentItems.id, title: contentItems.title, status: contentItems.status })
    .from(contentItems)
    .where(and(eq(contentItems.workspaceId, workspace.id), isNull(contentItems.deletedAt), isNull(contentItems.scheduledDate)));

  return (
    <div className="stack-lg">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div className="stack-sm">
          <p className="kicker">Content calendar</p>
          <h1 className="display-sm">{monthTitle(month)}</h1>
        </div>
        <div className="row-sm">
          <Link className="btn btn-sm" href={`?m=${shiftMonth(month, -1)}`}>Previous</Link>
          <Link className="btn btn-sm" href={`?m=${today.slice(0, 7)}`}>Today</Link>
          <Link className="btn btn-sm" href={`?m=${shiftMonth(month, 1)}`}>Next</Link>
          <NewContentForm slug={slug} pillars={workspace.pillars} />
        </div>
      </div>
      <p className="muted small">Drag a piece to another day to reschedule it. Open a piece to set the date for the first time.</p>
      <CalendarBoard
        slug={slug}
        today={today}
        days={monthDays(month)}
        entries={rows.map((row) => ({ ...row, scheduledDate: row.scheduledDate! }))}
      />
      {unscheduled.length > 0 && (
        <section className="stack-sm">
          <h2 className="section-title">Without a date</h2>
          <div>
            {unscheduled.map((item) => (
              <Link key={item.id} href={`/admin/${slug}/content/${item.id}`} className="list-row" style={{ padding: "10px 0" }}>
                <span className="grow list-title">{item.title}</span>
                <span className="badge">{STATUS_LABEL[item.status]}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
