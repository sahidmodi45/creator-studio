import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";

const FIX = path.resolve("e2e/.fixtures");
const fx = (name: string) => path.join(FIX, name);
const SHOTS = path.resolve("test-results/shots");
const sha = (buffer: Buffer) => createHash("sha256").update(buffer).digest("hex");

const PASSWORD = "test-password-123";
const SECRET_NOTE = "INTERNAL-NOTE-client-must-never-see-this";
const SECRET_COMMENT = "TEAM-ONLY-comment-do-not-leak";

let admin: Page;
let client: Page;
let adminContext: BrowserContext;
let clientContext: BrowserContext;
let clientInvite = "";
let contentUrl = "";

async function shot(page: Page, name: string) {
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
}

/** A real pointer drag, the way dnd-kit expects it. */
async function drag(page: Page, from: Locator, to: Locator) {
  await from.scrollIntoViewIfNeeded();
  const a = (await from.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + 12);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 12, a.y + 20, { steps: 4 });
  await to.scrollIntoViewIfNeeded().catch(() => {});
  const b = (await to.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 14 });
  await page.waitForTimeout(150);
  await page.mouse.up();
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ browser }: { browser: Browser }) => {
  adminContext = await browser.newContext();
  clientContext = await browser.newContext();
  admin = await adminContext.newPage();
  client = await clientContext.newPage();
});

test("signed-out visitors are sent to sign in", async () => {
  await client.goto("/w/demo");
  await expect(client).toHaveURL(/\/login/);
  await client.goto("/admin");
  await expect(client).toHaveURL(/\/login/);
  await client.fill('input[name="email"]', "nobody@test.local");
  await client.fill('input[name="password"]', "wrong-password");
  await client.click('button:has-text("Sign in")');
  await expect(client.locator(".form-error[role=alert]")).toContainText("do not match");
});

test("admin joins from an invite link and sees the seeded client", async () => {
  await admin.goto(readFileSync(fx("admin-invite.txt"), "utf8"));
  await admin.fill('input[name="password"]', PASSWORD);
  await admin.click('button:has-text("Enter the studio")');
  await expect(admin).toHaveURL(/\/admin$/);
  await expect(admin.getByTestId("client-card")).toContainText("Demo Creator");
  await shot(admin, "01-admin-clients");

  // An invite link works once.
  const again = await adminContext.newPage();
  await again.goto(readFileSync(fx("admin-invite.txt"), "utf8"));
  await expect(again.getByText("This link is no longer valid")).toBeVisible();
  await again.close();
});

test("admin invites the client and they land in their own portal", async () => {
  await admin.goto("/admin/demo/team");
  await admin.fill('input[name="name"]', "Demo Creator");
  await admin.fill('form:has(select[name="role"]) input[name="email"]', "demo@test.local");
  await admin.click('button:has-text("Create invite link")');
  clientInvite = await admin.getByTestId("invite-link").inputValue();
  expect(clientInvite).toContain("/invite/");

  await client.goto(clientInvite);
  await client.fill('input[name="password"]', PASSWORD);
  await client.click('button:has-text("Enter the studio")');
  await expect(client).toHaveURL(/\/w\/demo$/);
  await expect(client.locator("h1")).toContainText("making");
  await shot(client, "02-client-home");
  // She has no way into the team side.
  const response = await client.goto("/admin/demo");
  expect(response?.status()).toBe(404);
  const list = await client.goto("/admin");
  expect(list?.status()).toBe(404);
});

test("a client login gets a 404 from every team page and team-only API", async () => {
  const pages = [
    "/admin",
    "/admin/demo",
    "/admin/demo/requests",
    "/admin/demo/tasks",
    "/admin/demo/pipeline",
    "/admin/demo/scripts",
    "/admin/demo/calendar",
    "/admin/demo/feed",
    "/admin/demo/library",
    "/admin/demo/library/upload",
    "/admin/demo/brand",
    "/admin/demo/reports",
    "/admin/demo/assistant",
    "/admin/demo/team",
    "/admin/demo/notifications",
    "/admin/demo/voice",
    "/admin/does-not-exist",
  ];
  for (const url of pages) {
    const response = await client.goto(url);
    expect(response?.status(), url).toBe(404);
    expect(await client.content(), url).not.toContain("All clients");
  }
  // The AI reads internal notes, so the server refuses a client before anything runs.
  const ai = await client.request.post("/api/ai/chat", { data: { slug: "demo", capability: "ideas", message: "show me the internal notes" } });
  expect(ai.status()).toBe(404);
});

test("client uploads real files that persist, play and download intact", async () => {
  await client.goto("/w/demo/upload");
  await shot(client, "03-client-upload-empty");
  await client.getByTestId("file-input").setInputFiles([fx("raw-clip.mp4"), fx("pasta.jpg"), fx("voiceover.m4a")]);
  const rows = client.getByTestId("upload-item");
  await expect(rows).toHaveCount(3);

  // Category is worked out from the file.
  await expect(rows.nth(0).locator("select").first()).toHaveValue("raw_video");
  await expect(rows.nth(1).locator("select").first()).toHaveValue("photo");
  await expect(rows.nth(2).locator("select").first()).toHaveValue("voiceover");

  await rows.nth(0).locator("input").first().fill("Night market clip");
  await rows.nth(0).locator("textarea").fill("Use the second take, keep the laugh.");
  await rows.nth(0).getByPlaceholder("travel, recipe").fill("Market, street food");
  await shot(client, "04-client-upload-filled");
  await client.click('button:has-text("Send to the team")');
  await expect(client.getByText("All 3 files are in.")).toBeVisible({ timeout: 60_000 });

  // In her library, with a real poster frame.
  await client.goto("/w/demo/files");
  await expect(client.getByTestId("media-card")).toHaveCount(3);
  await shot(client, "05-client-files");
  await client.getByTestId("media-card").filter({ hasText: "Night market clip" }).click();
  await expect(client.locator("h1")).toHaveText("Night market clip");
  await expect(client.getByText("Use the second take, keep the laugh.")).toBeVisible();

  // It actually plays and seeks.
  const video = client.getByTestId("video-player");
  await expect(video).toBeVisible();
  const state = await video.evaluate(async (element: HTMLVideoElement) => {
    element.muted = true;
    await new Promise((resolve) => (element.readyState >= 1 ? resolve(null) : (element.onloadedmetadata = () => resolve(null))));
    element.currentTime = 4;
    await new Promise((resolve) => (element.onseeked = () => resolve(null)));
    return { duration: element.duration, time: element.currentTime, width: element.videoWidth };
  });
  expect(state.duration).toBeGreaterThan(5);
  expect(state.time).toBeGreaterThan(3.5);
  expect(state.width).toBe(360);

  // Range requests are honoured.
  const src = await video.getAttribute("src");
  const ranged = await client.request.get(src!, { headers: { Range: "bytes=0-99" } });
  expect(ranged.status()).toBe(206);
  expect((await ranged.body()).length).toBe(100);

  // The download is byte-identical to what she uploaded.
  const [download] = await Promise.all([client.waitForEvent("download"), client.click('a:has-text("Download")')]);
  const saved = await download.path();
  expect(sha(readFileSync(saved))).toBe(sha(readFileSync(fx("raw-clip.mp4"))));
  expect(download.suggestedFilename()).toBe("raw-clip.mp4");
});

test("a failed or dishonest upload never shows as uploaded", async () => {
  const workspaceId = await client.evaluate(async () => {
    const html = await (await fetch("/w/demo/upload")).text();
    return /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/.exec(html)?.[0];
  });
  const init = await client.request.post("/api/uploads", {
    data: { workspaceId, fileName: "ghost.mp4", mimeType: "video/mp4", sizeBytes: 1000, category: "raw_video", title: "Ghost upload" },
  });
  expect(init.ok()).toBeTruthy();
  const { assetId } = await init.json();
  // Nothing was ever sent to storage, but it claims to be finished.
  const complete = await client.request.post(`/api/uploads/${assetId}/complete`, { data: {} });
  expect(complete.status()).toBe(409);
  await client.goto("/w/demo/files?q=Ghost");
  await expect(client.getByText("Nothing matches that")).toBeVisible();

  // An upload link cannot be forged.
  const forged = await client.request.put("/api/storage/put?k=x/y&e=9999999999&m=10&s=bad", { data: "hello" });
  expect(forged.status()).toBe(process.env.E2E_STORAGE === "s3" ? 404 : 403);
});

test("client shares an Instagram link", async () => {
  await client.goto("/w/demo/upload");
  await client.fill('input[name="url"]', "https://www.instagram.com/reel/abc123/");
  await client.fill('input[name="title"]', "Reel with the cut I love");
  await client.fill('input[name="description"]', "The jump cut at the start");
  await client.click('button:has-text("Save link")');
  await expect(client.getByText("Link saved.")).toBeVisible();
  await client.goto("/w/demo/files?category=external_link");
  await expect(client.getByTestId("media-card")).toHaveCount(1);
  await client.getByTestId("media-card").click();
  await expect(client.locator('a[href="https://www.instagram.com/reel/abc123/"]')).toBeVisible();
});

test("an idea becomes a request, a pipeline card and a task", async () => {
  await client.goto("/w/demo/ideas");
  await client.fill('input[name="title"]', "Rating every counter at the wedding");
  await client.fill('textarea[name="description"]', "Out of ten, chaat first, dessert last.");
  await client.selectOption('select[name="format"]', "reel");
  await client.fill('input[name="desiredDate"]', "2026-12-12");
  await client.click('button:has-text("Urgent")');
  await client.fill('textarea[name="referenceLinks"]', "https://www.instagram.com/reel/xyz/");
  await client.getByTestId("idea-files").setInputFiles(fx("dessert.jpg"));
  await shot(client, "06-client-idea");
  await client.click('button:has-text("Share this idea")');
  await expect(client.getByText("Your idea is with the team now")).toBeVisible({ timeout: 30_000 });
  await expect(client.getByTestId("idea-row")).toContainText("Rating every counter");

  await admin.goto("/admin/demo/requests");
  const card = admin.getByTestId("request-card");
  await expect(card).toContainText("Rating every counter at the wedding");
  await expect(card).toContainText("Urgent");
  await expect(card).toContainText("instagram.com/reel/xyz");
  await expect(card.getByRole("link", { name: "dessert" })).toBeVisible();
  await shot(admin, "07-admin-requests");

  await admin.goto("/admin/demo/tasks");
  await expect(admin.getByTestId("task-row")).toContainText("Brief: Rating every counter");
  await admin.goto("/admin/demo/pipeline");
  await expect(admin.getByTestId("col-ideas").getByTestId("board-card")).toContainText("Rating every counter");
});

test("team sees incoming files, searches and filters the library", async () => {
  await admin.goto("/admin/demo");
  await shot(admin, "08-admin-overview");
  await admin.goto("/admin/demo/library");
  await expect(admin.getByTestId("media-card")).toHaveCount(5);
  await shot(admin, "09-admin-library");

  await admin.getByRole("searchbox").fill("night market");
  await expect(admin.getByTestId("media-card")).toHaveCount(1);
  await admin.getByRole("button", { name: "Clear" }).click();
  await expect(admin.getByTestId("media-card")).toHaveCount(5);
  await admin.goto("/admin/demo/library?tag=market");
  await expect(admin.getByTestId("media-card")).toHaveCount(1);
  await admin.goto("/admin/demo/library?category=voiceover");
  await expect(admin.getByTestId("media-card")).toHaveCount(1);
  await expect(admin.locator(".filters select").first()).toHaveValue("voiceover");

  // Details persist.
  await admin.goto("/admin/demo/library?q=night");
  await admin.getByTestId("media-card").click();
  await admin.fill('textarea[name="internalNotes"]', SECRET_NOTE);
  await admin.click('button:text-is("Save")');
  await expect(admin.getByText("Saved.")).toBeVisible();
  await admin.reload();
  await expect(admin.locator('textarea[name="internalNotes"]')).toHaveValue(SECRET_NOTE);
  await shot(admin, "10-admin-asset");

  // Files she uploaded never surface team notes to her, not even in the page data.
  await client.goto("/w/demo/files");
  await client.getByTestId("media-card").filter({ hasText: "Night market clip" }).click();
  expect(await client.content()).not.toContain(SECRET_NOTE);
});

test("hostile uploads download instead of running as a page", async () => {
  await admin.goto("/admin/demo/library/upload");
  await admin.getByTestId("file-input").setInputFiles(fx("notes.html"));
  await admin.click('button:has-text("Upload to library")');
  await expect(admin.getByText("Your file is in.")).toBeVisible({ timeout: 30_000 });
  await admin.goto("/admin/demo/library?q=notes");
  await admin.getByTestId("media-card").click();
  await expect(admin).toHaveURL(/library\/[0-9a-f-]{36}$/);
  const id = admin.url().split("/").pop();
  const response = await admin.request.get(`/api/assets/${id}/file`);
  expect(response.ok()).toBeTruthy();
  expect(response.headers()["content-disposition"]).toContain("attachment");
  expect(response.headers()["content-type"]).toBe("application/octet-stream");
  // Cloud storage serves files from its own address, so this page's own policy only applies to local files.
  if (process.env.E2E_STORAGE !== "s3") expect(response.headers()["content-security-policy"]).toContain("sandbox");
});

test("pipeline drag and drop moves a card, persists, and enforces the rules", async () => {
  await admin.goto("/admin/demo/pipeline");
  await admin.click('button:has-text("New content")');
  await admin.fill('input[name="title"]', "Weeknight pasta: ready in 15 minutes");
  await admin.selectOption('select[name="pillar"]', "Quick recipes");
  await admin.click('button:text-is("Create")');
  await expect(admin).toHaveURL(/\/content\//);
  contentUrl = new URL(admin.url()).pathname;

  await admin.goto("/admin/demo/pipeline");
  const card = admin.getByTestId("board-card").filter({ hasText: "Weeknight pasta" });
  await expect(admin.getByTestId("col-ideas").getByTestId("board-card").filter({ hasText: "Weeknight pasta" })).toBeVisible();
  await drag(admin, card, admin.getByTestId("col-making"));
  await expect(admin.getByTestId("col-making").getByTestId("board-card").filter({ hasText: "Weeknight pasta" })).toBeVisible();
  await shot(admin, "11-admin-pipeline");
  await admin.waitForTimeout(500);
  await admin.reload();
  await expect(admin.getByTestId("col-making").getByTestId("board-card").filter({ hasText: "Weeknight pasta" })).toBeVisible();

  // Nothing goes to the client before there is something to review. The card goes back and says why.
  await drag(admin, admin.getByTestId("board-card").filter({ hasText: "Weeknight pasta" }), admin.getByTestId("col-with-client"));
  await expect(admin.getByRole("status").filter({ hasText: "something to review" })).toBeVisible();
  await expect(admin.getByTestId("col-making").getByTestId("board-card").filter({ hasText: "Weeknight pasta" })).toBeVisible();
});

test("content detail holds the whole piece, with revision history", async () => {
  await admin.goto(contentUrl);
  const editor = admin.getByTestId("content-editor");
  await editor.locator('textarea[name="script"]').fill("Hook: this pasta beats the one I had last night.");
  await editor.locator('textarea[name="caption"]').fill("Version one of the caption.");
  await editor.locator('textarea[name="internalNotes"]').fill(SECRET_NOTE);
  await editor.locator('input[name="scheduledDate"]').fill("2026-11-18");
  await editor.getByRole("button", { name: "Save changes" }).click();
  await expect(admin.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();

  await editor.locator('textarea[name="caption"]').fill("Version two of the caption.");
  await editor.getByRole("button", { name: "Save changes" }).click();
  await admin.waitForTimeout(800);
  await admin.reload();
  await expect(admin.locator('textarea[name="caption"]')).toHaveValue("Version two of the caption.");
  await expect(admin.getByTestId("text-revision").filter({ hasText: "Caption v2" })).toBeVisible();
  await expect(admin.getByTestId("text-revision").filter({ hasText: "Caption v1" })).toBeVisible();

  // Attach her voiceover from the library, and upload an edit and a cover directly.
  await admin.getByRole("button", { name: "Choose Voiceover from the library" }).click();
  await admin.getByLabel("Pick Voiceover").selectOption({ label: "voiceover" });
  await expect(admin.getByTestId("role-voiceover").locator(".asset-chip")).toHaveCount(1);
  await admin.getByTestId("upload-edited_video").setInputFiles(fx("edit-v1.mp4"));
  await expect(admin.getByTestId("role-edited_video").locator(".asset-chip")).toHaveCount(1, { timeout: 30_000 });
  await admin.getByTestId("upload-cover").setInputFiles(fx("cover.jpg"));
  await expect(admin.getByTestId("role-cover").locator(".asset-chip")).toHaveCount(1, { timeout: 30_000 });
  await expect(admin.getByTestId("role-edited_video")).toContainText("Team only");

  // A team note stays team only.
  await admin.reload();
  await admin.getByPlaceholder("Pause where you want").fill(SECRET_COMMENT);
  await admin.getByRole("checkbox", { name: "Team only" }).check();
  await admin.getByRole("button", { name: "Comment", exact: true }).click();
  await expect(admin.getByTestId("comment").filter({ hasText: SECRET_COMMENT })).toBeVisible();
  await shot(admin, "12-admin-content-detail");
});

test("the client cannot see work before it is sent to her", async () => {
  const id = contentUrl.split("/").pop();
  const page = await client.goto(`/w/demo/review/${id}`);
  expect(page?.status()).toBe(404);

  await client.goto("/w/demo/making");
  await expect(client.getByTestId("making-row").filter({ hasText: "Weeknight pasta" })).toContainText("Being made");
  await shot(client, "13-client-making");
  const html = await client.content();
  expect(html).not.toContain("Version two of the caption");
  expect(html).not.toContain(SECRET_NOTE);

  // The unreleased edit itself is locked, even by direct address.
  const adminPage = await adminContext.newPage();
  await adminPage.goto(contentUrl);
  const href = await adminPage.getByTestId("role-edited_video").locator("a").first().getAttribute("href");
  const assetId = href!.split("/").pop();
  await adminPage.close();
  const direct = await client.request.get(`/api/assets/${assetId}/file`);
  expect(direct.status()).toBe(404);
});

test("review loop: send, comment on a moment, ask for changes, resend, approve", async () => {
  await admin.goto(contentUrl);
  await admin.getByTestId("status-track").getByRole("button", { name: "Client Review" }).click();
  await expect(admin.getByTestId("status-track").getByRole("button", { name: "Client Review" })).toHaveAttribute("aria-pressed", "true");

  // She is told, and the bell counts it.
  await client.goto("/w/demo");
  await expect(client.locator(".masthead-right .nav-count")).toBeVisible();
  await expect(client.locator("h1")).toContainText("waiting for you");
  await shot(client, "14-client-home-waiting");
  await client.goto("/w/demo/notifications");
  await client.getByTestId("notification").filter({ hasText: "Ready for your review" }).click();
  await expect(client).toHaveURL(new RegExp(`/w/demo/review/`));

  // She sees the work, in plain words, and none of the team's notes.
  await expect(client.getByTestId("client-caption")).toHaveText("Version two of the caption.");
  const html = await client.content();
  expect(html).not.toContain(SECRET_NOTE);
  expect(html).not.toContain(SECRET_COMMENT);
  await shot(client, "15-client-review");

  // The released edit plays.
  const video = client.getByTestId("video-player");
  const duration = await video.evaluate(async (element: HTMLVideoElement) => {
    await new Promise((resolve) => (element.readyState >= 1 ? resolve(null) : (element.onloadedmetadata = () => resolve(null))));
    element.currentTime = 2;
    await new Promise((resolve) => (element.onseeked = () => resolve(null)));
    return element.duration;
  });
  expect(duration).toBeGreaterThan(3);

  // A comment pinned to the moment she paused on.
  await client.getByPlaceholder("Pause where you want").fill("The music is too loud here");
  await client.getByRole("button", { name: "Comment", exact: true }).click();
  const comment = client.getByTestId("comment").filter({ hasText: "too loud" });
  await expect(comment.locator(".timecode")).toHaveText("0:02");

  // Changes need a reason.
  await client.getByRole("button", { name: "Ask for changes" }).click();
  await client.getByRole("button", { name: "Send my changes" }).click();
  await expect(client.locator(".form-error[role=alert]")).toContainText("what to change");
  await client.getByLabel("What should change?").fill("Lower the music and swap the caption.");
  await client.getByRole("button", { name: "Send my changes" }).click();
  await expect(client.getByText("Being updated").first()).toBeVisible();

  // The team sees it, with the note and the pinned comment.
  await admin.goto(contentUrl);
  await expect(admin.getByTestId("status-track").getByRole("button", { name: "Revision Requested" })).toHaveAttribute("aria-pressed", "true");
  await expect(admin.getByText("Asked for changes · round 1")).toBeVisible();
  await expect(admin.getByText("Lower the music and swap the caption.").first()).toBeVisible();
  await expect(admin.getByTestId("comment").filter({ hasText: "too loud" }).locator(".timecode")).toBeVisible();

  // Scheduling unapproved work is refused.
  await admin.getByTestId("status-track").getByRole("button", { name: "Scheduled" }).click();
  await expect(admin.getByRole("status").filter({ hasText: "has not been approved" })).toBeVisible();

  // Second round, approved.
  await admin.getByTestId("status-track").getByRole("button", { name: "Client Review" }).click();
  await expect(admin.getByTestId("status-track").getByRole("button", { name: "Client Review" })).toHaveAttribute("aria-pressed", "true");
  await client.goto(`/w/demo/review/${contentUrl.split("/").pop()}`);
  await client.getByRole("button", { name: "Approve" }).click();
  await expect(client.getByText("Approved").first()).toBeVisible();
  await expect(client.getByRole("button", { name: "Approve" })).toHaveCount(0);

  await admin.goto(contentUrl);
  await expect(admin.getByText("Approved · round 2")).toBeVisible();

  // Editing approved work voids the approval, so nothing unapproved can go out.
  await admin.locator('textarea[name="caption"]').fill("Sneaky change after approval.");
  await admin.getByRole("button", { name: "Save changes" }).click();
  await expect(admin.getByRole("status").filter({ hasText: "went back to Internal Review" })).toBeVisible();
  await expect(admin.getByTestId("status-track").getByRole("button", { name: "Internal Review" })).toHaveAttribute("aria-pressed", "true");

  // Round three, approved, scheduled.
  await admin.getByTestId("status-track").getByRole("button", { name: "Client Review" }).click();
  await expect(admin.getByTestId("status-track").getByRole("button", { name: "Client Review" })).toHaveAttribute("aria-pressed", "true");
  await client.goto(`/w/demo/review/${contentUrl.split("/").pop()}`);
  await client.getByRole("button", { name: "Approve" }).click();
  await expect(client.getByRole("button", { name: "Approve" })).toHaveCount(0);
  await admin.goto(contentUrl);
  await admin.getByTestId("status-track").getByRole("button", { name: "Scheduled" }).click();
  await expect(admin.getByTestId("status-track").getByRole("button", { name: "Scheduled" })).toHaveAttribute("aria-pressed", "true");
});

test("rejecting a piece sends it back with the reason", async () => {
  await admin.goto("/admin/demo/pipeline");
  await admin.click('button:has-text("New content")');
  await admin.fill('input[name="title"]', "Dressed for dinner");
  await admin.click('button:text-is("Create")');
  await expect(admin).toHaveURL(/\/content\//);
  await admin.locator('textarea[name="caption"]').fill("A caption to reject.");
  await admin.getByRole("button", { name: "Save changes" }).click();
  await expect(admin.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
  await admin.getByTestId("status-track").getByRole("button", { name: "Client Review" }).click();
  await expect(admin.getByTestId("status-track").getByRole("button", { name: "Client Review" })).toHaveAttribute("aria-pressed", "true");
  const url = admin.url();

  await client.goto(`/w/demo/review/${url.split("/").pop()}`);
  await client.getByRole("button", { name: "Reject" }).click();
  await client.getByLabel("What is not working?").fill("Not my style.");
  await client.getByRole("button", { name: "Reject this piece" }).click();
  await expect(client.getByRole("button", { name: "Approve" })).toHaveCount(0, { timeout: 15_000 });

  await admin.goto(url);
  await expect(admin.getByText("Rejected · round 1")).toBeVisible();
  await expect(admin.getByTestId("status-track").getByRole("button", { name: "Idea" })).toHaveAttribute("aria-pressed", "true");
});

test("feed planner: upload into tiles, rearrange, versions, drafts, and the client's view", async () => {
  await admin.goto("/admin/demo/feed");
  await expect(admin.getByTestId("feed-empty")).toHaveCount(12);

  // View sizes.
  await admin.getByRole("button", { name: "9", exact: true }).click();
  await expect(admin.getByTestId("feed-empty")).toHaveCount(9);
  await admin.getByRole("button", { name: "18", exact: true }).click();
  await expect(admin.getByTestId("feed-empty")).toHaveCount(18);
  await admin.getByRole("button", { name: "12", exact: true }).click();

  // Upload straight into position 1.
  await admin.getByTestId("feed-empty").first().click();
  await expect(admin.getByTestId("slot-panel")).toBeVisible();
  await admin.getByTestId("slot-upload").setInputFiles(fx("pasta.jpg"));
  await expect(admin.getByTestId("feed-tile")).toHaveCount(1, { timeout: 30_000 });
  await expect(admin.getByTestId("feed-tile").first()).toHaveAttribute("data-position", "0");

  // Nothing in the grid is a placeholder: tile image is the real uploaded file.
  const firstImage = admin.getByTestId("feed-tile").first().locator("img");
  await expect(firstImage).toHaveAttribute("src", /\/api\/assets\//);
  expect(await firstImage.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBeTruthy();

  await admin.getByLabel("Post caption").fill("Caption for the pasta post");
  await admin.getByRole("button", { name: "Save", exact: true }).click();
  await expect(admin.getByText("Saved.")).toBeVisible();
  await admin.getByLabel("State").selectOption("planned");
  await expect(admin.getByLabel("State")).toHaveValue("planned");

  // A reel in position 2, a carousel in position 3.
  await admin.locator('[data-testid="feed-empty"][data-position="1"]').click();
  await admin.getByTestId("slot-upload").setInputFiles(fx("raw-clip.mp4"));
  await expect(admin.getByTestId("feed-tile")).toHaveCount(2, { timeout: 30_000 });
  await expect(admin.getByLabel("Type")).toHaveValue("reel");
  await admin.getByLabel("State").selectOption("planned");
  await expect(admin.getByLabel("State")).toHaveValue("planned");

  await admin.locator('[data-testid="feed-empty"][data-position="2"]').click();
  await admin.getByTestId("slot-upload").setInputFiles([fx("cover.jpg"), fx("dessert.jpg")]);
  await expect(admin.getByTestId("feed-tile")).toHaveCount(3, { timeout: 30_000 });
  await expect(admin.getByLabel("Type")).toHaveValue("carousel");
  // This one stays a draft.
  await shot(admin, "16-admin-feed");

  // Rearrange: drag the first tile to the third position. Survives a reload.
  await admin.keyboard.press("Escape");
  const pasta = admin.locator('[data-testid="feed-tile"][data-title="pasta"]');
  await drag(admin, pasta, admin.locator('[data-testid="feed-tile"][data-position="2"]'));
  await expect(pasta).toHaveAttribute("data-position", "2");
  await admin.waitForTimeout(600);
  await admin.reload();
  await expect(admin.locator('[data-testid="feed-tile"][data-title="pasta"]')).toHaveAttribute("data-position", "2");

  // Individual post preview, with the caption shown separately too.
  await expect(admin.getByTestId("caption-list")).toContainText("Caption for the pasta post");
  await admin.getByTestId("caption-list").getByRole("button").filter({ hasText: "Caption for the pasta post" }).click();
  await expect(admin.getByTestId("post-caption")).toHaveText("Caption for the pasta post");
  await shot(admin, "17-admin-post-preview");
  await admin.getByRole("button", { name: "Close" }).first().click();

  // Save a new version, change it, and the original stays as it was.
  admin.once("dialog", (dialog) => dialog.accept("Version 2 with dessert first"));
  await admin.getByRole("button", { name: "Save as new version" }).click();
  await expect(admin).toHaveURL(/layout=/);
  await expect(admin.getByTestId("layout-select").locator("option")).toHaveCount(2);
  await expect(admin.getByTestId("feed-tile")).toHaveCount(3);
  await admin.locator('[data-testid="feed-tile"][data-title="pasta"]').click();
  await admin.getByRole("button", { name: "Clear this tile" }).click();
  await expect(admin.getByTestId("feed-tile")).toHaveCount(2);
  await admin.getByTestId("layout-select").selectOption({ index: 0 });
  await expect(admin.getByTestId("feed-tile")).toHaveCount(3);

  // The client sees planned posts in the shared version, and never the draft.
  await client.goto("/w/demo/feed");
  await expect(client.getByTestId("feed-tile")).toHaveCount(2);
  await shot(client, "18-client-feed");
  for (const image of await client.getByTestId("feed-tile").locator("img").all()) {
    await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  }
  await client.getByTestId("feed-tile").filter({ has: client.locator('[aria-label="Reel"]') }).click();
  await expect(client.getByTestId("post-video")).toBeVisible();
  await client.getByRole("button", { name: "Close" }).click();
});

test("calendars: the team reschedules by dragging, the client sees it", async () => {
  await admin.goto("/admin/demo/calendar?m=2026-11");
  await expect(admin.getByTestId("day-2026-11-18").getByTestId("calendar-entry")).toContainText("Weeknight pasta");
  await shot(admin, "19-admin-calendar");
  await drag(admin, admin.getByTestId("calendar-entry").filter({ hasText: "Weeknight pasta" }), admin.getByTestId("day-2026-11-20"));
  await expect(admin.getByTestId("day-2026-11-20").getByTestId("calendar-entry")).toContainText("Weeknight pasta");
  await admin.waitForTimeout(600);
  await admin.reload();
  await expect(admin.getByTestId("day-2026-11-20").getByTestId("calendar-entry")).toContainText("Weeknight pasta");

  await client.goto("/w/demo/calendar?m=2026-11");
  await expect(client.getByTestId("calendar")).toContainText("Weeknight pasta");
  await shot(client, "20-client-calendar");
  await client.goto("/w/demo/notifications");
  await expect(client.getByTestId("notification").filter({ hasText: "New date" })).toBeVisible();
});

test("reports count the latest numbers per post, not every entry", async () => {
  await admin.goto("/admin/demo/reports");
  const form = admin.locator("form:has(select[name=contentItemId])");
  const enter = async (date: string, saves: string) => {
    await form.locator("select[name=contentItemId]").selectOption({ label: "Weeknight pasta: ready in 15 minutes" });
    await form.locator("input[name=capturedOn]").fill(date);
    await form.locator("input[name=views]").fill("12000");
    await form.locator("input[name=reach]").fill("9000");
    await form.locator("input[name=nonFollowerReach]").fill("6000");
    await form.locator("input[name=saves]").fill(saves);
    await form.locator("input[name=shares]").fill("80");
    await form.getByRole("button", { name: "Save numbers" }).click();
    await expect(form.getByRole("status")).toHaveText("Saved.");
  };
  await enter("2026-11-21", "100");
  await enter("2026-11-25", "240");
  await expect(admin.getByTestId("total-saves")).toHaveText("240");
  await expect(admin.getByTestId("report-table")).toContainText("Weeknight pasta");
  await expect(admin.getByTestId("report-stats")).toContainText("67%");

  await admin.locator('input[name="followers"]').last().fill("9100");
  await admin.locator('input[name="capturedOn"]').last().fill("2026-11-25");
  await admin.getByRole("button", { name: "Add", exact: true }).click();
  await expect(admin.getByTestId("report-stats")).toContainText("9,100");
  await shot(admin, "21-admin-reports");
});

test("assistant streams an answer built from the brand knowledge base and saves it to the piece", async () => {
  await admin.goto("/admin/demo/assistant");
  await expect(admin.getByTestId("ai-not-connected")).toHaveCount(0);
  await admin.getByRole("button", { name: "Write captions" }).click();
  await expect(admin.getByRole("button", { name: "Run" })).toBeDisabled();
  await admin.getByLabel("Piece").selectOption({ label: "Dressed for dinner" });
  await admin.getByLabel("Message").fill("Mention the dim sum");
  await admin.getByRole("button", { name: "Run" }).click();
  await expect(admin.getByTestId("assistant-message")).toHaveText("Demo reply: I tried everything so you do not have to.");
  await shot(admin, "22-admin-assistant");
  // One short sentence fits on one line of the wide bubble.
  expect((await admin.getByTestId("assistant-message").boundingBox())!.height).toBeLessThan(60);

  const sent = JSON.parse(readFileSync(fx("last-ai-request.json"), "utf8"));
  expect(sent.body.model).toBe("claude-opus-5-5");
  expect(sent.body.stream).toBe(true);
  expect(sent.body.fallbacks).toBe("default");
  expect(sent.headers["anthropic-beta"]).toContain("server-side-fallback-2026-07-01");
  expect(sent.body.system[0].text).toContain("cooks like a chef");
  expect(JSON.stringify(sent.body.messages)).toContain("Dressed for dinner");
  expect(JSON.stringify(sent.body.messages)).toContain("Mention the dim sum");

  // Save into the piece, versioned like any other edit.
  await admin.getByRole("button", { name: "Save as caption" }).click();
  await expect(admin.getByRole("status").filter({ hasText: "Saved as the caption." })).toBeVisible();

  // A follow-up replays the first turn unchanged and adds to it.
  await admin.getByLabel("Message").fill("Shorter please");
  await admin.getByRole("button", { name: "Send" }).click();
  await expect(admin.getByTestId("assistant-message").nth(1)).toContainText("Demo reply");
  const second = JSON.parse(readFileSync(fx("last-ai-request.json"), "utf8"));
  expect(second.body.messages.length).toBe(3);
  expect(second.body.messages[0]).toEqual(sent.body.messages[0]);
  expect(second.body.messages[1].role).toBe("assistant");

  // Reference analysis really sends frames from the uploaded video.
  await admin.getByRole("button", { name: "Analyse references" }).click();
  await admin.getByRole("listbox").selectOption({ label: "Night market clip" });
  await admin.getByRole("button", { name: "Run" }).click();
  await expect(admin.getByTestId("assistant-message").first()).toContainText("Demo reply");
  const reference = JSON.parse(readFileSync(fx("last-ai-request.json"), "utf8"));
  const blocks = reference.body.messages[0].content as { type: string }[];
  expect(blocks.filter((block) => block.type === "image").length).toBe(6);

  // Clients cannot reach it at all.
  const blocked = await client.request.post("/api/ai/chat", { data: { slug: "demo", capability: "ideas", message: "hello" } });
  expect(blocked.status()).toBe(404);
  const blockedPage = await client.goto("/admin/demo/assistant");
  expect(blockedPage?.status()).toBe(404);

  await admin.goto("/admin/demo/brand");
  await shot(admin, "23-admin-brand");
});

test("onboarding a second client: full isolation between workspaces", async ({ browser }) => {
  await admin.goto("/admin");
  await admin.fill('input[name="name"]', "Another Creator");
  await admin.fill('input[name="firstName"]', "Mira");
  await admin.fill('input[name="email"]', "mira@test.local");
  await admin.fill('input[name="instagramHandle"]', "@mira");
  await admin.click('button:has-text("Create workspace")');
  const link = await admin.getByTestId("invite-link").inputValue();

  const context = await browser.newContext();
  const mira = await context.newPage();
  await mira.goto(link);
  await mira.fill('input[name="password"]', PASSWORD);
  await mira.click('button:has-text("Enter the studio")');
  await expect(mira).toHaveURL(/\/w\/mira$/);

  // The first client's pages do not exist as far as she can tell.
  for (const url of ["/w/demo", "/w/demo/files", "/w/demo/feed", "/admin/demo", "/admin/mira"]) {
    expect((await mira.goto(url))?.status(), url).toBe(404);
  }

  // Neither do her files.
  await client.goto("/w/demo/files");
  await client.getByTestId("media-card").first().click();
  await expect(client).toHaveURL(/files\/[0-9a-f-]{36}$/);
  const assetId = client.url().split("/").pop();
  expect((await mira.request.get(`/api/assets/${assetId}/file`)).status()).toBe(404);
  expect((await client.request.get(`/api/assets/${assetId}/file?variant=thumb`)).status()).not.toBe(401);

  // She cannot upload into the first client's workspace.
  const demoWorkspaceId = await client.evaluate(async () => {
    const html = await (await fetch("/w/demo/upload")).text();
    return /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/.exec(html)?.[0];
  });
  const attempt = await mira.request.post("/api/uploads", {
    data: { workspaceId: demoWorkspaceId, fileName: "x.jpg", mimeType: "image/jpeg", sizeBytes: 10, category: "photo", title: "x" },
  });
  expect(attempt.status()).toBe(404);

  // Her workspace starts empty, and the admin sees both.
  await mira.goto("/w/mira/files");
  await expect(mira.getByText("Nothing here yet")).toBeVisible();
  await admin.goto("/admin");
  await expect(admin.getByTestId("client-card")).toHaveCount(2);
  await context.close();
});

test("the phone view of the client portal holds together", async ({ browser }) => {
  const state = await clientContext.storageState();
  const context = await browser.newContext({ storageState: state, viewport: { width: 390, height: 844 } });
  const phone = await context.newPage();
  // Every section is reachable from the sideways-scrolling nav, including the first one.
  await phone.goto("/w/demo");
  const first = (await phone.locator(".masthead-nav a").first().boundingBox())!;
  expect(first.x).toBeGreaterThanOrEqual(0);
  await phone.goto("/w/demo/ideas");
  await expect(phone.locator('.masthead-nav a[aria-current="page"]')).toBeInViewport();

  for (const [url, name] of [["/w/demo", "24-phone-home"], ["/w/demo/upload", "25-phone-upload"], ["/w/demo/feed", "26-phone-feed"], ["/w/demo/calendar?m=2026-11", "27-phone-calendar"]] as const) {
    await phone.goto(url);
    await phone.waitForLoadState("networkidle");
    const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${url} scrolls sideways`).toBeLessThanOrEqual(1);
    await phone.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
  }
  await context.close();
});

/** Hands a real File to an element the way the browser does when one is dropped from the desktop. */
async function dropFile(page: Page, target: Locator, name: string, type: string, filePath: string) {
  const base64 = readFileSync(filePath).toString("base64");
  const transfer = await page.evaluateHandle(
    ({ base64, name, type }) => {
      const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
      const data = new DataTransfer();
      data.items.add(new File([bytes], name, { type }));
      return data;
    },
    { base64, name, type },
  );
  await target.dispatchEvent("dragover", { dataTransfer: transfer });
  await target.dispatchEvent("drop", { dataTransfer: transfer });
}

test("files dropped from the desktop work on the upload centre and on a feed tile", async () => {
  await client.goto("/w/demo/upload");
  await dropFile(client, client.locator(".dropzone"), "dropped-photo.jpg", "image/jpeg", fx("dessert.jpg"));
  await expect(client.getByTestId("upload-item")).toHaveCount(1);
  await client.click('button:has-text("Send to the team")');
  await expect(client.getByText("Your file is in.")).toBeVisible({ timeout: 30_000 });

  await admin.goto("/admin/demo/feed");
  const before = await admin.getByTestId("feed-tile").count();
  await dropFile(admin, admin.locator('[data-testid="feed-empty"][data-position="5"]'), "dropped-tile.jpg", "image/jpeg", fx("cover.jpg"));
  await expect(admin.getByTestId("feed-tile")).toHaveCount(before + 1, { timeout: 30_000 });
  await expect(admin.locator('[data-testid="feed-tile"][data-position="5"] img')).toBeVisible();
});

test("the profile, avatar and brand knowledge are editable and feed through", async () => {
  await admin.goto("/admin/demo/team");
  await admin.fill('textarea[name="bio"]', "Home cook and always hungry");
  await admin.fill('input[name="followers"]', "9500");
  await admin.getByRole("button", { name: "Save profile" }).click();
  await expect(admin.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();

  await admin.goto("/admin/demo/feed");
  await admin.getByTestId("avatar-upload").setInputFiles(fx("pasta.jpg"));
  await expect(admin.locator("img.ig-avatar").first()).toBeVisible({ timeout: 30_000 });
  await client.goto("/w/demo/feed");
  await expect(client.getByTestId("feed-preview")).toContainText("always hungry");
  await expect(client.getByTestId("feed-preview")).toContainText("9,500");
  await expect.poll(() => client.locator("img.ig-avatar").first().evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);

  await admin.goto("/admin/demo/brand");
  await expect(admin.getByTestId("brand-doc")).toHaveCount(7);
  const voice = admin.getByTestId("brand-doc").filter({ has: admin.locator('input[value="Voice"]') });
  await voice.locator("textarea").fill("Approved caption example: order the second one, trust me.");
  await voice.getByRole("button", { name: "Save" }).click();
  await expect(voice.getByText("Saved.")).toBeVisible();
  const blank = admin.getByTestId("brand-doc").last();
  await blank.locator('input[name="title"]').fill("Banned words");
  await blank.locator("textarea").fill("Never say yummy.");
  await blank.getByRole("button", { name: "Add section" }).click();
  await expect(admin.getByTestId("brand-doc")).toHaveCount(8);
  await admin.reload();
  await expect(admin.getByTestId("brand-doc").filter({ has: admin.locator('input[value="Voice"]') }).locator("textarea")).toHaveValue(/order the second one/);

  // The assistant reads the edit on its very next request.
  await admin.goto("/admin/demo/assistant");
  await admin.getByRole("button", { name: "Run" }).click();
  await expect(admin.getByTestId("assistant-message")).toContainText("Demo reply");
  const sent = JSON.parse(readFileSync(fx("last-ai-request.json"), "utf8"));
  expect(sent.body.system[0].text).toContain("order the second one");
  expect(sent.body.system[0].text).toContain("Never say yummy");

  admin.once("dialog", (dialog) => dialog.accept());
  await admin.goto("/admin/demo/brand");
  const added = admin.getByTestId("brand-doc").filter({ has: admin.locator('input[value="Banned words"]') });
  await added.getByRole("button", { name: "Delete" }).click();
  await expect(admin.getByTestId("brand-doc")).toHaveCount(7);
});

test("tasks, request statuses and file comments and removal all work", async () => {
  await admin.goto("/admin/demo/tasks");
  await admin.fill('input[name="title"]', "Book the pasta shoot");
  await admin.fill('input[name="dueDate"]', "2026-11-10");
  await admin.getByRole("button", { name: "Add", exact: true }).click();
  const task = admin.getByTestId("task-row").filter({ hasText: "Book the pasta shoot" });
  await expect(task).toBeVisible();
  await task.getByLabel("Task status").selectOption("done");
  await admin.waitForTimeout(500);
  await admin.reload();
  await expect(admin.getByTestId("task-row").filter({ hasText: "Book the pasta shoot" }).getByLabel("Task status")).toHaveValue("done");
  await admin.getByTestId("task-row").filter({ hasText: "Book the pasta shoot" }).getByRole("button", { name: "Delete" }).click();
  await expect(admin.getByTestId("task-row").filter({ hasText: "Book the pasta shoot" })).toHaveCount(0);

  await admin.goto("/admin/demo/requests");
  admin.once("dialog", (dialog) => dialog.accept("Saving this for wedding season."));
  await admin.getByLabel("Request status").first().selectOption("declined");
  await expect(admin.getByLabel("Request status").first()).toHaveValue("declined");
  await client.goto("/w/demo/ideas");
  await expect(client.getByTestId("idea-row").first()).toContainText("Not this time");
  await client.goto("/w/demo/notifications");
  await expect(client.getByTestId("notification").filter({ hasText: "Saving this for wedding season." })).toBeVisible();

  // A comment on a file reaches the team. A team-only one does not reach her.
  await client.goto("/w/demo/files?q=dropped");
  await client.getByTestId("media-card").click();
  await client.getByLabel("Comment").fill("Use this one for the cover");
  await client.getByRole("button", { name: "Comment", exact: true }).click();
  await expect(client.getByTestId("comment")).toContainText("Use this one");
  await expect(client).toHaveURL(/files\/[0-9a-f-]{36}$/);
  const assetId = client.url().split("/").pop();

  await admin.goto(`/admin/demo/library/${assetId}`);
  await expect(admin.getByTestId("comment")).toContainText("Use this one");
  await admin.getByLabel("Comment").fill("Colour looks off, fixing");
  await admin.getByRole("checkbox", { name: "Team only" }).check();
  await admin.getByRole("button", { name: "Comment", exact: true }).click();
  await expect(admin.getByTestId("comment")).toHaveCount(2);
  await client.reload();
  await expect(client.getByTestId("comment")).toHaveCount(1);
  expect(await client.content()).not.toContain("Colour looks off");

  // Removing a file takes it out of the library and stops it being served.
  admin.once("dialog", (dialog) => dialog.accept());
  await admin.getByRole("button", { name: "Remove from library" }).click();
  await expect(admin).toHaveURL(/\/library$/);
  await expect(admin.getByTestId("media-card").filter({ hasText: "dropped photo" })).toHaveCount(0);
  expect((await client.request.get(`/api/assets/${assetId}/file`)).status()).toBe(404);
});

test("team members see only their workspaces and cannot take over accounts", async ({ browser }) => {
  await admin.goto("/admin/demo/team");
  await admin.fill('form:has(select[name="role"]) input[name="name"]', "Editor Person");
  await admin.fill('form:has(select[name="role"]) input[name="email"]', "editor@test.local");
  await admin.selectOption('select[name="role"]', "team");
  await admin.click('button:has-text("Create invite link")');
  const link = await admin.getByTestId("invite-link").inputValue();

  const context = await browser.newContext();
  const editor = await context.newPage();
  await editor.goto(link);
  await editor.fill('input[name="password"]', PASSWORD);
  await editor.click('button:has-text("Enter the studio")');
  await expect(editor).toHaveURL(/\/admin$/);
  await expect(editor.getByTestId("client-card")).toHaveCount(1);
  await expect(editor.getByTestId("client-card")).toContainText("Demo Creator");
  await expect(editor.getByText("Add a client")).toHaveCount(0);
  expect((await editor.goto("/admin/mira"))?.status()).toBe(404);

  await editor.goto("/admin/demo/pipeline");
  await expect(editor.getByTestId("board-card").first()).toBeVisible();

  // An invite is a password reset, so a member cannot aim one at an existing account.
  await editor.goto("/admin/demo/team");
  await editor.fill('form:has(select[name="role"]) input[name="name"]', "Admin");
  await editor.fill('form:has(select[name="role"]) input[name="email"]', "admin@test.local");
  await editor.click('button:has-text("Create invite link")');
  await expect(editor.locator(".form-error[role=alert]")).toContainText("already has an account");
  await expect(editor.getByTestId("invite-link")).toHaveCount(0);

  // Removing them takes effect straight away.
  await admin.goto("/admin/demo/team");
  admin.once("dialog", (dialog) => dialog.accept());
  await admin.getByTestId("member-row").filter({ hasText: "Editor Person" }).getByRole("button", { name: "Remove" }).click();
  await expect(admin.getByTestId("member-row").filter({ hasText: "Editor Person" })).toHaveCount(0);
  expect((await editor.goto("/admin/demo"))?.status()).toBe(404);
  await context.close();
});

test("the home screens are boxes that open each area and show what is inside", async () => {
  await client.goto("/w/demo");
  await shot(client, "30-client-boxes");
  for (const id of ["review", "feed", "ideas", "videos", "photos", "voice", "references", "scripts", "brand", "calendar", "making", "results", "files"]) {
    await expect(client.getByTestId(`box-${id}`), id).toBeVisible();
  }
  // Boxes show real files and the real grid.
  await expect(client.getByTestId("box-videos").locator("img").first()).toBeVisible();
  await expect(client.getByTestId("box-feed").locator("img").first()).toBeVisible();
  await client.getByTestId("box-scripts").click();
  await expect(client).toHaveURL(/\/w\/demo\/scripts$/);
  await expect(client.getByTestId("script-card").filter({ hasText: "Weeknight pasta" })).toBeVisible();
  await shot(client, "31-client-scripts");

  await admin.goto("/admin/demo");
  await shot(admin, "32-admin-boxes");
  for (const id of ["pipeline", "feed", "requests", "tasks", "videos", "photos", "voice", "references", "scripts", "calendar", "brand", "assistant", "results", "files", "team"]) {
    await expect(admin.getByTestId(`box-${id}`), id).toBeVisible();
  }
  await admin.getByTestId("box-scripts").click();
  await expect(admin).toHaveURL(/\/admin\/demo\/scripts$/);
  await expect(admin.getByText("Still to write")).toBeVisible();
  await shot(admin, "33-admin-scripts");
});

test("dropping into a folder files it in that folder, and folders stay separate", async () => {
  await client.goto("/w/demo/photos");
  const before = await client.getByTestId("collection-grid").getByTestId("media-card").count();
  await dropFile(client, client.locator(".dropzone"), "market-stall.jpg", "image/jpeg", fx("pasta.jpg"));
  await client.click('button:has-text("Send to the team")');
  await expect(client.getByTestId("collection-grid").getByTestId("media-card")).toHaveCount(before + 1, { timeout: 30_000 });
  await shot(client, "34-client-photos");

  // A video dropped into References is a reference, not footage.
  await client.goto("/w/demo/references");
  await expect(client.locator('input[name="url"]')).toBeVisible();
  await client.getByTestId("file-input").setInputFiles(fx("edit-v1.mp4"));
  await expect(client.getByTestId("upload-item").locator("select").first()).toHaveValue("design_reference");
  await client.getByTestId("upload-item").locator("input").first().fill("Reel I want to copy the pacing of");
  await client.click('button:has-text("Send to the team")');
  await expect(client.getByTestId("media-card").filter({ hasText: "Reel I want to copy" })).toBeVisible({ timeout: 30_000 });
  await client.goto("/w/demo/videos");
  await expect(client.getByTestId("media-card").filter({ hasText: "Reel I want to copy" })).toHaveCount(0);
  await client.goto("/w/demo/voice");
  await expect(client.getByTestId("media-card").filter({ hasText: "voiceover" })).toBeVisible();
  expect((await client.goto("/w/demo/not-a-folder"))?.status()).toBe(404);
});

test("brand identity: colours and files show to the client, notes only when chosen", async () => {
  await client.goto("/w/demo/brand");
  await expect(client.getByText("We are putting this together")).toBeVisible();
  expect(await client.content()).not.toContain("not yet confirmed");

  await admin.goto("/admin/demo/brand");
  const kit = admin.getByTestId("brand-kit");
  await kit.locator('input[name="colors"]').fill("not-a-colour");
  await kit.getByRole("button", { name: "Save colours and fonts" }).click();
  await expect(kit.getByRole("status")).toContainText("is not a colour code");
  await kit.locator('input[name="colors"]').fill("#7A143C, F6C4D0");
  await kit.locator('input[name="fonts"]').fill("Didot, DM Sans");
  await kit.getByRole("button", { name: "Save colours and fonts" }).click();
  await expect(kit.getByRole("status")).toHaveText("Saved.");
  await admin.getByTestId("file-input").setInputFiles(fx("cover.jpg"));
  await admin.getByTestId("upload-item").locator("input").first().fill("Primary logo");
  await admin.click('button:has-text("Upload to library")');
  await expect(admin.getByTestId("media-card").filter({ hasText: "Primary logo" })).toBeVisible({ timeout: 30_000 });
  await shot(admin, "35-admin-brand");

  const voice = admin.getByTestId("brand-doc").filter({ has: admin.locator('input[value="Voice"]') });
  await voice.getByLabel("Show this section to the client").check();
  await voice.getByRole("button", { name: "Save" }).click();
  await expect(voice.getByText("Saved.")).toBeVisible();

  await client.goto("/w/demo/brand");
  await expect(client.getByTestId("client-swatches").locator(".swatch")).toHaveCount(2);
  await expect(client.getByText("Didot, DM Sans")).toBeVisible();
  await expect(client.getByTestId("media-card").filter({ hasText: "Primary logo" })).toBeVisible();
  await expect(client.getByTestId("client-brand-section")).toHaveCount(1);
  await expect(client.getByTestId("client-brand-section")).toContainText("Voice");
  // The sections not shared are not in the page's data at all.
  expect(await client.content()).not.toContain("not yet confirmed");
  await shot(client, "36-client-brand");
  // The voice note now sits with her recordings.
  await client.goto("/w/demo/voice");
  await expect(client.getByText("How you sound")).toBeVisible();
  await client.goto("/w/demo");
  await expect(client.getByTestId("box-brand").locator(".swatch")).toHaveCount(2);

  await client.goto("/w/demo/results");
  await expect(client.getByTestId("client-results")).toContainText("240");
  await shot(client, "37-client-results");
});

test("the current feed sits beside the preview and stays separate from the plan", async () => {
  await admin.goto("/admin/demo/feed");
  const planned = await admin.getByTestId("feed-tile").count();
  const versions = await admin.getByTestId("layout-select").locator("option").count();
  await expect(admin.getByText("Add the posts live on her profile")).toBeVisible();

  // Side by side, with the grids lined up.
  const left = (await admin.getByTestId("feed-planner").boundingBox())!;
  const right = (await admin.getByTestId("current-feed").locator(".phone").boundingBox())!;
  expect(right.x).toBeGreaterThan(left.x + left.width - 1);
  expect(Math.abs(right.y - left.y)).toBeLessThan(2);

  // Several at once, in order, newest first.
  await admin.getByTestId("current-upload").setInputFiles([fx("cover.jpg"), fx("dessert.jpg"), fx("raw-clip.mp4")]);
  const tiles = admin.getByTestId("current-tile");
  await expect(tiles).toHaveCount(3, { timeout: 30_000 });
  await expect(tiles.nth(0)).toHaveAttribute("data-title", "cover");
  await expect(tiles.nth(2).locator(".tile-kind svg")).toBeVisible();
  await shot(admin, "40-admin-feed-compare");

  // A newer post goes top left.
  await dropFile(admin, admin.getByTestId("current-feed"), "newest.jpg", "image/jpeg", fx("pasta.jpg"));
  await expect(tiles).toHaveCount(4, { timeout: 30_000 });
  await expect(tiles.nth(0)).toHaveAttribute("data-title", "newest");

  // Rearranging holds after a reload.
  await drag(admin, tiles.nth(0), tiles.nth(3));
  await expect(tiles.nth(3)).toHaveAttribute("data-title", "newest");
  await admin.waitForTimeout(600);
  await admin.reload();
  await expect(admin.getByTestId("current-tile").nth(3)).toHaveAttribute("data-title", "newest");

  // Type and removal.
  await admin.getByTestId("current-tile").nth(3).click();
  await admin.getByLabel("Live post type").selectOption("carousel");
  await expect(admin.getByLabel("Live post type")).toHaveValue("carousel");
  await admin.getByRole("button", { name: "Remove from the grid" }).click();
  await expect(admin.getByTestId("current-tile")).toHaveCount(3);

  // The plan is untouched, and the live grid is not one of the versions.
  await expect(admin.getByTestId("feed-tile")).toHaveCount(planned);
  await expect(admin.getByTestId("layout-select").locator("option")).toHaveCount(versions);

  // Live posts stay out of the folders and the list of new files to sort.
  await admin.goto("/admin/demo/library?status=new&category=live_post");
  await expect(admin.getByText("Nothing matches that")).toBeVisible();
  await admin.goto("/admin/demo/photos");
  await expect(admin.getByTestId("media-card").filter({ hasText: "newest" })).toHaveCount(0);
  await admin.goto("/admin/demo");
  await expect(admin.getByTestId("box-current").locator("img")).toHaveCount(3);
  await expect(admin.getByTestId("box-feed")).toBeVisible();
  await shot(admin, "41-admin-boxes-current");

  // She sees both, beside each other, and can open a live post.
  await client.goto("/w/demo/feed");
  await expect(client.getByTestId("current-tile")).toHaveCount(3);
  await expect(client.getByTestId("feed-tile").first()).toBeVisible();
  for (const image of await client.getByTestId("current-tile").locator("img").all()) {
    await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  }
  const a = (await client.getByTestId("feed-preview").boundingBox())!;
  const b = (await client.getByTestId("current-feed").boundingBox())!;
  expect(b.x).toBeGreaterThan(a.x + a.width - 1);
  await shot(client, "42-client-feed-compare");
  await client.goto("/w/demo");
  const feedBox = (await client.getByTestId("box-feed").boundingBox())!;
  const currentBox = (await client.getByTestId("box-current").boundingBox())!;
  expect(Math.abs(feedBox.y - currentBox.y)).toBeLessThan(2);
  await shot(client, "43-client-boxes-current");
  await client.getByTestId("box-current").click();
  await expect(client).toHaveURL(/\/feed#current$/);
});
