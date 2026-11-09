import { asc, eq } from "drizzle-orm";
import { BrandDocEditor, BrandKitForm } from "@/components/admin-forms";
import { MediaCard } from "@/components/media";
import { UploadCentre } from "@/components/upload-centre";
import { db } from "@/db";
import { brandDocs } from "@/db/schema";
import { requireTeam } from "@/lib/auth";
import { listAssets } from "@/lib/queries";

export default async function BrandPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { workspace } = await requireTeam(slug);
  const [docs, files] = await Promise.all([
    db.select().from(brandDocs).where(eq(brandDocs.workspaceId, workspace.id)).orderBy(asc(brandDocs.position)),
    listAssets(workspace.id, "team", { categories: ["brand_asset"] }),
  ]);
  return (
    <div className="stack-lg" style={{ maxWidth: 820 }}>
      <div className="stack-sm">
        <p className="kicker">Brand identity</p>
        <h1 className="display-sm">Who <em>{workspace.clientFirstName}</em> is</h1>
      </div>

      <section className="stack">
        <h2 className="section-title">Colours and fonts</h2>
        {workspace.brandColors.length > 0 && (
          <div className="swatches">
            {workspace.brandColors.map((color) => <span key={color} className="swatch" style={{ background: color }} title={color} />)}
          </div>
        )}
        <BrandKitForm slug={slug} colors={workspace.brandColors} fonts={workspace.brandFonts} />
      </section>

      <section className="stack">
        <h2 className="section-title">Logos and brand files</h2>
        <UploadCentre workspaceId={workspace.id} mode="agency" projects={[]} doneHref={`/admin/${slug}/brand`} forceCategory="brand_asset" visibility="shared" showLinkForm={false} startCompact dropHint={`Logos, templates, guidelines. ${workspace.clientFirstName} can see these.`} />
        {files.length > 0 && <div className="media-grid">{files.map((asset) => <MediaCard key={asset.id} asset={asset} href={`/admin/${slug}/library/${asset.id}`} />)}</div>}
      </section>

      <div className="stack-sm">
        <h2 className="section-title">Brand knowledge</h2>
        <p className="muted small">The assistant reads all of this on every request. The more real examples of {workspace.clientFirstName}&apos;s voice you add, the more it sounds like her. {workspace.clientFirstName} sees only the sections you choose to show.</p>
      </div>
      {docs.map((doc) => <BrandDocEditor key={doc.id} slug={slug} doc={{ id: doc.id, title: doc.title, body: doc.body, sharedWithClient: doc.sharedWithClient }} />)}
      <section className="stack-sm">
        <h2 className="section-title">Add a section</h2>
        <BrandDocEditor slug={slug} />
      </section>
    </div>
  );
}
