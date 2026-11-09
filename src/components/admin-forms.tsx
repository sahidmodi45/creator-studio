"use client";

import Link from "next/link";
import { useActionState, useRef, useState, useTransition } from "react";
import { CopyLink } from "@/components/ui";
import { createContent } from "@/lib/actions/content";
import {
  createClientWorkspace,
  deleteBrandDoc,
  inviteToWorkspace,
  removeMember,
  saveBrandDoc,
  saveBrandKit,
  saveFollowerSnapshot,
  saveMetrics,
  updateProfile,
} from "@/lib/actions/workspace";
import { createTask, deleteTask, setRequestStatus, setTaskStatus } from "@/lib/actions/requests";
import { FORMAT_LABEL, FORMATS } from "@/lib/constants";
import { useRouter } from "next/navigation";

export function NewClientForm() {
  const [state, action, pending] = useActionState(createClientWorkspace, undefined);
  return (
    <form action={action} className="stack card">
      <div className="grid-2">
        <label className="field"><span>Full name or brand</span><input name="name" required /></label>
        <label className="field"><span>First name</span><input name="firstName" required /></label>
        <label className="field"><span>Their email</span><input name="email" type="email" required /></label>
        <label className="field"><span>Instagram handle</span><input name="instagramHandle" placeholder="@handle" /></label>
      </div>
      {state?.error && <p className="form-error" role="alert">{state.error}</p>}
      {state?.link && (
        <div className="stack-sm" role="status">
          <p className="form-ok">
            Workspace created. Send them this link to get in. <Link className="link" href={`/admin/${state.slug}`}>Open the workspace</Link>
          </p>
          <CopyLink link={state.link} />
        </div>
      )}
      <div><button className="btn btn-primary" disabled={pending}>{pending ? "Creating" : "Create workspace"}</button></div>
    </form>
  );
}

export function NewContentForm({ slug, pillars }: { slug: string; pillars: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();

  if (!open) return <button className="btn btn-primary" onClick={() => setOpen(true)}>New content</button>;
  return (
    <div className="modal-backdrop" onClick={() => setOpen(false)}>
      <form
        className="modal modal-narrow stack"
        role="dialog"
        aria-label="New content"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          start(async () => {
            const result = await createContent(slug, form);
            if (result?.error) setError(result.error);
            else if (result?.id) router.push(`/admin/${slug}/content/${result.id}`);
          });
        }}
      >
        <h2 className="section-title">New content</h2>
        <label className="field"><span>Title</span><input name="title" required autoFocus /></label>
        <div className="grid-2">
          <label className="field">
            <span>Format</span>
            <select name="format" defaultValue="reel">
              {FORMATS.map((format) => <option key={format} value={format}>{FORMAT_LABEL[format]}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Pillar</span>
            <select name="pillar" defaultValue="">
              <option value="">None yet</option>
              {pillars.map((pillar) => <option key={pillar} value={pillar}>{pillar}</option>)}
            </select>
          </label>
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="row-sm">
          <button className="btn btn-primary" disabled={pending}>Create</button>
          <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
        </div>
      </form>
    </div>
  );
}

export function ProfileForm({
  slug,
  workspace,
}: {
  slug: string;
  workspace: {
    instagramHandle: string | null;
    profileName: string | null;
    bio: string | null;
    profileLink: string | null;
    followers: number | null;
    following: number | null;
    postCount: number | null;
    pillars: string[];
  };
}) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string>();
  return (
    <form
      className="stack"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        start(async () => {
          const result = await updateProfile(slug, form);
          setMessage(result?.error ?? "Saved.");
        });
      }}
    >
      <div className="grid-2">
        <label className="field"><span>Instagram handle</span><input name="instagramHandle" defaultValue={workspace.instagramHandle ?? ""} /></label>
        <label className="field"><span>Name on profile</span><input name="profileName" defaultValue={workspace.profileName ?? ""} /></label>
      </div>
      <label className="field"><span>Bio</span><textarea name="bio" rows={4} defaultValue={workspace.bio ?? ""} /></label>
      <label className="field"><span>Link in bio</span><input name="profileLink" defaultValue={workspace.profileLink ?? ""} /></label>
      <div className="grid-3">
        <label className="field"><span>Followers</span><input name="followers" type="number" min={0} defaultValue={workspace.followers ?? ""} /></label>
        <label className="field"><span>Following</span><input name="following" type="number" min={0} defaultValue={workspace.following ?? ""} /></label>
        <label className="field"><span>Live posts</span><input name="postCount" type="number" min={0} defaultValue={workspace.postCount ?? ""} /></label>
      </div>
      <label className="field">
        <span>Content pillars</span>
        <input name="pillars" defaultValue={workspace.pillars.join(", ")} />
        <small>Separate with commas.</small>
      </label>
      {message && <p className={message === "Saved." ? "form-ok" : "form-error"} role="status">{message}</p>}
      <div><button className="btn btn-primary" disabled={pending}>Save profile</button></div>
    </form>
  );
}

export function InviteForm({ slug }: { slug: string }) {
  const [state, action, pending] = useActionState(inviteToWorkspace.bind(null, slug), undefined);
  return (
    <form action={action} className="stack">
      <div className="grid-3">
        <label className="field"><span>Name</span><input name="name" required /></label>
        <label className="field"><span>Email</span><input name="email" type="email" required /></label>
        <label className="field">
          <span>Access</span>
          <select name="role" defaultValue="client">
            <option value="client">Client</option>
            <option value="team">Team member</option>
          </select>
        </label>
      </div>
      {state?.error && <p className="form-error" role="alert">{state.error}</p>}
      {state?.link && (
        <div className="stack-sm" role="status">
          <p className="form-ok">Send this link. It works once and lasts 7 days. Sending it to someone who already has access lets them set a new password.</p>
          <CopyLink link={state.link} />
        </div>
      )}
      <div><button className="btn" disabled={pending}>{pending ? "Creating" : "Create invite link"}</button></div>
    </form>
  );
}

export function RemoveMemberButton({ slug, userId, name }: { slug: string; userId: string; name: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      className="btn btn-sm btn-danger"
      disabled={pending}
      onClick={() => {
        if (confirm(`Remove ${name} from this workspace?`)) start(async () => void (await removeMember(slug, userId)));
      }}
    >
      Remove
    </button>
  );
}

export function BrandKitForm({ slug, colors, fonts }: { slug: string; colors: string[]; fonts: string[] }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string>();
  return (
    <form
      className="stack-sm"
      data-testid="brand-kit"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        start(async () => {
          const result = await saveBrandKit(slug, form);
          setMessage(result?.error ?? "Saved.");
        });
      }}
    >
      <div className="grid-2">
        <label className="field">
          <span>Colours</span>
          <input name="colors" defaultValue={colors.join(", ")} placeholder="#7A143C, #F6C4D0" />
          <small>Colour codes, separated with commas.</small>
        </label>
        <label className="field">
          <span>Fonts</span>
          <input name="fonts" defaultValue={fonts.join(", ")} placeholder="Heading font, body font" />
          <small>Separated with commas.</small>
        </label>
      </div>
      <div className="row-sm">
        <button className="btn btn-sm" disabled={pending}>Save colours and fonts</button>
        {message && <span className={message === "Saved." ? "form-ok" : "form-error"} role="status">{message}</span>}
      </div>
    </form>
  );
}

export function BrandDocEditor({ slug, doc }: { slug: string; doc?: { id: string; title: string; body: string; sharedWithClient: boolean } }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string>();
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={formRef}
      className="card stack-sm"
      data-testid="brand-doc"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        form.set("id", doc?.id ?? "");
        start(async () => {
          const result = await saveBrandDoc(slug, form);
          setMessage(result?.error ?? "Saved.");
          if (!result?.error && !doc) formRef.current?.reset();
        });
      }}
    >
      <input name="title" defaultValue={doc?.title ?? ""} placeholder="Section title" required aria-label="Section title" style={{ fontWeight: 600 }} />
      <textarea name="body" className="tall" defaultValue={doc?.body ?? ""} placeholder="What should the assistant know?" aria-label="Section text" />
      <label className="check small">
        <input type="checkbox" name="sharedWithClient" defaultChecked={doc?.sharedWithClient ?? false} />
        Show this section to the client
      </label>
      <div className="row-between">
        <div className="row-sm">
          <button className="btn btn-sm" disabled={pending}>{doc ? "Save" : "Add section"}</button>
          {message && <span className={message === "Saved." ? "form-ok" : "form-error"}>{message}</span>}
        </div>
        {doc && (
          <button
            type="button"
            className="btn btn-sm btn-ghost btn-danger"
            disabled={pending}
            onClick={() => {
              if (confirm(`Delete "${doc.title}"?`)) start(async () => void (await deleteBrandDoc(slug, doc.id)));
            }}
          >
            Delete
          </button>
        )}
      </div>
    </form>
  );
}

export function RequestActions({ slug, requestId, status }: { slug: string; requestId: string; status: string }) {
  const [pending, start] = useTransition();
  return (
    <select
      aria-label="Request status"
      value={status}
      disabled={pending}
      style={{ width: "auto" }}
      onChange={(event) => {
        const next = event.target.value as "new" | "in_progress" | "done" | "declined";
        const note = next === "declined" ? (prompt("A short note for the client (optional)") ?? "") : "";
        start(async () => void (await setRequestStatus(slug, requestId, next, note)));
      }}
    >
      <option value="new">New</option>
      <option value="in_progress">In progress</option>
      <option value="done">Done</option>
      <option value="declined">Declined</option>
    </select>
  );
}

export function NewTaskForm({ slug, team }: { slug: string; team: { id: string; name: string }[] }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={formRef}
      className="row row-top"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        start(async () => {
          const result = await createTask(slug, form);
          if (result?.error) setError(result.error);
          else {
            setError(undefined);
            formRef.current?.reset();
          }
        });
      }}
    >
      <label className="field grow" style={{ minWidth: 220 }}><span>New task</span><input name="title" required /></label>
      <label className="field"><span>Due</span><input name="dueDate" type="date" /></label>
      <label className="field">
        <span>For</span>
        <select name="assigneeId" defaultValue="">
          <option value="">Anyone</option>
          {team.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
        </select>
      </label>
      <button className="btn" style={{ marginTop: 22 }} disabled={pending}>Add</button>
      {error && <p className="form-error">{error}</p>}
    </form>
  );
}

export function TaskStatusControl({ slug, taskId, status }: { slug: string; taskId: string; status: "todo" | "doing" | "done" }) {
  const [pending, start] = useTransition();
  return (
    <div className="row-sm">
      <select
        aria-label="Task status"
        value={status}
        disabled={pending}
        style={{ width: "auto", padding: "4px 8px", fontSize: 13 }}
        onChange={(event) => start(async () => void (await setTaskStatus(slug, taskId, event.target.value as "todo" | "doing" | "done")))}
      >
        <option value="todo">To do</option>
        <option value="doing">Doing</option>
        <option value="done">Done</option>
      </select>
      <button className="btn btn-sm btn-ghost" disabled={pending} onClick={() => start(async () => void (await deleteTask(slug, taskId)))}>
        Delete
      </button>
    </div>
  );
}

export function MetricsForm({ slug, items, today }: { slug: string; items: { id: string; title: string }[]; today: string }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string>();
  const formRef = useRef<HTMLFormElement>(null);
  const fields: [string, string][] = [
    ["views", "Views"],
    ["reach", "Reach"],
    ["nonFollowerReach", "Non-follower reach"],
    ["likes", "Likes"],
    ["comments", "Comments"],
    ["shares", "Shares"],
    ["saves", "Saves"],
    ["follows", "Follows"],
  ];
  return (
    <form
      ref={formRef}
      className="card stack"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        start(async () => {
          const result = await saveMetrics(slug, form);
          setMessage(result?.error ?? "Saved.");
          if (!result?.error) formRef.current?.reset();
        });
      }}
    >
      <div className="grid-2">
        <label className="field">
          <span>Post</span>
          <select name="contentItemId" required defaultValue="">
            <option value="" disabled>Choose a post</option>
            {items.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select>
        </label>
        <label className="field"><span>Numbers as of</span><input name="capturedOn" type="date" defaultValue={today} required /></label>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 12 }}>
        {fields.map(([name, label]) => (
          <label key={name} className="field"><span>{label}</span><input name={name} type="number" min={0} inputMode="numeric" /></label>
        ))}
      </div>
      {message && <p className={message === "Saved." ? "form-ok" : "form-error"} role="status">{message}</p>}
      <div><button className="btn btn-primary" disabled={pending}>Save numbers</button></div>
    </form>
  );
}

export function FollowerForm({ slug, today }: { slug: string; today: string }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string>();
  return (
    <form
      className="row row-top"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        start(async () => {
          const result = await saveFollowerSnapshot(slug, form);
          setMessage(result?.error ?? "Saved.");
        });
      }}
    >
      <label className="field"><span>Date</span><input name="capturedOn" type="date" defaultValue={today} required /></label>
      <label className="field"><span>Followers</span><input name="followers" type="number" min={0} required /></label>
      <button className="btn" style={{ marginTop: 22 }} disabled={pending}>Add</button>
      {message && <span className={message === "Saved." ? "form-ok" : "form-error"} style={{ marginTop: 26 }}>{message}</span>}
    </form>
  );
}
