/** Display helpers. Safe to import from client components. */

export function formatBytes(bytes: number | null | undefined) {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

export function formatDuration(seconds: number | null | undefined) {
  if (seconds == null || !Number.isFinite(seconds)) return "";
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const SHORT_DATE_FORMAT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const WEEKDAY_FORMAT = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/** A wall-clock date string such as 2026-11-05. */
export function formatDay(day: string | null | undefined) {
  if (!day) return "";
  return DATE_FORMAT.format(new Date(`${day}T00:00:00Z`));
}
export function formatDayShort(day: string | null | undefined) {
  if (!day) return "";
  return SHORT_DATE_FORMAT.format(new Date(`${day}T00:00:00Z`));
}
export function formatDayWeekday(day: string | null | undefined) {
  if (!day) return "";
  return WEEKDAY_FORMAT.format(new Date(`${day}T00:00:00Z`));
}

/** A stored instant. Formatted in UTC so server and browser always render the same text. */
export function formatInstant(value: Date | string | null | undefined) {
  if (!value) return "";
  return DATE_FORMAT.format(new Date(value));
}

export function timeAgo(value: Date | string, now = Date.now()) {
  const seconds = Math.max(0, Math.round((now - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days} day${days === 1 ? "" : "s"} ago`;
  return formatInstant(value);
}

export function formatCount(value: number | null | undefined) {
  if (value == null) return "–";
  return new Intl.NumberFormat("en-IN").format(value);
}

export function todayString() {
  return new Date().toISOString().slice(0, 10);
}

export function slugify(input: string) {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function titleFromFileName(name: string) {
  const base = name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  return base.length ? base : name;
}
