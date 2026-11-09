import { and, eq, isNull } from "drizzle-orm";
import { NewContentForm } from "@/components/admin-forms";
import { PipelineBoard } from "@/components/pipeline-board";
import { db } from "@/db";
import { contentItems, users } from "@/db/schema";
import { requireTeam } from "@/lib/auth";
import { coverFor } from "@/lib/queries";

export default async function PipelinePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { workspace } = await requireTeam(slug);
  const rows = await db
    .select({
      id: contentItems.id,
      title: contentItems.title,
      pillar: contentItems.pillar,
      format: contentItems.format,
      status: contentItems.status,
      rank: contentItems.rank,
      scheduledDate: contentItems.scheduledDate,
      ownerName: users.name,
    })
    .from(contentItems)
    .leftJoin(users, eq(users.id, contentItems.ownerId))
    .where(and(eq(contentItems.workspaceId, workspace.id), isNull(contentItems.deletedAt)));
  const covers = await coverFor(rows.map((row) => row.id), "team");

  return (
    <>
      <div className="page-head">
        <div className="stack-sm">
          <p className="kicker">Every post, idea to live</p>
          <h1 className="display-sm">In the <em>making</em></h1>
        </div>
        <NewContentForm slug={slug} pillars={workspace.pillars} />
      </div>
      <PipelineBoard
        slug={slug}
        pillars={workspace.pillars}
        clientFirstName={workspace.clientFirstName}
        items={rows.map((row) => ({ ...row, coverAssetId: covers.get(row.id) ?? null }))}
      />
    </>
  );
}
