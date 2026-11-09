"use client";

import { DndContext, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, rectSortingStrategy, SortableContext, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Trash2, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { KindIcon, ProfileHeader, tileImage, type ProfileView } from "@/components/instagram";
import { Toast } from "@/components/ui";
import { addCurrentPosts, removeSlot, saveSlotOrder, updateSlot } from "@/lib/actions/feed";
import { dropUnderCursor } from "@/lib/dnd";
import type { FeedSlotView } from "@/lib/queries";
import { uploadFile } from "@/lib/upload-client";
import { UPLOADS_COMING_SOON, UploadsComingSoon, useUploadsEnabled } from "@/components/uploads-gate";

function CurrentTile({ slot, onOpen }: { slot: FeedSlotView; onOpen: () => void }) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: slot.id });
  const image = tileImage(slot);
  return (
    <button
      ref={setNodeRef}
      type="button"
      className={`tile${isDragging ? " is-dragging" : ""}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      data-testid="current-tile"
      data-title={slot.title}
      aria-label={`Live post: ${slot.title || "untitled"}`}
      onClick={onOpen}
      {...attributes}
      {...listeners}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {image && <img src={image} alt="" draggable={false} />}
      <span className="tile-kind"><KindIcon kind={slot.kind} /></span>
    </button>
  );
}

/** What is on her profile right now. Instagram is not connected, so the team adds these by hand. */
export function CurrentFeed({
  slug,
  workspaceId,
  layoutId,
  slots,
  profile,
}: {
  slug: string;
  workspaceId: string;
  layoutId: string | null;
  slots: FeedSlotView[];
  profile: ProfileView;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [order, setOrder] = useState(slots);
  const [open, setOpen] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [fileOver, setFileOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const uploadsOn = useUploadsEnabled();

  useEffect(() => setOrder(slots), [slots]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  );

  const addFiles = async (list: File[]) => {
    if (!uploadsOn) return setError(UPLOADS_COMING_SOON);
    const files = list.filter((file) => file.type.startsWith("image/") || file.type.startsWith("video/"));
    if (!files.length) return;
    const ids: string[] = [];
    try {
      for (const [index, file] of files.entries()) {
        setProgress(`Adding ${index + 1} of ${files.length}`);
        ids.push(await uploadFile(file, { workspaceId, category: "live_post", visibility: "shared" }));
      }
      const result = await addCurrentPosts(slug, ids);
      if (result?.error) setError(result.error);
      router.refresh();
    } catch (failure) {
      setError((failure as Error).message);
      // Files that did make it should still land in the grid.
      if (ids.length) {
        await addCurrentPosts(slug, ids);
        router.refresh();
      }
    } finally {
      setProgress(null);
    }
  };

  const onDragEnd = (event: DragEndEvent) => {
    if (!layoutId || !event.over || event.active.id === event.over.id) return;
    const from = order.findIndex((slot) => slot.id === event.active.id);
    const to = order.findIndex((slot) => slot.id === event.over!.id);
    if (from < 0 || to < 0) return;
    const previous = order;
    const moved = arrayMove(order, from, to).map((slot, position) => ({ ...slot, position }));
    setOrder(moved);
    start(async () => {
      const result = await saveSlotOrder(layoutId, moved.map(({ id, position }) => ({ id, position })));
      if (result?.error) {
        setOrder(previous);
        setError(result.error);
      }
    });
  };

  const selected = order.find((slot) => slot.id === open) ?? null;
  const selectedImage = selected ? tileImage(selected) : null;

  return (
    <div
      className="stack-sm"
      id="current"
      data-testid="current-feed"
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("Files")) {
          event.preventDefault();
          setFileOver(true);
        }
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setFileOver(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setFileOver(false);
        void addFiles(Array.from(event.dataTransfer.files));
      }}
    >
      <h2 className="section-title">Current feed</h2>
      <div className="row-between feed-controls">
        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          hidden
          data-testid="current-upload"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = "";
            void addFiles(files);
          }}
        />
        {uploadsOn ? (
          <button type="button" className="btn btn-sm" disabled={!!progress} onClick={() => inputRef.current?.click()}>
            <Upload size={13} /> {progress ?? "Add live posts"}
          </button>
        ) : (
          <UploadsComingSoon />
        )}
        <span className="muted tiny">What is on Instagram now</span>
      </div>
      <div className="phone" style={fileOver ? { outline: "2px solid var(--beet)" } : undefined}>
        <ProfileHeader profile={profile} plannedCount={0} />
        {order.length === 0 ? (
          <div className="feed-empty-note">
            <p className="strong">Add the posts live on her profile</p>
            <p className="small muted">Instagram is not connected, so drop in the images, newest first. Drag them to match her grid.</p>
          </div>
        ) : (
          <DndContext id="current-grid" sensors={sensors} collisionDetection={dropUnderCursor} onDragEnd={onDragEnd}>
            <SortableContext items={order.map((slot) => slot.id)} strategy={rectSortingStrategy}>
              <div className="ig-grid">
                {order.map((slot) => <CurrentTile key={slot.id} slot={slot} onOpen={() => setOpen(slot.id)} />)}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {selected && (
        <div className="modal-backdrop" onClick={() => setOpen(null)}>
          <div className="modal modal-narrow stack-sm" role="dialog" aria-label="Live post" onClick={(event) => event.stopPropagation()}>
            <div className="row-between">
              <p className="section-title">Live post</p>
              <button type="button" className="icon-btn" aria-label="Close" onClick={() => setOpen(null)}><X size={16} /></button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {selectedImage && <img src={selectedImage} alt="" style={{ width: "100%", maxHeight: 340, objectFit: "contain", background: "#0c0908", borderRadius: 8 }} />}
            <label className="field">
              <span>Type</span>
              <select
                aria-label="Live post type"
                value={selected.kind}
                disabled={pending}
                onChange={(event) => start(async () => void (await updateSlot(selected.id, { kind: event.target.value as FeedSlotView["kind"] })))}
              >
                <option value="photo">Photo</option>
                <option value="reel">Reel</option>
                <option value="carousel">Carousel</option>
              </select>
            </label>
            <div>
              <button
                type="button"
                className="btn btn-sm btn-ghost btn-danger"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const result = await removeSlot(selected.id);
                    if (result?.error) setError(result.error);
                    else setOpen(null);
                  })
                }
              >
                <Trash2 size={13} /> Remove from the grid
              </button>
            </div>
          </div>
        </div>
      )}
      {error && <Toast message={error} tone="error" onDone={() => setError(null)} />}
    </div>
  );
}
