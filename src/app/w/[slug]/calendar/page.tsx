import Link from "next/link";
import { requireWorkspace } from "@/lib/auth";
import { monthDays, monthParam, monthTitle, shiftMonth, WEEKDAYS } from "@/lib/calendar";
import { CLIENT_CAN_SEE_WORK } from "@/lib/constants";
import { todayString } from "@/lib/format";
import { clientContentList } from "@/lib/queries";

export default async function ClientCalendar({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ m?: string }>;
}) {
  const { slug } = await params;
  const { workspace } = await requireWorkspace(slug);
  const today = todayString();
  const month = monthParam((await searchParams).m, today);
  const items = (await clientContentList(workspace.id)).filter((item) => item.scheduledDate);
  const days = monthDays(month);

  return (
    <main className="client-main stack-lg">
      <div className="row-between">
        <div className="stack-sm">
          <p className="kicker">Calendar</p>
          <h1 className="display-sm">{monthTitle(month)}</h1>
        </div>
        <div className="row-sm">
          <Link className="btn btn-sm" href={`?m=${shiftMonth(month, -1)}`}>Previous</Link>
          <Link className="btn btn-sm" href={`?m=${today.slice(0, 7)}`}>Today</Link>
          <Link className="btn btn-sm" href={`?m=${shiftMonth(month, 1)}`}>Next</Link>
        </div>
      </div>
      <div className="calendar" data-testid="calendar">
        {WEEKDAYS.map((day) => <div className="calendar-head" key={day}>{day}</div>)}
        {days.map((day) => (
          <div key={day.date} className={`calendar-day${day.inMonth ? "" : " other"}${day.date === today ? " today" : ""}`}>
            <span className="calendar-num">{day.day}</span>
            {items
              .filter((item) => item.scheduledDate === day.date)
              .map((item) =>
                CLIENT_CAN_SEE_WORK.includes(item.status) ? (
                  <Link key={item.id} href={`/w/${slug}/review/${item.id}`} className={`calendar-item st-${item.status}`} title={item.title}>
                    {item.title}
                  </Link>
                ) : (
                  <span key={item.id} className={`calendar-item st-${item.status}`} title={item.title}>{item.title}</span>
                ),
              )}
          </div>
        ))}
      </div>
    </main>
  );
}
