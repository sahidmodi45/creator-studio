import { eq } from "drizzle-orm";
import { InviteForm, ProfileForm, RemoveMemberButton } from "@/components/admin-forms";
import { db } from "@/db";
import { memberships, users } from "@/db/schema";
import { requireTeam } from "@/lib/auth";

export default async function TeamPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { workspace } = await requireTeam(slug);
  const members = await db
    .select({ id: users.id, name: users.name, email: users.email, role: memberships.role })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.workspaceId, workspace.id));

  return (
    <div className="stack-xl" style={{ maxWidth: 820 }}>
      <section className="stack">
        <div className="stack-sm">
          <p className="kicker">Instagram profile</p>
          <h1 className="display-sm">{workspace.name}</h1>
          <p className="muted small">Shown at the top of the feed preview. Type these in from Instagram when they change.</p>
        </div>
        <ProfileForm slug={slug} workspace={workspace} />
      </section>

      <section className="stack">
        <h2 className="section-title">Who has access</h2>
        {members.length === 0 ? (
          <p className="muted small">Only agency admins so far. Invite {workspace.clientFirstName} below.</p>
        ) : (
          <div>
            {members.map((member) => (
              <div key={member.id} className="list-row" data-testid="member-row">
                <div className="grow">
                  <p className="list-title">{member.name}</p>
                  <p className="muted small">{member.email} · {member.role === "client" ? "Client" : "Team member"}</p>
                </div>
                <RemoveMemberButton slug={slug} userId={member.id} name={member.name} />
              </div>
            ))}
          </div>
        )}
        <InviteForm slug={slug} />
      </section>
    </div>
  );
}
