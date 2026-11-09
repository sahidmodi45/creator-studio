import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { CollectionView } from "@/components/collection-view";
import { db } from "@/db";
import { brandDocs } from "@/db/schema";
import { requireWorkspace } from "@/lib/auth";
import { isCollection } from "@/lib/constants";

export default async function ClientCollection({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; collection: string }>;
  searchParams: Promise<{ q?: string; tag?: string }>;
}) {
  const { slug, collection } = await params;
  const { workspace } = await requireWorkspace(slug);
  if (!isCollection(collection)) notFound();

  // On Voice, the note on how she sounds sits beside her recordings, if the team has shared it.
  const voiceNotes =
    collection === "voice"
      ? await db
          .select({ id: brandDocs.id, title: brandDocs.title, body: brandDocs.body })
          .from(brandDocs)
          .where(and(eq(brandDocs.workspaceId, workspace.id), eq(brandDocs.sharedWithClient, true), eq(brandDocs.title, "Voice")))
      : [];

  return (
    <main className="client-main">
      <CollectionView
        id={collection}
        workspaceId={workspace.id}
        audience="client"
        search={await searchParams}
        hrefFor={(id) => `/w/${slug}/files/${id}`}
        above={voiceNotes.map((doc) => (
          <section key={doc.id} className="card stack-sm">
            <h2 className="section-title">How you sound</h2>
            <p className="prose small">{doc.body}</p>
          </section>
        ))}
      />
    </main>
  );
}
