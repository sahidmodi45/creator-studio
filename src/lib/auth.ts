import "server-only";
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { and, eq, gt } from "drizzle-orm";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/db";
import { memberships, sessions, users, workspaces } from "@/db/schema";
import { appUrl } from "@/lib/site";

const scrypt = promisify(scryptCb) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

const COOKIE = "studio_session";
const SESSION_DAYS = 30;

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function newToken() {
  return randomBytes(32).toString("base64url");
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string | null) {
  // Burn the same work when there is no stored hash, so timing does not reveal which emails exist.
  const [, saltHex, hashHex] = (stored ?? `scrypt$${"0".repeat(32)}$${"0".repeat(128)}`).split("$");
  const expected = Buffer.from(hashHex, "hex");
  const derived = await scrypt(password, Buffer.from(saltHex, "hex"), expected.length);
  return !!stored && timingSafeEqual(derived, expected);
}

export async function createSession(userId: string) {
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await db.insert(sessions).values({ tokenHash: hashToken(token), userId, expiresAt });
  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: appUrl().startsWith("https://"),
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  store.delete(COOKIE);
}

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  agencyRole: "admin" | "member" | null;
};

export const getUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;
  const [row] = await db
    .select({ id: users.id, email: users.email, name: users.name, agencyRole: users.agencyRole })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date())));
  return row ?? null;
});

export async function requireUser() {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAgency() {
  const user = await requireUser();
  if (!user.agencyRole) notFound();
  return user;
}

export async function requireAgencyAdmin() {
  const user = await requireUser();
  if (user.agencyRole !== "admin") notFound();
  return user;
}

export type WorkspaceRow = typeof workspaces.$inferSelect;

export type Access = {
  user: SessionUser;
  workspace: WorkspaceRow;
  /** True for marketing-team staff, false for the client. */
  isTeam: boolean;
};

/** Pure access rule for one workspace, shared by page and API checks. */
async function resolveAccess(user: SessionUser, workspace: WorkspaceRow): Promise<Access | null> {
  if (user.agencyRole === "admin") return { user, workspace, isTeam: true };
  const [membership] = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.userId, user.id), eq(memberships.workspaceId, workspace.id)));
  if (!membership) return null;
  return { user, workspace, isTeam: membership.role === "team" };
}

export async function getAccessBySlug(slug: string): Promise<Access | null> {
  const user = await getUser();
  if (!user) return null;
  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.slug, slug));
  if (!workspace) return null;
  return resolveAccess(user, workspace);
}

export async function getAccessById(workspaceId: string): Promise<Access | null> {
  const user = await getUser();
  if (!user) return null;
  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
  if (!workspace) return null;
  return resolveAccess(user, workspace);
}

/**
 * Gate for every page and action in a workspace. Anyone without access gets a
 * 404, so another client's workspace cannot be told apart from one that does not exist.
 */
export async function requireWorkspace(slug: string) {
  await requireUser();
  const access = await getAccessBySlug(slug);
  if (!access) notFound();
  return access;
}

export async function requireTeam(slug: string) {
  const access = await requireWorkspace(slug);
  if (!access.isTeam) notFound();
  return access;
}

/** Where someone lands after signing in. */
export async function homeFor(user: SessionUser) {
  if (user.agencyRole) return "/admin";
  const [row] = await db
    .select({ slug: workspaces.slug })
    .from(memberships)
    .innerJoin(workspaces, eq(workspaces.id, memberships.workspaceId))
    .where(eq(memberships.userId, user.id))
    .limit(1);
  return row ? `/w/${row.slug}` : "/login?error=no-workspace";
}
