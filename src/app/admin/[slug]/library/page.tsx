import Link from "next/link";
import { LibraryFiltersBar } from "@/components/library-filters";
import { MediaCard } from "@/components/media";
import { requireTeam } from "@/lib/auth";
import { allTags, listAssets, projectOptions, workspaceUploaders, type LibraryFilters } from "@/lib/queries";

export default async function LibraryPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<LibraryFilters> }) {
  const { slug } = await params;
  const { workspace } = await requireTeam(slug);
  const filters = await searchParams;
  const [files, tags, uploaders, projects] = await Promise.all([
    listAssets(workspace.id, "team", filters),
    allTags(workspace.id, "team"),
    workspaceUploaders(workspace.id),
    projectOptions(workspace.id),
  ]);
  const filtered = Object.values(filters).some(Boolean);

  return (
    <>
      <div className="page-head">
        <div className="stack-sm">
          <p className="kicker">Media library</p>
          <h1 className="display-sm">{files.length} {files.length === 1 ? "file" : "files"}</h1>
        </div>
        <Link className="btn btn-primary" href={`/admin/${slug}/library/upload`}>Upload</Link>
      </div>
      <LibraryFiltersBar filters={filters} tags={tags} uploaders={uploaders} projects={projects} />
      {files.length === 0 ? (
        <div className="empty">
          <p className="section-title">{filtered ? "Nothing matches that" : "The library is empty"}</p>
          <p className="small">{filtered ? "Try a different word or clear the filters." : `Files from you and ${workspace.clientFirstName} will land here.`}</p>
        </div>
      ) : (
        <div className="media-grid">
          {files.map((asset) => <MediaCard key={asset.id} asset={asset} href={`/admin/${slug}/library/${asset.id}`} showStatus />)}
        </div>
      )}
    </>
  );
}
