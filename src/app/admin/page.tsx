import { and, count, desc, eq, inArray, isNull } from "drizzle-orm";
import { LogOut } from "lucide-react";
import Link from "next/link";
import { NewClientForm } from "@/components/admin-forms";
import { db } from "@/db";
import { assets, contentItems, memberships, workspaces } from "@/db/schema";
import { signOut } from "@/lib/actions/auth";
import { requireAgency } from "@/lib/auth";
import { formatCount } from "@/lib/format";

export default async function AdminHome() {
  const user = await requireAgency();
  const isAdmin = user.agencyRole === "admin";

  const assigned = isAdmin
    ? null
    : (await db.select({ id: memberships.workspaceId }).from(memberships).where(and(eq(memberships.userId, user.id), eq(memberships.role, "team")))).map((row) => row.id);

  const rows = await db
    .select()
    .from(workspaces)
    .where(assigned ? inArray(workspaces.id, assigned.length ? assigned : ["00000000-0000-0000-0000-000000000000"]) : isNull(workspaces.archivedAt))
    .orderBy(desc(workspaces.createdAt));

  const ids = rows.map((row) => row.id);
  const statuses = ids.length
    ? await db
        .select({ workspaceId: contentItems.workspaceId, status: contentItems.status, value: count() })
        .from(contentItems)
        .where(and(inArray(contentItems.workspaceId, ids), isNull(contentItems.deletedAt)))
        .groupBy(contentItems.workspaceId, contentItems.status)
    : [];
  const newFiles = ids.length
    ? await db
        .select({ workspaceId: assets.workspaceId, value: count() })
        .from(assets)
        .where(and(inArray(assets.workspaceId, ids), eq(assets.status, "new"), isNull(assets.deletedAt)))
        .groupBy(assets.workspaceId)
    : [];

  const countOf = (workspaceId: string, ...wanted: string[]) =>
    statuses.filter((row) => row.workspaceId === workspaceId && wanted.includes(row.status)).reduce((sum, row) => sum + row.value, 0);

  return (
    <main className="client-main stack-xl">
      <div className="row-between">
        <div className="stack-sm">
          <p className="kicker">The agency</p>
          <h1 className="display">Your <em>clients</em></h1>
        </div>
        <form action={signOut}>
          <button className="btn btn-ghost"><LogOut size={15} /> Sign out</button>
        </form>
      </div>

      {rows.length === 0 ? (
        <div className="empty">
          <p className="section-title">No clients yet</p>
          <p className="small">{isAdmin ? "Add your first client below." : "Ask an admin to add you to a workspace."}</p>
        </div>
      ) : (
        <div className="grid-2">
          {rows.map((workspace) => (
            <Link key={workspace.id} href={`/admin/${workspace.slug}`} className="card hover-lift plain-link stack" data-testid="client-card">
              <div>
                <h2 className="display-sm">{workspace.name}</h2>
                <p className="muted small">
                  {workspace.instagramHandle ? `@${workspace.instagramHandle}` : "No Instagram handle yet"}
                  {workspace.followers != null ? ` · ${formatCount(workspace.followers)} followers` : ""}
                </p>
              </div>
              <div className="row small">
                <span>{countOf(workspace.id, "client_review")} with client</span>
                <span className="muted">·</span>
                <span>{countOf(workspace.id, "in_production", "internal_review", "revision_requested")} in production</span>
                <span className="muted">·</span>
                <span>{newFiles.find((row) => row.workspaceId === workspace.id)?.value ?? 0} new files</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {isAdmin && (
        <section className="stack" style={{ maxWidth: 620 }}>
          <h2 className="section-title">Add a client</h2>
          <NewClientForm />
        </section>
      )}
    </main>
  );
}
