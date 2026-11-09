/**
 * The public address of the studio, used for invite and password links and to decide
 * whether sign-in cookies are secure. Order: APP_URL, then Netlify's own URL, then
 * localhost, but localhost only outside production, so a live site never sends a
 * link that points at someone's laptop.
 */
export function appUrl() {
  const value = process.env.APP_URL || process.env.URL;
  if (value) return value.replace(/\/$/, "");
  if (process.env.NODE_ENV === "production") throw new Error("APP_URL is not set. Set it to the site's https address.");
  return "http://localhost:3100";
}
