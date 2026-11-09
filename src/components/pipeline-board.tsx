"use client";

import { DndContext, DragOverlay, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Toast } from "@/components/ui";
import { setContentStatus } from "@/lib/actions/content";
import { FORMAT_LABEL, type ContentFormat, type ContentStatus } from "@/lib/constants";
import { formatDayShort } from "@/lib/format";

export type BoardItem = {
  id: string;
  title: string;
  pillar: string | null;
  format: ContentFormat;
  status: ContentStatus;
  rank: number;
  scheduledDate: string | null;
  ownerName: string | null;
  coverAssetId: string | null;
};

/**
 * Four plain stages instead of nine statuses. Each stage keeps the finer statuses inside it,
 * and dropping a card into a stage gives it that stage's first status.
 */
const STAGES = [
  { id: "ideas", label: "Ideas", hint: "Not started yet", statuses: ["idea", "briefed"], drop: "idea" },
  { id: "making", label: "Making", hint: "Filming, editing, fixing", statuses: ["in_production", "internal_review", "revision_requested"], drop: "in_production" },
  { id: "with-client", label: "With {first}", hint: "Waiting for her yes", statuses: ["client_review"], drop: "client_review" },
  { id: "done", label: "Ready and live", hint: "Approved, scheduled, posted", statuses: ["approved", "scheduled", "published"], drop: "approved" },
] as const satisfies readonly { id: string; label: string; hint: string; statuses: readonly ContentStatus[]; drop: ContentStatus }[];
type Stage = (typeof STAGES)[number];

/** Shown on a card only when it says more than the stage name does. */
const STEP_NOTE: Partial<Record<ContentStatus, string>> = {
  briefed: "Briefed",
  internal_review: "Our check",
  revision_requested: "Changes asked",
  approved: "Approved",
  scheduled: "Scheduled",
  published: "Live",
};

const stageOf = (status: ContentStatus) => STAGES.find((stage) => (stage.statuses as readonly ContentStatus[]).includes(status))!;

function CardBody({ item }: { item: BoardItem }) {
  const note = STEP_NOTE[item.status];
  return (
    <>
      {item.coverAssetId && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/assets/${item.coverAssetId}/file?variant=thumb`} alt="" style={{ width: "100%", aspectRatio: "16 / 10", objectFit: "cover", borderRadius: 6 }} draggable={false} />
      )}
      <span className="title">{item.title}</span>
      <div className="row-sm">
        <span className="badge">{FORMAT_LABEL[item.format]}</span>
        {note && <span className={`badge${item.status === "revision_requested" ? " badge-solid" : ""}`}>{note}</span>}
        {item.pillar && <span className="badge badge-beet">{item.pillar}</span>}
      </div>
      {(item.scheduledDate || item.ownerName) && (
        <p className="muted tiny">{[item.scheduledDate && formatDayShort(item.scheduledDate), item.ownerName].filter(Boolean).join(" · ")}</p>
      )}
    </>
  );
}

function Card({ item, slug }: { item: BoardItem; slug: string }) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({ id: item.id });
  const router = useRouter();
  const href = `/admin/${slug}/content/${item.id}`;
  // The whole card drags. A click that did not turn into a drag opens the piece.
  return (
    <div
      ref={setNodeRef}
      className={`board-card${isDragging ? " is-dragging" : ""}`}
      data-testid="board-card"
      data-title={item.title}
      {...listeners}
      {...attributes}
      role="link"
      onClick={() => router.push(href)}
      onKeyDown={(event) => {
        if (event.key === "Enter") router.push(href);
      }}
    >
      <CardBody item={item} />
    </div>
  );
}

function Column({ stage, label, items, slug }: { stage: Stage; label: string; items: BoardItem[]; slug: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  return (
    <section ref={setNodeRef} className={`board-col${isOver ? " is-over" : ""}`} data-testid={`col-${stage.id}`} aria-label={label}>
      <div className="board-col-head">
        <div>
          <h3>{label}</h3>
          <p className="muted tiny" style={{ margin: "2px 0 0" }}>{stage.hint}</p>
        </div>
        <span className="muted tiny">{items.length}</span>
      </div>
      {items.map((item) => <Card key={item.id} item={item} slug={slug} />)}
    </section>
  );
}

export function PipelineBoard({ items: initial, slug, pillars, clientFirstName }: { items: BoardItem[]; slug: string; pillars: string[]; clientFirstName: string }) {
  const [items, setItems] = useState(initial);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pillar, setPillar] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  useEffect(() => setItems(initial), [initial]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  );

  const visible = pillar ? items.filter((item) => item.pillar === pillar) : items;
  const active = items.find((item) => item.id === activeId) ?? null;

  const onDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const stage = STAGES.find((row) => row.id === event.over?.id);
    const id = String(event.active.id);
    const item = items.find((row) => row.id === id);
    if (!item || !stage || stageOf(item.status).id === stage.id) return;
    const next: ContentStatus = stage.drop;

    const previous = items;
    // Show it moved straight away, and put it back if the server refuses.
    setItems((current) => current.map((row) => (row.id === id ? { ...row, status: next } : row)));
    start(async () => {
      const result = await setContentStatus(id, next);
      if (result?.error) {
        setItems(previous);
        setError(result.error);
      }
    });
  };

  return (
    <div className="stack">
      {pillars.length > 0 && (
        <div className="segmented" role="group" aria-label="Filter by pillar">
          <button aria-pressed={!pillar} onClick={() => setPillar("")}>All</button>
          {pillars.map((value) => (
            <button key={value} aria-pressed={pillar === value} onClick={() => setPillar(value)}>{value}</button>
          ))}
        </div>
      )}
      <DndContext
        id="pipeline"
        sensors={sensors}
        onDragStart={(event: DragStartEvent) => setActiveId(String(event.active.id))}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div className="board board-four">
          {STAGES.map((stage) => (
            <Column
              key={stage.id}
              stage={stage}
              label={stage.label.replace("{first}", clientFirstName)}
              slug={slug}
              items={visible.filter((item) => stageOf(item.status).id === stage.id).sort((a, b) => a.rank - b.rank)}
            />
          ))}
        </div>
        <DragOverlay>
          {active && (
            <div className="board-card is-overlay">
              <CardBody item={active} />
            </div>
          )}
        </DragOverlay>
      </DndContext>
      {error && <Toast message={error} tone="error" onDone={() => setError(null)} />}
    </div>
  );
}
