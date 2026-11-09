import { UploadCentre } from "@/components/upload-centre";
import { requireTeam } from "@/lib/auth";
import { projectOptions } from "@/lib/queries";

export default async function AdminUpload({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ project?: string }> }) {
  const { slug } = await params;
  const { workspace } = await requireTeam(slug);
  const { project } = await searchParams;
  const projects = await projectOptions(workspace.id);
  return (
    <div className="stack-lg" style={{ maxWidth: 820 }}>
      <div className="stack-sm">
        <p className="kicker">Upload centre</p>
        <h1 className="display-sm">Add to the <em>library</em></h1>
        <p className="muted small">Team uploads stay private until a piece is sent to {workspace.clientFirstName}.</p>
      </div>
      <UploadCentre
        workspaceId={workspace.id}
        mode="agency"
        projects={projects}
        doneHref={`/admin/${slug}/library`}
        defaultContentItemId={projects.some((row) => row.id === project) ? project : ""}
      />
    </div>
  );
}
