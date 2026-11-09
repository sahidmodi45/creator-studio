"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { assets, comments, contentAssets, contentItems } from "@/db/schema";
import { logActivity, notifyClient, notifyTeam } from "@/lib/activity";
import { getAccessById, requireUser, type Access } from "@/lib/auth";
import { ASSET_CATEGORIES, ASSET_STATUSES, roleForCategory, type AssetCategory, type ContentAssetRole } from "@/lib/constants";
import { attachAssetToContent } from "@/lib/content";

type Result = { error?: string; id?: string } | undefined;

/** Loads a file together with the caller's rights over it, or nothing if they have none. */
async function loadAsset(assetId: string): Promise<{ asset: typeof assets.$inferSelect; access: Access } | null> {
  await requireUser();
  const [asset] = await db.select().from(assets).where(eq(assets.id, assetId));
  if (!asset || asset.deletedAt) return null;
  const access = await getAccessById(asset.workspaceId);
  if (!access) return null;
  if (!access.isTeam && asset.visibility === "internal") return null;
  return { asset, access };
}

function revalidateWorkspace(slug: string) {
  revalidatePath(`/admin/${slug}`, "layout");
  revalidatePath(`/w/${slug}`, "layout");
}

const linkSchema = z.object({
  workspaceId: z.string().uuid(),
  url: z.string().trim().url(),
  title: z.string().trim().max(200).optional().default(""),
  description: z.string().trim().max(5000).optional().default(""),
  contentItemId: z.string().uuid().or(z.literal("")).optional(),
});

export async function addLinkAsset(form: FormData): Promise<Result> {
  await requireUser();
  const parsed = linkSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Please check the link. It should start with https://" };
  const input = parsed.data;
  if (!/^https?:\/\//i.test(input.url)) return { error: "Please use a link that starts with https://" };

  const access = await getAccessById(input.workspaceId);
  if (!access) return { error: "Not found" };

  const [item] = input.contentItemId
    ? await db
        .select({ id: contentItems.id })
        .from(contentItems)
        .where(and(eq(contentItems.id, input.contentItemId), eq(contentItems.workspaceId, access.workspace.id)))
    : [];

  const host = new URL(input.url).hostname.replace(/^www\./, "");
  const title = input.title || `Link from ${host}`;
  const [asset] = await db
    .insert(assets)
    .values({
      workspaceId: access.workspace.id,
      category: "external_link",
      status: item ? "in_use" : "new",
      visibility: access.isTeam ? "internal" : "shared",
      title,
      description: input.description,
      externalUrl: input.url,
      uploadedById: access.user.id,
    })
    .returning({ id: assets.id });

  if (item) await attachAssetToContent(item.id, asset.id, "reference", access.user.id);

  await logActivity({
    workspaceId: access.workspace.id,
    actorId: access.user.id,
    summary: `shared a link "${title}"`,
    assetId: asset.id,
    contentItemId: item?.id,
    internal: access.isTeam,
  });
  if (!access.isTeam) {
    await notifyTeam(access.workspace.id, access.user.id, {
      title: `${access.user.name} shared a link`,
      body: title,
      href: `/admin/${access.workspace.slug}/library/${asset.id}`,
    });
  }
  revalidateWorkspace(access.workspace.slug);
  return { id: asset.id };
}

const updateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000).default(""),
  category: z.enum(ASSET_CATEGORIES),
  status: z.enum(ASSET_STATUSES),
  visibility: z.enum(["shared", "internal"]),
  tags: z.string().max(1000).default(""),
  internalNotes: z.string().max(5000).default(""),
});

export async function updateAsset(assetId: string, form: FormData): Promise<Result> {
  const loaded = await loadAsset(assetId);
  if (!loaded) return { error: "Not found" };
  const { asset, access } = loaded;

  const raw = Object.fromEntries(form);
  if (!access.isTeam) {
    // A client may tidy up her own uploads' words, and nothing else.
    if (asset.uploadedById !== access.user.id) return { error: "Not found" };
    const title = String(raw.title ?? "").trim();
    if (!title) return { error: "Please add a title." };
    await db
      .update(assets)
      .set({ title: title.slice(0, 200), description: String(raw.description ?? "").slice(0, 5000) })
      .where(eq(assets.id, assetId));
    revalidateWorkspace(access.workspace.slug);
    return { id: assetId };
  }

  const parsed = updateSchema.safeParse(raw);
  if (!parsed.success) return { error: "Please check the details and try again." };
  const input = parsed.data;
  await db
    .update(assets)
    .set({
      title: input.title,
      description: input.description,
      category: input.category,
      status: input.status,
      visibility: input.visibility,
      tags: [...new Set(input.tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))],
      internalNotes: input.internalNotes,
    })
    .where(eq(assets.id, assetId));
  revalidateWorkspace(access.workspace.slug);
  return { id: assetId };
}

export async function deleteAsset(assetId: string) {
  const loaded = await loadAsset(assetId);
  if (!loaded) return { error: "Not found" };
  const { asset, access } = loaded;
  if (!access.isTeam && asset.uploadedById !== access.user.id) return { error: "Not found" };

  // Hidden, not erased, so a mistake can be undone from the database.
  await db.update(assets).set({ deletedAt: new Date() }).where(eq(assets.id, assetId));
  await db.delete(contentAssets).where(eq(contentAssets.assetId, assetId));
  await logActivity({
    workspaceId: asset.workspaceId,
    actorId: access.user.id,
    summary: `removed "${asset.title}" from the library`,
    internal: true,
  });
  revalidateWorkspace(access.workspace.slug);
  redirect(access.isTeam ? `/admin/${access.workspace.slug}/library` : `/w/${access.workspace.slug}/files`);
}

export async function linkAssetToContent(assetId: string, contentItemId: string, role?: ContentAssetRole): Promise<Result> {
  const loaded = await loadAsset(assetId);
  if (!loaded) return { error: "Not found" };
  const { asset, access } = loaded;
  if (!access.isTeam) return { error: "Not found" };
  const [item] = await db
    .select({ id: contentItems.id, title: contentItems.title })
    .from(contentItems)
    .where(and(eq(contentItems.id, contentItemId), eq(contentItems.workspaceId, asset.workspaceId)));
  if (!item) return { error: "Not found" };
  await attachAssetToContent(item.id, assetId, role ?? roleForCategory(asset.category as AssetCategory), access.user.id);
  await logActivity({
    workspaceId: asset.workspaceId,
    actorId: access.user.id,
    summary: `attached "${asset.title}" to "${item.title}"`,
    contentItemId: item.id,
    assetId,
    internal: true,
  });
  revalidateWorkspace(access.workspace.slug);
  return { id: assetId };
}

export async function unlinkAssetFromContent(assetId: string, contentItemId: string, role: ContentAssetRole): Promise<Result> {
  const loaded = await loadAsset(assetId);
  if (!loaded || !loaded.access.isTeam) return { error: "Not found" };
  await db
    .delete(contentAssets)
    .where(and(eq(contentAssets.assetId, assetId), eq(contentAssets.contentItemId, contentItemId), eq(contentAssets.role, role)));
  revalidateWorkspace(loaded.access.workspace.slug);
  return { id: assetId };
}

export async function addAssetComment(assetId: string, form: FormData): Promise<Result> {
  const loaded = await loadAsset(assetId);
  if (!loaded) return { error: "Not found" };
  const { asset, access } = loaded;
  const body = String(form.get("body") ?? "").trim();
  if (!body) return { error: "Please write something first." };
  const internal = access.isTeam && form.get("internal") === "on";
  await db.insert(comments).values({
    workspaceId: asset.workspaceId,
    assetId,
    authorId: access.user.id,
    body: body.slice(0, 5000),
    internal,
  });
  await logActivity({
    workspaceId: asset.workspaceId,
    actorId: access.user.id,
    summary: `commented on "${asset.title}"`,
    assetId,
    internal,
  });
  if (!internal) {
    const note = { title: `${access.user.name} commented on ${asset.title}`, body: body.slice(0, 140) };
    if (access.isTeam) await notifyClient(asset.workspaceId, access.user.id, { ...note, href: `/w/${access.workspace.slug}/files/${assetId}` });
    else await notifyTeam(asset.workspaceId, access.user.id, { ...note, href: `/admin/${access.workspace.slug}/library/${assetId}` });
  }
  revalidateWorkspace(access.workspace.slug);
  return { id: assetId };
}
