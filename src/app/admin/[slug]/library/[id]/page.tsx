import { and, eq } from "drizzle-orm";
import { Download } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AssetEditForm, AssetProjectLinker } from "@/components/asset-admin";
import { CommentThread } from "@/components/comments";
import { AssetViewer, fileUrl } from "@/components/media";
import { db } from "@/db";
import { assets, contentAssets, contentItems } from "@/db/schema";
import { requireTeam } from "@/lib/auth";
import { formatBytes, formatDuration, formatInstant } from "@/lib/format";
import { assetsByIds, listComments, projectOptions } from "@/lib/queries";

export default async function AdminAssetPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const { workspace } = await requireTeam(slug);
  const [[asset], [full]] = await Promise.all([
    assetsByIds([id]),
    db.select({ internalNotes: assets.internalNotes }).from(assets).where(and(eq(assets.id, id), eq(assets.workspaceId, workspace.id))),
  ]);
  if (!asset || !full || asset.workspaceId !== workspace.id) notFound();

  const [comments, linked, projects] = await Promise.all([
    listComments({ assetId: id }, "team"),
    db
      .select({ id: contentItems.id, title: contentItems.title, role: contentAssets.role })
      .from(contentAssets)
      .innerJoin(contentItems, eq(contentItems.id, contentAssets.contentItemId))
      .where(eq(contentAssets.assetId, id)),
    projectOptions(workspace.id),
  ]);

  return (
    <div className="stack-lg">
      <Link href={`/admin/${slug}/library`} className="small muted plain-link">Back to the library</Link>
      <div className="split">
        <div className="stack-lg">
          <AssetViewer asset={asset} />
          <section className="stack-sm">
            <h2 className="section-title">Comments</h2>
            <CommentThread comments={comments} assetId={id} isTeam />
          </section>
        </div>
        <aside className="stack-lg">
          <div className="stack-sm">
            <h1 className="display-sm" style={{ overflowWrap: "anywhere" }}>{asset.title}</h1>
            <dl className="meta-list">
              <dt>Uploaded by</dt><dd>{asset.uploadedBy ?? "Unknown"}</dd>
              <dt>Upload date</dt><dd>{formatInstant(asset.uploadedAt)}</dd>
              {asset.fileName && <><dt>File</dt><dd>{asset.fileName}</dd></>}
              {asset.sizeBytes != null && <><dt>Size</dt><dd>{formatBytes(asset.sizeBytes)}</dd></>}
              {asset.durationSeconds != null && <><dt>Length</dt><dd>{formatDuration(asset.durationSeconds)}</dd></>}
              {asset.width && asset.height && <><dt>Dimensions</dt><dd>{asset.width} × {asset.height}</dd></>}
            </dl>
            {asset.fileName && (
              <div>
                <a className="btn btn-sm" href={fileUrl(id, { download: true })} data-testid="download">
                  <Download size={14} /> Download
                </a>
              </div>
            )}
          </div>
          <section className="stack-sm">
            <h2 className="section-title">Content projects</h2>
            <AssetProjectLinker assetId={id} linked={linked} projects={projects} slug={slug} />
          </section>
          <section className="stack-sm">
            <h2 className="section-title">Details</h2>
            <AssetEditForm asset={{ ...asset, internalNotes: full.internalNotes }} />
          </section>
        </aside>
      </div>
    </div>
  );
}
