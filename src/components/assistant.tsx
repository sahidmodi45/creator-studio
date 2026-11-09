"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Toast } from "@/components/ui";
import { saveAiOutput } from "@/lib/actions/ai";
import { CAPABILITIES, CAPABILITY_IDS, type CapabilityId } from "@/lib/ai/capabilities";

type Option = { id: string; title: string };
type Turn = { role: "user" | "assistant"; text: string };
export type ThreadSummary = { id: string; title: string; capability: string; contentItemId: string | null };

function SaveButtons({ slug, contentItemId, getText }: { slug: string; contentItemId: string; getText: () => string }) {
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<{ text: string; tone: "info" | "error" } | null>(null);
  const save = (field: "script" | "caption" | "brief") =>
    start(async () => {
      const result = await saveAiOutput(slug, contentItemId, field, getText());
      setToast(result?.error ? { text: result.error, tone: "error" } : { text: `Saved as the ${field}.`, tone: "info" });
    });
  return (
    <div className="row-sm">
      <span className="muted tiny">Select the part you want, or save it all:</span>
      <button className="btn btn-sm" disabled={pending} onClick={() => save("script")}>Save as script</button>
      <button className="btn btn-sm" disabled={pending} onClick={() => save("caption")}>Save as caption</button>
      <button className="btn btn-sm" disabled={pending} onClick={() => save("brief")}>Save as brief</button>
      {toast && <Toast message={toast.text} tone={toast.tone} onDone={() => setToast(null)} />}
    </div>
  );
}

function AssistantTurn({ turn, slug, contentItemId, streaming }: { turn: Turn; slug: string; contentItemId: string | null; streaming: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const selectedOrAll = () => {
    const selection = window.getSelection();
    const text = selection?.toString().trim();
    if (text && ref.current && selection?.anchorNode && ref.current.contains(selection.anchorNode)) return text;
    return turn.text;
  };
  return (
    <div className="stack-sm">
      <div ref={ref} className="bubble assistant" data-testid="assistant-message">{turn.text || "Thinking"}</div>
      {!streaming && contentItemId && turn.text && <SaveButtons slug={slug} contentItemId={contentItemId} getText={selectedOrAll} />}
    </div>
  );
}

export function Assistant({
  slug,
  connected,
  pieces,
  requests,
  files,
  threads,
  initial,
}: {
  slug: string;
  connected: boolean;
  pieces: Option[];
  requests: Option[];
  files: Option[];
  threads: ThreadSummary[];
  initial: {
    capability: CapabilityId;
    contentItemId: string;
    requestId: string;
    threadId: string | null;
    threadContentItemId: string | null;
    turns: Turn[];
  };
}) {
  const router = useRouter();
  const [capability, setCapability] = useState<CapabilityId>(initial.capability);
  const [contentItemId, setContentItemId] = useState(initial.contentItemId);
  const [requestId, setRequestId] = useState(initial.requestId);
  const [assetIds, setAssetIds] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [threadId, setThreadId] = useState<string | null>(initial.threadId);
  const [threadPiece, setThreadPiece] = useState<string | null>(initial.threadContentItemId);
  const [turns, setTurns] = useState<Turn[]>(initial.turns);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string>();

  const spec = CAPABILITIES[capability];
  const needs = spec.needs as readonly string[];
  const inThread = !!threadId;

  const missing =
    !inThread &&
    ((needs.includes("request") && !requestId) || (capability === "analyse_reference" && assetIds.length === 0) || (capability !== "edit_suggestions" && needs.includes("content") && !contentItemId) || (capability === "edit_suggestions" && !contentItemId));

  const startFresh = (next: CapabilityId) => {
    setCapability(next);
    setThreadId(null);
    setThreadPiece(null);
    setTurns([]);
    setError(undefined);
    setAssetIds([]);
    if (initial.threadId) router.replace(`/admin/${slug}/assistant?capability=${next}`);
  };

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(undefined);
    setStreaming(true);
    const asked = message;
    setMessage("");
    setTurns((current) => [...current, { role: "user", text: asked || spec.label }, { role: "assistant", text: "" }]);

    const dropEmpty = () =>
      setTurns((current) => (current[current.length - 1]?.text ? current : current.slice(0, -1)));

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          threadId,
          capability,
          message: asked,
          contentItemId: contentItemId || null,
          requestId: requestId || null,
          assetIds,
        }),
      });
      if (!response.ok || !response.body) {
        const failure = await response.json().catch(() => ({}));
        setError(failure.error ?? "The assistant could not start.");
        dropEmpty();
        return;
      }
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          if (!part.startsWith("data: ")) continue;
          const payload = JSON.parse(part.slice(6));
          if (payload.type === "thread") {
            setThreadId(payload.threadId);
            setThreadPiece(payload.contentItemId);
          } else if (payload.type === "text") {
            setTurns((current) => {
              const copy = [...current];
              const last = copy[copy.length - 1];
              copy[copy.length - 1] = { ...last, text: last.text + payload.text };
              return copy;
            });
          } else if (payload.type === "error") {
            setError(payload.message);
          }
        }
      }
      dropEmpty();
      router.refresh();
    } catch {
      setError("The connection dropped. Please try again.");
      dropEmpty();
    } finally {
      setStreaming(false);
    }
  };

  return (
    <div className="assistant-layout">
      <aside className="stack-lg">
        <div className="cap-list" role="group" aria-label="What should it do">
          {CAPABILITY_IDS.map((id) => (
            <button key={id} aria-pressed={capability === id && !initial.threadId} onClick={() => startFresh(id)}>{CAPABILITIES[id].label}</button>
          ))}
        </div>
        {threads.length > 0 && (
          <div className="stack-sm">
            <span className="rail-label">Earlier</span>
            {threads.map((thread) => (
              <a key={thread.id} className="plain-link small truncate" href={`/admin/${slug}/assistant?thread=${thread.id}`}>{thread.title}</a>
            ))}
          </div>
        )}
      </aside>

      <div className="stack">
        {!connected && (
          <div className="card" style={{ background: "var(--warn-soft)", borderColor: "transparent" }} role="status" data-testid="ai-not-connected">
            <p className="strong">The assistant is not connected yet.</p>
            <p className="small">Add an Anthropic API key as ANTHROPIC_API_KEY in the settings, then restart. Everything else in the studio works without it.</p>
          </div>
        )}

        <h2 className="display-sm">{spec.label}</h2>

        {!inThread && (
          <div className="grid-2">
            {(needs.includes("content") || capability === "ideas") && (
              <label className="field">
                <span>Piece{needs.includes("content") ? "" : " (optional)"}</span>
                <select aria-label="Piece" value={contentItemId} onChange={(event) => setContentItemId(event.target.value)}>
                  <option value="">Choose a piece</option>
                  {pieces.map((piece) => <option key={piece.id} value={piece.id}>{piece.title}</option>)}
                </select>
              </label>
            )}
            {needs.includes("request") && (
              <label className="field">
                <span>Request</span>
                <select aria-label="Request" value={requestId} onChange={(event) => setRequestId(event.target.value)}>
                  <option value="">Choose a request</option>
                  {requests.map((row) => <option key={row.id} value={row.id}>{row.title}</option>)}
                </select>
              </label>
            )}
            {needs.includes("assets") && (
              <label className="field">
                <span>Files to look at (up to 10)</span>
                <select
                  aria-label="Files"
                  multiple
                  size={5}
                  value={assetIds}
                  onChange={(event) => setAssetIds(Array.from(event.target.selectedOptions).map((option) => option.value).slice(0, 10))}
                >
                  {files.map((file) => <option key={file.id} value={file.id}>{file.title}</option>)}
                </select>
              </label>
            )}
          </div>
        )}

        <div className="stack">
          {turns.map((turn, index) =>
            turn.role === "user" ? (
              <div key={index} className="bubble user" data-testid="user-message">{turn.text}</div>
            ) : (
              <AssistantTurn
                key={index}
                turn={turn}
                slug={slug}
                contentItemId={threadPiece ?? (contentItemId || null)}
                streaming={streaming && index === turns.length - 1}
              />
            ),
          )}
        </div>

        {error && <p className="form-error" role="alert">{error}</p>}

        <form className="stack-sm" onSubmit={send}>
          <textarea
            aria-label="Message"
            value={message}
            placeholder={inThread ? "Ask for a change" : spec.placeholder}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) event.currentTarget.form?.requestSubmit();
            }}
          />
          <div className="row-between">
            <span className="muted tiny">{missing ? "Choose what to work on first." : "Reads the brand knowledge base every time."}</span>
            <div className="row-sm">
              {inThread && <button type="button" className="btn btn-ghost" onClick={() => startFresh(capability)}>Start over</button>}
              <button className="btn btn-primary" disabled={streaming || !connected || missing || (inThread && !message.trim())}>
                {streaming ? "Writing" : inThread ? "Send" : "Run"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
