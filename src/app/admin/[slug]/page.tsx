import { and, asc, count, eq, isNull } from "drizzle-orm";
import { BarChart3, Bookmark, Calendar, Clapperboard, FileText, FolderOpen, Image as ImageIcon, LayoutGrid, ListChecks, Mic, Palette, Radio, Sparkles, Users, Video, Lightbulb } from "lucide-react";
import Link from "next/link";
import { Box, BoxLine, MiniFeed, Swatches, Thumbs } from "@/components/boxes";
import { db } from "@/db";
import { brandDocs, contentItems, creativeRequests, feedLayouts, tasks } from "@/db/schema";
import { requireTeam } from "@/lib/auth";
import { COLLECTIONS, STATUS_LABEL, type CollectionId } from "@/lib/constants";
import { formatCount, formatDayShort, formatDayWeekday, timeAgo, todayString } from "@/lib/format";
import { currentLayout, latestMetrics, listActivity, listAssets, loadSlots, sharedLayout } from "@/lib/queries";

const ICON = { size: 20, strokeWidth: 1.6 };

export default async function AdminHome({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { workspace } = await requireTeam(slug);
  const base = `/admin/${slug}`;
  const today = todayString();
  const first = workspace.clientFirstName;

  const [items, files, requests, openTasks, feed, shared, live, anyLayout, [brandCount], results] = await Promise.all([
    db
      .select({ id: contentItems.id, title: contentItems.title, status: contentItems.status, script: contentItems.script, caption: contentItems.caption, scheduledDate: contentItems.scheduledDate })
      .from(contentItems)
      .where(and(eq(contentItems.workspaceId, workspace.id), isNull(contentItems.deletedAt)))
      .orderBy(asc(contentItems.scheduledDate)),
    listAssets(workspace.id, "team"),
    db.select({ title: creativeRequests.title }).from(creativeRequests).where(and(eq(creativeRequests.workspaceId, workspace.id), eq(creativeRequests.status, "new"))),
    db.select({ title: tasks.title }).from(tasks).where(and(eq(tasks.workspaceId, workspace.id), eq(tasks.status, "todo"))).orderBy(asc(tasks.dueDate)),
    listActivity({ workspaceId: workspace.id }, "team", 8),
    sharedLayout(workspace.id),
    currentLayout(workspace.id),
    db.select({ id: feedLayouts.id }).from(feedLayouts).where(and(eq(feedLayouts.workspaceId, workspace.id), eq(feedLayouts.isCurrent, false))).limit(1),
    db.select({ value: count() }).from(brandDocs).where(eq(brandDocs.workspaceId, workspace.id)),
    latestMetrics(workspace.id),
  ]);
  const layoutId = shared?.id ?? anyLayout[0]?.id;
  const slots = layoutId ? await loadSlots(layoutId, "team") : [];
  const liveSlots = live ? await loadSlots(live.id, "team") : [];

  const inFolder = (id: CollectionId) => files.filter((file) => (COLLECTIONS[id].categories as readonly string[]).includes(file.category));
  const videos = inFolder("videos");
  const photos = inFolder("photos");
  const voice = inFolder("voice");
  const references = inFolder("references");
  const newFiles = files.filter((file) => file.status === "new");

  const revisions = items.filter((item) => item.status === "revision_requested");
  const withClient = items.filter((item) => item.status === "client_review");
  const noWords = items.filter((item) => !item.script.trim() || !item.caption.trim());
  const upcoming = items.filter((item) => item.scheduledDate && item.scheduledDate >= today && item.status !== "published");
  const overdue = items.filter((item) => item.scheduledDate && item.scheduledDate < today && item.status !== "published");
  const unapprovedSoon = upcoming.slice(0, 6).filter((item) => !["approved", "scheduled"].includes(item.status));
  const saves = results.reduce((sum, { metric }) => sum + metric.saves, 0);

  return (
    <div className="stack-lg">
      <div className="stack-sm">
        <p className="kicker">{workspace.name}</p>
        <h1 className="display">{first} <em>Studio</em></h1>
      </div>

      {(overdue.length > 0 || unapprovedSoon.length > 0) && (
        <section className="card stack-sm" style={{ background: "var(--warn-soft)", borderColor: "transparent" }} data-testid="needs-decision">
          <h2 className="section-title">Needs a decision</h2>
          {overdue.map((item) => (
            <Link key={item.id} className="plain-link small" href={`${base}/content/${item.id}`}>
              <b>{item.title}</b> was due {formatDayShort(item.scheduledDate)} and is still {STATUS_LABEL[item.status]}.
            </Link>
          ))}
          {unapprovedSoon.map((item) => (
            <Link key={item.id} className="plain-link small" href={`${base}/content/${item.id}`}>
              <b>{item.title}</b> is planned for {formatDayShort(item.scheduledDate)} and is not approved yet.
            </Link>
          ))}
        </section>
      )}

      <div className="boxes four">
        <Box id="pipeline" href={`${base}/pipeline`} title="Pipeline" icon={<Clapperboard {...ICON} />} tone={revisions.length ? "beet" : ""} count={items.length || undefined}>
          <BoxLine>{revisions.length} {revisions.length === 1 ? "revision" : "revisions"} to make · {withClient.length} with {first}</BoxLine>
        </Box>

        <Box id="feed" href={`${base}/feed`} title="Feed preview" icon={<LayoutGrid {...ICON} />} size="tall">
          {slots.length ? <MiniFeed slots={slots} /> : <BoxLine quiet>Plan how the next posts sit together.</BoxLine>}
        </Box>

        <Box id="current" href={`${base}/feed#current`} title="Current feed" icon={<Radio {...ICON} />} size="tall">
          {liveSlots.length ? <MiniFeed slots={liveSlots.map((slot, position) => ({ ...slot, position }))} /> : <BoxLine quiet>Add the posts live on her profile now.</BoxLine>}
        </Box>

        <Box id="requests" href={`${base}/requests`} title="Ideas" icon={<Lightbulb {...ICON} />} tone={requests.length ? "blush" : ""} count={requests.length ? `${requests.length} new` : undefined}>
          <BoxLine quiet={!requests.length}>{requests.length ? requests[0].title : `Nothing new from ${first}.`}</BoxLine>
        </Box>

        <Box id="tasks" href={`${base}/tasks`} title="Tasks" icon={<ListChecks {...ICON} />} count={openTasks.length || undefined}>
          <BoxLine quiet={!openTasks.length}>{openTasks.length ? openTasks[0].title : "Nothing to do."}</BoxLine>
        </Box>

        <Box id="videos" href={`${base}/videos`} title="Videos" icon={<Video {...ICON} />} count={videos.length || undefined}>
          <Thumbs assets={videos} empty="Raw clips and edits." />
        </Box>

        <Box id="photos" href={`${base}/photos`} title="Photos" icon={<ImageIcon {...ICON} />} count={photos.length || undefined}>
          <Thumbs assets={photos} empty="Photographs live here." />
        </Box>

        <Box id="voice" href={`${base}/voice`} title="Voice" icon={<Mic {...ICON} />} count={voice.length || undefined}>
          <BoxLine quiet={!voice.length}>{voice.length ? voice[0].title : "Voiceovers and how she sounds."}</BoxLine>
        </Box>

        <Box id="references" href={`${base}/references`} title="References" icon={<Bookmark {...ICON} />} count={references.length || undefined}>
          <Thumbs assets={references} empty="Inspiration and links." />
        </Box>

        <Box id="scripts" href={`${base}/scripts`} title="Scripts" icon={<FileText {...ICON} />} count={noWords.length ? `${noWords.length} to write` : undefined}>
          <BoxLine quiet={!noWords.length}>{noWords.length ? noWords[0].title : "Scripts and captions, all together."}</BoxLine>
        </Box>

        <Box id="calendar" href={`${base}/calendar`} title="Calendar" icon={<Calendar {...ICON} />}>
          {upcoming.length ? (
            <>
              <p className="big-date">{formatDayWeekday(upcoming[0].scheduledDate)}</p>
              <BoxLine>{upcoming[0].title}</BoxLine>
            </>
          ) : (
            <BoxLine quiet>Nothing scheduled.</BoxLine>
          )}
        </Box>

        <Box id="brand" href={`${base}/brand`} title="Brand identity" icon={<Palette {...ICON} />} count={brandCount.value ? `${brandCount.value} sections` : undefined}>
          {workspace.brandColors.length ? <Swatches colors={workspace.brandColors} /> : <BoxLine quiet>Add colours, fonts and logos.</BoxLine>}
        </Box>

        <Box id="assistant" href={`${base}/assistant`} title="Assistant" icon={<Sparkles {...ICON} />} size="wide">
          <BoxLine quiet>Ideas, scripts, captions and reviews in {first}&apos;s voice.</BoxLine>
        </Box>

        <Box id="results" href={`${base}/reports`} title="Results" icon={<BarChart3 {...ICON} />}>
          <BoxLine quiet={!results.length}>{results.length ? `${formatCount(saves)} saves across ${results.length} ${results.length === 1 ? "post" : "posts"}` : "Add numbers from Instagram."}</BoxLine>
        </Box>

        <Box id="files" href={newFiles.length ? `${base}/library?status=new` : `${base}/library`} title="All files" icon={<FolderOpen {...ICON} />} count={files.length || undefined}>
          <BoxLine quiet={!newFiles.length}>{newFiles.length ? `${newFiles.length} new to sort` : "Search everything."}</BoxLine>
        </Box>

        <Box id="team" href={`${base}/team`} title="Profile and team" icon={<Users {...ICON} />} size="wide">
          <BoxLine quiet>Instagram details and who has access.</BoxLine>
        </Box>
      </div>

      <section className="stack-sm">
        <h2 className="section-title">Latest activity</h2>
        {feed.length === 0 ? (
          <p className="muted small">Nothing has happened yet.</p>
        ) : (
          <div>
            {feed.map((entry) => (
              <div key={entry.id} className="timeline-item">
                <span><b>{entry.actor ?? "Someone"}</b> {entry.summary}</span>
                <span className="when">{timeAgo(entry.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
