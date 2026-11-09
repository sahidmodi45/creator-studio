import { and, desc, eq, isNull } from "drizzle-orm";
import Link from "next/link";
import { NewContentForm } from "@/components/admin-forms";
import { db } from "@/db";
import { contentItems } from "@/db/schema";
import { requireTeam } from "@/lib/auth";
import { FORMAT_LABEL, STATUS_LABEL } from "@/lib/constants";

export default async function AdminScripts({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { workspace } = await requireTeam(slug);
  const items = await db
    .select({ id: contentItems.id, title: contentItems.title, format: contentItems.format, status: contentItems.status, script: contentItems.script, caption: contentItems.caption })
    .from(contentItems)
    .where(and(eq(contentItems.workspaceId, workspace.id), isNull(contentItems.deletedAt)))
    .orderBy(desc(contentItems.updatedAt));

  const toWrite = items.filter((item) => !item.script.trim() || !item.caption.trim());
  const written = items.filter((item) => item.script.trim() && item.caption.trim());

  const missing = (item: (typeof items)[number]) =>
    [!item.script.trim() && "script", !item.caption.trim() && "caption"].filter(Boolean).join(" and ");

  return (
    <div className="stack-lg" style={{ maxWidth: 860 }}>
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div className="stack-sm">
          <h1 className="display-sm">Scripts and captions</h1>
          <p className="muted small">Open a piece to write. Every save is kept as a version.</p>
        </div>
        <NewContentForm slug={slug} pillars={workspace.pillars} />
      </div>

      <section className="stack-sm">
        <h2 className="section-title">Still to write</h2>
        {toWrite.length === 0 ? (
          <p className="muted small">Nothing is waiting for words.</p>
        ) : (
          <div>
            {toWrite.map((item) => (
              <Link key={item.id} href={`/admin/${slug}/content/${item.id}`} className="list-row" data-testid="script-todo">
                <div className="grow">
                  <p className="list-title">{item.title}</p>
                  <p className="muted small">{FORMAT_LABEL[item.format]} · Needs a {missing(item)}</p>
                </div>
                <span className="badge">{STATUS_LABEL[item.status]}</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="stack">
        <h2 className="section-title">Written</h2>
        {written.length === 0 && <p className="muted small">Finished scripts will show here.</p>}
        {written.map((item) => (
          <Link key={item.id} href={`/admin/${slug}/content/${item.id}`} className="card hover-lift plain-link script-card">
            <div className="row-between">
              <h3 className="section-title">{item.title}</h3>
              <span className="badge">{STATUS_LABEL[item.status]}</span>
            </div>
            <p className="script-text">{item.script}</p>
            <p className="kicker">Caption</p>
            <p className="script-text">{item.caption}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}
