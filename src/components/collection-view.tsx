import { LibraryFiltersBar } from "@/components/library-filters";
import { MediaCard } from "@/components/media";
import { UploadCentre } from "@/components/upload-centre";
import { COLLECTIONS, type CollectionId } from "@/lib/constants";
import { allTags, listAssets } from "@/lib/queries";

const DROP_HINT: Record<CollectionId, string> = {
  videos: "Raw clips and edits, up to 5 GB each.",
  photos: "As many as you like.",
  voice: "Voiceovers and voice notes.",
  references: "Videos, photos and screenshots you want to learn from.",
};

/** One folder: drop files in at the top, see what is there below. Both portals use this, with the audience deciding what is returned. */
export async function CollectionView({
  id,
  workspaceId,
  audience,
  search,
  hrefFor,
  above,
}: {
  id: CollectionId;
  workspaceId: string;
  audience: "team" | "client";
  search: { q?: string; tag?: string };
  hrefFor: (assetId: string) => string;
  above?: React.ReactNode;
}) {
  const folder = COLLECTIONS[id];
  const filters = { q: search.q, tag: search.tag };
  const [files, tags] = await Promise.all([
    listAssets(workspaceId, audience, { ...filters, categories: folder.categories }),
    allTags(workspaceId, audience),
  ]);
  const filtered = !!(search.q || search.tag);

  return (
    <div className="stack-lg">
      <div className="stack-sm">
        <h1 className="display-sm">{folder.title}</h1>
        <p className="muted">{audience === "client" ? folder.clientLine : folder.teamLine}</p>
      </div>
      {above}
      <UploadCentre
        workspaceId={workspaceId}
        mode={audience === "client" ? "client" : "agency"}
        projects={[]}
        doneHref=""
        forceCategory={folder.force}
        showLinkForm={id === "references"}
        startCompact
        dropHint={DROP_HINT[id]}
      />
      <LibraryFiltersBar filters={filters} tags={tags} simple hideType />
      {files.length === 0 ? (
        <div className="empty">
          <p className="section-title">{filtered ? "Nothing matches that" : "Nothing here yet"}</p>
          <p className="small">{filtered ? "Try a different word or clear the filters." : "Files you add will live here."}</p>
        </div>
      ) : (
        <div className="media-grid" data-testid="collection-grid">
          {files.map((asset) => <MediaCard key={asset.id} asset={asset} href={hrefFor(asset.id)} showStatus={audience === "team"} />)}
        </div>
      )}
    </div>
  );
}
