/**
 * Creates the first agency admin and prints a one-time link to set a password.
 * Usage: npm run bootstrap -- --email you@example.com --name "Your Name"
 */
import { createHash, randomBytes } from "node:crypto";
import { parseArgs } from "node:util";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { invites, users } from "../src/db/schema";
import { appUrl } from "../src/lib/site";

const { values } = parseArgs({ options: { email: { type: "string" }, name: { type: "string" } } });
if (!values.email || !values.name) {
  console.error('Usage: npm run bootstrap -- --email you@example.com --name "Your Name"');
  process.exit(1);
}
const email = values.email.toLowerCase();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

const [existing] = await db.select().from(users).where(eq(users.email, email));
if (existing) {
  await db.update(users).set({ agencyRole: "admin" }).where(eq(users.id, existing.id));
} else {
  await db.insert(users).values({ email, name: values.name, agencyRole: "admin" });
}

const token = randomBytes(32).toString("base64url");
await db.insert(invites).values({
  tokenHash: createHash("sha256").update(token).digest("hex"),
  email,
  name: values.name,
  agencyRole: "admin",
  expiresAt: new Date(Date.now() + 7 * 86400_000),
});
await pool.end();

console.log(`Set your password here (single use, valid 7 days):\n${appUrl()}/invite/${token}`);
