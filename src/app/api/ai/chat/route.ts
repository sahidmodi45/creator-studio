import Anthropic from "@anthropic-ai/sdk";
import { and, asc, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { aiMessages, aiThreads } from "@/db/schema";
import { getAccessBySlug } from "@/lib/auth";
import { CAPABILITIES, CAPABILITY_IDS, MODEL } from "@/lib/ai/capabilities";
import { buildFirstTurn, buildSystemPrompt } from "@/lib/ai/context";

const body = z.object({
  slug: z.string(),
  threadId: z.string().uuid().nullable().optional(),
  capability: z.enum(CAPABILITY_IDS as [string, ...string[]]),
  message: z.string().max(20000),
  contentItemId: z.string().uuid().nullable().optional(),
  requestId: z.string().uuid().nullable().optional(),
  assetIds: z.array(z.string().uuid()).max(10).optional(),
});

function friendlyError(error: unknown) {
  if (error instanceof Anthropic.AuthenticationError) return "The API key was not accepted. Please check ANTHROPIC_API_KEY.";
  if (error instanceof Anthropic.PermissionDeniedError) return "This API key does not have access to that model.";
  if (error instanceof Anthropic.RateLimitError) return "Too many requests right now. Please try again in a minute.";
  if (error instanceof Anthropic.BadRequestError) return `The request was rejected: ${error.message}`;
  if (error instanceof Anthropic.APIConnectionError) return "Could not reach the AI service. Please check the connection.";
  if (error instanceof Anthropic.APIError) return "The AI service had a problem. Please try again.";
  return "Something went wrong. Please try again.";
}

export async function POST(request: NextRequest) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "That request is not valid." }, { status: 400 });
  const input = parsed.data;

  // Team only. The AI spends money and reads internal notes, so it is never exposed to a client.
  const access = await getAccessBySlug(input.slug);
  if (!access?.isTeam) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    return NextResponse.json({ error: "The assistant is not connected yet. Add ANTHROPIC_API_KEY to the settings." }, { status: 503 });
  }

  const capability = input.capability as keyof typeof CAPABILITIES;
  let threadId = input.threadId ?? null;
  let contentItemId: string | null = null;
  const history: { role: "user" | "assistant"; content: unknown }[] = [];

  if (threadId) {
    const [thread] = await db
      .select()
      .from(aiThreads)
      .where(and(eq(aiThreads.id, threadId), eq(aiThreads.workspaceId, access.workspace.id)));
    if (!thread) return NextResponse.json({ error: "Not found" }, { status: 404 });
    contentItemId = thread.contentItemId;
    const previous = await db.select().from(aiMessages).where(eq(aiMessages.threadId, threadId)).orderBy(asc(aiMessages.createdAt));
    // Earlier turns go back byte for byte, thinking blocks included.
    for (const message of previous) history.push({ role: message.role, content: message.rawContent ?? message.text });
    const newTurn = [{ type: "text", text: input.message }];
    history.push({ role: "user", content: newTurn });
    await db.insert(aiMessages).values({ threadId, role: "user", text: input.message, rawContent: newTurn });
  } else {
    const first = await buildFirstTurn(access.workspace.id, {
      capability,
      message: input.message,
      contentItemId: input.contentItemId,
      requestId: input.requestId,
      assetIds: input.assetIds,
    });
    contentItemId = first.contentItemId;
    const [thread] = await db
      .insert(aiThreads)
      .values({
        workspaceId: access.workspace.id,
        userId: access.user.id,
        capability,
        title: (input.message.trim() || CAPABILITIES[capability].label).slice(0, 90),
        contentItemId,
        requestId: input.requestId ?? null,
        assetIds: input.assetIds ?? [],
      })
      .returning({ id: aiThreads.id });
    threadId = thread.id;
    await db.insert(aiMessages).values({ threadId, role: "user", text: input.message, rawContent: first.blocks });
    history.push({ role: "user", content: first.blocks });
  }

  const system = await buildSystemPrompt(access.workspace);
  const client = new Anthropic();
  const encoder = new TextEncoder();
  const send = (controller: ReadableStreamDefaultController, payload: object) =>
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
  const savedThreadId = threadId;

  const stream = new ReadableStream({
    async start(controller) {
      send(controller, { type: "thread", threadId: savedThreadId, contentItemId });
      try {
        const params = {
          model: MODEL,
          max_tokens: 64000,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          output_config: { effort: "high" },
          system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
          messages: history,
        };
        const messageStream = client.beta.messages.stream(params as unknown as Parameters<typeof client.beta.messages.stream>[0]);
        for await (const event of messageStream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            send(controller, { type: "text", text: event.delta.text });
          }
        }
        const final = await messageStream.finalMessage();
        if (final.stop_reason === "refusal") {
          send(controller, { type: "error", message: "The assistant declined this request. Try rewording it." });
        }
        const text = final.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
        await db.insert(aiMessages).values({ threadId: savedThreadId, role: "assistant", text, rawContent: final.content });
        if (final.stop_reason === "max_tokens") send(controller, { type: "error", message: "The answer was cut off for length." });
        send(controller, { type: "done" });
      } catch (error) {
        console.error("Assistant request failed", error instanceof Error ? error.message : error);
        send(controller, { type: "error", message: friendlyError(error) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}
