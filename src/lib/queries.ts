import "server-only";
import { and, asc, count, desc, eq, ilike, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  activity,
  approvals,
  assets,
  comments,
  contentAssets,
  contentItems,
  contentMetrics,
  contentRevisions,
  feedLayouts,
  feedSlots,
  memberships,
  notifications,
  users,
} from "@/db/schema";
import { CLIENT_CAN_SEE_WORK, type ContentStatus } from "@/lib/constants";

/** What a card or thumbnail needs. Leaves out internal notes, so it is safe to hand to either portal. */
export const publicAssetColumns = {
  id: assets.id,
  workspaceId: assets.workspaceId,
  category: assets.category,
  status: assets.status,
  visibility: assets.visibility,
  title: assets.title,
  description: assets.description,
  tags: assets.tags,
  fileName: assets.fileName,
  mimeType: assets.mimeType,
  sizeBytes: assets.sizeBytes,
  width: assets.width,
  height: assets.height,
  durationSeconds: assets.durationSeconds,
  thumbnailKey: assets.thumbnailKey,
  externalUrl: assets.externalUrl,
  uploadedAt: assets.uploadedAt,
  uploadedById: assets.uploadedById,
  uploadedBy: users.name,
};

export type PublicAsset = {
  id: string;
  workspaceId: string;
  category: (typeof assets.$inferSelect)["category"];
  status: (typeof assets.$inferSelect)["status"];
  visibility: "shared" | "internal";
  title: string;
  description: string;
  tags: string[];
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  thumbnailKey: string | null;
  externalUrl: string | null;
  uploadedAt: Date;
  uploadedById: string | null;
  uploadedBy: string | null;
};

export type LibraryFilters = {
  q?: string;
  category?: string;
  tag?: string;
  status?: string;
  uploader?: string;
  project?: string;
  categories?: readonly string[];
};

/**
 * The one way files get listed. audience "client" can only ever return shared
 * files, whatever filters are passed in.
 */
export async function listAssets(workspaceId: string, audience: "team" | "client", filters: LibraryFilters = {}): Promise<PublicAsset[]> {
  const conditions = [
    eq(assets.workspaceId, workspaceId),
    isNull(assets.deletedAt),
    ne(assets.status, "uploading"),
  ];
  if (audience === "client") conditions.push(eq(assets.visibility, "shared"));
  if (filters.q) {
    const like = `%${filters.q.replace(/[%_\\]/g, "\\$&")}%`;
    conditions.push(
      or(
        ilike(assets.title, like),
        ilike(assets.description, like),
        ilike(assets.fileName, like),
        sql`array_to_string(${assets.tags}, ' ') ILIKE ${like}`,
        ...(audience === "team" ? [ilike(assets.internalNotes, like)] : []),
      )!,
    );
  }
  if (filters.categories?.length) conditions.push(sql`${assets.category}::text IN ${filters.categories}`);
  if (filters.category) conditions.push(sql`${assets.category}::text = ${filters.category}`);
  if (filters.status) conditions.push(sql`${assets.status}::text = ${filters.status}`);
  if (filters.tag) conditions.push(sql`${filters.tag} = ANY(${assets.tags})`);
  if (filters.uploader) conditions.push(eq(assets.uploadedById, filters.uploader));
  if (filters.project) {
    conditions.push(
      sql`EXISTS (SELECT 1 FROM ${contentAssets} WHERE ${contentAssets.assetId} = ${assets.id} AND ${contentAssets.contentItemId} = ${filters.project})`,
    );
  }
  return db
    .select(publicAssetColumns)
    .from(assets)
    .leftJoin(users, eq(users.id, assets.uploadedById))
    .where(and(...conditions))
    .orderBy(desc(assets.uploadedAt))
    .limit(300);
}

export async function allTags(workspaceId: string, audience: "team" | "client") {
  const conditions = [eq(assets.workspaceId, workspaceId), isNull(assets.deletedAt)];
  if (audience === "client") conditions.push(eq(assets.visibility, "shared"));
  const rows = await db.selectDistinct({ tag: sql<string>`unnest(${assets.tags})` }).from(assets).where(and(...conditions));
  return rows.map((row) => row.tag).sort();
}

export async function workspaceUploaders(workspaceId: string) {
  return db
    .selectDistinct({ id: users.id, name: users.name })
    .from(assets)
    .innerJoin(users, eq(users.id, assets.uploadedById))
    .where(and(eq(assets.workspaceId, workspaceId), isNull(assets.deletedAt)));
}

export async function assetsByIds(ids: string[]): Promise<PublicAsset[]> {
  if (!ids.length) return [];
  return db
    .select(publicAssetColumns)
    .from(assets)
    .leftJoin(users, eq(users.id, assets.uploadedById))
    .where(and(inArray(assets.id, ids), isNull(assets.deletedAt)));
}

/** Files attached to a piece. For a client: only released files, and only once the piece has reached her. */
export async function contentFiles(contentItemId: string, audience: "team" | "client") {
  const conditions = [eq(contentAssets.contentItemId, contentItemId), isNull(assets.deletedAt)];
  if (audience === "client") conditions.push(eq(assets.visibility, "shared"));
  const rows = await db
    .select({ ...publicAssetColumns, role: contentAssets.role, linkedAt: contentAssets.createdAt })
    .from(contentAssets)
    .innerJoin(assets, eq(assets.id, contentAssets.assetId))
    .leftJoin(users, eq(users.id, assets.uploadedById))
    .where(and(...conditions))
    .orderBy(desc(contentAssets.createdAt));
  return rows;
}

/** Newest cover or edit per piece, for card thumbnails. */
export async function coverFor(contentItemIds: string[], audience: "team" | "client") {
  if (!contentItemIds.length) return new Map<string, string>();
  const conditions = [
    inArray(contentAssets.contentItemId, contentItemIds),
    inArray(contentAssets.role, ["cover", "edited_video"]),
    isNull(assets.deletedAt),
    sql`${assets.thumbnailKey} IS NOT NULL`,
  ];
  if (audience === "client") conditions.push(eq(assets.visibility, "shared"));
  const rows = await db
    .select({ contentItemId: contentAssets.contentItemId, assetId: assets.id, role: contentAssets.role })
    .from(contentAssets)
    .innerJoin(assets, eq(assets.id, contentAssets.assetId))
    .where(and(...conditions))
    .orderBy(desc(contentAssets.createdAt));
  const map = new Map<string, string>();
  for (const row of rows) if (row.role === "cover" && !map.has(row.contentItemId)) map.set(row.contentItemId, row.assetId);
  for (const row of rows) if (!map.has(row.contentItemId)) map.set(row.contentItemId, row.assetId);
  return map;
}

/* ------------------------------------------------- client-safe content reads */

/** Every column the client is allowed to see on a piece. Script and caption are masked until it reaches her. */
const clientContentColumns = {
  id: contentItems.id,
  title: contentItems.title,
  pillar: contentItems.pillar,
  format: contentItems.format,
  status: contentItems.status,
  script: contentItems.script,
  caption: contentItems.caption,
  scheduledDate: contentItems.scheduledDate,
  scheduledTime: contentItems.scheduledTime,
  publishingLink: contentItems.publishingLink,
  reviewRound: contentItems.reviewRound,
  updatedAt: contentItems.updatedAt,
};

function maskForClient<T extends { status: ContentStatus; script: string; caption: string }>(item: T): T {
  if (CLIENT_CAN_SEE_WORK.includes(item.status)) return item;
  return { ...item, script: "", caption: "" };
}

export async function clientContentList(workspaceId: string) {
  const rows = await db
    .select(clientContentColumns)
    .from(contentItems)
    .where(and(eq(contentItems.workspaceId, workspaceId), isNull(contentItems.deletedAt)))
    .orderBy(desc(contentItems.updatedAt));
  return rows.map(maskForClient);
}

export async function clientContentItem(workspaceId: string, id: string) {
  const [row] = await db
    .select(clientContentColumns)
    .from(contentItems)
    .where(and(eq(contentItems.id, id), eq(contentItems.workspaceId, workspaceId), isNull(contentItems.deletedAt)));
  return row ? maskForClient(row) : null;
}

/* ---------------------------------------------------------- shared reads */

export type CommentView = {
  id: string;
  body: string;
  authorName: string | null;
  createdAt: Date;
  internal: boolean;
  timecodeSeconds: number | null;
  resolvedAt: Date | null;
};

export async function listComments(where: { contentItemId?: string; assetId?: string }, audience: "team" | "client"): Promise<CommentView[]> {
  const conditions = [];
  if (where.contentItemId) conditions.push(eq(comments.contentItemId, where.contentItemId));
  if (where.assetId) conditions.push(eq(comments.assetId, where.assetId));
  if (audience === "client") conditions.push(eq(comments.internal, false));
  return db
    .select({
      id: comments.id,
      body: comments.body,
      authorName: users.name,
      createdAt: comments.createdAt,
      internal: comments.internal,
      timecodeSeconds: comments.timecodeSeconds,
      resolvedAt: comments.resolvedAt,
    })
    .from(comments)
    .leftJoin(users, eq(users.id, comments.authorId))
    .where(and(...conditions))
    .orderBy(asc(comments.createdAt));
}

export async function listActivity(where: { workspaceId?: string; contentItemId?: string }, audience: "team" | "client", limit = 50) {
  const conditions = [];
  if (where.workspaceId) conditions.push(eq(activity.workspaceId, where.workspaceId));
  if (where.contentItemId) conditions.push(eq(activity.contentItemId, where.contentItemId));
  if (audience === "client") conditions.push(eq(activity.internal, false));
  return db
    .select({
      id: activity.id,
      summary: activity.summary,
      createdAt: activity.createdAt,
      actor: users.name,
      contentItemId: activity.contentItemId,
      internal: activity.internal,
    })
    .from(activity)
    .leftJoin(users, eq(users.id, activity.actorId))
    .where(and(...conditions))
    .orderBy(desc(activity.createdAt))
    .limit(limit);
}

export async function listRevisions(contentItemId: string) {
  return db
    .select({
      id: contentRevisions.id,
      kind: contentRevisions.kind,
      version: contentRevisions.version,
      value: contentRevisions.value,
      assetId: contentRevisions.assetId,
      author: users.name,
      createdAt: contentRevisions.createdAt,
    })
    .from(contentRevisions)
    .leftJoin(users, eq(users.id, contentRevisions.authorId))
    .where(eq(contentRevisions.contentItemId, contentItemId))
    .orderBy(desc(contentRevisions.createdAt));
}

export async function listApprovals(contentItemId: string) {
  return db
    .select({
      id: approvals.id,
      decision: approvals.decision,
      round: approvals.round,
      note: approvals.note,
      decidedBy: users.name,
      createdAt: approvals.createdAt,
    })
    .from(approvals)
    .leftJoin(users, eq(users.id, approvals.decidedById))
    .where(eq(approvals.contentItemId, contentItemId))
    .orderBy(desc(approvals.createdAt));
}

export async function unreadCount(userId: string, workspaceId?: string) {
  const conditions = [eq(notifications.userId, userId), isNull(notifications.readAt)];
  if (workspaceId) conditions.push(eq(notifications.workspaceId, workspaceId));
  const [row] = await db.select({ value: count() }).from(notifications).where(and(...conditions));
  return row?.value ?? 0;
}

export async function listNotifications(userId: string, workspaceId?: string) {
  const conditions = [eq(notifications.userId, userId)];
  if (workspaceId) conditions.push(eq(notifications.workspaceId, workspaceId));
  return db
    .select()
    .from(notifications)
    .where(and(...conditions))
    .orderBy(desc(notifications.createdAt))
    .limit(100);
}

export async function waitingOnClientCount(workspaceId: string) {
  const [row] = await db
    .select({ value: count() })
    .from(contentItems)
    .where(and(eq(contentItems.workspaceId, workspaceId), eq(contentItems.status, "client_review"), isNull(contentItems.deletedAt)));
  return row?.value ?? 0;
}

export async function projectOptions(workspaceId: string) {
  return db
    .select({ id: contentItems.id, title: contentItems.title })
    .from(contentItems)
    .where(and(eq(contentItems.workspaceId, workspaceId), isNull(contentItems.deletedAt), ne(contentItems.status, "published")))
    .orderBy(desc(contentItems.updatedAt));
}

export async function workspaceTeam(workspaceId: string) {
  const admins = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.agencyRole, "admin"));
  const team = await db
    .select({ id: users.id, name: users.name })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.role, "team")));
  const byId = new Map([...admins, ...team].map((person) => [person.id, person]));
  return [...byId.values()];
}

/* ------------------------------------------------------------ feed reads */

export type FeedSlotView = {
  id: string;
  position: number;
  kind: "reel" | "carousel" | "photo";
  state: "draft" | "planned";
  title: string;
  caption: string;
  contentItemId: string | null;
  media: PublicAsset[];
};

export async function loadSlots(layoutId: string, audience: "team" | "client"): Promise<FeedSlotView[]> {
  const conditions = [eq(feedSlots.layoutId, layoutId)];
  // Drafts belong to the team. The client only ever sees planned posts.
  if (audience === "client") conditions.push(eq(feedSlots.state, "planned"));
  const slots = await db.select().from(feedSlots).where(and(...conditions)).orderBy(asc(feedSlots.position));
  const media = await assetsByIds([...new Set(slots.flatMap((slot) => slot.assetIds))]);
  const byId = new Map(media.filter((asset) => audience === "team" || asset.visibility === "shared").map((asset) => [asset.id, asset]));
  return slots.map((slot) => ({
    id: slot.id,
    position: slot.position,
    kind: slot.kind,
    state: slot.state,
    title: slot.title,
    caption: slot.caption,
    contentItemId: slot.contentItemId,
    media: slot.assetIds.map((id) => byId.get(id)).filter((asset): asset is PublicAsset => !!asset),
  }));
}

/** The newest numbers for each post. Entries are running totals, so older ones must never be added in. */
export async function latestMetrics(workspaceId: string) {
  const rows = await db
    .select({
      metric: contentMetrics,
      item: { id: contentItems.id, title: contentItems.title, pillar: contentItems.pillar, status: contentItems.status },
    })
    .from(contentMetrics)
    .innerJoin(contentItems, eq(contentItems.id, contentMetrics.contentItemId))
    .where(and(eq(contentItems.workspaceId, workspaceId), isNull(contentItems.deletedAt)))
    .orderBy(desc(contentMetrics.capturedOn));
  const seen = new Set<string>();
  return rows
    .filter((row) => (seen.has(row.item.id) ? false : (seen.add(row.item.id), true)))
    .sort((a, b) => b.metric.saves + b.metric.shares - (a.metric.saves + a.metric.shares));
}

/** The grid of what is live on Instagram now, or null before anyone has added to it. */
export async function currentLayout(workspaceId: string) {
  const [layout] = await db
    .select()
    .from(feedLayouts)
    .where(and(eq(feedLayouts.workspaceId, workspaceId), eq(feedLayouts.isCurrent, true)));
  return layout ?? null;
}

export async function sharedLayout(workspaceId: string) {
  const [layout] = await db
    .select()
    .from(feedLayouts)
    .where(and(eq(feedLayouts.workspaceId, workspaceId), eq(feedLayouts.sharedWithClient, true)));
  return layout ?? null;
}
