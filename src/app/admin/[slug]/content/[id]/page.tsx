import { and, eq, isNull } from "drizzle-orm";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CommentThread } from "@/components/comments";
import { ContentAssets, ContentEditor, DeleteContentButton, StatusTrack } from "@/components/content-detail";
import { fileUrl } from "@/components/media";
import { VideoReview } from "@/components/review-panel";
import { db } from "@/db";
import { contentItems, creativeRequests } from "@/db/schema";
import { requireTeam } from "@/lib/auth";
import { CONTENT_ASSET_ROLES, isPlayableVideo } from "@/lib/constants";
import { formatInstant, timeAgo } from "@/lib/format";
import { contentFiles, listActivity, listApprovals, listAssets, listComments, listRevisions, workspaceTeam } from "@/lib/queries";

const DECISION_LABEL = { approved: "Approved", revision_requested: "Asked for changes", rejected: "Rejected" } as const;

export default async function ContentDetailPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const { workspace } = await requireTeam(slug);
  const [item] = await db
    .select()
    .from(contentItems)
    .where(and(eq(contentItems.id, id), eq(contentItems.workspaceId, workspace.id), isNull(contentItems.deletedAt)));
  if (!item) notFound();

  const [files, comments, revisions, approvals, log, team, library, request] = await Promise.all([
    contentFiles(id, "team"),
    listComments({ contentItemId: id }, "team"),
    listRevisions(id),
    listApprovals(id),
    listActivity({ contentItemId: id }, "team", 40),
    workspaceTeam(workspace.id),
    listAssets(workspace.id, "team"),
    item.requestId ? db.select().from(creativeRequests).where(eq(creativeRequests.id, item.requestId)).then((rows) => rows[0]) : null,
  ]);

  const edit = files.find((file) => file.role === "edited_video" && isPlayableVideo(file.mimeType));
  const grouped = Object.fromEntries(CONTENT_ASSET_ROLES.map((role) => [role, files.filter((file) => file.role === role)]));
  const textRevisions = revisions.filter((revision) => revision.kind === "script" || revision.kind === "caption");
  const fileRevisions = revisions.filter((revision) => revision.kind === "edited_video" || revision.kind === "cover");

  return (
    <div className="stack-lg">
      <div className="stack-sm">
        <Link href={`/admin/${slug}/pipeline`} className="small muted plain-link">Back to the pipeline</Link>
        <h1 className="display-sm" data-testid="content-title">{item.title}</h1>
        <StatusTrack id={id} status={item.status} />
        {request && <p className="muted small">From {workspace.clientFirstName}&apos;s idea on {formatInstant(request.createdAt)}.</p>}
      </div>

      <div className="split">
        <div className="stack-xl">
          {edit && (
            <VideoReview
              videoUrl={fileUrl(edit.id)}
              poster={edit.thumbnailKey ? fileUrl(edit.id, { thumb: true }) : undefined}
              comments={comments}
              contentItemId={id}
              isTeam
            />
          )}
          <ContentEditor item={item} pillars={workspace.pillars} team={team} />
          {!edit && (
            <section className="stack-sm">
              <h2 className="section-title">Comments</h2>
              <CommentThread comments={comments} contentItemId={id} isTeam />
            </section>
          )}
        </div>

        <aside className="stack-lg">
          {item.publishingLink && (
            <a className="btn" href={item.publishingLink} target="_blank" rel="noopener noreferrer">
              See it live <ExternalLink size={14} />
            </a>
          )}
          <ContentAssets slug={slug} workspaceId={workspace.id} contentItemId={id} grouped={grouped} library={library} />

          <section className="stack-sm">
            <h2 className="section-title">Approvals</h2>
            {approvals.length === 0 ? (
              <p className="muted small">No decision yet. Sent to the client {item.reviewRound} {item.reviewRound === 1 ? "time" : "times"}.</p>
            ) : (
              approvals.map((approval) => (
                <div key={approval.id} className="comment">
                  <div className="row-between small">
                    <span className="strong">{DECISION_LABEL[approval.decision]} · round {approval.round}</span>
                    <span className="muted tiny">{timeAgo(approval.createdAt)}</span>
                  </div>
                  <p className="small muted">{approval.decidedBy}</p>
                  {approval.note && <p className="small pre">{approval.note}</p>}
                </div>
              ))
            )}
          </section>

          <section className="stack-sm">
            <h2 className="section-title">Revision history</h2>
            {revisions.length === 0 && <p className="muted small">Saved versions of the script, caption, edit and cover will appear here.</p>}
            {fileRevisions.map((revision) => (
              <div key={revision.id} className="timeline-item">
                <span>
                  {revision.kind === "cover" ? "Cover" : "Edit"} v{revision.version} by {revision.author ?? "someone"}
                  {revision.assetId && <> · <Link className="link" href={`/admin/${slug}/library/${revision.assetId}`}>open</Link></>}
                </span>
                <span className="when">{timeAgo(revision.createdAt)}</span>
              </div>
            ))}
            {textRevisions.map((revision) => (
              <details key={revision.id} className="small" data-testid="text-revision">
                <summary style={{ cursor: "pointer", padding: "5px 0" }}>
                  {revision.kind === "script" ? "Script" : "Caption"} v{revision.version} by {revision.author ?? "someone"} <span className="muted">· {timeAgo(revision.createdAt)}</span>
                </summary>
                <p className="pre muted" style={{ padding: "4px 0 10px" }}>{revision.value || "(empty)"}</p>
              </details>
            ))}
          </section>

          <section className="stack-sm">
            <h2 className="section-title">Activity</h2>
            {log.length === 0 && <p className="muted small">Nothing yet.</p>}
            {log.map((entry) => (
              <div key={entry.id} className="timeline-item">
                <span><b>{entry.actor ?? "Someone"}</b> {entry.summary}</span>
                <span className="when">{timeAgo(entry.createdAt)}</span>
              </div>
            ))}
          </section>

          <DeleteContentButton id={id} title={item.title} />
        </aside>
      </div>
    </div>
  );
}
