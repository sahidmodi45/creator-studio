import "server-only";
import { and, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { db } from "@/db";
import { activity, memberships, notifications, users } from "@/db/schema";

export async function logActivity(entry: {
  workspaceId: string;
  actorId: string | null;
  summary: string;
  contentItemId?: string | null;
  assetId?: string | null;
  internal?: boolean;
}) {
  await db.insert(activity).values({
    workspaceId: entry.workspaceId,
    actorId: entry.actorId,
    summary: entry.summary,
    contentItemId: entry.contentItemId ?? null,
    assetId: entry.assetId ?? null,
    internal: entry.internal ?? false,
  });
}

/** Everyone on the marketing team who can see this workspace, leaving out whoever did the thing. */
async function teamUserIds(workspaceId: string, exceptUserId?: string | null) {
  const admins = await db.select({ id: users.id }).from(users).where(eq(users.agencyRole, "admin"));
  const team = await db
    .select({ id: memberships.userId })
    .from(memberships)
    .where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.role, "team")));
  const ids = new Set([...admins, ...team].map((row) => row.id));
  if (exceptUserId) ids.delete(exceptUserId);
  return [...ids];
}

async function clientUserIds(workspaceId: string, exceptUserId?: string | null) {
  const rows = await db
    .select({ id: memberships.userId })
    .from(memberships)
    .where(
      and(
        eq(memberships.workspaceId, workspaceId),
        eq(memberships.role, "client"),
        exceptUserId ? ne(memberships.userId, exceptUserId) : isNotNull(memberships.userId),
      ),
    );
  return rows.map((row) => row.id);
}

async function insertNotifications(
  userIds: string[],
  workspaceId: string,
  note: { title: string; body?: string; href: string },
) {
  if (!userIds.length) return;
  await db.insert(notifications).values(
    userIds.map((userId) => ({
      userId,
      workspaceId,
      title: note.title,
      body: note.body ?? "",
      href: note.href,
    })),
  );
}

export async function notifyTeam(
  workspaceId: string,
  exceptUserId: string | null,
  note: { title: string; body?: string; href: string },
) {
  await insertNotifications(await teamUserIds(workspaceId, exceptUserId), workspaceId, note);
}

export async function notifyClient(
  workspaceId: string,
  exceptUserId: string | null,
  note: { title: string; body?: string; href: string },
) {
  await insertNotifications(await clientUserIds(workspaceId, exceptUserId), workspaceId, note);
}

export async function markRead(userId: string, ids?: string[]) {
  const conditions = [eq(notifications.userId, userId)];
  if (ids?.length) conditions.push(inArray(notifications.id, ids));
  await db.update(notifications).set({ readAt: new Date() }).where(and(...conditions));
}
