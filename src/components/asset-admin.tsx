"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { deleteAsset, linkAssetToContent, unlinkAssetFromContent, updateAsset } from "@/lib/actions/assets";
import { ASSET_CATEGORIES, ASSET_STATUS_LABEL, ASSET_STATUSES, CATEGORY_LABEL, CONTENT_ASSET_ROLES, ROLE_LABEL, type ContentAssetRole } from "@/lib/constants";

type EditableAsset = {
  id: string;
  title: string;
  description: string;
  category: (typeof ASSET_CATEGORIES)[number];
  status: string;
  visibility: "shared" | "internal";
  tags: string[];
  internalNotes: string;
};

export function AssetEditForm({ asset }: { asset: EditableAsset }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string>();
  return (
    <form
      className="stack-sm"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        start(async () => {
          const result = await updateAsset(asset.id, form);
          setMessage(result?.error ?? "Saved.");
        });
      }}
    >
      <label className="field"><span>Title</span><input name="title" defaultValue={asset.title} required /></label>
      <label className="field"><span>Description</span><textarea name="description" defaultValue={asset.description} /></label>
      <div className="grid-2">
        <label className="field">
          <span>Category</span>
          <select name="category" defaultValue={asset.category}>
            {ASSET_CATEGORIES.map((category) => <option key={category} value={category}>{CATEGORY_LABEL[category]}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Status</span>
          <select name="status" defaultValue={asset.status}>
            {ASSET_STATUSES.map((status) => <option key={status} value={status}>{ASSET_STATUS_LABEL[status]}</option>)}
          </select>
        </label>
      </div>
      <label className="field">
        <span>Who can see this</span>
        <select name="visibility" defaultValue={asset.visibility}>
          <option value="internal">Team only</option>
          <option value="shared">Team and client</option>
        </select>
      </label>
      <label className="field"><span>Tags</span><input name="tags" defaultValue={asset.tags.join(", ")} placeholder="Separate with commas" /></label>
      <label className="field"><span>Internal notes</span><textarea name="internalNotes" defaultValue={asset.internalNotes} /></label>
      {message && <p className={message === "Saved." ? "form-ok" : "form-error"} role="status">{message}</p>}
      <div className="row-between">
        <button className="btn btn-primary btn-sm" disabled={pending}>Save</button>
        <button
          type="button"
          className="btn btn-sm btn-ghost btn-danger"
          disabled={pending}
          onClick={() => {
            if (confirm(`Remove "${asset.title}" from the library?`)) start(async () => void (await deleteAsset(asset.id)));
          }}
        >
          Remove from library
        </button>
      </div>
    </form>
  );
}

export function AssetProjectLinker({
  assetId,
  linked,
  projects,
  slug,
}: {
  assetId: string;
  linked: { id: string; title: string; role: ContentAssetRole }[];
  projects: { id: string; title: string }[];
  slug: string;
}) {
  const [pending, start] = useTransition();
  const [project, setProject] = useState("");
  const [role, setRole] = useState<ContentAssetRole | "">("");
  const [error, setError] = useState<string>();

  return (
    <div className="stack-sm">
      {linked.length === 0 && <p className="muted small">Not part of a piece yet.</p>}
      {linked.map((row) => (
        <div key={`${row.id}-${row.role}`} className="row-between small">
          <Link className="link truncate grow" href={`/admin/${slug}/content/${row.id}`}>{row.title}</Link>
          <span className="row-sm">
            <span className="muted tiny">{ROLE_LABEL[row.role]}</span>
            <button
              className="icon-btn"
              style={{ width: 24, height: 24 }}
              aria-label={`Remove from ${row.title}`}
              disabled={pending}
              onClick={() => start(async () => void (await unlinkAssetFromContent(assetId, row.id, row.role)))}
            >
              <X size={13} />
            </button>
          </span>
        </div>
      ))}
      {projects.length > 0 && (
        <div className="stack-sm">
          <select aria-label="Choose a project" value={project} onChange={(event) => setProject(event.target.value)}>
            <option value="">Add to a piece</option>
            {projects.map((row) => <option key={row.id} value={row.id}>{row.title}</option>)}
          </select>
          {project && (
            <div className="row-sm">
              <select aria-label="Role" value={role} style={{ width: "auto" }} onChange={(event) => setRole(event.target.value as ContentAssetRole)}>
                <option value="">Use as (automatic)</option>
                {CONTENT_ASSET_ROLES.map((value) => <option key={value} value={value}>{ROLE_LABEL[value]}</option>)}
              </select>
              <button
                className="btn btn-sm"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const result = await linkAssetToContent(assetId, project, role || undefined);
                    if (result?.error) setError(result.error);
                    else {
                      setProject("");
                      setRole("");
                    }
                  })
                }
              >
                Attach
              </button>
            </div>
          )}
        </div>
      )}
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}
