"use server";

import { and, eq, gt, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { invites, memberships, users } from "@/db/schema";
import { createSession, destroySession, getUser, hashPassword, hashToken, homeFor, verifyPassword } from "@/lib/auth";

export type FormState = { error?: string; ok?: boolean; message?: string } | undefined;

/* Slows down password guessing. Per process, which is enough for a small private app. */
const attempts = new Map<string, { count: number; first: number }>();
const WINDOW_MS = 15 * 60_000;
const MAX_ATTEMPTS = 10;

function tooManyAttempts(email: string) {
  const entry = attempts.get(email);
  if (!entry) return false;
  if (Date.now() - entry.first > WINDOW_MS) {
    attempts.delete(email);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
}

function recordFailure(email: string) {
  const entry = attempts.get(email);
  if (entry) entry.count += 1;
  else attempts.set(email, { count: 1, first: Date.now() });
}

export async function signIn(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (tooManyAttempts(email)) return { error: "Too many tries. Please wait 15 minutes and try again." };

  const [user] = await db.select().from(users).where(eq(users.email, email));
  const valid = await verifyPassword(password, user?.passwordHash ?? null);
  if (!user || !valid) {
    recordFailure(email);
    return { error: "That email and password do not match." };
  }
  attempts.delete(email);
  await createSession(user.id);
  redirect(await homeFor({ id: user.id, email: user.email, name: user.name, agencyRole: user.agencyRole }));
}

export async function signOut() {
  await destroySession();
  redirect("/login");
}

export async function acceptInvite(_: FormState, form: FormData): Promise<FormState> {
  const token = String(form.get("token") ?? "");
  const name = String(form.get("name") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (password.length < 10) return { error: "Please use at least 10 characters." };
  if (!name) return { error: "Please add your name." };

  const [invite] = await db
    .select()
    .from(invites)
    .where(and(eq(invites.tokenHash, hashToken(token)), isNull(invites.acceptedAt), gt(invites.expiresAt, new Date())));
  if (!invite) return { error: "This link has expired or was already used. Please ask for a new one." };

  const passwordHash = await hashPassword(password);
  const [existing] = await db.select().from(users).where(eq(users.email, invite.email));
  let userId: string;
  if (existing) {
    userId = existing.id;
    await db
      .update(users)
      // An invite can raise access but never lowers an admin.
      .set({ name, passwordHash, agencyRole: existing.agencyRole === "admin" ? "admin" : (invite.agencyRole ?? existing.agencyRole) })
      .where(eq(users.id, userId));
  } else {
    const [created] = await db
      .insert(users)
      .values({ email: invite.email, name, passwordHash, agencyRole: invite.agencyRole })
      .returning({ id: users.id });
    userId = created.id;
  }
  if (invite.workspaceId && invite.membershipRole) {
    await db
      .insert(memberships)
      .values({ userId, workspaceId: invite.workspaceId, role: invite.membershipRole })
      .onConflictDoNothing();
  }
  await db.update(invites).set({ acceptedAt: new Date() }).where(eq(invites.id, invite.id));
  await createSession(userId);
  const user = await getUser();
  redirect(user ? await homeFor(user) : await homeFor({ id: userId, email: invite.email, name, agencyRole: invite.agencyRole }));
}
