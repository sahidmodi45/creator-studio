import { ExternalLink } from "lucide-react";
import { notFound } from "next/navigation";
import { CommentThread } from "@/components/comments";
import { DecisionBar } from "@/components/decision-bar";
import { AssetViewer, fileUrl } from "@/components/media";
import { VideoReview } from "@/components/review-panel";
import { requireWorkspace } from "@/lib/auth";
import { CLIENT_CAN_SEE_WORK, CLIENT_STATUS_LABEL, FORMAT_LABEL, isPlayableVideo } from "@/lib/constants";
import { formatDayWeekday } from "@/lib/format";
import { clientContentItem, contentFiles, listComments } from "@/lib/queries";

export default async function ClientReviewPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const { workspace, isTeam } = await requireWorkspace(slug);
  const item = await clientContentItem(workspace.id, id);
  if (!item || !CLIENT_CAN_SEE_WORK.includes(item.status)) notFound();

  // Always the client's view of the data, even when the team is looking through her eyes.
  const [files, comments] = await Promise.all([contentFiles(id, "client"), listComments({ contentItemId: id }, "client")]);
  const edit = files.find((file) => file.role === "edited_video" && isPlayableVideo(file.mimeType));
  const covers = files.filter((file) => file.role === "cover");

  return (
    <main className="client-main stack-lg">
      <div className="stack-sm">
        <p className="kicker">{FORMAT_LABEL[item.format]} · {CLIENT_STATUS_LABEL[item.status]}</p>
        <h1 className="display-sm">{item.title}</h1>
        {item.scheduledDate && <p className="muted small">Planned for {formatDayWeekday(item.scheduledDate)}</p>}
      </div>

      {item.status === "client_review" && !isTeam && <DecisionBar contentItemId={id} />}

      {item.publishingLink && (
        <a className="btn" href={item.publishingLink} target="_blank" rel="noopener noreferrer" style={{ alignSelf: "flex-start" }}>
          See it on Instagram <ExternalLink size={14} />
        </a>
      )}

      <div className="split">
        <div>
          {edit ? (
            <VideoReview
              videoUrl={fileUrl(edit.id)}
              poster={edit.thumbnailKey ? fileUrl(edit.id, { thumb: true }) : undefined}
              comments={comments}
              contentItemId={id}
              isTeam={false}
            />
          ) : (
            <section className="stack-sm">
              <h2 className="section-title">Comments</h2>
              <CommentThread comments={comments} contentItemId={id} isTeam={false} />
            </section>
          )}
        </div>
        <aside className="stack-lg">
          {covers.length > 0 && (
            <section className="stack-sm">
              <h2 className="section-title">Cover</h2>
              {covers.map((cover) => <AssetViewer key={cover.id} asset={cover} />)}
            </section>
          )}
          {item.caption && (
            <section className="stack-sm">
              <h2 className="section-title">Caption</h2>
              <p className="prose" data-testid="client-caption">{item.caption}</p>
            </section>
          )}
          {item.script && (
            <section className="stack-sm">
              <h2 className="section-title">Script</h2>
              <p className="prose">{item.script}</p>
            </section>
          )}
        </aside>
      </div>
    </main>
  );
}
