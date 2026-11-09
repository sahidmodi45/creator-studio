"use client";

import { Check } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { addAssetComment } from "@/lib/actions/assets";
import { addContentComment, toggleCommentResolved } from "@/lib/actions/content";
import { formatDuration, timeAgo } from "@/lib/format";
import type { CommentView } from "@/lib/queries";

export function CommentThread({
  comments,
  contentItemId,
  assetId,
  isTeam,
  getCurrentTime,
  onSeek,
  placeholder = "Write a comment",
}: {
  comments: CommentView[];
  contentItemId?: string;
  assetId?: string;
  isTeam: boolean;
  /** Present when there is a video to pin comments to. */
  getCurrentTime?: () => number | null;
  onSeek?: (seconds: number) => void;
  placeholder?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const [pin, setPin] = useState(true);

  return (
    <div className="stack-sm" data-testid="comment-thread">
      {comments.length === 0 && <p className="muted small">No comments yet.</p>}
      <div>
        {comments.map((comment) => (
          <div key={comment.id} className={`comment${comment.internal ? " internal" : ""}${comment.resolvedAt ? " resolved" : ""}`} data-testid="comment">
            <div className="row-between">
              <span className="row-sm small">
                <span className="strong">{comment.authorName ?? "Someone"}</span>
                {comment.internal && <span className="badge badge-warn">Team only</span>}
                {comment.timecodeSeconds != null && (
                  <button type="button" className="timecode" onClick={() => onSeek?.(comment.timecodeSeconds!)}>
                    {formatDuration(comment.timecodeSeconds)}
                  </button>
                )}
              </span>
              <span className="row-sm">
                <span className="muted tiny">{timeAgo(comment.createdAt)}</span>
                {isTeam && (
                  <button
                    type="button"
                    className="icon-btn"
                    style={{ width: 24, height: 24 }}
                    title={comment.resolvedAt ? "Mark as open" : "Mark as done"}
                    aria-label={comment.resolvedAt ? "Mark as open" : "Mark as done"}
                    onClick={() => start(async () => void (await toggleCommentResolved(comment.id)))}
                  >
                    <Check size={14} />
                  </button>
                )}
              </span>
            </div>
            <p className="pre small">{comment.body}</p>
          </div>
        ))}
      </div>
      <form
        ref={formRef}
        className="stack-sm"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          if (pin && getCurrentTime) {
            const time = getCurrentTime();
            // Still at the very start means she has not picked a moment, so it is a general comment.
            if (time != null && time > 0) form.set("timecode", String(time));
          }
          setError(undefined);
          start(async () => {
            const result = contentItemId ? await addContentComment(contentItemId, form) : await addAssetComment(assetId!, form);
            if (result?.error) setError(result.error);
            else formRef.current?.reset();
          });
        }}
      >
        <textarea name="body" rows={2} style={{ minHeight: 64 }} placeholder={placeholder} required aria-label="Comment" />
        {error && <p className="form-error">{error}</p>}
        <div className="row-between">
          <div className="row">
            {getCurrentTime && (
              <label className="check small">
                <input type="checkbox" checked={pin} onChange={(event) => setPin(event.target.checked)} />
                Pin to this moment in the video
              </label>
            )}
            {isTeam && (
              <label className="check small">
                <input type="checkbox" name="internal" />
                Team only
              </label>
            )}
          </div>
          <button className="btn btn-sm" disabled={pending}>{pending ? "Sending" : "Comment"}</button>
        </div>
      </form>
    </div>
  );
}
