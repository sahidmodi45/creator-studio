import Link from "next/link";
import { requireWorkspace } from "@/lib/auth";
import { CLIENT_CAN_SEE_WORK, CLIENT_STATUS_LABEL, FORMAT_LABEL, type ContentStatus } from "@/lib/constants";
import { formatDayWeekday } from "@/lib/format";
import { clientContentList } from "@/lib/queries";

const GROUPS: { title: string; statuses: ContentStatus[] }[] = [
  { title: "Waiting for you", statuses: ["client_review"] },
  { title: "Being made", statuses: ["in_production", "internal_review", "revision_requested"] },
  { title: "Planning", statuses: ["idea", "briefed"] },
  { title: "Ready to go", statuses: ["approved", "scheduled"] },
  { title: "Live", statuses: ["published"] },
];

export default async function MakingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { workspace } = await requireWorkspace(slug);
  const items = await clientContentList(workspace.id);

  return (
    <main className="client-main narrow stack-xl">
      <div className="stack-sm">
        <p className="kicker">In the making</p>
        <h1 className="display-sm">Everything we are <em>working on</em></h1>
      </div>
      {items.length === 0 && (
        <div className="empty">
          <p className="section-title">Nothing here yet</p>
          <p className="small">Share an idea or send some files, and it will show up here.</p>
        </div>
      )}
      {GROUPS.map((group) => {
        const rows = items.filter((item) => group.statuses.includes(item.status));
        if (!rows.length) return null;
        return (
          <section key={group.title} className="stack-sm">
            <h2 className="section-title">{group.title}</h2>
            <div>
              {rows.map((item) => {
                const inner = (
                  <>
                    <div className="grow">
                      <p className="list-title">{item.title}</p>
                      <p className="muted small">
                        {FORMAT_LABEL[item.format]}
                        {item.scheduledDate ? ` · ${formatDayWeekday(item.scheduledDate)}` : ""}
                      </p>
                    </div>
                    <span className="badge">{CLIENT_STATUS_LABEL[item.status]}</span>
                  </>
                );
                return CLIENT_CAN_SEE_WORK.includes(item.status) ? (
                  <Link key={item.id} className="list-row" href={`/w/${slug}/review/${item.id}`}>{inner}</Link>
                ) : (
                  <div key={item.id} className="list-row" data-testid="making-row">{inner}</div>
                );
              })}
            </div>
          </section>
        );
      })}
    </main>
  );
}
