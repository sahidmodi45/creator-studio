import { desc, eq } from "drizzle-orm";
import { IdeaForm } from "@/components/idea-form";
import { db } from "@/db";
import { contentItems, creativeRequests } from "@/db/schema";
import { requireWorkspace } from "@/lib/auth";
import { CLIENT_STATUS_LABEL, FORMAT_LABEL, type ContentStatus } from "@/lib/constants";
import { formatInstant } from "@/lib/format";

export default async function IdeasPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { workspace } = await requireWorkspace(slug);
  const ideas = await db
    .select({
      id: creativeRequests.id,
      title: creativeRequests.title,
      format: creativeRequests.format,
      status: creativeRequests.status,
      createdAt: creativeRequests.createdAt,
      contentStatus: contentItems.status,
    })
    .from(creativeRequests)
    .leftJoin(contentItems, eq(contentItems.id, creativeRequests.contentItemId))
    .where(eq(creativeRequests.workspaceId, workspace.id))
    .orderBy(desc(creativeRequests.createdAt));

  return (
    <main className="client-main narrow stack-xl">
      <section className="stack-lg">
        <div className="stack-sm">
          <p className="kicker">Share an idea</p>
          <h1 className="display-sm">What did you <em>see</em>, taste or think of?</h1>
        </div>
        <IdeaForm workspaceId={workspace.id} />
      </section>

      {ideas.length > 0 && (
        <section className="stack-sm">
          <h2 className="section-title">Your ideas</h2>
          <div>
            {ideas.map((idea) => (
              <div key={idea.id} className="list-row" data-testid="idea-row">
                <div className="grow">
                  <p className="list-title">{idea.title}</p>
                  <p className="muted small">{FORMAT_LABEL[idea.format]} · {formatInstant(idea.createdAt)}</p>
                </div>
                <span className="badge">
                  {idea.status === "declined"
                    ? "Not this time"
                    : idea.contentStatus
                      ? CLIENT_STATUS_LABEL[idea.contentStatus as ContentStatus]
                      : "With the team"}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
