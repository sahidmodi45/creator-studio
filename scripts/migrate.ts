import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

/**
 * Neon's pooled address (host with "-pooler") is right for the app, but table changes
 * should go over a direct connection. Same database, same login, host without "-pooler".
 */
function directUrl(value: string | undefined) {
  if (!value) throw new Error("DATABASE_URL is not set");
  const url = new URL(value);
  if (url.hostname.endsWith(".neon.tech")) url.hostname = url.hostname.replace("-pooler.", ".");
  return url.toString();
}

const pool = new Pool({ connectionString: process.env.DIRECT_DATABASE_URL || directUrl(process.env.DATABASE_URL) });
await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
await pool.end();
console.log("Database is up to date.");
