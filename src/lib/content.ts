import "server-only";
import { and, desc, eq, inArray, max } from "drizzle-orm";
import { db } from "@/db";
import { assets, contentAssets, contentItems, contentRevisions } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import type { ContentAssetRole } from "@/lib/constants";

async function nextVersion(contentItemId: string, kind: "script" | "caption" | "edited_video" | "cover") {
  const [row] = await db
    .select({ version: max(contentRevisions.version) })
    .from(contentRevisions)
    .where(and(eq(contentRevisions.contentItemId, contentItemId), eq(contentRevisions.kind, kind)));
  return (row?.version ?? 0) + 1;
}

export async function addTextRevision(contentItemId: string, kind: "script" | "caption", value: string, authorId: string) {
  const version = await nextVersion(contentItemId, kind);
  await db.insert(contentRevisions).values({ contentItemId, kind, version, value, authorId });
}

/**
 * Links a file to a piece. A new edit or cover counts as a new numbered version,
 * and if the piece was already approved, that approval no longer stands.
 */
export async function attachAssetToContent(contentItemId: string, assetId: string, role: ContentAssetRole, actorId: string) {
  const [inserted] = await db
    .insert(contentAssets)
    .values({ contentItemId, assetId, role })
    .onConflictDoNothing()
    .returning({ assetId: contentAssets.assetId });
  await db.update(assets).set({ status: "in_use" }).where(eq(assets.id, assetId));
  if (!inserted) return;

  if (role === "edited_video" || role === "cover") {
    const version = await nextVersion(contentItemId, role);
    await db.insert(contentRevisions).values({ contentItemId, kind: role, version, assetId, authorId: actorId });
    await resetApprovalIfNeeded(contentItemId, role === "cover" ? "cover" : "edit", actorId);
  }
  await db.update(contentItems).set({ updatedAt: new Date() }).where(eq(contentItems.id, contentItemId));
}

/** Approved work that changes goes back to internal review, so nothing unapproved can slip out. */
export async function resetApprovalIfNeeded(contentItemId: string, whatChanged: string, actorId: string) {
  const [item] = await db
    .select({ status: contentItems.status, workspaceId: contentItems.workspaceId })
    .from(contentItems)
    .where(eq(contentItems.id, contentItemId));
  if (!item || (item.status !== "approved" && item.status !== "scheduled")) return false;
  await db.update(contentItems).set({ status: "internal_review" }).where(eq(contentItems.id, contentItemId));
  await logActivity({
    workspaceId: item.workspaceId,
    actorId,
    summary: `changed the ${whatChanged} after approval, so it went back to Internal Review`,
    contentItemId,
    internal: true,
  });
  return true;
}

/** The newest edit and cover become visible to the client when a piece goes to them. */
export async function releaseToClient(contentItemId: string) {
  const links = await db
    .select({ assetId: contentAssets.assetId })
    .from(contentAssets)
    .where(and(eq(contentAssets.contentItemId, contentItemId), inArray(contentAssets.role, ["edited_video", "cover"])));
  if (links.length) {
    await db
      .update(assets)
      .set({ visibility: "shared" })
      .where(inArray(assets.id, links.map((link) => link.assetId)));
  }
}

export async function latestEdit(contentItemId: string) {
  const [row] = await db
    .select({ assetId: contentRevisions.assetId })
    .from(contentRevisions)
    .where(and(eq(contentRevisions.contentItemId, contentItemId), eq(contentRevisions.kind, "edited_video")))
    .orderBy(desc(contentRevisions.version))
    .limit(1);
  return row?.assetId ?? null;
}
