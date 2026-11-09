"use server";

import { and, eq, inArray, isNull, min } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { approvals, comments, contentAssets, contentItems } from "@/db/schema";
import { logActivity, notifyClient, notifyTeam } from "@/lib/activity";
import { getAccessById, requireTeam, requireUser, type Access } from "@/lib/auth";
import { CONTENT_STATUSES, FORMATS, STATUS_LABEL, type ContentStatus } from "@/lib/constants";
import { addTextRevision, releaseToClient, resetApprovalIfNeeded } from "@/lib/content";

type Result = { error?: string; id?: string; warning?: string } | undefined;
type Item = typeof contentItems.$inferSelect;

function refresh() {
  revalidatePath("/", "layout");
}

async function loadItem(id: string): Promise<{ item: Item; access: Access } | null> {
  await requireUser();
  const [item] = await db.select().from(contentItems).where(and(eq(contentItems.id, id), isNull(contentItems.deletedAt)));
  if (!item) return null;
  const access = await getAccessById(item.workspaceId);
  return access ? { item, access } : null;
}

async function loadItemAsTeam(id: string) {
  const loaded = await loadItem(id);
  return loaded?.access.isTeam ? loaded : null;
}

const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  format: z.enum(FORMATS).default("reel"),
  pillar: z.string().trim().max(80).optional().default(""),
  status: z.enum(CONTENT_STATUSES).default("idea"),
});

export async function createContent(slug: string, form: FormData): Promise<Result> {
  const access = await requireTeam(slug);
  const parsed = createSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Please give it a title." };
  const [topOfColumn] = await db
    .select({ rank: min(contentItems.rank) })
    .from(contentItems)
    .where(and(eq(contentItems.workspaceId, access.workspace.id), eq(contentItems.status, parsed.data.status)));
  const [item] = await db
    .insert(contentItems)
    .values({
      workspaceId: access.workspace.id,
      title: parsed.data.title,
      format: parsed.data.format,
      pillar: parsed.data.pillar || null,
      status: parsed.data.status,
      rank: (topOfColumn?.rank ?? 0) - 1,
      createdById: access.user.id,
      ownerId: access.user.id,
    })
    .returning({ id: contentItems.id });
  await logActivity({
    workspaceId: access.workspace.id,
    actorId: access.user.id,
    summary: `created "${parsed.data.title}"`,
    contentItemId: item.id,
    internal: true,
  });
  refresh();
  return { id: item.id };
}

const updateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  pillar: z.string().trim().max(80).default(""),
  format: z.enum(FORMATS),
  brief: z.string().max(20000).default(""),
  script: z.string().max(50000).default(""),
  caption: z.string().max(5000).default(""),
  internalNotes: z.string().max(20000).default(""),
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")).default(""),
  scheduledTime: z.string().regex(/^\d{2}:\d{2}$/).or(z.literal("")).default(""),
  publishingLink: z.string().trim().url().or(z.literal("")).default(""),
  ownerId: z.string().uuid().or(z.literal("")).default(""),
});

export async function updateContent(id: string, form: FormData): Promise<Result> {
  const loaded = await loadItemAsTeam(id);
  if (!loaded) return { error: "Not found" };
  const { item, access } = loaded;
  const parsed = updateSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return { error: field === "publishingLink" ? "The publishing link should be a full web address." : "Please check the details and try again." };
  }
  const input = parsed.data;

  if (input.script !== item.script) await addTextRevision(id, "script", input.script, access.user.id);
  if (input.caption !== item.caption) await addTextRevision(id, "caption", input.caption, access.user.id);

  await db
    .update(contentItems)
    .set({
      title: input.title,
      pillar: input.pillar || null,
      format: input.format,
      brief: input.brief,
      script: input.script,
      caption: input.caption,
      internalNotes: input.internalNotes,
      scheduledDate: input.scheduledDate || null,
      scheduledTime: input.scheduledTime || null,
      publishingLink: input.publishingLink || null,
      ownerId: input.ownerId || null,
      updatedAt: new Date(),
    })
    .where(eq(contentItems.id, id));

  const changed = [
    input.script !== item.script && "script",
    input.caption !== item.caption && "caption",
    input.title !== item.title && "title",
    input.brief !== item.brief && "brief",
    (input.scheduledDate || null) !== item.scheduledDate && "schedule",
  ].filter(Boolean) as string[];
  if (changed.length) {
    await logActivity({
      workspaceId: item.workspaceId,
      actorId: access.user.id,
      summary: `edited the ${changed.join(", ")}`,
      contentItemId: id,
      internal: true,
    });
  }
  // What the client signed off on is the script and caption, so those two void an approval.
  let warning: string | undefined;
  if (input.script !== item.script || input.caption !== item.caption) {
    const reset = await resetApprovalIfNeeded(id, input.caption !== item.caption ? "caption" : "script", access.user.id);
    if (reset) warning = "This was approved, so it went back to Internal Review. Send it to the client again.";
  }
  refresh();
  return { id, warning };
}

/** The rules a move must pass, in one place, for the board, the detail page and the calendar. */
async function statusProblem(item: Item, next: ContentStatus): Promise<string | null> {
  if (next === "client_review") {
    const [hasWork] = await db
      .select({ assetId: contentAssets.assetId })
      .from(contentAssets)
      .where(and(eq(contentAssets.contentItemId, item.id), inArray(contentAssets.role, ["edited_video", "cover"])))
      .limit(1);
    if (!hasWork && !item.caption.trim() && !item.script.trim()) {
      return "Add an edit, a cover, a script or a caption first, so the client has something to review.";
    }
  }
  if (next === "scheduled" && !item.scheduledDate) return "Pick a date first, then schedule it.";
  if ((next === "scheduled" || next === "published") && !["approved", "scheduled", "published"].includes(item.status)) {
    return `"${item.title}" has not been approved yet. Only approved work can be ${next === "scheduled" ? "scheduled" : "published"}.`;
  }
  return null;
}

export async function setContentStatus(id: string, next: ContentStatus, rank?: number): Promise<Result> {
  const loaded = await loadItemAsTeam(id);
  if (!loaded) return { error: "Not found" };
  const { item, access } = loaded;
  if (!CONTENT_STATUSES.includes(next)) return { error: "Unknown status." };

  if (item.status === next) {
    if (rank != null) await db.update(contentItems).set({ rank }).where(eq(contentItems.id, id));
    refresh();
    return { id };
  }

  const problem = await statusProblem(item, next);
  if (problem) return { error: problem };

  const sendingToClient = next === "client_review";
  await db
    .update(contentItems)
    .set({
      status: next,
      updatedAt: new Date(),
      ...(rank != null ? { rank } : {}),
      ...(sendingToClient ? { reviewRound: item.reviewRound + 1 } : {}),
    })
    .where(eq(contentItems.id, id));

  await logActivity({
    workspaceId: item.workspaceId,
    actorId: access.user.id,
    summary: `moved this to ${STATUS_LABEL[next]}`,
    contentItemId: id,
    internal: !sendingToClient && next !== "scheduled" && next !== "published",
  });

  const clientHref = `/w/${access.workspace.slug}/review/${id}`;
  if (sendingToClient) {
    await releaseToClient(id);
    await notifyClient(item.workspaceId, access.user.id, {
      title: `Ready for your review: ${item.title}`,
      body: "Take a look and tell us what you think.",
      href: clientHref,
    });
  }
  if (next === "scheduled") {
    await notifyClient(item.workspaceId, access.user.id, {
      title: `Scheduled: ${item.title}`,
      body: `Going out on ${item.scheduledDate}.`,
      href: clientHref,
    });
  }
  if (next === "published") {
    await notifyClient(item.workspaceId, access.user.id, {
      title: `Live now: ${item.title}`,
      body: item.publishingLink ?? "",
      href: clientHref,
    });
  }
  refresh();
  return { id };
}

export async function rescheduleContent(id: string, date: string): Promise<Result> {
  const loaded = await loadItemAsTeam(id);
  if (!loaded) return { error: "Not found" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "That date is not valid." };
  const { item, access } = loaded;
  await db.update(contentItems).set({ scheduledDate: date, updatedAt: new Date() }).where(eq(contentItems.id, id));
  await logActivity({
    workspaceId: item.workspaceId,
    actorId: access.user.id,
    summary: `moved the date to ${date}`,
    contentItemId: id,
    internal: item.status !== "scheduled",
  });
  if (item.status === "scheduled") {
    await notifyClient(item.workspaceId, access.user.id, {
      title: `New date for ${item.title}`,
      body: `Now going out on ${date}.`,
      href: `/w/${access.workspace.slug}/calendar`,
    });
  }
  refresh();
  return { id };
}

export async function deleteContent(id: string) {
  const loaded = await loadItemAsTeam(id);
  if (!loaded) return { error: "Not found" };
  const { item, access } = loaded;
  await db.update(contentItems).set({ deletedAt: new Date() }).where(eq(contentItems.id, id));
  await logActivity({
    workspaceId: item.workspaceId,
    actorId: access.user.id,
    summary: `deleted "${item.title}"`,
    internal: true,
  });
  refresh();
  redirect(`/admin/${access.workspace.slug}/pipeline`);
}

/** The client's three answers. Only valid while a piece is actually waiting on her. */
export async function decideContent(id: string, decision: "approved" | "revision_requested" | "rejected", note: string): Promise<Result> {
  const loaded = await loadItem(id);
  if (!loaded) return { error: "Not found" };
  const { item, access } = loaded;
  if (item.status !== "client_review") return { error: "This is not waiting for a decision any more." };
  const trimmed = note.trim().slice(0, 5000);
  if (decision !== "approved" && !trimmed) {
    return { error: decision === "rejected" ? "Please tell us why, so we can do better." : "Please tell us what to change." };
  }

  const nextStatus: ContentStatus = decision === "approved" ? "approved" : decision === "revision_requested" ? "revision_requested" : "idea";
  await db.insert(approvals).values({ contentItemId: id, decision, round: item.reviewRound, note: trimmed, decidedById: access.user.id });
  await db.update(contentItems).set({ status: nextStatus, updatedAt: new Date() }).where(eq(contentItems.id, id));
  if (trimmed) {
    await db.insert(comments).values({ workspaceId: item.workspaceId, contentItemId: id, authorId: access.user.id, body: trimmed });
  }

  const verb = decision === "approved" ? "approved this" : decision === "revision_requested" ? "asked for changes" : "rejected this";
  await logActivity({ workspaceId: item.workspaceId, actorId: access.user.id, summary: verb, contentItemId: id });
  await notifyTeam(item.workspaceId, access.user.id, {
    title: `${access.user.name} ${verb}: ${item.title}`,
    body: trimmed.slice(0, 140),
    href: `/admin/${access.workspace.slug}/content/${id}`,
  });
  refresh();
  return { id };
}

export async function addContentComment(id: string, form: FormData): Promise<Result> {
  const loaded = await loadItem(id);
  if (!loaded) return { error: "Not found" };
  const { item, access } = loaded;
  const body = String(form.get("body") ?? "").trim();
  if (!body) return { error: "Please write something first." };
  const timecodeRaw = form.get("timecode");
  const timecode = timecodeRaw != null && timecodeRaw !== "" ? Number(timecodeRaw) : null;
  // The server decides this. A client's comment can never be marked team-only, or the reverse.
  const internal = access.isTeam && form.get("internal") === "on";

  await db.insert(comments).values({
    workspaceId: item.workspaceId,
    contentItemId: id,
    authorId: access.user.id,
    body: body.slice(0, 5000),
    internal,
    timecodeSeconds: timecode != null && Number.isFinite(timecode) && timecode >= 0 ? timecode : null,
  });
  await logActivity({
    workspaceId: item.workspaceId,
    actorId: access.user.id,
    summary: internal ? "left a team note" : "left a comment",
    contentItemId: id,
    internal,
  });
  if (!internal) {
    const note = { title: `${access.user.name} commented on ${item.title}`, body: body.slice(0, 140) };
    if (access.isTeam) await notifyClient(item.workspaceId, access.user.id, { ...note, href: `/w/${access.workspace.slug}/review/${id}` });
    else await notifyTeam(item.workspaceId, access.user.id, { ...note, href: `/admin/${access.workspace.slug}/content/${id}` });
  }
  refresh();
  return { id };
}

export async function toggleCommentResolved(commentId: string): Promise<Result> {
  await requireUser();
  const [comment] = await db.select().from(comments).where(eq(comments.id, commentId));
  if (!comment) return { error: "Not found" };
  const access = await getAccessById(comment.workspaceId);
  if (!access?.isTeam) return { error: "Not found" };
  await db
    .update(comments)
    .set({ resolvedAt: comment.resolvedAt ? null : new Date() })
    .where(eq(comments.id, commentId));
  refresh();
  return { id: commentId };
}
