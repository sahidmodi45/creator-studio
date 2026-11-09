/**
 * Opens the studio with one command: npm run studio
 *
 * Does whatever is missing, quietly, then opens the browser:
 * packages, settings file, the database on this laptop, tables, the client
 * workspace from seed.local.json, the build. The first run takes a few minutes.
 * After that it opens in seconds. Everything technical goes to ~/.creator-studio/studio.log.
 */
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HOME = path.join(os.homedir(), ".creator-studio");
const LOG = path.join(HOME, "studio.log");
const DB_DIR = path.join(os.homedir(), ".creator-studio-pg", "data");
const PORT = 3100;
const URL = `http://localhost:${PORT}`;
const isWin = process.platform === "win32";

fs.mkdirSync(HOME, { recursive: true });
fs.writeFileSync(LOG, `--- ${new Date().toISOString()}\n`, { flag: "a" });

const say = (text) => console.log(text);
const log = (text) => fs.appendFileSync(LOG, text);

function fail(step) {
  const tail = fs.readFileSync(LOG, "utf8").split("\n").slice(-25).join("\n");
  console.error(`\nThe studio could not open (${step}). Details:\n${tail}`);
  process.exit(1);
}

function run(step, cmd, args) {
  const result = isWin
    ? spawnSync([cmd, ...args].join(" "), { cwd: APP, shell: true, encoding: "utf8" })
    : spawnSync(cmd, args, { cwd: APP, encoding: "utf8" });
  log(`$ ${cmd} ${args.join(" ")}\n${result.stdout ?? ""}${result.stderr ?? ""}`);
  if (result.status !== 0) fail(step);
}

function portOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect(port, "127.0.0.1");
    socket.once("connect", () => { socket.end(); resolve(true); });
    socket.once("error", () => resolve(false));
  });
}

function openBrowser() {
  const [cmd, args] = isWin ? ["cmd", ["/c", "start", "", URL]] : process.platform === "darwin" ? ["open", [URL]] : ["xdg-open", [URL]];
  spawn(cmd, args, { stdio: "ignore", detached: true }).unref();
}

function newestMtime(dir) {
  let newest = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    newest = Math.max(newest, entry.isDirectory() ? newestMtime(full) : fs.statSync(full).mtimeMs);
  }
  return newest;
}

/* Already open? Just show it. */
if (await portOpen(PORT)) {
  openBrowser();
  say(`The studio is open: ${URL}`);
  process.exit(0);
}

say("Opening the studio...");

/* 1. Packages, first time only. */
if (!fs.existsSync(path.join(APP, "node_modules"))) {
  say("First time on this laptop, setting up. This takes a few minutes.");
  run("installing", "npm", ["install", "--no-audit", "--no-fund"]);
}

/* 2. Settings file, first time only. */
const envPath = path.join(APP, ".env");
if (!fs.existsSync(envPath)) {
  const env = fs
    .readFileSync(path.join(APP, ".env.example"), "utf8")
    .replace(/^DATABASE_URL=.*$/m, "DATABASE_URL=postgres://postgres:postgres@localhost:5432/creator_studio")
    .replace(/^APP_SECRET=.*$/m, `APP_SECRET=${randomBytes(32).toString("hex")}`);
  fs.writeFileSync(envPath, env);
}
const env = Object.fromEntries(
  fs.readFileSync(envPath, "utf8").split(/\r?\n/).filter((l) => /^\w+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);

/* 3. The database. Started here only when it lives on this laptop. */
let pg = null;
const localDb = /@(localhost|127\.0\.0\.1)(:|\/)/.test(env.DATABASE_URL ?? "");
if (localDb && !(await portOpen(5432))) {
  const { default: EmbeddedPostgres } = await import("embedded-postgres");
  const fresh = !fs.existsSync(path.join(DB_DIR, "PG_VERSION"));
  fs.mkdirSync(DB_DIR, { recursive: true });
  pg = new EmbeddedPostgres({ databaseDir: DB_DIR, user: "postgres", password: "postgres", port: 5432, persistent: true, initdbFlags: ["--encoding=UTF8", "--locale=C"], onLog: log, onError: (e) => log(`${e}\n`) });
  try {
    if (fresh) await pg.initialise();
    await pg.start();
    if (fresh) await pg.createDatabase("creator_studio");
  } catch (error) {
    log(`${error?.stack ?? error}\n`);
    fail("starting the database");
  }
}

/* 4. Tables and the client workspace. Both are safe to run every time. */
run("updating the database", "npx", ["tsx", "--env-file=.env", "scripts/migrate.ts"]);
run("loading the workspace", "npx", ["tsx", "--env-file=.env", "scripts/seed.ts"]);

/* 5. Build, only when the code changed since the last build. */
const buildId = path.join(APP, ".next", "BUILD_ID");
if (!fs.existsSync(buildId) || newestMtime(path.join(APP, "src")) > fs.statSync(buildId).mtimeMs) {
  say("Getting the latest version ready. About a minute.");
  run("building", "npm", ["run", "build"]);
}

/* 6. Start, wait until it answers, open the browser. */
const out = fs.openSync(LOG, "a");
const startCmd = `npx next start -p ${PORT}`;
const server = isWin
  ? spawn(startCmd, { cwd: APP, shell: true, stdio: ["ignore", out, out] })
  : spawn("npx", ["next", "start", "-p", String(PORT)], { cwd: APP, stdio: ["ignore", out, out] });
let serverExited = false;
let ready = false;
server.on("exit", async () => {
  serverExited = true;
  if (pg) await pg.stop().catch(() => {});
  if (!ready) fail("starting the app");
  process.exit(0);
});
for (let i = 0; i < 120 && !serverExited && !(await portOpen(PORT)); i += 1) await new Promise((r) => setTimeout(r, 500));
await new Promise((r) => setTimeout(r, 1000)); // a server that lost the port race exits within this second
if (serverExited || !(await portOpen(PORT))) fail("starting the app");
ready = true;

openBrowser();
say(`The studio is open: ${URL}\nLeave this window open while you use it. Close it to stop the studio.`);

async function stop() {
  server.kill();
  if (pg) await pg.stop().catch(() => {});
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
