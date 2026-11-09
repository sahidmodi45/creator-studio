import { FeedPreview } from "@/components/instagram";
import { requireWorkspace } from "@/lib/auth";
import { currentLayout, loadSlots, sharedLayout } from "@/lib/queries";

export default async function ClientFeed({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { workspace } = await requireWorkspace(slug);
  const [planned, live] = await Promise.all([sharedLayout(workspace.id), currentLayout(workspace.id)]);
  const [slots, liveSlots] = await Promise.all([planned ? loadSlots(planned.id, "client") : [], live ? loadSlots(live.id, "client") : []]);
  const coming = slots.filter((slot) => slot.media.length > 0);
  const current = liveSlots.filter((slot) => slot.media.length > 0);
  const profile = {
    instagramHandle: workspace.instagramHandle,
    profileName: workspace.profileName,
    bio: workspace.bio,
    profileLink: workspace.profileLink,
    followers: workspace.followers,
    following: workspace.following,
    postCount: workspace.postCount ?? current.length,
    avatarAssetId: workspace.avatarAssetId,
    firstName: workspace.clientFirstName,
  };

  return (
    <main className="client-main stack-lg">
      <div className="stack-sm">
        <h1 className="display-sm">How it will <em>look</em></h1>
        <p className="muted">What is coming next, beside what is on your profile now. Tap any post to see it up close.</p>
      </div>
      <div className="feed-compare">
        <section className="stack-sm">
          <h2 className="section-title">Feed preview</h2>
          <p className="muted tiny feed-controls-client">Your next posts. Nothing here is live yet.</p>
          {coming.length ? (
            <FeedPreview slots={coming} profile={profile} />
          ) : (
            <div className="empty"><p className="small">Your next posts will show up here as the team plans them.</p></div>
          )}
        </section>
        <section className="stack-sm" id="current">
          <h2 className="section-title">Current feed</h2>
          <p className="muted tiny feed-controls-client">What is on Instagram now.</p>
          {current.length ? (
            <FeedPreview slots={current} profile={profile} testId="current-feed" tileTestId="current-tile" plannedCount={0} />
          ) : (
            <div className="empty"><p className="small">Your team will add your live posts here.</p></div>
          )}
        </section>
      </div>
    </main>
  );
}
