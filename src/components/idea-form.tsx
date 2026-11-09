"use client";

import { Paperclip, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { submitRequest } from "@/lib/actions/requests";
import { FORMAT_LABEL, FORMATS, PRIORITIES, PRIORITY_LABEL, type Priority } from "@/lib/constants";
import { formatBytes } from "@/lib/format";
import { uploadFile } from "@/lib/upload-client";
import { UploadsComingSoon, useUploadsEnabled } from "@/components/uploads-gate";

export function IdeaForm({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [priority, setPriority] = useState<Priority>("normal");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [sent, setSent] = useState(false);
  const uploadsOn = useUploadsEnabled();

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(undefined);
    setSent(false);
    const form = new FormData(event.currentTarget);
    form.set("workspaceId", workspaceId);
    form.set("priority", priority);
    setBusy("Sending your idea");

    const result = await submitRequest(form);
    if (result?.error || !result?.id) {
      setError(result?.error ?? "That did not go through. Please try again.");
      setBusy(null);
      return;
    }

    // The idea is safe by now. A failed attachment should not lose it.
    const failed: string[] = [];
    for (const [index, file] of files.entries()) {
      setBusy(`Attaching ${index + 1} of ${files.length}`);
      try {
        await uploadFile(file, {
          workspaceId,
          category: "design_reference",
          requestId: result.id,
          contentItemId: result.contentItemId,
          role: "reference",
        });
      } catch {
        failed.push(file.name);
      }
    }

    setBusy(null);
    setFiles([]);
    setPriority("normal");
    formRef.current?.reset();
    router.refresh();
    if (failed.length) setError(`Your idea was sent, but these files did not attach: ${failed.join(", ")}. You can send them from Send files.`);
    else setSent(true);
  };

  return (
    <form ref={formRef} className="stack" onSubmit={submit}>
      <label className="field">
        <span>Your idea in a few words</span>
        <input name="title" required maxLength={200} placeholder="Rating every counter at a wedding" />
      </label>
      <label className="field">
        <span>Tell us more</span>
        <textarea name="description" rows={4} placeholder="What should it feel like? What is the moment you are picturing?" />
      </label>

      <div className="grid-2">
        <label className="field">
          <span>What kind of post?</span>
          <select name="format" defaultValue="reel">
            {FORMATS.map((format) => (
              <option key={format} value={format}>{FORMAT_LABEL[format]}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>When would you like it out? (optional)</span>
          <input name="desiredDate" type="date" />
        </label>
      </div>

      <div className="field">
        <span className="field-label">How soon?</span>
        <div className="segmented">
          {PRIORITIES.map((value) => (
            <button key={value} type="button" aria-pressed={priority === value} onClick={() => setPriority(value)}>
              {PRIORITY_LABEL[value]}
            </button>
          ))}
        </div>
      </div>

      <label className="field">
        <span>Links you love (optional)</span>
        <textarea name="referenceLinks" rows={2} style={{ minHeight: 60 }} placeholder={"https://www.instagram.com/reel/...\nOne per line"} />
      </label>

      <div className="stack-sm">
        <input
          ref={fileRef}
          type="file"
          multiple
          hidden
          data-testid="idea-files"
          onChange={(event) => {
            // Copy now: clearing the input below empties this list before React applies the update.
            const chosen = Array.from(event.target.files ?? []);
            setFiles((current) => [...current, ...chosen]);
            event.target.value = "";
          }}
        />
        <div>
          {uploadsOn ? (
            <button type="button" className="btn btn-sm" onClick={() => fileRef.current?.click()}>
              <Paperclip size={14} /> Attach files
            </button>
          ) : (
            <UploadsComingSoon />
          )}
        </div>
        {files.map((file, index) => (
          <div key={`${file.name}-${index}`} className="row-between small">
            <span className="truncate grow">{file.name} <span className="muted">· {formatBytes(file.size)}</span></span>
            <button type="button" className="icon-btn" aria-label={`Remove ${file.name}`} onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}>
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}
      {sent && <p className="form-ok" role="status">Got it. Your idea is with the team now.</p>}
      <div>
        <button className="btn btn-primary btn-lg" disabled={!!busy}>{busy ?? "Share this idea"}</button>
      </div>
    </form>
  );
}
