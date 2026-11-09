import { LogOut } from "lucide-react";
import Link from "next/link";
import { NavLink, NotificationBell } from "@/components/ui";
import { UploadsProvider } from "@/components/uploads-gate";
import { signOut } from "@/lib/actions/auth";
import { requireWorkspace } from "@/lib/auth";
import { uploadsEnabled } from "@/lib/storage";
import { unreadCount, waitingOnClientCount } from "@/lib/queries";

export default async function ClientLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { user, workspace, isTeam } = await requireWorkspace(slug);
  const [unread, waiting] = await Promise.all([unreadCount(user.id, workspace.id), waitingOnClientCount(workspace.id)]);
  const base = `/w/${slug}`;

  return (
    <UploadsProvider enabled={uploadsEnabled()}>
    <div className="client-shell">
      {isTeam && (
        <div className="row-between small" style={{ background: "var(--ink)", color: "#fff", padding: "6px 20px" }}>
          <span>You are seeing what {workspace.clientFirstName} sees.</span>
          <Link href={`/admin/${slug}`} className="link" style={{ color: "var(--blush)" }}>Back to the team view</Link>
        </div>
      )}
      <header className="masthead">
        <div className="masthead-top">
          <span />
          <Link href={base} className="brandmark">
            {workspace.clientFirstName} <em>Studio</em>
          </Link>
          <div className="masthead-right">
            <NotificationBell href={`${base}/notifications`} initial={unread} workspaceId={workspace.id} />
            <form action={signOut}>
              <button className="icon-btn" aria-label="Sign out" title="Sign out">
                <LogOut size={17} />
              </button>
            </form>
          </div>
        </div>
        <nav className="masthead-nav" aria-label="Main">
          <NavLink href={base} exact>Home</NavLink>
          <NavLink href={`${base}/review`}>
            Review{waiting > 0 && <span className="nav-count">{waiting}</span>}
          </NavLink>
          <NavLink href={`${base}/upload`}>Send files</NavLink>
          <NavLink href={`${base}/ideas`}>Share an idea</NavLink>
        </nav>
      </header>
      {children}
    </div>
    </UploadsProvider>
  );
}
