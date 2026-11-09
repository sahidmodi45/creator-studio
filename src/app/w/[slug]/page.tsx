import { and, asc, count, eq } from "drizzle-orm";
import { Radio, BarChart3, BookOpen, Calendar, Clapperboard, FileText, FolderOpen, Image as ImageIcon, Lightbulb, LayoutGrid, Mic, Palette, Bookmark, Video } from "lucide-react";
import { Box, BoxLine, MiniFeed, Swatches, Thumbs } from "@/components/boxes";
import { db } from "@/db";
import { brandDocs, creativeRequests } from "@/db/schema";
import { requireWorkspace } from "@/lib/auth";
import { CLIENT_CAN_SEE_WORK, CLIENT_STATUS_LABEL, COLLECTIONS, type CollectionId } from "@/lib/constants";
import { formatCount, formatDayWeekday, todayString } from "@/lib/format";
import { clientContentList, currentLayout, latestMetrics, listAssets, loadSlots, sharedLayout } from "@/lib/queries";

function greeting() {
  const local = (new Date().getUTCHours() + 5.5) % 24; // Her working day runs on India time.
  if (local < 12) return "Good morning";
  if (local < 17) return "Good afternoon";
  return "Good evening";
}

const ICON = { size: 20, strokeWidth: 1.6 };

export default async function ClientHome({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { workspace } = await requireWorkspace(slug);
  const base = `/w/${slug}`;

  const [items, files, layout, live, [ideas], [brandSections], results] = await Promise.all([
    clientContentList(workspace.id),
    listAssets(workspace.id, "client"),
    sharedLayout(workspace.id),
    currentLayout(workspace.id),
    db.select({ value: count() }).from(creativeRequests).where(eq(creativeRequests.workspaceId, workspace.id)),
    db.select({ value: count() }).from(brandDocs).where(and(eq(brandDocs.workspaceId, workspace.id), eq(brandDocs.sharedWithClient, true))).orderBy(asc(count())),
    latestMetrics(workspace.id),
  ]);
  const slots = layout ? (await loadSlots(layout.id, "client")).filter((slot) => slot.media.length > 0) : [];
  const liveSlots = live ? (await loadSlots(live.id, "client")).filter((slot) => slot.media.length > 0) : [];

  const inFolder = (id: CollectionId) => files.filter((file) => (COLLECTIONS[id].categories as readonly string[]).includes(file.category));
  const videos = inFolder("videos");
  const photos = inFolder("photos");
  const voice = inFolder("voice");
  const references = inFolder("references");

  const waiting = items.filter((item) => item.status === "client_review");
  const making = items.filter((item) => ["in_production", "internal_review", "revision_requested", "idea", "briefed"].includes(item.status));
  const scripts = items.filter((item) => CLIENT_CAN_SEE_WORK.includes(item.status) && (item.script || item.caption));
  const today = todayString();
  const next = items
    .filter((item) => item.scheduledDate && item.scheduledDate >= today && item.status !== "published")
    .sort((a, b) => a.scheduledDate!.localeCompare(b.scheduledDate!))[0];
  const saves = results.filter(({ item }) => CLIENT_CAN_SEE_WORK.includes(item.status)).reduce((sum, { metric }) => sum + metric.saves, 0);

  return (
    <main className="client-main stack-lg">
      <section className="stack-sm">
        <p className="kicker">{greeting()}, {workspace.clientFirstName}</p>
        <h1 className="display">
          {waiting.length > 0 ? (
            <>{waiting.length === 1 ? "One piece is" : `${waiting.length} pieces are`} <em>waiting for you</em></>
          ) : (
            <>What are we <em>making</em> next?</>
          )}
        </h1>
      </section>

      <div className="boxes">
        <Box id="review" href={`${base}/review`} title="Review" icon={<Clapperboard {...ICON} />} tone={waiting.length ? "beet" : ""} count={waiting.length || undefined} example={!waiting.length && "review"}>
          {waiting.length ? <BoxLine>{waiting[0].title}</BoxLine> : <BoxLine quiet>All caught up. We will tell you when something is ready.</BoxLine>}
        </Box>

        <Box id="feed" href={`${base}/feed`} title="Feed preview" icon={<LayoutGrid {...ICON} />} size="tall" example={!slots.length && "feed"}>
          {slots.length ? <MiniFeed slots={slots.map((slot, position) => ({ ...slot, position }))} /> : <BoxLine quiet>Your next posts will show up here as they are planned.</BoxLine>}
        </Box>

        <Box id="current" href={`${base}/feed#current`} title="Current feed" icon={<Radio {...ICON} />} size="tall" example={!liveSlots.length && "current"}>
          {liveSlots.length ? <MiniFeed slots={liveSlots.map((slot, position) => ({ ...slot, position }))} /> : <BoxLine quiet>What is on your profile now. Your team will add it here.</BoxLine>}
        </Box>

        <Box id="ideas" href={`${base}/ideas`} title="Share an idea" icon={<Lightbulb {...ICON} />} tone="blush" count={ideas.value || undefined}>
          <BoxLine>A reel you loved, a recipe to try, a thought from dinner.</BoxLine>
        </Box>

        <Box id="videos" href={`${base}/videos`} title="Videos" icon={<Video {...ICON} />} count={videos.length || undefined} example={!videos.length && "videos"}>
          <Thumbs assets={videos} empty="Drop in your raw clips here." />
        </Box>

        <Box id="photos" href={`${base}/photos`} title="Photos" icon={<ImageIcon {...ICON} />} count={photos.length || undefined} example={!photos.length && "photos"}>
          <Thumbs assets={photos} empty="Drop in your photos here." />
        </Box>

        <Box id="voice" href={`${base}/voice`} title="Voice" icon={<Mic {...ICON} />} count={voice.length || undefined} example={!voice.length && "voice"}>
          <BoxLine quiet={!voice.length}>{voice.length ? voice[0].title : "Send voiceovers and voice notes here."}</BoxLine>
        </Box>

        <Box id="references" href={`${base}/references`} title="References" icon={<Bookmark {...ICON} />} count={references.length || undefined} example={!references.length && "references"}>
          <Thumbs assets={references} empty="Anything you love and want us to see." />
        </Box>

        <Box id="scripts" href={`${base}/scripts`} title="Scripts" icon={<FileText {...ICON} />} count={scripts.length || undefined} example={!scripts.length && "scripts"}>
          <BoxLine quiet={!scripts.length}>{scripts.length ? scripts[0].title : "Scripts and captions appear here when they are ready for you."}</BoxLine>
        </Box>

        <Box id="brand" href={`${base}/brand`} title="Brand identity" icon={<Palette {...ICON} />} example={!workspace.brandColors.length && "brand"}>
          {workspace.brandColors.length > 0 ? (
            <Swatches colors={workspace.brandColors} />
          ) : (
            <BoxLine quiet>{brandSections.value ? `${brandSections.value} ${brandSections.value === 1 ? "section" : "sections"} to read` : "Your look, your voice and what you stand for."}</BoxLine>
          )}
        </Box>

        <Box id="calendar" href={`${base}/calendar`} title="Calendar" icon={<Calendar {...ICON} />} example={!next && "calendar"}>
          {next ? (
            <>
              <p className="big-date">{formatDayWeekday(next.scheduledDate)}</p>
              <BoxLine>{next.title}</BoxLine>
            </>
          ) : (
            <BoxLine quiet>Nothing on the calendar yet.</BoxLine>
          )}
        </Box>

        <Box id="making" href={`${base}/making`} title="In the making" icon={<BookOpen {...ICON} />} count={making.length || undefined} example={!making.length && "pipeline"}>
          {making.length ? (
            <BoxLine>{making[0].title} · {CLIENT_STATUS_LABEL[making[0].status]}</BoxLine>
          ) : (
            <BoxLine quiet>Nothing in production right now.</BoxLine>
          )}
        </Box>

        <Box id="results" href={`${base}/results`} title="Results" icon={<BarChart3 {...ICON} />} example={!results.length && "results"}>
          {results.length ? <BoxLine>{formatCount(saves)} saves across your posts</BoxLine> : <BoxLine quiet>How your posts are doing, once they are live.</BoxLine>}
        </Box>

        <Box id="files" href={`${base}/files`} title="All files" icon={<FolderOpen {...ICON} />} count={files.length || undefined} size="full">
          <BoxLine quiet>Everything in one place, searchable.</BoxLine>
        </Box>
      </div>
    </main>
  );
}
