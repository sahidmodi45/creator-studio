"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import {
  assets,
  brandDocs,
  contentItems,
  contentMetrics,
  feedLayouts,
  followerSnapshots,
  invites,
  memberships,
  users,
  workspaces,
} from "@/db/schema";
import { markRead } from "@/lib/activity";
import { hashToken, newToken, requireAgencyAdmin, requireTeam, requireUser } from "@/lib/auth";
import { slugify } from "@/lib/format";
import { appUrl } from "@/lib/site";

type Result = { error?: string; id?: string; link?: string; slug?: string } | undefined;

function refresh() {
  revalidatePath("/", "layout");
}

async function makeInvite(values: {
  email: string;
  name: string;
  workspaceId?: string | null;
  membershipRole?: "client" | "team" | null;
  agencyRole?: "admin" | "member" | null;
  createdById: string;
}) {
  const token = newToken();
  await db.insert(invites).values({
    tokenHash: hashToken(token),
    email: values.email.trim().toLowerCase(),
    name: values.name.trim(),
    workspaceId: values.workspaceId ?? null,
    membershipRole: values.membershipRole ?? null,
    agencyRole: values.agencyRole ?? null,
    createdById: values.createdById,
    expiresAt: new Date(Date.now() + 7 * 86400_000),
  });
  return `${appUrl()}/invite/${token}`;
}

const newClient = z.object({
  name: z.string().trim().min(1).max(120),
  firstName: z.string().trim().min(1).max(60),
  instagramHandle: z.string().trim().max(60).default(""),
  email: z.string().trim().email(),
});

/** Onboarding a client: one workspace, one blank feed version, one invite link. */
export async function createClientWorkspace(_: Result, form: FormData): Promise<Result> {
  const admin = await requireAgencyAdmin();
  const parsed = newClient.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Please fill in the name, first name and a valid email." };
  const input = parsed.data;

  const base = slugify(input.firstName) || "client";
  let slug = base;
  for (let n = 2; ; n += 1) {
    const [taken] = await db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.slug, slug));
    if (!taken) break;
    slug = `${base}-${n}`;
  }

  const handle = input.instagramHandle.replace(/^@/, "");
  const [workspace] = await db
    .insert(workspaces)
    .values({ slug, name: input.name, clientFirstName: input.firstName, instagramHandle: handle || null, profileName: input.firstName })
    .returning({ id: workspaces.id });
  await db.insert(feedLayouts).values({ workspaceId: workspace.id, name: "Version 1", sharedWithClient: true, createdById: admin.id });
  const link = await makeInvite({
    email: input.email,
    name: input.name,
    workspaceId: workspace.id,
    membershipRole: "client",
    createdById: admin.id,
  });
  refresh();
  return { slug, link };
}

const inviteSchema = z.object({
  email: z.string().trim().email(),
  name: z.string().trim().min(1).max(120),
  role: z.enum(["client", "team"]),
});

export async function inviteToWorkspace(slug: string, _: Result, form: FormData): Promise<Result> {
  const access = await requireTeam(slug);
  const parsed = inviteSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Please add a name and a valid email." };
  const input = parsed.data;

  // Accepting an invite sets a password, so an invite to an existing account is a password reset.
  // Only an admin may issue one, or a team member could take over someone else's account.
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email.toLowerCase()));
  if (existing && access.user.agencyRole !== "admin") {
    return { error: "That person already has an account. Please ask an admin to send this invite." };
  }

  const link = await makeInvite({
    email: input.email,
    name: input.name,
    workspaceId: access.workspace.id,
    membershipRole: input.role,
    agencyRole: input.role === "team" ? "member" : null,
    createdById: access.user.id,
  });
  refresh();
  return { link };
}

export async function removeMember(slug: string, userId: string): Promise<Result> {
  const access = await requireTeam(slug);
  await db.delete(memberships).where(and(eq(memberships.workspaceId, access.workspace.id), eq(memberships.userId, userId)));
  refresh();
  return {};
}

const profileSchema = z.object({
  instagramHandle: z.string().trim().max(60).default(""),
  profileName: z.string().trim().max(120).default(""),
  bio: z.string().max(400).default(""),
  profileLink: z.string().trim().max(200).default(""),
  followers: z.coerce.number().int().min(0).optional(),
  following: z.coerce.number().int().min(0).optional(),
  postCount: z.coerce.number().int().min(0).optional(),
  pillars: z.string().max(1000).default(""),
});

export async function updateProfile(slug: string, form: FormData): Promise<Result> {
  const access = await requireTeam(slug);
  const raw = Object.fromEntries([...form.entries()].filter(([, value]) => value !== ""));
  const parsed = profileSchema.safeParse(raw);
  if (!parsed.success) return { error: "Please check the details and try again." };
  const input = parsed.data;
  await db
    .update(workspaces)
    .set({
      instagramHandle: input.instagramHandle.replace(/^@/, "") || null,
      profileName: input.profileName || null,
      bio: input.bio || null,
      profileLink: input.profileLink || null,
      followers: input.followers ?? null,
      following: input.following ?? null,
      postCount: input.postCount ?? null,
      pillars: input.pillars.split(",").map((pillar) => pillar.trim()).filter(Boolean),
    })
    .where(eq(workspaces.id, access.workspace.id));
  refresh();
  return {};
}

export async function setProfileAvatar(slug: string, assetId: string): Promise<Result> {
  const access = await requireTeam(slug);
  const [asset] = await db
    .select({ id: assets.id })
    .from(assets)
    .where(and(eq(assets.id, assetId), eq(assets.workspaceId, access.workspace.id)));
  if (!asset) return { error: "Not found" };
  await db.update(assets).set({ visibility: "shared" }).where(eq(assets.id, assetId));
  await db.update(workspaces).set({ avatarAssetId: assetId }).where(eq(workspaces.id, access.workspace.id));
  refresh();
  return {};
}

const docSchema = z.object({
  id: z.string().uuid().or(z.literal("")).default(""),
  title: z.string().trim().min(1).max(120),
  body: z.string().max(100000).default(""),
});

export async function saveBrandDoc(slug: string, form: FormData): Promise<Result> {
  const access = await requireTeam(slug);
  const parsed = docSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Please give this section a title." };
  const { id, title, body } = parsed.data;
  const sharedWithClient = form.get("sharedWithClient") === "on";
  if (id) {
    await db
      .update(brandDocs)
      .set({ title, body, sharedWithClient, updatedById: access.user.id, updatedAt: new Date() })
      .where(and(eq(brandDocs.id, id), eq(brandDocs.workspaceId, access.workspace.id)));
  } else {
    const existing = await db.select({ id: brandDocs.id }).from(brandDocs).where(eq(brandDocs.workspaceId, access.workspace.id));
    await db.insert(brandDocs).values({ workspaceId: access.workspace.id, title, body, sharedWithClient, position: existing.length, updatedById: access.user.id });
  }
  refresh();
  return {};
}

export async function saveBrandKit(slug: string, form: FormData): Promise<Result> {
  const access = await requireTeam(slug);
  const list = (name: string) => String(form.get(name) ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  const colors = list("colors").map((color) => (color.startsWith("#") ? color : `#${color}`).toLowerCase());
  const invalid = colors.find((color) => !/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(color));
  if (invalid) return { error: `${invalid} is not a colour code. Use the form #7A143C.` };
  await db
    .update(workspaces)
    .set({ brandColors: colors.slice(0, 12), brandFonts: list("fonts").slice(0, 6) })
    .where(eq(workspaces.id, access.workspace.id));
  refresh();
  return {};
}

export async function deleteBrandDoc(slug: string, id: string): Promise<Result> {
  const access = await requireTeam(slug);
  await db.delete(brandDocs).where(and(eq(brandDocs.id, id), eq(brandDocs.workspaceId, access.workspace.id)));
  refresh();
  return {};
}

const metricsSchema = z.object({
  contentItemId: z.string().uuid(),
  capturedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  views: z.coerce.number().int().min(0).default(0),
  reach: z.coerce.number().int().min(0).default(0),
  nonFollowerReach: z.coerce.number().int().min(0).default(0),
  likes: z.coerce.number().int().min(0).default(0),
  comments: z.coerce.number().int().min(0).default(0),
  shares: z.coerce.number().int().min(0).default(0),
  saves: z.coerce.number().int().min(0).default(0),
  follows: z.coerce.number().int().min(0).default(0),
});

export async function saveMetrics(slug: string, form: FormData): Promise<Result> {
  const access = await requireTeam(slug);
  const raw = Object.fromEntries([...form.entries()].filter(([, value]) => value !== ""));
  const parsed = metricsSchema.safeParse(raw);
  if (!parsed.success) return { error: "Please choose a post and a date, and use whole numbers." };
  const { contentItemId, ...values } = parsed.data;
  if (values.nonFollowerReach > values.reach) return { error: "Non-follower reach cannot be more than total reach." };
  const [item] = await db
    .select({ id: contentItems.id })
    .from(contentItems)
    .where(and(eq(contentItems.id, contentItemId), eq(contentItems.workspaceId, access.workspace.id), isNull(contentItems.deletedAt)));
  if (!item) return { error: "Not found" };
  await db
    .insert(contentMetrics)
    .values({ contentItemId, ...values })
    .onConflictDoUpdate({ target: [contentMetrics.contentItemId, contentMetrics.capturedOn], set: values });
  refresh();
  return {};
}

export async function saveFollowerSnapshot(slug: string, form: FormData): Promise<Result> {
  const access = await requireTeam(slug);
  const capturedOn = String(form.get("capturedOn") ?? "");
  const followers = Number(form.get("followers"));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(capturedOn) || !Number.isInteger(followers) || followers < 0) {
    return { error: "Please add a date and a whole number." };
  }
  await db
    .insert(followerSnapshots)
    .values({ workspaceId: access.workspace.id, capturedOn, followers })
    .onConflictDoUpdate({ target: [followerSnapshots.workspaceId, followerSnapshots.capturedOn], set: { followers } });
  refresh();
  return {};
}

export async function markNotificationsRead(ids?: string[]) {
  const user = await requireUser();
  await markRead(user.id, ids);
  refresh();
}
