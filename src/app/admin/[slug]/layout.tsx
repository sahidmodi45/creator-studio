import { and, count, eq, isNull } from "drizzle-orm";
import Link from "next/link";
import { RailNav, type RailGroup } from "@/components/rail-nav";
import { WorkspaceTheme } from "@/components/workspace-theme";
import { NotificationBell } from "@/components/ui";
import { db } from "@/db";
import { assets, creativeRequests, tasks } from "@/db/schema";
import { UploadsProvider } from "@/components/uploads-gate";
import { signOut } from "@/lib/actions/auth";
import { requireTeam } from "@/lib/auth";
import { uploadsEnabled } from "@/lib/storage";
import { unreadCount } from "@/lib/queries";

export default async function AdminWorkspaceLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { user, workspace } = await requireTeam(slug);
  const base = `/admin/${slug}`;

  const [unread, [newFiles], [newRequests], [openTasks]] = await Promise.all([
    unreadCount(user.id, workspace.id),
    db.select({ value: count() }).from(assets).where(and(eq(assets.workspaceId, workspace.id), eq(assets.status, "new"), isNull(assets.deletedAt))),
    db.select({ value: count() }).from(creativeRequests).where(and(eq(creativeRequests.workspaceId, workspace.id), eq(creativeRequests.status, "new"))),
    db.select({ value: count() }).from(tasks).where(and(eq(tasks.workspaceId, workspace.id), eq(tasks.status, "todo"))),
  ]);

  const first = workspace.clientFirstName;
  const groups: RailGroup[] = [
    {
      items: [
        { id: "home", href: base, exact: true, label: "Home", hint: "Everything at a glance" },
        { id: "requests", href: `${base}/requests`, label: `From ${first}`, hint: "Ideas and asks she sends", count: newRequests.value },
        { id: "tasks", href: `${base}/tasks`, label: "Tasks", hint: "Our to-do list", count: openTasks.value },
      ],
    },
    {
      label: "Work",
      items: [
        { id: "pipeline", href: `${base}/pipeline`, label: "In the making", hint: "Every post, idea to live" },
        { id: "scripts", href: `${base}/scripts`, label: "Scripts", hint: "Hooks, scripts, captions" },
        { id: "calendar", href: `${base}/calendar`, label: "Calendar", hint: "What goes out when" },
        { id: "feed", href: `${base}/feed`, label: "Feed preview", hint: "How her grid will look" },
      ],
    },
    {
      label: "Files",
      items: [{ id: "files", href: `${base}/library`, label: "Files", hint: "Videos, photos, voice, references", count: newFiles.value }],
    },
    {
      label: "Brand",
      items: [
        { id: "brand", href: `${base}/brand`, label: "Brand", hint: "Colours, fonts, voice" },
        { id: "results", href: `${base}/reports`, label: "Results", hint: "How posts are doing" },
        { id: "assistant", href: `${base}/assistant`, label: "Assistant", hint: "Ask about her brand" },
        { id: "team", href: `${base}/team`, label: "Team", hint: "Who has access" },
      ],
    },
  ];

  return (
    <UploadsProvider enabled={uploadsEnabled()}>
    <div className="admin-shell">
      <WorkspaceTheme colors={workspace.brandColors} fonts={workspace.brandFonts} />
      <aside className="rail">
        <div className="row-between">
          <Link href={base} className="brandmark">{workspace.clientFirstName} <em>Studio</em></Link>
          <NotificationBell href={`${base}/notifications`} initial={unread} workspaceId={workspace.id} />
        </div>
        <RailNav groups={groups} />
        <div className="rail-footer">
          <Link className="plain-link muted" href={`/w/${slug}`}>See what {workspace.clientFirstName} sees</Link>
          <Link className="plain-link muted" href="/admin">All clients</Link>
          <form action={signOut}>
            <button className="btn btn-ghost btn-sm" style={{ padding: 0 }}>Sign out, {user.name.split(" ")[0]}</button>
          </form>
        </div>
      </aside>
      <main className="admin-main">{children}</main>
    </div>
    </UploadsProvider>
  );
}
