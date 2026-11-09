"use client";

import { Check, PenLine, X } from "lucide-react";
import { useState, useTransition } from "react";
import { decideContent } from "@/lib/actions/content";

type Decision = "approved" | "revision_requested" | "rejected";

const PROMPT: Record<Exclude<Decision, "approved">, { label: string; placeholder: string; confirm: string }> = {
  revision_requested: {
    label: "What should change?",
    placeholder: "For example: the music is too loud at the start, and can we use the other caption?",
    confirm: "Send my changes",
  },
  rejected: {
    label: "What is not working?",
    placeholder: "Be as honest as you like. It helps us get the next one right.",
    confirm: "Reject this piece",
  },
};

export function DecisionBar({ contentItemId }: { contentItemId: string }) {
  const [open, setOpen] = useState<Exclude<Decision, "approved"> | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  const decide = (decision: Decision) => {
    setError(undefined);
    start(async () => {
      const result = await decideContent(contentItemId, decision, note);
      if (result?.error) setError(result.error);
    });
  };

  return (
    <div className="card stack-sm" style={{ background: "var(--blush-soft)", borderColor: "var(--blush)" }}>
      <div className="row-between">
        <p className="section-title">What do you think?</p>
        <div className="row-sm">
          <button className="btn btn-primary" disabled={pending} onClick={() => decide("approved")}>
            <Check size={15} /> Approve
          </button>
          <button className="btn" disabled={pending} aria-expanded={open === "revision_requested"} onClick={() => setOpen("revision_requested")}>
            <PenLine size={15} /> Ask for changes
          </button>
          <button className="btn btn-ghost" disabled={pending} aria-expanded={open === "rejected"} onClick={() => setOpen("rejected")}>
            <X size={15} /> Reject
          </button>
        </div>
      </div>
      {open && (
        <div className="stack-sm">
          <label className="field">
            <span>{PROMPT[open].label}</span>
            <textarea value={note} placeholder={PROMPT[open].placeholder} onChange={(event) => setNote(event.target.value)} autoFocus />
          </label>
          <div className="row-sm">
            <button className="btn btn-dark" disabled={pending} onClick={() => decide(open)}>{PROMPT[open].confirm}</button>
            <button className="btn btn-ghost" disabled={pending} onClick={() => setOpen(null)}>Never mind</button>
          </div>
        </div>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}
