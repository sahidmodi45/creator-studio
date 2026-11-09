/** Builds the weeks of a month view, Monday first, using plain date strings so no timezone can shift a day. */

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function monthParam(raw: string | undefined, today: string) {
  return raw && /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) ? raw : today.slice(0, 7);
}

export function shiftMonth(month: string, delta: number) {
  const [year, m] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, m - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`;
}

export function monthTitle(month: string) {
  const [year, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, m - 1, 1)));
}

export function monthDays(month: string) {
  const [year, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(year, m - 1, 1));
  const start = new Date(first);
  start.setUTCDate(1 - ((first.getUTCDay() + 6) % 7));
  const days: { date: string; day: number; inMonth: boolean }[] = [];
  const cursor = new Date(start);
  do {
    for (let i = 0; i < 7; i += 1) {
      days.push({ date: cursor.toISOString().slice(0, 10), day: cursor.getUTCDate(), inMonth: cursor.getUTCMonth() === m - 1 });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  } while (cursor.getUTCMonth() === m - 1);
  return days;
}

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
