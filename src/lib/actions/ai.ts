"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { contentItems } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { requireTeam } from "@/lib/auth";
import { addTextRevision, resetApprovalIfNeeded } from "@/lib/content";

/** Puts assistant text into a piece the same way a person's edit would: versioned, logged, and voiding any approval. */
export async function saveAiOutput(slug: string, contentItemId: string, field: "script" | "caption" | "brief", text: string) {
  const access = await requireTeam(slug);
  const value = text.trim();
  if (!value) return { error: "There is nothing to save." };
  const [item] = await db
    .select({ id: contentItems.id })
    .from(contentItems)
    .where(and(eq(contentItems.id, contentItemId), eq(contentItems.workspaceId, access.workspace.id), isNull(contentItems.deletedAt)));
  if (!item) return { error: "Not found" };

  if (field !== "brief") await addTextRevision(contentItemId, field, value, access.user.id);
  await db.update(contentItems).set({ [field]: value, updatedAt: new Date() }).where(eq(contentItems.id, contentItemId));
  await logActivity({
    workspaceId: access.workspace.id,
    actorId: access.user.id,
    summary: `saved a ${field} from the assistant`,
    contentItemId,
    internal: true,
  });
  if (field !== "brief") await resetApprovalIfNeeded(contentItemId, field, access.user.id);
  revalidatePath("/", "layout");
  return { ok: true };
}
