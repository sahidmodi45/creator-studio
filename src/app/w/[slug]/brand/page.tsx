import { and, asc, eq } from "drizzle-orm";
import { MediaCard } from "@/components/media";
import { db } from "@/db";
import { brandDocs } from "@/db/schema";
import { requireWorkspace } from "@/lib/auth";
import { listAssets } from "@/lib/queries";

export default async function ClientBrand({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { workspace } = await requireWorkspace(slug);
  // Only what the team has chosen to show. Everything else in the knowledge base stays out of this page's data.
  const [docs, files] = await Promise.all([
    db
      .select({ id: brandDocs.id, title: brandDocs.title, body: brandDocs.body })
      .from(brandDocs)
      .where(and(eq(brandDocs.workspaceId, workspace.id), eq(brandDocs.sharedWithClient, true)))
      .orderBy(asc(brandDocs.position)),
    listAssets(workspace.id, "client", { categories: ["brand_asset"] }),
  ]);
  const empty = !docs.length && !files.length && !workspace.brandColors.length && !workspace.brandFonts.length;

  return (
    <main className="client-main narrow stack-xl">
      <div className="stack-sm">
        <h1 className="display-sm">Your <em>brand</em></h1>
        <p className="muted">Your look, your voice and what you stand for.</p>
      </div>

      {empty && (
        <div className="empty">
          <p className="section-title">We are putting this together</p>
          <p className="small">Your brand guide will show up here once it is ready for you.</p>
        </div>
      )}

      {(workspace.brandColors.length > 0 || workspace.brandFonts.length > 0) && (
        <section className="stack-sm">
          {workspace.brandColors.length > 0 && (
            <div className="swatches" data-testid="client-swatches">
              {workspace.brandColors.map((color) => <span key={color} className="swatch" style={{ background: color, width: 48, height: 48 }} title={color} />)}
            </div>
          )}
          {workspace.brandFonts.length > 0 && <p className="muted small">Fonts: {workspace.brandFonts.join(", ")}</p>}
        </section>
      )}

      {files.length > 0 && (
        <section className="stack-sm">
          <h2 className="section-title">Logos and brand files</h2>
          <div className="media-grid">
            {files.map((asset) => <MediaCard key={asset.id} asset={asset} href={`/w/${slug}/files/${asset.id}`} />)}
          </div>
        </section>
      )}

      {docs.map((doc) => (
        <section key={doc.id} className="stack-sm" data-testid="client-brand-section">
          <h2 className="section-title">{doc.title}</h2>
          <p className="prose">{doc.body}</p>
        </section>
      ))}
    </main>
  );
}
