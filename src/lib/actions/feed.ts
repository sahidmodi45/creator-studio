"use server";

import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { assets, contentItems, feedLayouts, feedSlots } from "@/db/schema";
import { logActivity, notifyClient } from "@/lib/activity";
import { getAccessById, requireTeam, requireUser } from "@/lib/auth";

type Result = { error?: string; id?: string } | undefined;

function refresh() {
  revalidatePath("/", "layout");
}

async function loadLayoutAsTeam(layoutId: string) {
  await requireUser();
  const [layout] = await db.select().from(feedLayouts).where(eq(feedLayouts.id, layoutId));
  if (!layout) return null;
  const access = await getAccessById(layout.workspaceId);
  return access?.isTeam ? { layout, access } : null;
}

async function loadSlotAsTeam(slotId: string) {
  await requireUser();
  const [slot] = await db.select().from(feedSlots).where(eq(feedSlots.id, slotId));
  if (!slot) return null;
  const loaded = await loadLayoutAsTeam(slot.layoutId);
  return loaded ? { slot, ...loaded } : null;
}

/** Every id must be a real file of this workspace, or one client's file could be pulled into another's feed. */
async function validAssetIds(workspaceId: string, ids: string[]) {
  if (!ids.length) return [];
  const rows = await db
    .select({ id: assets.id })
    .from(assets)
    .where(and(inArray(assets.id, ids), eq(assets.workspaceId, workspaceId)));
  const known = new Set(rows.map((row) => row.id));
  return ids.filter((id) => known.has(id));
}

/** Files in planned posts on the client-visible layout need to be readable by her. */
async function releasePlannedFiles(layoutId: string) {
  const [layout] = await db.select().from(feedLayouts).where(eq(feedLayouts.id, layoutId));
  if (!layout?.sharedWithClient) return;
  const slots = await db
    .select({ assetIds: feedSlots.assetIds })
    .from(feedSlots)
    .where(and(eq(feedSlots.layoutId, layoutId), eq(feedSlots.state, "planned")));
  const ids = [...new Set(slots.flatMap((slot) => slot.assetIds))];
  if (ids.length) await db.update(assets).set({ visibility: "shared" }).where(inArray(assets.id, ids));
}

async function touch(layoutId: string) {
  await db.update(feedLayouts).set({ updatedAt: new Date() }).where(eq(feedLayouts.id, layoutId));
}

export async function createLayout(slug: string, name: string): Promise<Result> {
  const access = await requireTeam(slug);
  const trimmed = name.trim();
  if (!trimmed) return { error: "Please name this version." };
  const [layout] = await db
    .insert(feedLayouts)
    .values({ workspaceId: access.workspace.id, name: trimmed.slice(0, 80), createdById: access.user.id })
    .returning({ id: feedLayouts.id });
  refresh();
  return { id: layout.id };
}

export async function duplicateLayout(layoutId: string, name: string): Promise<Result> {
  const loaded = await loadLayoutAsTeam(layoutId);
  if (!loaded) return { error: "Not found" };
  const trimmed = name.trim();
  if (!trimmed) return { error: "Please name this version." };
  const id = await db.transaction(async (tx) => {
    const [copy] = await tx
      .insert(feedLayouts)
      .values({ workspaceId: loaded.layout.workspaceId, name: trimmed.slice(0, 80), createdById: loaded.access.user.id })
      .returning({ id: feedLayouts.id });
    const slots = await tx.select().from(feedSlots).where(eq(feedSlots.layoutId, layoutId));
    if (slots.length) {
      await tx.insert(feedSlots).values(
        slots.map((slot) => ({
          layoutId: copy.id,
          position: slot.position,
          kind: slot.kind,
          state: slot.state,
          assetIds: slot.assetIds,
          title: slot.title,
          caption: slot.caption,
          contentItemId: slot.contentItemId,
        })),
      );
    }
    return copy.id;
  });
  refresh();
  return { id };
}

export async function renameLayout(layoutId: string, name: string): Promise<Result> {
  const loaded = await loadLayoutAsTeam(layoutId);
  if (!loaded) return { error: "Not found" };
  const trimmed = name.trim();
  if (!trimmed) return { error: "Please name this version." };
  await db.update(feedLayouts).set({ name: trimmed.slice(0, 80), updatedAt: new Date() }).where(eq(feedLayouts.id, layoutId));
  refresh();
  return { id: layoutId };
}

export async function deleteLayout(layoutId: string): Promise<Result> {
  const loaded = await loadLayoutAsTeam(layoutId);
  if (!loaded) return { error: "Not found" };
  if (loaded.layout.sharedWithClient) return { error: "The client is looking at this version. Share another one first." };
  await db.delete(feedLayouts).where(eq(feedLayouts.id, layoutId));
  refresh();
  return { id: layoutId };
}

export async function shareLayout(layoutId: string): Promise<Result> {
  const loaded = await loadLayoutAsTeam(layoutId);
  if (!loaded) return { error: "Not found" };
  const { layout, access } = loaded;
  await db.transaction(async (tx) => {
    await tx
      .update(feedLayouts)
      .set({ sharedWithClient: false })
      .where(and(eq(feedLayouts.workspaceId, layout.workspaceId), ne(feedLayouts.id, layoutId)));
    await tx.update(feedLayouts).set({ sharedWithClient: true }).where(eq(feedLayouts.id, layoutId));
  });
  await releasePlannedFiles(layoutId);
  await notifyClient(layout.workspaceId, access.user.id, {
    title: "Your feed has been updated",
    body: "Take a look at how the next few posts will sit together.",
    href: `/w/${access.workspace.slug}/feed`,
  });
  await logActivity({
    workspaceId: layout.workspaceId,
    actorId: access.user.id,
    summary: `shared feed version "${layout.name}"`,
  });
  refresh();
  return { id: layoutId };
}

const slotInput = z.object({
  kind: z.enum(["reel", "carousel", "photo"]).optional(),
  state: z.enum(["draft", "planned"]).optional(),
  assetIds: z.array(z.string().uuid()).max(20).optional(),
  title: z.string().max(200).optional(),
  caption: z.string().max(5000).optional(),
  contentItemId: z.string().uuid().nullable().optional(),
});

export async function createSlot(layoutId: string, position: number, input: z.input<typeof slotInput>): Promise<Result> {
  const loaded = await loadLayoutAsTeam(layoutId);
  if (!loaded) return { error: "Not found" };
  const parsed = slotInput.safeParse(input);
  if (!parsed.success || !Number.isInteger(position) || position < 0) return { error: "Those details are not valid." };
  const assetIds = await validAssetIds(loaded.layout.workspaceId, parsed.data.assetIds ?? []);
  const [slot] = await db
    .insert(feedSlots)
    .values({
      layoutId,
      position,
      kind: parsed.data.kind ?? "photo",
      state: parsed.data.state ?? "draft",
      assetIds,
      title: parsed.data.title ?? "",
      caption: parsed.data.caption ?? "",
      contentItemId: parsed.data.contentItemId ?? null,
    })
    .returning({ id: feedSlots.id });
  await touch(layoutId);
  await releasePlannedFiles(layoutId);
  refresh();
  return { id: slot.id };
}

export async function updateSlot(slotId: string, input: z.input<typeof slotInput>): Promise<Result> {
  const loaded = await loadSlotAsTeam(slotId);
  if (!loaded) return { error: "Not found" };
  const parsed = slotInput.safeParse(input);
  if (!parsed.success) return { error: "Those details are not valid." };
  const change = { ...parsed.data };
  if (change.assetIds) change.assetIds = await validAssetIds(loaded.layout.workspaceId, change.assetIds);
  if (change.contentItemId) {
    const [item] = await db
      .select({ id: contentItems.id })
      .from(contentItems)
      .where(and(eq(contentItems.id, change.contentItemId), eq(contentItems.workspaceId, loaded.layout.workspaceId)));
    if (!item) return { error: "Not found" };
  }
  await db.update(feedSlots).set(change).where(eq(feedSlots.id, slotId));
  await touch(loaded.layout.id);
  await releasePlannedFiles(loaded.layout.id);
  refresh();
  return { id: slotId };
}

export async function removeSlot(slotId: string): Promise<Result> {
  const loaded = await loadSlotAsTeam(slotId);
  if (!loaded) return { error: "Not found" };
  await db.delete(feedSlots).where(eq(feedSlots.id, slotId));
  await touch(loaded.layout.id);
  refresh();
  return { id: slotId };
}

/** Adds live posts to the top of the current feed, since the newest post is always top left. */
export async function addCurrentPosts(slug: string, assetIds: string[]): Promise<Result> {
  const access = await requireTeam(slug);
  const parsed = z.array(z.string().uuid()).min(1).max(100).safeParse(assetIds);
  if (!parsed.success) return { error: "Those files are not valid." };
  const ids = await validAssetIds(access.workspace.id, parsed.data);
  if (!ids.length) return { error: "Those files were not found." };
  const files = await db.select({ id: assets.id, mimeType: assets.mimeType, title: assets.title }).from(assets).where(inArray(assets.id, ids));
  const byId = new Map(files.map((file) => [file.id, file]));

  await db.transaction(async (tx) => {
    let [layout] = await tx
      .select({ id: feedLayouts.id })
      .from(feedLayouts)
      .where(and(eq(feedLayouts.workspaceId, access.workspace.id), eq(feedLayouts.isCurrent, true)));
    if (!layout) {
      [layout] = await tx
        .insert(feedLayouts)
        .values({ workspaceId: access.workspace.id, name: "Current feed", isCurrent: true, createdById: access.user.id })
        .returning({ id: feedLayouts.id });
    }
    await tx
      .update(feedSlots)
      .set({ position: sql`${feedSlots.position} + ${ids.length}` })
      .where(eq(feedSlots.layoutId, layout.id));
    await tx.insert(feedSlots).values(
      ids.map((id, position) => ({
        layoutId: layout.id,
        position,
        // Planned, because this is what the client is meant to see.
        state: "planned" as const,
        kind: byId.get(id)?.mimeType?.startsWith("video/") ? ("reel" as const) : ("photo" as const),
        assetIds: [id],
        title: byId.get(id)?.title ?? "",
      })),
    );
    // Already placed, so these should not sit in the team's list of new files to sort.
    await tx.update(assets).set({ status: "in_use", visibility: "shared" }).where(inArray(assets.id, ids));
  });
  refresh();
  return {};
}

export async function saveSlotOrder(layoutId: string, order: { id: string; position: number }[]): Promise<Result> {
  const loaded = await loadLayoutAsTeam(layoutId);
  if (!loaded) return { error: "Not found" };
  const parsed = z.array(z.object({ id: z.string().uuid(), position: z.number().int().min(0) })).safeParse(order);
  if (!parsed.success) return { error: "Those positions are not valid." };
  await db.transaction(async (tx) => {
    for (const entry of parsed.data) {
      await tx
        .update(feedSlots)
        .set({ position: entry.position })
        .where(and(eq(feedSlots.id, entry.id), eq(feedSlots.layoutId, layoutId)));
    }
  });
  await touch(layoutId);
  refresh();
  return { id: layoutId };
}
