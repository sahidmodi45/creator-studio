import { Download } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CommentThread } from "@/components/comments";
import { AssetViewer, fileUrl } from "@/components/media";
import { requireWorkspace } from "@/lib/auth";
import { CATEGORY_LABEL } from "@/lib/constants";
import { formatBytes, formatDuration, formatInstant } from "@/lib/format";
import { assetsByIds, listComments } from "@/lib/queries";

export default async function ClientFileDetail({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const { workspace } = await requireWorkspace(slug);
  const [asset] = await assetsByIds([id]);
  if (!asset || asset.workspaceId !== workspace.id || asset.visibility !== "shared" || asset.status === "uploading") notFound();
  const comments = await listComments({ assetId: id }, "client");

  return (
    <main className="client-main stack-lg">
      <Link href={`/w/${slug}/files`} className="small muted plain-link">Back to my files</Link>
      <div className="split">
        <AssetViewer asset={asset} />
        <aside className="stack-lg">
          <div className="stack-sm">
            <p className="kicker">{CATEGORY_LABEL[asset.category]}</p>
            <h1 className="display-sm">{asset.title}</h1>
            {asset.description && <p className="pre">{asset.description}</p>}
            <p className="muted small">
              {[formatInstant(asset.uploadedAt), formatBytes(asset.sizeBytes), formatDuration(asset.durationSeconds)].filter(Boolean).join(" · ")}
            </p>
          </div>
          {asset.fileName && (
            <a className="btn" href={fileUrl(id, { download: true })} style={{ alignSelf: "flex-start" }}>
              <Download size={14} /> Download
            </a>
          )}
          <section className="stack-sm">
            <h2 className="section-title">Comments</h2>
            <CommentThread comments={comments} assetId={id} isTeam={false} />
          </section>
        </aside>
      </div>
    </main>
  );
}
