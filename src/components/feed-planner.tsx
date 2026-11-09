"use client";

import { DndContext, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, rectSortingStrategy, SortableContext, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Copy, Eye, ImagePlus, Trash2, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { CurrentFeed } from "@/components/current-feed";
import { KindIcon, PostPreview, ProfileHeader, tileImage, type ProfileView } from "@/components/instagram";
import { Toast } from "@/components/ui";
import {
  createLayout,
  createSlot,
  deleteLayout,
  duplicateLayout,
  removeSlot,
  renameLayout,
  saveSlotOrder,
  shareLayout,
  updateSlot,
} from "@/lib/actions/feed";
import { setProfileAvatar } from "@/lib/actions/workspace";
import { FEED_VIEW_SIZES, isImage, isPlayableVideo } from "@/lib/constants";
import { dropUnderCursor } from "@/lib/dnd";
import type { FeedSlotView, PublicAsset } from "@/lib/queries";
import { uploadFile } from "@/lib/upload-client";
import { UPLOADS_COMING_SOON, UploadsComingSoon, useUploadsEnabled } from "@/components/uploads-gate";

type LayoutRow = { id: string; name: string; sharedWithClient: boolean };
type LibraryPick = Pick<PublicAsset, "id" | "title" | "mimeType" | "thumbnailKey" | "category">;
type ContentPick = { id: string; title: string; caption: string; format: string };

type TileEntry = { key: string; position: number; slot: FeedSlotView | null };

function kindForFile(file: File, count: number): FeedSlotView["kind"] {
  if (file.type.startsWith("video/")) return "reel";
  return count > 1 ? "carousel" : "photo";
}

/** Files only: the grid accepts images and videos, nothing else. */
function usableFiles(list: FileList | File[]) {
  return Array.from(list).filter((file) => file.type.startsWith("image/") || file.type.startsWith("video/"));
}

function Tile({
  entry,
  selected,
  progress,
  onSelect,
  onDropFiles,
}: {
  entry: TileEntry;
  selected: boolean;
  progress: number | null;
  onSelect: () => void;
  onDropFiles: (files: File[]) => void;
}) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: entry.key });
  const [fileOver, setFileOver] = useState(false);
  const image = entry.slot ? tileImage(entry.slot) : null;
  const className = [
    "tile",
    isDragging && "is-dragging",
    selected && "is-selected",
    fileOver && "is-file-over",
    entry.slot?.state === "draft" && "is-draft",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      ref={setNodeRef}
      type="button"
      className={className}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      data-testid={entry.slot ? "feed-tile" : "feed-empty"}
      data-position={entry.position}
      data-title={entry.slot?.title ?? ""}
      aria-label={entry.slot ? `Post ${entry.position + 1}: ${entry.slot.title || "untitled"}` : `Empty position ${entry.position + 1}. Click to add.`}
      onClick={onSelect}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("Files")) {
          event.preventDefault();
          setFileOver(true);
        }
      }}
      onDragLeave={() => setFileOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setFileOver(false);
        const files = usableFiles(event.dataTransfer.files);
        if (files.length) onDropFiles(files);
      }}
      {...attributes}
      {...listeners}
    >
      {entry.slot ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {image && <img src={image} alt="" draggable={false} />}
          <span className="tile-kind"><KindIcon kind={entry.slot.kind} /></span>
          {entry.slot.state === "draft" && <span className="tile-state">Draft</span>}
        </>
      ) : (
        <span className="tile-empty">
          <ImagePlus size={18} />
          <span>{entry.position + 1}</span>
        </span>
      )}
      {progress != null && (
        <span className="tile-progress">
          <span className="progress" style={{ display: "block" }} role="progressbar" aria-valuenow={Math.round(progress * 100)}>
            <span style={{ display: "block", height: "100%", width: `${progress * 100}%`, background: "var(--beet)" }} />
          </span>
        </span>
      )}
    </button>
  );
}

function CaptionList({ slots, onOpen }: { slots: FeedSlotView[]; onOpen: (slot: FeedSlotView) => void }) {
  if (!slots.length) return <p className="muted small">Captions show up here as you add posts.</p>;
  return (
    <div data-testid="caption-list">
      {slots.map((slot) => {
        const image = tileImage(slot);
        return (
          <button
            key={slot.id}
            type="button"
            className="caption-row"
            style={{ width: "100%", textAlign: "left", background: "transparent", border: 0, borderBottom: "1px solid var(--rule)", cursor: "pointer" }}
            onClick={() => onOpen(slot)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {image ? <img src={image} alt="" /> : <span className="caption-thumb" />}
            <span className="stack-sm" style={{ gap: 2, minWidth: 0 }}>
              <span className="small strong">{slot.title || `Post ${slot.position + 1}`}</span>
              <span className="small muted pre">{slot.caption || "No caption yet."}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** The panel for the tile in focus: filled tiles get edited, empty ones get filled. */
function SlotPanel({
  layoutId,
  position,
  slot,
  library,
  content,
  slug,
  onClose,
  onPreview,
  onUpload,
  onError,
}: {
  layoutId: string;
  position: number;
  slot: FeedSlotView | null;
  library: LibraryPick[];
  content: ContentPick[];
  slug: string;
  onClose: () => void;
  onPreview: (slot: FeedSlotView) => void;
  onUpload: (files: File[], position: number, existing: FeedSlotView | null) => void;
  onError: (message: string) => void;
}) {
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadsOn = useUploadsEnabled();
  const [title, setTitle] = useState(slot?.title ?? "");
  const [caption, setCaption] = useState(slot?.caption ?? "");
  const [saved, setSaved] = useState(false);

  // Reset only on a different post. Reacting to the saved text coming back would wipe the confirmation.
  useEffect(() => {
    setTitle(slot?.title ?? "");
    setCaption(slot?.caption ?? "");
    setSaved(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot?.id]);

  const media = library.filter((asset) => isImage(asset.mimeType) || isPlayableVideo(asset.mimeType));
  const inSlot = new Set(slot?.media.map((asset) => asset.id));

  const run = (action: () => Promise<{ error?: string } | undefined>, after?: () => void) =>
    start(async () => {
      const result = await action();
      if (result?.error) onError(result.error);
      else after?.();
    });

  const addFromLibrary = (assetId: string) => {
    const asset = media.find((row) => row.id === assetId);
    if (!asset) return;
    if (slot) {
      const assetIds = [...slot.media.map((row) => row.id), assetId];
      const kind = slot.kind === "photo" && assetIds.length > 1 ? "carousel" : slot.kind;
      run(() => updateSlot(slot.id, { assetIds, kind }));
    } else {
      const kind = isPlayableVideo(asset.mimeType) ? "reel" : "photo";
      run(() => createSlot(layoutId, position, { assetIds: [assetId], kind, title: asset.title }));
    }
  };

  const useContent = (contentId: string) => {
    const item = content.find((row) => row.id === contentId);
    if (!item) return;
    if (slot) run(() => updateSlot(slot.id, { contentItemId: contentId, caption: item.caption || caption, title: item.title }));
    else run(() => createSlot(layoutId, position, { contentItemId: contentId, caption: item.caption, title: item.title, kind: item.format === "carousel" ? "carousel" : item.format === "photo" ? "photo" : "reel" }));
  };

  return (
    <div className="card stack-sm" data-testid="slot-panel">
      <div className="row-between">
        <p className="section-title">{slot ? `Post ${position + 1}` : `Position ${position + 1}`}</p>
        <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}><X size={16} /></button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        hidden
        data-testid="slot-upload"
        onChange={(event) => {
          const files = event.target.files ? usableFiles(event.target.files) : [];
          if (files.length) onUpload(files, position, slot);
          event.target.value = "";
        }}
      />
      <div className="row-sm">
        {uploadsOn ? (
          <button type="button" className="btn btn-sm" onClick={() => inputRef.current?.click()}>
            <Upload size={13} /> {slot ? "Add a slide or file" : "Upload a creative"}
          </button>
        ) : (
          <UploadsComingSoon />
        )}
        {slot && slot.media.length > 0 && (
          <button type="button" className="btn btn-sm" onClick={() => onPreview(slot)}><Eye size={13} /> Preview</button>
        )}
      </div>

      <label className="field">
        <span>Or pick from the library</span>
        <select aria-label="Pick from the library" value="" disabled={pending} onChange={(event) => addFromLibrary(event.target.value)}>
          <option value="">{media.length ? "Choose a file" : "No images or videos yet"}</option>
          {media.filter((asset) => !inSlot.has(asset.id)).map((asset) => <option key={asset.id} value={asset.id}>{asset.title}</option>)}
        </select>
      </label>

      {content.length > 0 && (
        <label className="field">
          <span>Link to a content piece</span>
          <select aria-label="Link to a content piece" value={slot?.contentItemId ?? ""} disabled={pending} onChange={(event) => useContent(event.target.value)}>
            <option value="">None</option>
            {content.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select>
        </label>
      )}

      {slot && (
        <>
          {slot.media.length > 0 && (
            <div className="stack-sm" style={{ gap: 4 }}>
              <span className="field-label">Files, in order</span>
              {slot.media.map((asset, index) => (
                <div key={asset.id} className="row-between small">
                  <span className="truncate grow">{index + 1}. {asset.title}</span>
                  <button
                    type="button"
                    className="icon-btn"
                    style={{ width: 24, height: 24 }}
                    aria-label={`Remove ${asset.title}`}
                    disabled={pending}
                    onClick={() => run(() => updateSlot(slot.id, { assetIds: slot.media.filter((row) => row.id !== asset.id).map((row) => row.id) }))}
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="grid-2">
            <label className="field">
              <span>Type</span>
              <select aria-label="Type" value={slot.kind} disabled={pending} onChange={(event) => run(() => updateSlot(slot.id, { kind: event.target.value as FeedSlotView["kind"] }))}>
                <option value="photo">Photo</option>
                <option value="reel">Reel</option>
                <option value="carousel">Carousel</option>
              </select>
            </label>
            <label className="field">
              <span>State</span>
              <select aria-label="State" value={slot.state} disabled={pending} onChange={(event) => run(() => updateSlot(slot.id, { state: event.target.value as FeedSlotView["state"] }))}>
                <option value="draft">Draft (team only)</option>
                <option value="planned">Planned (client can see)</option>
              </select>
            </label>
          </div>
          <label className="field"><span>Title</span><input aria-label="Post title" value={title} onChange={(event) => { setTitle(event.target.value); setSaved(false); }} /></label>
          <label className="field"><span>Caption</span><textarea aria-label="Post caption" rows={5} value={caption} onChange={(event) => { setCaption(event.target.value); setSaved(false); }} /></label>
          <div className="row-between">
            <div className="row-sm">
              <button type="button" className="btn btn-sm btn-primary" disabled={pending} onClick={() => run(() => updateSlot(slot.id, { title, caption }), () => setSaved(true))}>
                Save
              </button>
              {saved && <span className="form-ok">Saved.</span>}
            </div>
            <button type="button" className="btn btn-sm btn-ghost btn-danger" disabled={pending} onClick={() => run(() => removeSlot(slot.id), onClose)}>
              <Trash2 size={13} /> Clear this tile
            </button>
          </div>
          {slot.contentItemId && <a className="link small" href={`/admin/${slug}/content/${slot.contentItemId}`}>Open the linked piece</a>}
        </>
      )}
    </div>
  );
}

export function FeedPlanner({
  slug,
  workspaceId,
  layouts,
  layoutId,
  slots,
  profile,
  library,
  content,
  currentLayoutId,
  currentSlots,
}: {
  slug: string;
  workspaceId: string;
  currentLayoutId: string | null;
  currentSlots: FeedSlotView[];
  layouts: LayoutRow[];
  layoutId: string;
  slots: FeedSlotView[];
  profile: ProfileView;
  library: LibraryPick[];
  content: ContentPick[];
}) {
  const router = useRouter();
  const layout = layouts.find((row) => row.id === layoutId)!;
  const [viewSize, setViewSize] = useState<number>(12);
  const [order, setOrder] = useState(slots);
  const [selected, setSelected] = useState<number | null>(null);
  const [preview, setPreview] = useState<FeedSlotView | null>(null);
  const [showDrafts, setShowDrafts] = useState(true);
  const [uploading, setUploading] = useState<Record<number, number>>({});
  const [toast, setToast] = useState<{ text: string; tone: "info" | "error" } | null>(null);
  const [pending, start] = useTransition();
  const avatarInput = useRef<HTMLInputElement>(null);
  const uploadsOn = useUploadsEnabled();

  useEffect(() => setOrder(slots), [slots]);

  const shown = useMemo(() => (showDrafts ? order : order.filter((slot) => slot.state === "planned")), [order, showDrafts]);

  // Every position in view is a tile. Grows so nothing placed further down is ever hidden.
  const tiles: TileEntry[] = useMemo(() => {
    const byPosition = new Map(shown.map((slot) => [slot.position, slot]));
    const highest = shown.reduce((max, slot) => Math.max(max, slot.position + 1), 0);
    const count = Math.max(viewSize, Math.ceil(highest / 3) * 3);
    return Array.from({ length: count }, (_, position) => {
      const slot = byPosition.get(position) ?? null;
      return { key: slot ? slot.id : `empty-${position}`, position, slot };
    });
  }, [shown, viewSize]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  );

  const onDragEnd = (event: DragEndEvent) => {
    if (!event.over || event.active.id === event.over.id) return;
    const from = tiles.findIndex((tile) => tile.key === event.active.id);
    const to = tiles.findIndex((tile) => tile.key === event.over!.id);
    if (from < 0 || to < 0) return;
    const moved = arrayMove(tiles, from, to);
    const changes = moved.flatMap((tile, position) => (tile.slot ? [{ id: tile.slot.id, position }] : []));
    const previous = order;
    const positions = new Map(changes.map((change) => [change.id, change.position]));
    setOrder((current) => current.map((slot) => (positions.has(slot.id) ? { ...slot, position: positions.get(slot.id)! } : slot)));
    setSelected(null);
    start(async () => {
      const result = await saveSlotOrder(layoutId, changes);
      if (result?.error) {
        setOrder(previous);
        setToast({ text: result.error, tone: "error" });
      }
    });
  };

  /** Uploads straight into a tile. The upload goes to the library too, so it is reusable and real. */
  const uploadToTile = async (files: File[], position: number, existing: FeedSlotView | null) => {
    if (!uploadsOn) return setToast({ text: UPLOADS_COMING_SOON, tone: "info" });
    setUploading((current) => ({ ...current, [position]: 0 }));
    try {
      const ids: string[] = [];
      for (const [index, file] of files.entries()) {
        const id = await uploadFile(file, { workspaceId, visibility: "internal" }, (fraction) =>
          setUploading((current) => ({ ...current, [position]: (index + fraction) / files.length })),
        );
        ids.push(id);
      }
      const title = files[0].name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ");
      if (existing) {
        const assetIds = [...existing.media.map((asset) => asset.id), ...ids];
        const kind = existing.kind === "photo" && assetIds.length > 1 ? "carousel" : existing.kind;
        const result = await updateSlot(existing.id, { assetIds, kind });
        if (result?.error) throw new Error(result.error);
      } else {
        const result = await createSlot(layoutId, position, { assetIds: ids, kind: kindForFile(files[0], files.length), title });
        if (result?.error) throw new Error(result.error);
      }
      setSelected(position);
      router.refresh();
    } catch (error) {
      setToast({ text: (error as Error).message, tone: "error" });
    } finally {
      setUploading((current) => {
        const next = { ...current };
        delete next[position];
        return next;
      });
    }
  };

  const go = (id: string) => router.push(`/admin/${slug}/feed?layout=${id}`);

  const onLayoutResult = (result: { error?: string; id?: string } | undefined, message: string, navigate = true) => {
    if (result?.error) setToast({ text: result.error, tone: "error" });
    else {
      setToast({ text: message, tone: "info" });
      if (navigate && result?.id) go(result.id);
    }
  };

  const selectedSlot = selected != null ? (order.find((slot) => slot.position === selected) ?? null) : null;

  return (
    <div className="stack-lg">
      <div className="row-between" style={{ alignItems: "flex-end" }}>
        <div className="row">
          <label className="field">
            <span>Version</span>
            <select data-testid="layout-select" value={layoutId} onChange={(event) => go(event.target.value)} style={{ minWidth: 190 }}>
              {layouts.map((row) => (
                <option key={row.id} value={row.id}>{row.name}{row.sharedWithClient ? " (client sees this)" : ""}</option>
              ))}
            </select>
          </label>
          <button
            className="btn btn-sm"
            style={{ marginTop: 22 }}
            disabled={pending}
            onClick={() => {
              const name = prompt("Name this new version", `${layout.name} copy`);
              if (name) start(async () => onLayoutResult(await duplicateLayout(layoutId, name), "Saved as a new version."));
            }}
          >
            <Copy size={13} /> Save as new version
          </button>
          <button
            className="btn btn-sm btn-ghost"
            style={{ marginTop: 22 }}
            disabled={pending}
            onClick={() => {
              const name = prompt("Name this blank version", "New layout");
              if (name) start(async () => onLayoutResult(await createLayout(slug, name), "New blank version."));
            }}
          >
            Blank
          </button>
          <button
            className="btn btn-sm btn-ghost"
            style={{ marginTop: 22 }}
            disabled={pending}
            onClick={() => {
              const name = prompt("Rename this version", layout.name);
              if (name) start(async () => onLayoutResult(await renameLayout(layoutId, name), "Renamed.", false));
            }}
          >
            Rename
          </button>
          {!layout.sharedWithClient && (
            <button
              className="btn btn-sm btn-ghost btn-danger"
              style={{ marginTop: 22 }}
              disabled={pending}
              onClick={() => {
                if (confirm(`Delete "${layout.name}"?`)) {
                  start(async () => {
                    const result = await deleteLayout(layoutId);
                    if (result?.error) setToast({ text: result.error, tone: "error" });
                    else router.push(`/admin/${slug}/feed`);
                  });
                }
              }}
            >
              Delete
            </button>
          )}
        </div>
        {layout.sharedWithClient ? (
          <span className="badge badge-ok">{profile.firstName} sees the planned posts in this version</span>
        ) : (
          <button className="btn btn-primary" disabled={pending} onClick={() => start(async () => onLayoutResult(await shareLayout(layoutId), `${profile.firstName} can now see this version.`, false))}>
            Show this to {profile.firstName}
          </button>
        )}
      </div>

      <div className="feed-compare">
        <div className="stack-sm">
          <h2 className="section-title">Feed preview</h2>
          <div className="row-between feed-controls">
            <div className="segmented" role="group" aria-label="How many posts to show">
              {FEED_VIEW_SIZES.map((size) => (
                <button key={size} aria-pressed={viewSize === size} onClick={() => setViewSize(size)}>{size}</button>
              ))}
            </div>
            <label className="check small">
              <input type="checkbox" checked={showDrafts} onChange={(event) => setShowDrafts(event.target.checked)} />
              Show drafts
            </label>
          </div>
          <div className="phone" data-testid="feed-planner">
            <input
              ref={avatarInput}
              type="file"
              accept="image/*"
              hidden
              data-testid="avatar-upload"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                try {
                  const id = await uploadFile(file, { workspaceId, title: "Profile picture", visibility: "internal" });
                  await setProfileAvatar(slug, id);
                  router.refresh();
                } catch (error) {
                  setToast({ text: (error as Error).message, tone: "error" });
                }
              }}
            />
            <ProfileHeader profile={profile} plannedCount={order.filter((slot) => slot.media.length > 0).length} />
            <DndContext id="feed-grid" sensors={sensors} collisionDetection={dropUnderCursor} onDragEnd={onDragEnd}>
              <SortableContext items={tiles.map((tile) => tile.key)} strategy={rectSortingStrategy}>
                <div className="ig-grid">
                  {tiles.map((tile) => (
                    <Tile
                      key={tile.key}
                      entry={tile}
                      selected={selected === tile.position}
                      progress={uploading[tile.position] ?? null}
                      onSelect={() => setSelected(tile.position)}
                      onDropFiles={(files) => uploadToTile(files, tile.position, tile.slot)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>
          {uploadsOn && (
            <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => avatarInput.current?.click()}>
              Change profile picture
            </button>
          )}
        </div>

        <CurrentFeed slug={slug} workspaceId={workspaceId} layoutId={currentLayoutId} slots={currentSlots} profile={profile} />
      </div>

      <div className="stack-lg">
          {selected != null ? (
            <div className="slot-drawer">
            <SlotPanel
              key={selected}
              layoutId={layoutId}
              position={selected}
              slot={selectedSlot}
              library={library}
              content={content}
              slug={slug}
              onClose={() => setSelected(null)}
              onPreview={setPreview}
              onUpload={uploadToTile}
              onError={(text) => setToast({ text, tone: "error" })}
            />
            </div>
          ) : (
            <div className="card-quiet muted small">
              Click any tile in the preview to fill or edit it. Drop files straight onto a tile from your computer. Drag tiles to rearrange them.
            </div>
          )}
          <section className="stack-sm">
            <h2 className="section-title">Captions</h2>
            <CaptionList slots={[...shown].sort((a, b) => a.position - b.position)} onOpen={setPreview} />
          </section>
      </div>

      {preview && <PostPreview slot={preview} profile={profile} onClose={() => setPreview(null)} />}
      {toast && <Toast message={toast.text} tone={toast.tone} onDone={() => setToast(null)} />}
    </div>
  );
}
