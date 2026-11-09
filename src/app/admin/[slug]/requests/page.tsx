import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { RequestActions } from "@/components/admin-forms";
import { db } from "@/db";
import { assets, creativeRequests, users } from "@/db/schema";
import { requireTeam } from "@/lib/auth";
import { FORMAT_LABEL, PRIORITY_LABEL } from "@/lib/constants";
import { formatDay, timeAgo } from "@/lib/format";

export default async function RequestsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { workspace } = await requireTeam(slug);
  const rows = await db
    .select({
      id: creativeRequests.id,
      title: creativeRequests.title,
      description: creativeRequests.description,
      format: creativeRequests.format,
      referenceLinks: creativeRequests.referenceLinks,
      priority: creativeRequests.priority,
      desiredDate: creativeRequests.desiredDate,
      status: creativeRequests.status,
      contentItemId: creativeRequests.contentItemId,
      createdAt: creativeRequests.createdAt,
      submittedBy: users.name,
    })
    .from(creativeRequests)
    .leftJoin(users, eq(users.id, creativeRequests.submittedById))
    .where(eq(creativeRequests.workspaceId, workspace.id))
    .orderBy(desc(creativeRequests.createdAt));
  const attachments = await db
    .select({ id: assets.id, title: assets.title, requestId: assets.requestId })
    .from(assets)
    .where(eq(assets.workspaceId, workspace.id));

  return (
    <div className="stack-lg">
      <div className="stack-sm">
        <p className="kicker">Creative requests</p>
        <h1 className="display-sm">Ideas from <em>{workspace.clientFirstName}</em></h1>
      </div>
      {rows.length === 0 ? (
        <div className="empty">
          <p className="section-title">No ideas yet</p>
          <p className="small">When {workspace.clientFirstName} shares one, it lands here with a task and a card in the pipeline.</p>
        </div>
      ) : (
        <div className="stack">
          {rows.map((row) => (
            <article key={row.id} className="card stack-sm" data-testid="request-card">
              <div className="row-between row-top">
                <div className="grow">
                  <h2 className="section-title">{row.title}</h2>
                  <p className="muted small">
                    {row.submittedBy ?? "Someone"} · {timeAgo(row.createdAt)} · {FORMAT_LABEL[row.format]}
                    {row.desiredDate ? ` · wants it by ${formatDay(row.desiredDate)}` : ""}
                  </p>
                </div>
                <div className="row-sm">
                  <span className={`badge${row.priority === "high" ? " badge-solid" : ""}`}>{PRIORITY_LABEL[row.priority]}</span>
                  <RequestActions slug={slug} requestId={row.id} status={row.status} />
                </div>
              </div>
              {row.description && <p className="pre small">{row.description}</p>}
              {row.referenceLinks.map((link) => (
                <a key={link} className="link small truncate" href={link} target="_blank" rel="noopener noreferrer">{link}</a>
              ))}
              {attachments.filter((file) => file.requestId === row.id).map((file) => (
                <Link key={file.id} className="link small" href={`/admin/${slug}/library/${file.id}`}>{file.title}</Link>
              ))}
              <div className="row-sm">
                {row.contentItemId && <Link className="btn btn-sm" href={`/admin/${slug}/content/${row.contentItemId}`}>Open the piece</Link>}
                <Link className="btn btn-sm btn-ghost" href={`/admin/${slug}/assistant?capability=request_to_brief&request=${row.id}`}>Turn into a brief</Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
