"use client";

import { useRef } from "react";
import { CommentThread } from "@/components/comments";
import type { CommentView } from "@/lib/queries";

/** A video with its comments side by side in the same state, so a comment can pin to a moment and jump back to it. */
export function VideoReview({
  videoUrl,
  poster,
  comments,
  contentItemId,
  isTeam,
}: {
  videoUrl: string;
  poster?: string;
  comments: CommentView[];
  contentItemId: string;
  isTeam: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  return (
    <div className="stack-lg">
      <div className="player">
        <video ref={videoRef} data-testid="video-player" src={videoUrl} poster={poster} controls playsInline preload="metadata" />
      </div>
      <section className="stack-sm">
        <h2 className="section-title">Comments</h2>
        <CommentThread
          comments={comments}
          contentItemId={contentItemId}
          isTeam={isTeam}
          placeholder="Pause where you want a change and tell us what you see."
          getCurrentTime={() => videoRef.current?.currentTime ?? null}
          onSeek={(seconds) => {
            const video = videoRef.current;
            if (!video) return;
            video.currentTime = seconds;
            video.scrollIntoView({ behavior: "smooth", block: "center" });
          }}
        />
      </section>
    </div>
  );
}
