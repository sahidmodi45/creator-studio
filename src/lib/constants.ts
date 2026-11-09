/** Labels and lookups shared by both portals. Safe to import from client components. */

export const CONTENT_STATUSES = [
  "idea",
  "briefed",
  "in_production",
  "internal_review",
  "client_review",
  "revision_requested",
  "approved",
  "scheduled",
  "published",
] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export const STATUS_LABEL: Record<ContentStatus, string> = {
  idea: "Idea",
  briefed: "Briefed",
  in_production: "In Production",
  internal_review: "Internal Review",
  client_review: "Client Review",
  revision_requested: "Revision Requested",
  approved: "Approved",
  scheduled: "Scheduled",
  published: "Published",
};

/** What the client sees instead of the nine internal statuses. */
export const CLIENT_STATUS_LABEL: Record<ContentStatus, string> = {
  idea: "Planning",
  briefed: "Planning",
  in_production: "Being made",
  internal_review: "Being made",
  client_review: "Waiting for you",
  revision_requested: "Being updated",
  approved: "Approved",
  scheduled: "Going out soon",
  published: "Live",
};

/** Statuses at which the client may see the edit and cover. */
export const CLIENT_CAN_SEE_WORK: ContentStatus[] = ["client_review", "revision_requested", "approved", "scheduled", "published"];

export const FORMATS = ["reel", "carousel", "photo", "story"] as const;
export type ContentFormat = (typeof FORMATS)[number];
export const FORMAT_LABEL: Record<ContentFormat, string> = {
  reel: "Reel",
  carousel: "Carousel",
  photo: "Photo",
  story: "Story",
};

export const ASSET_CATEGORIES = [
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
] as const;
export type AssetCategory = (typeof ASSET_CATEGORIES)[number];
export const CATEGORY_LABEL: Record<AssetCategory, string> = {
  voiceover: "Voiceover",
  raw_video: "Raw video",
  edited_video: "Edited video",
  photo: "Photograph",
  screenshot: "Screenshot",
  design_reference: "Reference",
  document: "Document",
  external_link: "Link",
  brand_asset: "Brand file",
  live_post: "Live post",
};

/** The folders both portals show as boxes. A folder is a view over file categories. */
export const COLLECTIONS = {
  videos: { title: "Videos", categories: ["raw_video", "edited_video"], force: null, clientLine: "Raw clips and finished edits.", teamLine: "Raw clips and edits." },
  photos: { title: "Photos", categories: ["photo"], force: null, clientLine: "Your photos, all in one place.", teamLine: "Photographs from the client and the team." },
  voice: { title: "Voice", categories: ["voiceover"], force: null, clientLine: "Your voiceovers and voice notes.", teamLine: "Voiceovers and voice notes." },
  references: { title: "References", categories: ["design_reference", "screenshot", "external_link"], force: "design_reference", clientLine: "Things you love and want us to learn from.", teamLine: "Inspiration, screenshots and links." },
} as const satisfies Record<string, { title: string; categories: readonly AssetCategory[]; force: AssetCategory | null; clientLine: string; teamLine: string }>;
export type CollectionId = keyof typeof COLLECTIONS;
export function isCollection(value: string): value is CollectionId {
  return Object.keys(COLLECTIONS).includes(value);
}

export const ASSET_STATUSES = ["new", "in_use", "archived"] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];
export const ASSET_STATUS_LABEL: Record<AssetStatus | "uploading", string> = {
  uploading: "Uploading",
  new: "New",
  in_use: "In use",
  archived: "Archived",
};

export const CONTENT_ASSET_ROLES = ["voiceover", "raw_footage", "edited_video", "cover", "reference"] as const;
export type ContentAssetRole = (typeof CONTENT_ASSET_ROLES)[number];
export const ROLE_LABEL: Record<ContentAssetRole, string> = {
  voiceover: "Voiceover",
  raw_footage: "Raw footage",
  edited_video: "Edited video",
  cover: "Cover design",
  reference: "Reference materials",
};

/** Which role a file takes when it is attached to a piece because of its category. */
export function roleForCategory(category: AssetCategory): ContentAssetRole {
  switch (category) {
    case "voiceover":
      return "voiceover";
    case "raw_video":
    case "photo":
      return "raw_footage";
    case "edited_video":
      return "edited_video";
    default:
      return "reference";
  }
}

export function guessCategory(file: { type: string; name: string }): AssetCategory {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  if (type.startsWith("audio/") || /\.(m4a|mp3|wav|aac|ogg|flac)$/.test(name)) return "voiceover";
  if (type.startsWith("video/") || /\.(mov|mp4|m4v|webm|mkv|avi)$/.test(name)) return "raw_video";
  if (name.includes("screenshot") || name.includes("screen shot")) return "screenshot";
  if (type.startsWith("image/") || /\.(heic|heif|jpe?g|png|webp|gif)$/.test(name)) return "photo";
  return "document";
}

export const PRIORITIES = ["low", "normal", "high"] as const;
export type Priority = (typeof PRIORITIES)[number];
export const PRIORITY_LABEL: Record<Priority, string> = { low: "Whenever", normal: "Soon", high: "Urgent" };

export const REQUEST_STATUS_LABEL = {
  new: "New",
  in_progress: "In progress",
  done: "Done",
  declined: "Declined",
} as const;

export const FEED_VIEW_SIZES = [9, 12, 18, 30] as const;

/** 5 GB is the most a single signed upload can carry on S3-style storage. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024 * 1024;

export function isPlayableVideo(mime: string | null | undefined) {
  return !!mime && mime.startsWith("video/");
}
export function isPlayableAudio(mime: string | null | undefined) {
  return !!mime && mime.startsWith("audio/");
}
export function isImage(mime: string | null | undefined) {
  return !!mime && mime.startsWith("image/");
}
