import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { Assistant } from "@/components/assistant";
import { db } from "@/db";
import { aiMessages, aiThreads, contentItems, creativeRequests } from "@/db/schema";
import { requireTeam } from "@/lib/auth";
import { CAPABILITY_IDS, type CapabilityId } from "@/lib/ai/capabilities";
import { listAssets } from "@/lib/queries";

type Search = { capability?: string; request?: string; piece?: string; thread?: string };

export default async function AssistantPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Search> }) {
  const { slug } = await params;
  const { workspace } = await requireTeam(slug);
  const search = await searchParams;

  const [pieces, requests, files, threads] = await Promise.all([
    db
      .select({ id: contentItems.id, title: contentItems.title })
      .from(contentItems)
      .where(and(eq(contentItems.workspaceId, workspace.id), isNull(contentItems.deletedAt)))
      .orderBy(desc(contentItems.updatedAt)),
    db
      .select({ id: creativeRequests.id, title: creativeRequests.title })
      .from(creativeRequests)
      .where(eq(creativeRequests.workspaceId, workspace.id))
      .orderBy(desc(creativeRequests.createdAt)),
    listAssets(workspace.id, "team"),
    db
      .select({ id: aiThreads.id, title: aiThreads.title, capability: aiThreads.capability, contentItemId: aiThreads.contentItemId })
      .from(aiThreads)
      .where(eq(aiThreads.workspaceId, workspace.id))
      .orderBy(desc(aiThreads.createdAt))
      .limit(20),
  ]);

  const openThread = search.thread ? threads.find((thread) => thread.id === search.thread) : undefined;
  const turns = openThread
    ? await db
        .select({ role: aiMessages.role, text: aiMessages.text })
        .from(aiMessages)
        .where(eq(aiMessages.threadId, openThread.id))
        .orderBy(asc(aiMessages.createdAt))
    : [];

  const requested = openThread?.capability ?? search.capability;
  const capability: CapabilityId = CAPABILITY_IDS.includes(requested as CapabilityId) ? (requested as CapabilityId) : "ideas";

  return (
    <div className="stack-lg">
      <p className="kicker">Brand assistant</p>
      <Assistant
        key={openThread?.id ?? "new"}
        slug={slug}
        connected={!!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN)}
        pieces={pieces}
        requests={requests}
        files={files.map((file) => ({ id: file.id, title: file.title }))}
        threads={threads}
        initial={{
          capability,
          contentItemId: search.piece ?? "",
          requestId: search.request ?? "",
          threadId: openThread?.id ?? null,
          threadContentItemId: openThread?.contentItemId ?? null,
          turns: turns.map((turn) => ({ role: turn.role, text: turn.text || "(no text)" })),
        }}
      />
    </div>
  );
}
