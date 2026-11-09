import { NotificationsView } from "@/components/notifications-view";
import { requireWorkspace } from "@/lib/auth";
import { listNotifications } from "@/lib/queries";

export default async function ClientNotifications({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { user, workspace } = await requireWorkspace(slug);
  const rows = await listNotifications(user.id, workspace.id);
  return (
    <main className="client-main narrow stack-lg">
      <div className="stack-sm">
        <p className="kicker">Notifications</p>
        <h1 className="display-sm">What needs <em>you</em></h1>
      </div>
      <NotificationsView rows={rows} />
    </main>
  );
}
