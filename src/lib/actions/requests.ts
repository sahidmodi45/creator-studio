"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { contentItems, creativeRequests, tasks } from "@/db/schema";
import { logActivity, notifyClient, notifyTeam } from "@/lib/activity";
import { getAccessById, requireTeam, requireUser } from "@/lib/auth";
import { FORMAT_LABEL, FORMATS, PRIORITIES } from "@/lib/constants";

type Result = { error?: string; id?: string; contentItemId?: string } | undefined;

const schema = z.object({
  workspaceId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(10000).default(""),
  format: z.enum(FORMATS),
  referenceLinks: z.string().max(5000).default(""),
  priority: z.enum(PRIORITIES),
  desiredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")).default(""),
});

/** One submission becomes three linked things: the request, a piece in the pipeline, and a task for the team. */
export async function submitRequest(form: FormData): Promise<Result> {
  await requireUser();
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Please give your idea a title." };
  const input = parsed.data;
  const access = await getAccessById(input.workspaceId);
  if (!access) return { error: "Not found" };

  const links = input.referenceLinks.split(/\s+/).map((link) => link.trim()).filter(Boolean);
  const invalid = links.find((link) => !/^https?:\/\/\S+\.\S+/i.test(link));
  if (invalid) return { error: `Please check this link: ${invalid}` };

  const brief = [
    input.description,
    links.length ? `References:\n${links.join("\n")}` : "",
    input.desiredDate ? `Would like it out by ${input.desiredDate}.` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const result = await db.transaction(async (tx) => {
    const [request] = await tx
      .insert(creativeRequests)
      .values({
        workspaceId: access.workspace.id,
        title: input.title,
        description: input.description,
        format: input.format,
        referenceLinks: links,
        priority: input.priority,
        desiredDate: input.desiredDate || null,
        submittedById: access.user.id,
      })
      .returning({ id: creativeRequests.id });
    const [item] = await tx
      .insert(contentItems)
      .values({
        workspaceId: access.workspace.id,
        title: input.title,
        format: input.format,
        status: "idea",
        brief,
        requestId: request.id,
        scheduledDate: input.desiredDate || null,
        createdById: access.user.id,
      })
      .returning({ id: contentItems.id });
    await tx.update(creativeRequests).set({ contentItemId: item.id }).where(eq(creativeRequests.id, request.id));
    await tx.insert(tasks).values({
      workspaceId: access.workspace.id,
      title: `Brief: ${input.title}`,
      description: `${FORMAT_LABEL[input.format]} idea from ${access.user.name}. Priority: ${input.priority}.`,
      dueDate: input.desiredDate || null,
      contentItemId: item.id,
      requestId: request.id,
    });
    return { requestId: request.id, contentItemId: item.id };
  });

  await logActivity({
    workspaceId: access.workspace.id,
    actorId: access.user.id,
    summary: `shared an idea: "${input.title}"`,
    contentItemId: result.contentItemId,
  });
  if (!access.isTeam) {
    await notifyTeam(access.workspace.id, access.user.id, {
      title: `New idea from ${access.user.name}`,
      body: input.title,
      href: `/admin/${access.workspace.slug}/requests`,
    });
  }
  revalidatePath("/", "layout");
  return { id: result.requestId, contentItemId: result.contentItemId };
}

export async function setRequestStatus(slug: string, requestId: string, status: "new" | "in_progress" | "done" | "declined", note = ""): Promise<Result> {
  const access = await requireTeam(slug);
  const [request] = await db
    .select()
    .from(creativeRequests)
    .where(and(eq(creativeRequests.id, requestId), eq(creativeRequests.workspaceId, access.workspace.id)));
  if (!request) return { error: "Not found" };
  await db.update(creativeRequests).set({ status }).where(eq(creativeRequests.id, requestId));
  if (status === "declined") {
    await notifyClient(access.workspace.id, access.user.id, {
      title: `About your idea: ${request.title}`,
      body: note || "We are not taking this one forward for now.",
      href: `/w/${access.workspace.slug}/ideas`,
    });
  }
  revalidatePath("/", "layout");
  return { id: requestId };
}

const taskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")).default(""),
  assigneeId: z.string().uuid().or(z.literal("")).default(""),
});

export async function createTask(slug: string, form: FormData): Promise<Result> {
  const access = await requireTeam(slug);
  const parsed = taskSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Please give the task a title." };
  await db.insert(tasks).values({
    workspaceId: access.workspace.id,
    title: parsed.data.title,
    dueDate: parsed.data.dueDate || null,
    assigneeId: parsed.data.assigneeId || null,
  });
  revalidatePath("/", "layout");
  return {};
}

export async function setTaskStatus(slug: string, taskId: string, status: "todo" | "doing" | "done"): Promise<Result> {
  const access = await requireTeam(slug);
  await db
    .update(tasks)
    .set({ status })
    .where(and(eq(tasks.id, taskId), eq(tasks.workspaceId, access.workspace.id)));
  revalidatePath("/", "layout");
  return {};
}

export async function deleteTask(slug: string, taskId: string): Promise<Result> {
  const access = await requireTeam(slug);
  await db.delete(tasks).where(and(eq(tasks.id, taskId), eq(tasks.workspaceId, access.workspace.id)));
  revalidatePath("/", "layout");
  return {};
}
