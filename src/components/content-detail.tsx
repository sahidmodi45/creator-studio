"use client";

import { Plus, UploadCloud, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Toast } from "@/components/ui";
import { linkAssetToContent, unlinkAssetFromContent } from "@/lib/actions/assets";
import { deleteContent, setContentStatus, updateContent } from "@/lib/actions/content";
import {
  CONTENT_ASSET_ROLES,
  CONTENT_STATUSES,
  FORMAT_LABEL,
  FORMATS,
  ROLE_LABEL,
  STATUS_LABEL,
  type ContentAssetRole,
  type ContentFormat,
  type ContentStatus,
} from "@/lib/constants";
import { formatBytes, formatDuration } from "@/lib/format";
import { uploadFile } from "@/lib/upload-client";
import { UPLOADS_COMING_SOON, UploadsComingSoon, useUploadsEnabled } from "@/components/uploads-gate";

/* ---------------------------------------------------------- status track */

export function StatusTrack({ id, status }: { id: string; status: ContentStatus }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const currentIndex = CONTENT_STATUSES.indexOf(status);
  return (
    <>
      <div className="status-track" role="group" aria-label="Status" data-testid="status-track">
        {CONTENT_STATUSES.map((value, index) => (
          <button
            key={value}
            disabled={pending}
            aria-pressed={value === status}
            className={value === status ? "current" : index < currentIndex ? "past" : ""}
            onClick={() => {
              if (value === status) return;
              setError(null);
              start(async () => {
                const result = await setContentStatus(id, value);
                if (result?.error) setError(result.error);
              });
            }}
          >
            {STATUS_LABEL[value]}
          </button>
        ))}
      </div>
      {error && <Toast message={error} tone="error" onDone={() => setError(null)} />}
    </>
  );
}

/* ---------------------------------------------------------- main editor */

type EditorItem = {
  id: string;
  title: string;
  pillar: string | null;
  format: ContentFormat;
  brief: string;
  script: string;
  caption: string;
  internalNotes: string;
  scheduledDate: string | null;
  scheduledTime: string | null;
  publishingLink: string | null;
  ownerId: string | null;
};

export function ContentEditor({ item, pillars, team }: { item: EditorItem; pillars: string[]; team: { id: string; name: string }[] }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ text: string; tone: "info" | "error" } | null>(null);
  const pillarOptions = item.pillar && !pillars.includes(item.pillar) ? [...pillars, item.pillar] : pillars;

  return (
    <form
      className="stack-lg"
      data-testid="content-editor"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        start(async () => {
          const result = await updateContent(item.id, form);
          if (result?.error) setMessage({ text: result.error, tone: "error" });
          else setMessage({ text: result?.warning ?? "Saved.", tone: result?.warning ? "error" : "info" });
        });
      }}
    >
      <label className="field"><span>Content title</span><input name="title" defaultValue={item.title} required /></label>

      <div className="grid-3">
        <label className="field">
          <span>Content pillar</span>
          <select name="pillar" defaultValue={item.pillar ?? ""}>
            <option value="">None yet</option>
            {pillarOptions.map((pillar) => <option key={pillar} value={pillar}>{pillar}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Format</span>
          <select name="format" defaultValue={item.format}>
            {FORMATS.map((format) => <option key={format} value={format}>{FORMAT_LABEL[format]}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Owner</span>
          <select name="ownerId" defaultValue={item.ownerId ?? ""}>
            <option value="">Nobody yet</option>
            {team.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
          </select>
        </label>
      </div>

      <label className="field"><span>Brief</span><textarea name="brief" defaultValue={item.brief} /></label>
      <label className="field"><span>Script</span><textarea name="script" className="tall" defaultValue={item.script} /></label>
      <label className="field">
        <span>Caption</span>
        <textarea name="caption" defaultValue={item.caption} rows={6} style={{ minHeight: 140 }} />
      </label>

      <div className="grid-3">
        <label className="field"><span>Scheduled date</span><input name="scheduledDate" type="date" defaultValue={item.scheduledDate ?? ""} /></label>
        <label className="field"><span>Time</span><input name="scheduledTime" type="time" defaultValue={item.scheduledTime ?? ""} /></label>
        <label className="field"><span>Publishing link</span><input name="publishingLink" type="url" defaultValue={item.publishingLink ?? ""} placeholder="https://www.instagram.com/p/..." /></label>
      </div>

      <label className="field">
        <span>Internal notes</span>
        <textarea name="internalNotes" defaultValue={item.internalNotes} />
        <small>Team only. The client never sees this.</small>
      </label>

      <div><button className="btn btn-primary" disabled={pending}>{pending ? "Saving" : "Save changes"}</button></div>
      {message && <Toast message={message.text} tone={message.tone} onDone={() => setMessage(null)} />}
    </form>
  );
}

/* ---------------------------------------------------------- attached files */

type FileRow = {
  id: string;
  title: string;
  category: string;
  mimeType: string | null;
  sizeBytes: number | null;
  durationSeconds: number | null;
  thumbnailKey: string | null;
  visibility: string;
  externalUrl: string | null;
};

function RoleSection({
  slug,
  workspaceId,
  contentItemId,
  role,
  files,
  library,
}: {
  slug: string;
  workspaceId: string;
  contentItemId: string;
  role: ContentAssetRole;
  files: FileRow[];
  library: { id: string; title: string }[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string>();
  const [picking, setPicking] = useState(false);
  const [pending, start] = useTransition();
  const uploadsOn = useUploadsEnabled();

  const attachedIds = new Set(files.map((file) => file.id));
  const available = library.filter((asset) => !attachedIds.has(asset.id));

  const upload = async (list: FileList) => {
    setError(undefined);
    for (const file of Array.from(list)) {
      setProgress(0);
      try {
        await uploadFile(
          file,
          {
            workspaceId,
            contentItemId,
            role,
            category: role === "edited_video" ? "edited_video" : role === "voiceover" ? "voiceover" : role === "raw_footage" ? undefined : role === "cover" ? "photo" : "design_reference",
            visibility: "internal",
          },
          setProgress,
        );
      } catch (failure) {
        setError((failure as Error).message);
      }
    }
    setProgress(null);
    router.refresh();
  };

  return (
    <div className="asset-slot" data-testid={`role-${role}`}>
      <div className="row-between">
        <span className="field-label">{ROLE_LABEL[role]}</span>
        <span className="row-sm">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPicking((open) => !open)} aria-label={`Choose ${ROLE_LABEL[role]} from the library`}>
            <Plus size={13} /> Library
          </button>
          {uploadsOn ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => inputRef.current?.click()} aria-label={`Upload ${ROLE_LABEL[role]}`}>
              <UploadCloud size={13} /> Upload
            </button>
          ) : (
            <UploadsComingSoon />
          )}
        </span>
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          data-testid={`upload-${role}`}
          onChange={(event) => {
            if (event.target.files?.length) void upload(event.target.files);
            event.target.value = "";
          }}
        />
      </div>

      {picking && (
        <select
          aria-label={`Pick ${ROLE_LABEL[role]}`}
          value=""
          disabled={pending}
          onChange={(event) => {
            const assetId = event.target.value;
            if (!assetId) return;
            start(async () => {
              const result = await linkAssetToContent(assetId, contentItemId, role);
              if (result?.error) setError(result.error);
              setPicking(false);
            });
          }}
        >
          <option value="">{available.length ? "Choose a file" : "No other files in the library"}</option>
          {available.map((asset) => <option key={asset.id} value={asset.id}>{asset.title}</option>)}
        </select>
      )}

      {progress != null && (
        <div className="progress" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div style={{ width: `${progress * 100}%` }} />
        </div>
      )}
      {error && <p className="form-error">{error}</p>}

      {files.map((file) => (
        <div key={file.id} className="asset-chip">
          {file.thumbnailKey ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/assets/${file.id}/file?variant=thumb`} alt="" />
          ) : (
            <div className="chip-icon" />
          )}
          <div className="grow">
            <Link className="plain-link small strong truncate" style={{ display: "block" }} href={`/admin/${slug}/library/${file.id}`}>{file.title}</Link>
            <p className="muted tiny">
              {[formatDuration(file.durationSeconds), formatBytes(file.sizeBytes), file.visibility === "internal" ? "Team only" : "Client can see"].filter(Boolean).join(" · ")}
            </p>
          </div>
          <button
            type="button"
            className="icon-btn"
            aria-label={`Remove ${file.title}`}
            disabled={pending}
            onClick={() => start(async () => void (await unlinkAssetFromContent(file.id, contentItemId, role)))}
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

export function ContentAssets({
  slug,
  workspaceId,
  contentItemId,
  grouped,
  library,
}: {
  slug: string;
  workspaceId: string;
  contentItemId: string;
  grouped: Record<string, FileRow[]>;
  library: { id: string; title: string }[];
}) {
  return (
    <section className="stack">
      <h2 className="section-title">Files</h2>
      {CONTENT_ASSET_ROLES.map((role) => (
        <RoleSection
          key={role}
          slug={slug}
          workspaceId={workspaceId}
          contentItemId={contentItemId}
          role={role}
          files={grouped[role] ?? []}
          library={library}
        />
      ))}
    </section>
  );
}

export function DeleteContentButton({ id, title }: { id: string; title: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn btn-sm btn-ghost btn-danger"
      style={{ alignSelf: "flex-start" }}
      disabled={pending}
      onClick={() => {
        if (confirm(`Delete "${title}"? Its files stay in the library.`)) start(async () => void (await deleteContent(id)));
      }}
    >
      Delete this piece
    </button>
  );
}
