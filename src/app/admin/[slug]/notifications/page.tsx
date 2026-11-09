import { NotificationsView } from "@/components/notifications-view";
import { requireTeam } from "@/lib/auth";
import { listNotifications } from "@/lib/queries";

export default async function AdminNotifications({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { user, workspace } = await requireTeam(slug);
  const rows = await listNotifications(user.id, workspace.id);
  return (
    <div className="stack-lg" style={{ maxWidth: 760 }}>
      <div className="stack-sm">
        <p className="kicker">Notifications</p>
        <h1 className="display-sm">What just <em>happened</em></h1>
      </div>
      <NotificationsView rows={rows} />
    </div>
  );
}
