import { and, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { assets, contentItems, creativeRequests } from "@/db/schema";
import { getAccessById } from "@/lib/auth";
import { ASSET_CATEGORIES, MAX_UPLOAD_BYTES } from "@/lib/constants";
import { storage, uploadsEnabled } from "@/lib/storage";

const body = z.object({
  workspaceId: z.string().uuid(),
  fileName: z.string().min(1).max(300),
  mimeType: z.string().max(200),
  sizeBytes: z.number().int().positive().max(MAX_UPLOAD_BYTES),
  category: z.enum(ASSET_CATEGORIES).exclude(["external_link"]),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000).default(""),
  tags: z.array(z.string().trim().min(1).max(40)).max(30).default([]),
  internalNotes: z.string().max(5000).default(""),
  visibility: z.enum(["shared", "internal"]).optional(),
  contentItemId: z.string().uuid().nullable().optional(),
  requestId: z.string().uuid().nullable().optional(),
  role: z.enum(["voiceover", "raw_footage", "edited_video", "cover", "reference"]).nullable().optional(),
  withThumbnail: z.boolean().default(false),
});

function extension(fileName: string) {
  const match = /\.([a-zA-Z0-9]{1,8})$/.exec(fileName);
  return match ? `.${match[1].toLowerCase()}` : "";
}

/** Step 1 of an upload: record what is coming and hand back signed addresses for the browser to send it to. */
export async function POST(request: NextRequest) {
  // Until Google Drive is connected there is nowhere to put a file. Say so before recording anything.
  if (!uploadsEnabled()) return NextResponse.json({ error: "Uploads coming soon" }, { status: 503 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Those upload details are not valid" }, { status: 400 });
  const input = parsed.data;

  const access = await getAccessById(input.workspaceId);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Both links must point inside this workspace.
  if (input.contentItemId) {
    const [item] = await db
      .select({ id: contentItems.id })
      .from(contentItems)
      .where(and(eq(contentItems.id, input.contentItemId), eq(contentItems.workspaceId, access.workspace.id)));
    if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (input.requestId) {
    const [row] = await db
      .select({ id: creativeRequests.id })
      .from(creativeRequests)
      .where(and(eq(creativeRequests.id, input.requestId), eq(creativeRequests.workspaceId, access.workspace.id)));
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const id = crypto.randomUUID();
  const storageKey = `${access.workspace.id}/${id}/original${extension(input.fileName)}`;
  const thumbnailKey = input.withThumbnail ? `${access.workspace.id}/${id}/thumb.jpg` : null;
  const mimeType = input.mimeType || "application/octet-stream";

  await db.insert(assets).values({
    id,
    workspaceId: access.workspace.id,
    category: input.category,
    status: "uploading",
    // A client's own files are always shared with the team. Team files stay private until released.
    visibility: access.isTeam ? (input.visibility ?? "internal") : "shared",
    title: input.title,
    description: input.description,
    tags: input.tags,
    internalNotes: access.isTeam ? input.internalNotes : "",
    uploadedById: access.user.id,
    requestId: input.requestId ?? null,
    storageKey,
    thumbnailKey,
    fileName: input.fileName,
    mimeType,
    sizeBytes: input.sizeBytes,
  });

  const driver = storage();
  return NextResponse.json({
    assetId: id,
    put: await driver.signPut(storageKey, mimeType, input.sizeBytes),
    thumbPut: thumbnailKey ? await driver.signPut(thumbnailKey, "image/jpeg", 10 * 1024 * 1024) : null,
  });
}
