import { execFileSync, execSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";

export const FIXTURES = path.resolve("e2e/.fixtures");

/** A stand-in for the Claude API, so the assistant's whole pipeline runs without spending money. It records what it was sent. */
function startMockClaude() {
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => (body += chunk));
    request.on("end", () => {
      writeFileSync(path.join(FIXTURES, "last-ai-request.json"), JSON.stringify({ url: request.url, headers: request.headers, body: JSON.parse(body || "{}") }));
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      const events: [string, object][] = [
        ["message_start", { type: "message_start", message: { id: "msg_test", type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 1 } } }],
        ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }],
        ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Demo reply: " } }],
        ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "I tried everything so you do not have to." } }],
        ["content_block_stop", { type: "content_block_stop", index: 0 }],
        ["message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 12 } }],
        ["message_stop", { type: "message_stop" }],
      ];
      for (const [name, data] of events) response.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
      response.end();
    });
  });
  server.listen(3102);
  return server;
}

export default async function globalSetup() {
  rmSync(FIXTURES, { recursive: true, force: true });
  mkdirSync(FIXTURES, { recursive: true });
  rmSync("storage-test", { recursive: true, force: true });

  const db = "creator_studio_test";
  execSync(`dropdb --if-exists ${db} && createdb ${db}`);
  const env = { ...process.env, DATABASE_URL: `postgres://localhost:5432/${db}` };
  execSync("npx tsx scripts/migrate.ts", { env });
  execSync("npx tsx scripts/seed.ts", { env: { ...env, SEED_FILE: "e2e/seed.fixture.json" } });
  const output = execSync(`npx tsx scripts/bootstrap.ts --email admin@test.local --name "Test Admin"`, { env }).toString();
  writeFileSync(path.join(FIXTURES, "admin-invite.txt"), output.trim().split("\n").pop()!);

  const ffmpeg = (...args: string[]) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...args]);
  ffmpeg("-f", "lavfi", "-i", "testsrc=duration=6:size=360x640:rate=24", "-f", "lavfi", "-i", "sine=frequency=440:duration=6", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", path.join(FIXTURES, "raw-clip.mp4"));
  ffmpeg("-f", "lavfi", "-i", "smptebars=duration=4:size=360x640:rate=24", "-c:v", "libx264", "-pix_fmt", "yuv420p", path.join(FIXTURES, "edit-v1.mp4"));
  ffmpeg("-f", "lavfi", "-i", "color=c=0x7A143C:size=1080x1350", "-frames:v", "1", path.join(FIXTURES, "pasta.jpg"));
  ffmpeg("-f", "lavfi", "-i", "color=c=0xF6C4D0:size=1080x1350", "-frames:v", "1", path.join(FIXTURES, "cover.jpg"));
  ffmpeg("-f", "lavfi", "-i", "color=c=0x2F6B4A:size=1080x1350", "-frames:v", "1", path.join(FIXTURES, "dessert.jpg"));
  ffmpeg("-f", "lavfi", "-i", "sine=frequency=330:duration=3", "-c:a", "aac", path.join(FIXTURES, "voiceover.m4a"));
  writeFileSync(path.join(FIXTURES, "notes.html"), "<script>document.title='pwned'</script>Hello");

  const mock = startMockClaude();
  return () => mock.close();
}
