import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CollectionView } from "@/components/collection-view";
import { db } from "@/db";
import { brandDocs } from "@/db/schema";
import { requireTeam } from "@/lib/auth";
import { isCollection } from "@/lib/constants";

export default async function AdminCollection({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; collection: string }>;
  searchParams: Promise<{ q?: string; tag?: string }>;
}) {
  const { slug, collection } = await params;
  const { workspace } = await requireTeam(slug);
  if (!isCollection(collection)) notFound();

  const voiceNotes =
    collection === "voice"
      ? await db
          .select({ body: brandDocs.body })
          .from(brandDocs)
          .where(and(eq(brandDocs.workspaceId, workspace.id), eq(brandDocs.title, "Voice")))
      : [];

  return (
    <CollectionView
      id={collection}
      workspaceId={workspace.id}
      audience="team"
      search={await searchParams}
      hrefFor={(id) => `/admin/${slug}/library/${id}`}
      above={voiceNotes.map((doc, index) => (
        <section key={index} className="card stack-sm">
          <div className="row-between">
            <h2 className="section-title">How {workspace.clientFirstName} sounds</h2>
            <Link className="link small" href={`/admin/${slug}/brand`}>Edit in Brand identity</Link>
          </div>
          <p className="prose small">{doc.body}</p>
        </section>
      ))}
    />
  );
}
