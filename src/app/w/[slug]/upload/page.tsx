import { UploadCentre } from "@/components/upload-centre";
import { requireWorkspace } from "@/lib/auth";
import { clientContentList } from "@/lib/queries";

export default async function ClientUploadPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { workspace } = await requireWorkspace(slug);
  const items = await clientContentList(workspace.id);
  const projects = items
    .filter((item) => !["published", "approved", "scheduled"].includes(item.status))
    .map((item) => ({ id: item.id, title: item.title }));

  return (
    <main className="client-main narrow stack-lg">
      <div className="stack-sm">
        <p className="kicker">Send files</p>
        <h1 className="display-sm">Send us <em>anything</em></h1>
        <p className="muted">Raw and messy is fine. Tell us what it is for, or leave it to us.</p>
      </div>
      <UploadCentre workspaceId={workspace.id} mode="client" projects={projects} doneHref={`/w/${slug}/files`} />
    </main>
  );
}
