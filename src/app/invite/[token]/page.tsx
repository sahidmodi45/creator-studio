import { and, eq, gt, isNull } from "drizzle-orm";
import Link from "next/link";
import { AcceptInviteForm } from "@/components/auth-forms";
import { db } from "@/db";
import { invites } from "@/db/schema";
import { hashToken } from "@/lib/auth";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [invite] = await db
    .select({ email: invites.email, name: invites.name })
    .from(invites)
    .where(and(eq(invites.tokenHash, hashToken(token)), isNull(invites.acceptedAt), gt(invites.expiresAt, new Date())));

  return (
    <main className="auth">
      <div className="auth-card">
        {invite ? (
          <>
            <p className="kicker">You are invited</p>
            <h1 className="display">Come <em>in</em></h1>
            <AcceptInviteForm token={token} name={invite.name} email={invite.email} />
          </>
        ) : (
          <>
            <p className="kicker">This link is no longer valid</p>
            <h1 className="display">Ask for a <em>new one</em></h1>
            <p className="muted">Invite links work once and expire after seven days.</p>
            <Link className="btn" href="/login">Go to sign in</Link>
          </>
        )}
      </div>
    </main>
  );
}
