import { and, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { assets, contentItems } from "@/db/schema";
import { logActivity, notifyTeam } from "@/lib/activity";
import { getAccessById } from "@/lib/auth";
import { CATEGORY_LABEL, roleForCategory, type ContentAssetRole } from "@/lib/constants";
import { attachAssetToContent } from "@/lib/content";
import { storage } from "@/lib/storage";

const body = z.object({
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
  durationSeconds: z.number().positive().nullable().optional(),
  thumbnailUploaded: z.boolean().default(false),
  contentItemId: z.string().uuid().nullable().optional(),
  role: z.enum(["voiceover", "raw_footage", "edited_video", "cover", "reference"]).nullable().optional(),
});

/** Step 3 of an upload: confirm the bytes really arrived before the file counts as uploaded. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Not valid" }, { status: 400 });
  const input = parsed.data;

  const [asset] = await db.select().from(assets).where(eq(assets.id, id));
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const access = await getAccessById(asset.workspaceId);
  if (!access || asset.uploadedById !== access.user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // A repeated confirmation must not notify anyone twice.
  if (asset.status !== "uploading") return NextResponse.json({ ok: true, assetId: id });

  const stored = await storage().size(asset.storageKey!);
  if (stored == null || stored !== asset.sizeBytes) {
    await db.delete(assets).where(eq(assets.id, id));
    return NextResponse.json({ error: "The file did not arrive in full. Please try again." }, { status: 409 });
  }

  let thumbnailKey = asset.thumbnailKey;
  if (thumbnailKey && !(input.thumbnailUploaded && (await storage().size(thumbnailKey)) != null)) thumbnailKey = null;

  const [item] = input.contentItemId
    ? await db
        .select({ id: contentItems.id, title: contentItems.title })
        .from(contentItems)
        .where(and(eq(contentItems.id, input.contentItemId), eq(contentItems.workspaceId, asset.workspaceId)))
    : [];

  await db
    .update(assets)
    .set({
      status: item ? "in_use" : "new",
      width: input.width ?? null,
      height: input.height ?? null,
      durationSeconds: input.durationSeconds ?? null,
      thumbnailKey,
    })
    .where(eq(assets.id, id));

  if (item) {
    const role = (input.role ?? roleForCategory(asset.category)) as ContentAssetRole;
    await attachAssetToContent(item.id, id, role, access.user.id);
  }

  const label = CATEGORY_LABEL[asset.category].toLowerCase();
  await logActivity({
    workspaceId: asset.workspaceId,
    actorId: access.user.id,
    summary: `uploaded ${label} "${asset.title}"${item ? ` to "${item.title}"` : ""}`,
    contentItemId: item?.id,
    assetId: id,
    internal: asset.visibility === "internal",
  });

  if (!access.isTeam) {
    await notifyTeam(asset.workspaceId, access.user.id, {
      title: `${access.user.name} sent a new ${label}`,
      body: asset.title,
      href: `/admin/${access.workspace.slug}/library/${id}`,
    });
  }

  return NextResponse.json({ ok: true, assetId: id });
}
