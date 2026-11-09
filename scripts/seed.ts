/**
 * Creates a client workspace from a JSON file: profile, brand knowledge base, a first
 * follower count and a first feed layout. Client data never lives in this repo.
 *
 * Reads SEED_FILE if set, otherwise ./seed.local.json (git-ignored). See seed.example.json.
 * With no file it creates nothing. Safe to run twice: an existing workspace is left alone.
 *
 * Usage: npm run seed                       (reads ./seed.local.json)
 *        SEED_FILE=path/to/client.json npm run seed
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { brandDocs, feedLayouts, followerSnapshots, workspaces } from "../src/db/schema";

type SeedFile = {
  workspace: {
    slug: string;
    name: string;
    clientFirstName: string;
    instagramHandle?: string | null;
    profileName?: string | null;
    bio?: string | null;
    followers?: number | null;
    following?: number | null;
    pillars?: string[];
  };
  followerSnapshots?: { capturedOn: string; followers: number }[];
  feedLayouts?: { name: string; sharedWithClient?: boolean }[];
  brandDocs?: { title: string; body: string }[];
};

const file = path.resolve(process.env.SEED_FILE || "seed.local.json");
if (!existsSync(file)) {
  console.log(`No seed file at ${file}. Nothing to seed. Copy seed.example.json to seed.local.json to add a client.`);
  process.exit(0);
}

const seed = JSON.parse(readFileSync(file, "utf8")) as SeedFile;
if (!seed.workspace?.slug || !seed.workspace?.name || !seed.workspace?.clientFirstName) {
  console.error(`${file} needs workspace.slug, workspace.name and workspace.clientFirstName.`);
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

const [existing] = await db.select().from(workspaces).where(eq(workspaces.slug, seed.workspace.slug));
if (existing) {
  console.log(`The workspace "${seed.workspace.slug}" already exists. Nothing changed.`);
  await pool.end();
  process.exit(0);
}

const [workspace] = await db.insert(workspaces).values({ ...seed.workspace, pillars: seed.workspace.pillars ?? [] }).returning();

for (const snapshot of seed.followerSnapshots ?? []) {
  await db.insert(followerSnapshots).values({ workspaceId: workspace.id, ...snapshot });
}
for (const layout of seed.feedLayouts ?? []) {
  await db.insert(feedLayouts).values({ workspaceId: workspace.id, name: layout.name, sharedWithClient: layout.sharedWithClient ?? false });
}
const docs = seed.brandDocs ?? [];
if (docs.length) {
  await db.insert(brandDocs).values(docs.map((doc, position) => ({ workspaceId: workspace.id, position, ...doc })));
}

await pool.end();
console.log(`Created the workspace at /w/${workspace.slug} with ${docs.length} brand doc${docs.length === 1 ? "" : "s"}.`);
