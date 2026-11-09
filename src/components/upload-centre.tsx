"use client";

import { FileAudio, FileText, Link2, UploadCloud, Video, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { addLinkAsset } from "@/lib/actions/assets";
import { ASSET_CATEGORIES, CATEGORY_LABEL, guessCategory, type AssetCategory } from "@/lib/constants";
import { formatBytes, titleFromFileName } from "@/lib/format";
import { uploadFile } from "@/lib/upload-client";
import { UPLOADS_COMING_SOON, useUploadsEnabled } from "@/components/uploads-gate";

type Project = { id: string; title: string };

type QueueItem = {
  key: string;
  file: File;
  previewUrl: string | null;
  title: string;
  description: string;
  category: AssetCategory;
  tags: string;
  internalNotes: string;
  contentItemId: string;
  state: "ready" | "uploading" | "done" | "error";
  progress: number;
  error?: string;
};

const FILE_CATEGORIES = ASSET_CATEGORIES.filter((c) => c !== "external_link");

/** Friendlier names on the client's side. */
const CLIENT_CATEGORY_LABEL: Partial<Record<AssetCategory, string>> = {
  voiceover: "Voiceover",
  raw_video: "Raw footage",
  photo: "Photo",
  design_reference: "Reference or inspiration",
  screenshot: "Screenshot",
  document: "Document",
};

function parseTags(text: string) {
  return [...new Set(text.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))];
}

function itemFor(file: File, contentItemId: string, force: AssetCategory | null): QueueItem {
  const previewable = file.type.startsWith("image/") || file.type.startsWith("video/");
  return {
    key: crypto.randomUUID(),
    file,
    previewUrl: previewable ? URL.createObjectURL(file) : null,
    title: titleFromFileName(file.name),
    description: "",
    category: force ?? guessCategory(file),
    tags: "",
    internalNotes: "",
    contentItemId,
    state: "ready",
    progress: 0,
  };
}

function Preview({ item }: { item: QueueItem }) {
  if (item.previewUrl && item.file.type.startsWith("image/")) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="upload-preview" src={item.previewUrl} alt="" />;
  }
  if (item.previewUrl) {
    return <video className="upload-preview" src={`${item.previewUrl}#t=0.5`} muted playsInline preload="metadata" />;
  }
  return (
    <div className="upload-preview">
      {item.file.type.startsWith("audio/") ? <FileAudio size={30} /> : item.file.type.startsWith("video/") ? <Video size={30} /> : <FileText size={30} />}
    </div>
  );
}

export function UploadCentre({
  workspaceId,
  mode,
  projects,
  doneHref,
  defaultContentItemId = "",
  forceCategory = null,
  visibility,
  showLinkForm = true,
  startCompact = false,
  dropHint,
}: {
  workspaceId: string;
  mode: "client" | "agency";
  projects: Project[];
  doneHref: string;
  defaultContentItemId?: string;
  /** Inside a folder such as References, every file belongs to that folder whatever its type. */
  forceCategory?: AssetCategory | null;
  visibility?: "shared" | "internal";
  showLinkForm?: boolean;
  startCompact?: boolean;
  dropHint?: string;
}) {
  const router = useRouter();
  const uploadsOn = useUploadsEnabled();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [isOver, setIsOver] = useState(false);
  const [sending, setSending] = useState(false);
  const [finished, setFinished] = useState(0);
  const isClient = mode === "client";

  const patch = (key: string, change: Partial<QueueItem>) =>
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...change } : item)));

  const addFiles = (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length) {
      setFinished(0);
      setItems((current) => [...current, ...list.map((file) => itemFor(file, defaultContentItemId, forceCategory))]);
    }
  };

  const remove = (key: string) =>
    setItems((current) => {
      const target = current.find((item) => item.key === key);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return current.filter((item) => item.key !== key);
    });

  // Leaving the page would cancel a running upload.
  useEffect(() => {
    if (!sending) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [sending]);

  const sendAll = async () => {
    setSending(true);
    const pending = items.filter((item) => item.state === "ready" || item.state === "error");
    let succeeded = 0;
    // Two at a time keeps a big batch moving without choking the connection.
    const queue = [...pending];
    const worker = async () => {
      while (queue.length) {
        const item = queue.shift()!;
        patch(item.key, { state: "uploading", progress: 0, error: undefined });
        try {
          await uploadFile(
            item.file,
            {
              workspaceId,
              title: item.title,
              description: item.description,
              category: item.category,
              tags: parseTags(item.tags),
              internalNotes: item.internalNotes,
              visibility,
              contentItemId: item.contentItemId || null,
            },
            (progress) => patch(item.key, { progress }),
          );
          patch(item.key, { state: "done", progress: 1 });
          succeeded += 1;
        } catch (error) {
          patch(item.key, { state: "error", error: (error as Error).message });
        }
      }
    };
    await Promise.all([worker(), worker()]);
    setSending(false);
    setFinished((value) => value + succeeded);
    setItems((current) => {
      current.filter((item) => item.state === "done").forEach((item) => item.previewUrl && URL.revokeObjectURL(item.previewUrl));
      return current.filter((item) => item.state !== "done");
    });
    router.refresh();
  };

  const readyCount = items.filter((item) => item.state === "ready" || item.state === "error").length;

  if (!uploadsOn) {
    return (
      <div className="stack-lg">
        <div className="dropzone compact" aria-disabled="true" data-testid="uploads-coming-soon">
          <UploadCloud size={20} style={{ margin: "0 auto 10px", color: "var(--ink-3)" }} />
          <h2>{UPLOADS_COMING_SOON}</h2>
          <p className="muted small">{showLinkForm ? "For now, paste a link below instead." : "Files can be added here soon."}</p>
        </div>
        {showLinkForm && <LinkForm workspaceId={workspaceId} isClient={isClient} projects={projects} defaultContentItemId={defaultContentItemId} />}
      </div>
    );
  }

  return (
    <div className="stack-lg">
      <div
        className={`dropzone${isOver ? " is-over" : ""}${items.length || startCompact ? " compact" : ""}`}
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") inputRef.current?.click();
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setIsOver(true);
        }}
        onDragLeave={() => setIsOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsOver(false);
          addFiles(event.dataTransfer.files);
        }}
      >
        <input
          ref={inputRef}
          data-testid="file-input"
          type="file"
          multiple
          hidden
          onChange={(event) => {
            if (event.target.files) addFiles(event.target.files);
            event.target.value = "";
          }}
        />
        <UploadCloud size={items.length || startCompact ? 20 : 30} style={{ margin: "0 auto 10px", color: "var(--beet)" }} />
        <h2>{items.length ? "Add more files" : <>Drop your files <em>here</em></>}</h2>
        <p className="muted small">{dropHint ?? "Voiceovers, raw footage, photos, references. As many as you like, up to 5 GB each."}</p>
      </div>

      {finished > 0 && !items.length && (
        <div className="card row-between" role="status">
          <div>
            <p className="section-title">{finished === 1 ? "Your file is in." : `All ${finished} files are in.`}</p>
            <p className="muted small">{isClient ? "The team has been told. There is nothing else you need to do." : "Saved to the library."}</p>
          </div>
          {doneHref && <a className="btn" href={doneHref}>{isClient ? "See my files" : "Open the library"}</a>}
        </div>
      )}

      {items.length > 0 && (
        <div className="stack">
          {items.map((item) => {
            const locked = item.state === "uploading" || item.state === "done";
            return (
              <div className="upload-item" key={item.key} data-testid="upload-item">
                <Preview item={item} />
                <div className="stack-sm">
                  <div className="row-between">
                    <span className="muted tiny truncate">
                      {item.file.name} · {formatBytes(item.file.size)}
                    </span>
                    {!locked && (
                      <button className="icon-btn" type="button" aria-label={`Remove ${item.file.name}`} onClick={() => remove(item.key)}>
                        <X size={16} />
                      </button>
                    )}
                  </div>
                  <div className="grid-2">
                    <label className="field">
                      <span>Title</span>
                      <input value={item.title} disabled={locked} onChange={(e) => patch(item.key, { title: e.target.value })} />
                    </label>
                    <label className="field">
                      <span>{isClient ? "What is it?" : "Category"}</span>
                      <select value={item.category} disabled={locked} onChange={(e) => patch(item.key, { category: e.target.value as AssetCategory })}>
                        {FILE_CATEGORIES.filter((c) => (!isClient || CLIENT_CATEGORY_LABEL[c]) && (!["brand_asset", "live_post"].includes(c) || forceCategory === c)).map((c) => (
                          <option key={c} value={c}>
                            {isClient ? CLIENT_CATEGORY_LABEL[c] : CATEGORY_LABEL[c]}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label className="field">
                    <span>{isClient ? "Anything we should know?" : "Description"}</span>
                    <textarea
                      rows={2}
                      style={{ minHeight: 60 }}
                      placeholder={isClient ? "For example: use the second take, and keep the bit where I laugh." : ""}
                      value={item.description}
                      disabled={locked}
                      onChange={(e) => patch(item.key, { description: e.target.value })}
                    />
                  </label>
                  <div className="grid-2">
                    <label className="field">
                      <span>Tags</span>
                      <input placeholder="travel, recipe" value={item.tags} disabled={locked} onChange={(e) => patch(item.key, { tags: e.target.value })} />
                    </label>
                    {projects.length > 0 && (
                      <label className="field">
                        <span>{isClient ? "Is this for a piece we are making?" : "Content project"}</span>
                        <select value={item.contentItemId} disabled={locked} onChange={(e) => patch(item.key, { contentItemId: e.target.value })}>
                          <option value="">{isClient ? "Not sure, or something new" : "None"}</option>
                          {projects.map((project) => (
                            <option key={project.id} value={project.id}>{project.title}</option>
                          ))}
                        </select>
                      </label>
                    )}
                  </div>
                  {!isClient && (
                    <label className="field">
                      <span>Internal notes</span>
                      <input value={item.internalNotes} disabled={locked} onChange={(e) => patch(item.key, { internalNotes: e.target.value })} />
                    </label>
                  )}
                  {item.state === "uploading" && (
                    <div className="progress" role="progressbar" aria-valuenow={Math.round(item.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
                      <div style={{ width: `${item.progress * 100}%` }} />
                    </div>
                  )}
                  {item.state === "error" && <p className="form-error">{item.error} Press send to try again.</p>}
                </div>
              </div>
            );
          })}
          <div className="row-between">
            <span className="muted small">
              {sending ? "Please keep this page open until it finishes." : `${readyCount} ${readyCount === 1 ? "file" : "files"} ready`}
            </span>
            <button className="btn btn-primary btn-lg" type="button" disabled={sending || !readyCount} onClick={sendAll}>
              {sending ? "Sending" : isClient ? "Send to the team" : "Upload to library"}
            </button>
          </div>
        </div>
      )}

      {showLinkForm && <LinkForm workspaceId={workspaceId} isClient={isClient} projects={projects} defaultContentItemId={defaultContentItemId} />}
    </div>
  );
}

function LinkForm({
  workspaceId,
  isClient,
  projects,
  defaultContentItemId,
}: {
  workspaceId: string;
  isClient: boolean;
  projects: Project[];
  defaultContentItemId: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  return (
    <form
      ref={formRef}
      className="card stack-sm"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        form.set("workspaceId", workspaceId);
        setError(undefined);
        setSaved(false);
        start(async () => {
          const result = await addLinkAsset(form);
          if (result?.error) setError(result.error);
          else {
            setSaved(true);
            formRef.current?.reset();
            router.refresh();
          }
        });
      }}
    >
      <div className="row-sm">
        <Link2 size={16} style={{ color: "var(--beet)" }} />
        <p className="section-title">{isClient ? "Or share a link" : "Add a link"}</p>
      </div>
      <p className="muted small">An Instagram reel you love, a TikTok, a mood board, anything with a web address.</p>
      <div className="grid-2">
        <label className="field">
          <span>Link</span>
          <input name="url" type="url" required placeholder="https://www.instagram.com/reel/..." />
        </label>
        <label className="field">
          <span>Title</span>
          <input name="title" placeholder="What is this?" />
        </label>
      </div>
      <label className="field">
        <span>{isClient ? "What do you like about it?" : "Description"}</span>
        <input name="description" />
      </label>
      {projects.length > 0 && (
        <label className="field">
          <span>{isClient ? "Is this for a piece we are making?" : "Content project"}</span>
          <select name="contentItemId" defaultValue={defaultContentItemId}>
            <option value="">{isClient ? "Not sure, or something new" : "None"}</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>{project.title}</option>
            ))}
          </select>
        </label>
      )}
      {error && <p className="form-error">{error}</p>}
      {saved && <p className="form-ok" role="status">Link saved.</p>}
      <div>
        <button className="btn" disabled={pending}>{pending ? "Saving" : "Save link"}</button>
      </div>
    </form>
  );
}
