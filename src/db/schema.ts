import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ enums */

export const agencyRole = pgEnum("agency_role", ["admin", "member"]);
export const membershipRole = pgEnum("membership_role", ["client", "team"]);

export const assetCategory = pgEnum("asset_category", [
  "voiceover",
  "raw_video",
  "edited_video",
  "photo",
  "screenshot",
  "design_reference",
  "document",
  "external_link",
  "brand_asset",
  "live_post",
]);
export const assetStatus = pgEnum("asset_status", ["uploading", "new", "in_use", "archived"]);
export const assetVisibility = pgEnum("asset_visibility", ["shared", "internal"]);

export const contentStatus = pgEnum("content_status", [
  "idea",
  "briefed",
  "in_production",
  "internal_review",
  "client_review",
  "revision_requested",
  "approved",
  "scheduled",
  "published",
]);
export const contentFormat = pgEnum("content_format", ["reel", "carousel", "photo", "story"]);
export const contentAssetRole = pgEnum("content_asset_role", [
  "voiceover",
  "raw_footage",
  "edited_video",
  "cover",
  "reference",
]);
export const revisionKind = pgEnum("revision_kind", ["script", "caption", "edited_video", "cover"]);
export const approvalDecision = pgEnum("approval_decision", ["approved", "revision_requested", "rejected"]);

export const requestPriority = pgEnum("request_priority", ["low", "normal", "high"]);
export const requestStatus = pgEnum("request_status", ["new", "in_progress", "done", "declined"]);
export const taskStatus = pgEnum("task_status", ["todo", "doing", "done"]);

export const feedSlotKind = pgEnum("feed_slot_kind", ["reel", "carousel", "photo"]);
export const feedSlotState = pgEnum("feed_slot_state", ["draft", "planned"]);

export const aiRole = pgEnum("ai_role", ["user", "assistant"]);

/* ------------------------------------------------------- people and access */

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash"),
  /** Set for marketing-team staff. Null means this person is a client only. */
  agencyRole: agencyRole("agency_role"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable(
  "sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/** One workspace per client. Every piece of client data hangs off this id. */
export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  clientFirstName: text("client_first_name").notNull(),
  instagramHandle: text("instagram_handle"),
  profileName: text("profile_name"),
  bio: text("bio"),
  profileLink: text("profile_link"),
  followers: integer("followers"),
  following: integer("following"),
  postCount: integer("post_count"),
  avatarAssetId: uuid("avatar_asset_id"),
  pillars: text("pillars").array().notNull().default(sql`'{}'::text[]`),
  brandColors: text("brand_colors").array().notNull().default(sql`'{}'::text[]`),
  brandFonts: text("brand_fonts").array().notNull().default(sql`'{}'::text[]`),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const memberships = pgTable(
  "memberships",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    role: membershipRole("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.workspaceId] }), index("memberships_ws_idx").on(t.workspaceId)],
);

/** Single-use link that lets someone set a password and join. Also used for password resets. */
export const invites = pgTable("invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  tokenHash: text("token_hash").notNull().unique(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
  membershipRole: membershipRole("membership_role"),
  agencyRole: agencyRole("agency_role"),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ assets */

export const assets = pgTable(
  "assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    category: assetCategory("category").notNull(),
    status: assetStatus("status").notNull().default("uploading"),
    visibility: assetVisibility("visibility").notNull().default("shared"),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    internalNotes: text("internal_notes").notNull().default(""),
    uploadedById: uuid("uploaded_by_id").references(() => users.id, { onDelete: "set null" }),
    requestId: uuid("request_id"),
    /* file assets */
    storageKey: text("storage_key"),
    thumbnailKey: text("thumbnail_key"),
    fileName: text("file_name"),
    mimeType: text("mime_type"),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    width: integer("width"),
    height: integer("height"),
    durationSeconds: doublePrecision("duration_seconds"),
    /* link assets */
    externalUrl: text("external_url"),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("assets_ws_idx").on(t.workspaceId, t.uploadedAt),
    index("assets_ws_category_idx").on(t.workspaceId, t.category),
    index("assets_tags_idx").using("gin", t.tags),
    index("assets_request_idx").on(t.requestId),
  ],
);

/* ----------------------------------------------------------------- content */

export const contentItems = pgTable(
  "content_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    pillar: text("pillar"),
    format: contentFormat("format").notNull().default("reel"),
    status: contentStatus("status").notNull().default("idea"),
    /** Orders cards inside a pipeline column. */
    rank: doublePrecision("rank").notNull().default(0),
    brief: text("brief").notNull().default(""),
    script: text("script").notNull().default(""),
    caption: text("caption").notNull().default(""),
    internalNotes: text("internal_notes").notNull().default(""),
    /** Wall-clock date and time in the client's own zone. Deliberately not a timestamp. */
    scheduledDate: date("scheduled_date", { mode: "string" }),
    scheduledTime: text("scheduled_time"),
    publishingLink: text("publishing_link"),
    /** Goes up each time the piece is sent to the client. */
    reviewRound: integer("review_round").notNull().default(0),
    requestId: uuid("request_id"),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("content_ws_status_idx").on(t.workspaceId, t.status),
    index("content_ws_date_idx").on(t.workspaceId, t.scheduledDate),
  ],
);

export const contentAssets = pgTable(
  "content_assets",
  {
    contentItemId: uuid("content_item_id")
      .notNull()
      .references(() => contentItems.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    role: contentAssetRole("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.contentItemId, t.assetId, t.role] }), index("content_assets_asset_idx").on(t.assetId)],
);

export const contentRevisions = pgTable(
  "content_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contentItemId: uuid("content_item_id")
      .notNull()
      .references(() => contentItems.id, { onDelete: "cascade" }),
    kind: revisionKind("kind").notNull(),
    version: integer("version").notNull(),
    /** Full text for script and caption. */
    value: text("value"),
    /** The file for edited video and cover versions. */
    assetId: uuid("asset_id").references(() => assets.id, { onDelete: "set null" }),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("revisions_item_kind_version_idx").on(t.contentItemId, t.kind, t.version)],
);

export const approvals = pgTable(
  "approvals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contentItemId: uuid("content_item_id")
      .notNull()
      .references(() => contentItems.id, { onDelete: "cascade" }),
    decision: approvalDecision("decision").notNull(),
    round: integer("round").notNull(),
    note: text("note").notNull().default(""),
    decidedById: uuid("decided_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("approvals_item_idx").on(t.contentItemId, t.createdAt)],
);

export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    contentItemId: uuid("content_item_id").references(() => contentItems.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id").references(() => assets.id, { onDelete: "cascade" }),
    requestId: uuid("request_id"),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    /** Team-only comment. Never returned to a client. */
    internal: boolean("internal").notNull().default(false),
    /** Position in the video, in seconds, when pinned to a moment. */
    timecodeSeconds: doublePrecision("timecode_seconds"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("comments_item_idx").on(t.contentItemId, t.createdAt), index("comments_asset_idx").on(t.assetId, t.createdAt)],
);

/* ---------------------------------------------------------------- requests */

export const creativeRequests = pgTable(
  "creative_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    format: contentFormat("format").notNull().default("reel"),
    referenceLinks: text("reference_links").array().notNull().default(sql`'{}'::text[]`),
    priority: requestPriority("priority").notNull().default("normal"),
    desiredDate: date("desired_date", { mode: "string" }),
    status: requestStatus("status").notNull().default("new"),
    contentItemId: uuid("content_item_id").references(() => contentItems.id, { onDelete: "set null" }),
    submittedById: uuid("submitted_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("requests_ws_idx").on(t.workspaceId, t.createdAt)],
);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    status: taskStatus("status").notNull().default("todo"),
    dueDate: date("due_date", { mode: "string" }),
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    contentItemId: uuid("content_item_id").references(() => contentItems.id, { onDelete: "set null" }),
    requestId: uuid("request_id").references(() => creativeRequests.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("tasks_ws_status_idx").on(t.workspaceId, t.status)],
);

/* -------------------------------------------------------------- feed plan */

export const feedLayouts = pgTable(
  "feed_layouts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** The one layout the client can see. */
    sharedWithClient: boolean("shared_with_client").notNull().default(false),
    /** The one grid showing what is live on Instagram now. It is not a plan, so it never appears among the versions. */
    isCurrent: boolean("is_current").notNull().default(false),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("feed_layouts_ws_idx").on(t.workspaceId),
    uniqueIndex("feed_layouts_one_current_idx").on(t.workspaceId).where(sql`${t.isCurrent}`),
  ],
);

export const feedSlots = pgTable(
  "feed_slots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    layoutId: uuid("layout_id")
      .notNull()
      .references(() => feedLayouts.id, { onDelete: "cascade" }),
    /** Zero is the top-left tile, the newest post. */
    position: integer("position").notNull(),
    kind: feedSlotKind("kind").notNull().default("photo"),
    state: feedSlotState("state").notNull().default("draft"),
    /** Slides in order. For a reel, the video plus an optional cover image. */
    assetIds: uuid("asset_ids").array().notNull().default(sql`'{}'::uuid[]`),
    title: text("title").notNull().default(""),
    caption: text("caption").notNull().default(""),
    contentItemId: uuid("content_item_id").references(() => contentItems.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("feed_slots_layout_idx").on(t.layoutId, t.position)],
);

/* ------------------------------------------------- activity, notifications */

export const activity = pgTable(
  "activity",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    /** Plain past-tense sentence fragment, e.g. "approved the edit". */
    summary: text("summary").notNull(),
    contentItemId: uuid("content_item_id").references(() => contentItems.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id").references(() => assets.id, { onDelete: "set null" }),
    /** Team-only entries never reach the client. */
    internal: boolean("internal").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("activity_ws_idx").on(t.workspaceId, t.createdAt), index("activity_item_idx").on(t.contentItemId, t.createdAt)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    href: text("href").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.readAt, t.createdAt)],
);

/* --------------------------------------------------------------- reporting */

export const contentMetrics = pgTable(
  "content_metrics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contentItemId: uuid("content_item_id")
      .notNull()
      .references(() => contentItems.id, { onDelete: "cascade" }),
    capturedOn: date("captured_on", { mode: "string" }).notNull(),
    views: integer("views").notNull().default(0),
    reach: integer("reach").notNull().default(0),
    nonFollowerReach: integer("non_follower_reach").notNull().default(0),
    likes: integer("likes").notNull().default(0),
    comments: integer("comments").notNull().default(0),
    shares: integer("shares").notNull().default(0),
    saves: integer("saves").notNull().default(0),
    follows: integer("follows").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("metrics_item_day_idx").on(t.contentItemId, t.capturedOn)],
);

export const followerSnapshots = pgTable(
  "follower_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    capturedOn: date("captured_on", { mode: "string" }).notNull(),
    followers: integer("followers").notNull(),
  },
  (t) => [uniqueIndex("followers_ws_day_idx").on(t.workspaceId, t.capturedOn)],
);

/* ------------------------------------------------------------------- brand */

export const brandDocs = pgTable(
  "brand_docs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    position: integer("position").notNull().default(0),
    /** Off by default: the knowledge base holds working notes the client has not agreed to. */
    sharedWithClient: boolean("shared_with_client").notNull().default(false),
    updatedById: uuid("updated_by_id").references(() => users.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("brand_docs_ws_idx").on(t.workspaceId, t.position)],
);

/* ---------------------------------------------------------------------- ai */

export const aiThreads = pgTable(
  "ai_threads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    capability: text("capability").notNull(),
    title: text("title").notNull(),
    contentItemId: uuid("content_item_id").references(() => contentItems.id, { onDelete: "set null" }),
    requestId: uuid("request_id").references(() => creativeRequests.id, { onDelete: "set null" }),
    assetIds: uuid("asset_ids").array().notNull().default(sql`'{}'::uuid[]`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ai_threads_ws_idx").on(t.workspaceId, t.createdAt)],
);

export const aiMessages = pgTable(
  "ai_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => aiThreads.id, { onDelete: "cascade" }),
    role: aiRole("role").notNull(),
    /** Visible text. */
    text: text("text").notNull(),
    /** Exact API content blocks for assistant turns, replayed unchanged so thinking stays valid. */
    rawContent: jsonb("raw_content"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ai_messages_thread_idx").on(t.threadId, t.createdAt)],
);
