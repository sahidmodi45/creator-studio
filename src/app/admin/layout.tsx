import { requireAgency } from "@/lib/auth";

/**
 * Server-side gate for everything under /admin, including pages added later.
 * A client login has no team role, so it gets a 404 here before any admin page or data loads.
 * Each workspace page also checks requireTeam for its own workspace.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAgency();
  return children;
}
