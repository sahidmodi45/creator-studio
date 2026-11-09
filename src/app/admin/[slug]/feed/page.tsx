import { and, asc, eq, isNull } from "drizzle-orm";
import { FeedPlanner } from "@/components/feed-planner";
import { db } from "@/db";
import { contentItems, feedLayouts } from "@/db/schema";
import { requireTeam } from "@/lib/auth";
import { currentLayout, listAssets, loadSlots } from "@/lib/queries";

export default async function FeedPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ layout?: string }> }) {
  const { slug } = await params;
  const { workspace, user } = await requireTeam(slug);
  const requested = (await searchParams).layout;

  let layouts = await db
    .select({ id: feedLayouts.id, name: feedLayouts.name, sharedWithClient: feedLayouts.sharedWithClient })
    .from(feedLayouts)
    .where(and(eq(feedLayouts.workspaceId, workspace.id), eq(feedLayouts.isCurrent, false)))
    .orderBy(asc(feedLayouts.createdAt));

  if (layouts.length === 0) {
    layouts = await db
      .insert(feedLayouts)
      .values({ workspaceId: workspace.id, name: "Version 1", sharedWithClient: true, createdById: user.id })
      .returning({ id: feedLayouts.id, name: feedLayouts.name, sharedWithClient: feedLayouts.sharedWithClient });
  }

  const current = layouts.find((row) => row.id === requested) ?? layouts.find((row) => row.sharedWithClient) ?? layouts[0];
  const live = await currentLayout(workspace.id);
  const [slots, liveSlots, library, content] = await Promise.all([
    loadSlots(current.id, "team"),
    live ? loadSlots(live.id, "team") : [],
    listAssets(workspace.id, "team"),
    db
      .select({ id: contentItems.id, title: contentItems.title, caption: contentItems.caption, format: contentItems.format })
      .from(contentItems)
      .where(and(eq(contentItems.workspaceId, workspace.id), isNull(contentItems.deletedAt))),
  ]);

  return (
    <div className="stack-lg">
      <div className="stack-sm">
        <p className="kicker">Instagram</p>
        <h1 className="display-sm">What is coming, beside what is <em>live</em></h1>
      </div>
      <FeedPlanner
        key={current.id}
        slug={slug}
        workspaceId={workspace.id}
        layouts={layouts}
        layoutId={current.id}
        slots={slots}
        currentLayoutId={live?.id ?? null}
        currentSlots={liveSlots}
        library={library.map(({ id, title, mimeType, thumbnailKey, category }) => ({ id, title, mimeType, thumbnailKey, category }))}
        content={content}
        profile={{
          instagramHandle: workspace.instagramHandle,
          profileName: workspace.profileName,
          bio: workspace.bio,
          profileLink: workspace.profileLink,
          followers: workspace.followers,
          following: workspace.following,
          // Until the real count is typed in, the live grid is the best count there is.
          postCount: workspace.postCount ?? liveSlots.length,
          avatarAssetId: workspace.avatarAssetId,
          firstName: workspace.clientFirstName,
        }}
      />
    </div>
  );
}
