import Link from "next/link";
import { LibraryFiltersBar } from "@/components/library-filters";
import { MediaCard } from "@/components/media";
import { requireWorkspace } from "@/lib/auth";
import { allTags, listAssets } from "@/lib/queries";

type Search = { q?: string; category?: string; tag?: string };

export default async function ClientFiles({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Search> }) {
  const { slug } = await params;
  const { workspace } = await requireWorkspace(slug);
  const filters = await searchParams;
  const [files, tags] = await Promise.all([listAssets(workspace.id, "client", filters), allTags(workspace.id, "client")]);
  const filtered = !!(filters.q || filters.category || filters.tag);

  return (
    <main className="client-main stack-lg">
      <div className="row-between">
        <div className="stack-sm">
          <p className="kicker">My files</p>
          <h1 className="display-sm">Everything in <em>one place</em></h1>
        </div>
        <Link className="btn btn-primary" href={`/w/${slug}/upload`}>Send files</Link>
      </div>
      <LibraryFiltersBar filters={filters} tags={tags} simple />
      {files.length === 0 ? (
        <div className="empty">
          <p className="section-title">{filtered ? "Nothing matches that" : "Nothing here yet"}</p>
          <p className="small">{filtered ? "Try a different word or clear the filters." : "Files you send will live here."}</p>
        </div>
      ) : (
        <div className="media-grid">
          {files.map((asset) => <MediaCard key={asset.id} asset={asset} href={`/w/${slug}/files/${asset.id}`} />)}
        </div>
      )}
    </main>
  );
}
