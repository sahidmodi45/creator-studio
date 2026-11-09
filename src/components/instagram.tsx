"use client";

import { ChevronLeft, ChevronRight, Clapperboard, Grid3x3, Layers, Tag, X } from "lucide-react";
import { useState } from "react";
import { isImage, isPlayableVideo } from "@/lib/constants";
import { formatCount } from "@/lib/format";
import type { FeedSlotView, PublicAsset } from "@/lib/queries";

export type ProfileView = {
  instagramHandle: string | null;
  profileName: string | null;
  bio: string | null;
  profileLink: string | null;
  followers: number | null;
  following: number | null;
  postCount: number | null;
  avatarAssetId: string | null;
  firstName: string;
};

function fileUrl(id: string, thumb = false) {
  return `/api/assets/${id}/file${thumb ? "?variant=thumb" : ""}`;
}

/** The picture a tile shows: an image if there is one, otherwise a video's cover frame. */
export function tileImage(slot: Pick<FeedSlotView, "media" | "kind">): string | null {
  const image = slot.media.find((asset) => isImage(asset.mimeType));
  if (image) return image.thumbnailKey ? fileUrl(image.id, true) : fileUrl(image.id);
  const video = slot.media.find((asset) => asset.thumbnailKey);
  return video ? fileUrl(video.id, true) : null;
}

export function KindIcon({ kind }: { kind: FeedSlotView["kind"] }) {
  if (kind === "reel") return <Clapperboard size={16} aria-label="Reel" />;
  if (kind === "carousel") return <Layers size={16} aria-label="Carousel" />;
  return null;
}

export function ProfileHeader({ profile, plannedCount }: { profile: ProfileView; plannedCount: number }) {
  return (
    <>
      <div className="ig-top">
        <span>{profile.instagramHandle ?? profile.firstName.toLowerCase()}</span>
      </div>
      <div className="ig-profile">
        {profile.avatarAssetId ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="ig-avatar" src={fileUrl(profile.avatarAssetId)} alt="" />
        ) : (
          <div className="ig-avatar" aria-hidden>{profile.firstName.charAt(0)}</div>
        )}
        <div className="ig-stats">
          <div><b>{formatCount((profile.postCount ?? 0) + plannedCount)}</b>posts</div>
          <div><b>{formatCount(profile.followers)}</b>followers</div>
          <div><b>{formatCount(profile.following)}</b>following</div>
        </div>
      </div>
      <div className="ig-bio">
        <b>{profile.profileName ?? profile.firstName}</b>
        {profile.bio ? `\n${profile.bio}` : ""}
        {profile.profileLink ? <span style={{ color: "#00376b", display: "block" }}>{profile.profileLink}</span> : null}
      </div>
      <div className="ig-buttons"><span>Edit profile</span><span>Share profile</span></div>
      <div className="ig-tabs" aria-hidden>
        <span className="active"><Grid3x3 size={20} /></span>
        <span><Clapperboard size={20} /></span>
        <span><Tag size={20} /></span>
      </div>
    </>
  );
}

function MediaSlide({ asset, title }: { asset: PublicAsset; title: string }) {
  if (isPlayableVideo(asset.mimeType)) {
    return <video key={asset.id} data-testid="post-video" src={fileUrl(asset.id)} controls playsInline autoPlay muted poster={asset.thumbnailKey ? fileUrl(asset.id, true) : undefined} />;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img key={asset.id} src={fileUrl(asset.id)} alt={title} />;
}

/** One post, the way it will open on Instagram. */
export function PostPreview({ slot, profile, onClose }: { slot: FeedSlotView; profile: ProfileView; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const showable = slot.media.filter((asset) => isImage(asset.mimeType) || isPlayableVideo(asset.mimeType));
  // A reel opens on the video, not its cover image.
  const slides = slot.kind === "reel" ? [...showable.filter((a) => isPlayableVideo(a.mimeType)), ...showable.filter((a) => !isPlayableVideo(a.mimeType))].slice(0, 1) : showable;
  const current = slides[Math.min(index, slides.length - 1)];

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Post preview" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="post-preview">
          <div className="post-media">
            {current ? <MediaSlide asset={current} title={slot.title} /> : <p style={{ color: "#fff" }}>No preview available</p>}
            {slides.length > 1 && (
              <>
                {index > 0 && (
                  <button className="icon-btn carousel-nav prev" aria-label="Previous slide" onClick={() => setIndex(index - 1)}>
                    <ChevronLeft size={18} />
                  </button>
                )}
                {index < slides.length - 1 && (
                  <button className="icon-btn carousel-nav next" aria-label="Next slide" onClick={() => setIndex(index + 1)}>
                    <ChevronRight size={18} />
                  </button>
                )}
              </>
            )}
          </div>
          <div className="stack" style={{ padding: 20 }}>
            <div className="row-between">
              <span className="strong">{profile.instagramHandle ?? profile.firstName}</span>
              <button className="icon-btn" aria-label="Close" onClick={onClose}><X size={18} /></button>
            </div>
            {slides.length > 1 && <p className="muted tiny">Slide {index + 1} of {slides.length}</p>}
            {slot.title && <p className="kicker">{slot.title}</p>}
            <p className="prose small" data-testid="post-caption">{slot.caption || <span className="muted">No caption yet.</span>}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Read-only grid for the client. */
export function FeedPreview({
  slots,
  profile,
  testId = "feed-preview",
  tileTestId = "feed-tile",
  plannedCount,
}: {
  slots: FeedSlotView[];
  profile: ProfileView;
  testId?: string;
  tileTestId?: string;
  plannedCount?: number;
}) {
  const [open, setOpen] = useState<FeedSlotView | null>(null);
  return (
    <div className="phone" data-testid={testId} style={{ maxWidth: 470, width: "100%" }}>
      <ProfileHeader profile={profile} plannedCount={plannedCount ?? slots.length} />
      <div className="ig-grid">
        {slots.map((slot) => {
          const image = tileImage(slot);
          return (
            <button key={slot.id} className="tile" data-testid={tileTestId} aria-label={slot.title || "Open post"} onClick={() => setOpen(slot)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {image && <img src={image} alt={slot.title} />}
              <span className="tile-kind"><KindIcon kind={slot.kind} /></span>
            </button>
          );
        })}
      </div>
      {open && <PostPreview slot={open} profile={profile} onClose={() => setOpen(null)} />}
    </div>
  );
}
