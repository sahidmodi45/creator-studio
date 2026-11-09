import { ExternalLink, FileAudio, FileText, Image as ImageIcon, Link2, Video } from "lucide-react";
import Link from "next/link";
import { ASSET_STATUS_LABEL, CATEGORY_LABEL, isImage, isPlayableAudio, isPlayableVideo } from "@/lib/constants";
import { formatBytes, formatDuration, formatInstant } from "@/lib/format";
import type { PublicAsset } from "@/lib/queries";

export function fileUrl(id: string, options?: { thumb?: boolean; download?: boolean }) {
  const query = new URLSearchParams();
  if (options?.thumb) query.set("variant", "thumb");
  if (options?.download) query.set("download", "1");
  const suffix = query.size ? `?${query}` : "";
  return `/api/assets/${id}/file${suffix}`;
}

export function AssetIcon({ asset, size = 26 }: { asset: Pick<PublicAsset, "category" | "mimeType">; size?: number }) {
  if (asset.category === "external_link") return <Link2 size={size} />;
  if (isPlayableAudio(asset.mimeType) || asset.category === "voiceover") return <FileAudio size={size} />;
  if (isPlayableVideo(asset.mimeType)) return <Video size={size} />;
  if (isImage(asset.mimeType)) return <ImageIcon size={size} />;
  return <FileText size={size} />;
}

export function AssetThumbImage({ asset, className }: { asset: Pick<PublicAsset, "id" | "thumbnailKey" | "title" | "category" | "mimeType">; className?: string }) {
  if (asset.thumbnailKey) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className={className} src={fileUrl(asset.id, { thumb: true })} alt={asset.title} loading="lazy" />;
  }
  return (
    <div className={className}>
      <AssetIcon asset={asset} />
    </div>
  );
}

export function MediaCard({ asset, href, showStatus = false }: { asset: PublicAsset; href: string; showStatus?: boolean }) {
  return (
    <Link href={href} className="media-card" data-testid="media-card">
      <div className="media-thumb">
        <AssetThumbImage asset={asset} />
        <div className="corner">
          {showStatus && asset.status === "new" && <span className="badge badge-solid">New</span>}
          {showStatus && asset.status === "archived" && <span className="badge">{ASSET_STATUS_LABEL.archived}</span>}
          {showStatus && asset.visibility === "internal" && <span className="badge">Team only</span>}
        </div>
        {asset.durationSeconds != null && <span className="duration">{formatDuration(asset.durationSeconds)}</span>}
      </div>
      <div>
        <p className="title">{asset.title}</p>
        <p className="muted tiny">
          {CATEGORY_LABEL[asset.category]} · {formatInstant(asset.uploadedAt)}
        </p>
      </div>
    </Link>
  );
}

/** Plays, shows or links to whatever the file is. Video stays in a separate client component where it needs to seek. */
export function AssetViewer({ asset }: { asset: PublicAsset }) {
  if (asset.category === "external_link" && asset.externalUrl) {
    return (
      <div className="audio-box stack-sm">
        <p className="kicker">Link</p>
        <a className="link strong" href={asset.externalUrl} target="_blank" rel="noopener noreferrer" style={{ overflowWrap: "anywhere" }}>
          {asset.externalUrl} <ExternalLink size={13} style={{ display: "inline", verticalAlign: "-1px" }} />
        </a>
      </div>
    );
  }
  if (isPlayableVideo(asset.mimeType)) {
    return (
      <div className="player">
        <video data-testid="video-player" src={fileUrl(asset.id)} controls playsInline preload="metadata" poster={asset.thumbnailKey ? fileUrl(asset.id, { thumb: true }) : undefined} />
      </div>
    );
  }
  if (isPlayableAudio(asset.mimeType)) {
    return (
      <div className="audio-box stack-sm">
        <p className="kicker">Voiceover</p>
        <audio data-testid="audio-player" src={fileUrl(asset.id)} controls preload="metadata" />
      </div>
    );
  }
  if (isImage(asset.mimeType) && asset.thumbnailKey) {
    return (
      <div className="player">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={fileUrl(asset.id)} alt={asset.title} />
      </div>
    );
  }
  return (
    <div className="audio-box row">
      <AssetIcon asset={asset} />
      <div className="grow">
        <p className="strong">{asset.fileName}</p>
        <p className="muted small">{formatBytes(asset.sizeBytes)}. This file does not preview in the browser, but you can download it.</p>
      </div>
    </div>
  );
}
