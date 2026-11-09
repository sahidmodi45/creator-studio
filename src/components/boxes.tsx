import Link from "next/link";
import { AssetIcon, fileUrl } from "@/components/media";
import type { FeedSlotView, PublicAsset } from "@/lib/queries";
import { isImage } from "@/lib/constants";
import { SectionExample, type SectionId } from "@/components/section-examples";
import { KindIcon, ProfileHeader, type ProfileView } from "@/components/instagram";

/** One tile on a home screen. The whole tile is the link, and its body shows what is really inside. */
export function Box({
  id,
  href,
  title,
  icon,
  count,
  tone = "",
  size = "",
  example,
  children,
}: {
  id: string;
  href: string;
  title: string;
  icon: React.ReactNode;
  count?: string | number;
  tone?: "" | "beet" | "blush";
  size?: "" | "tall" | "wide" | "full";
  /** Shown while the box is empty, so she can see what will go here. */
  example?: SectionId | false;
  children?: React.ReactNode;
}) {
  return (
    <Link href={href} className={`box ${tone} ${size}`} data-testid={`box-${id}`}>
      <div className="box-head">
        {icon}
        {count != null && <span className="box-count">{count}</span>}
      </div>
      <h2 className="box-title">{title}</h2>
      <div className="box-body">
        {example && <SectionExample id={example} compact />}
        {children}
      </div>
    </Link>
  );
}

export function BoxLine({ children, quiet = false }: { children: React.ReactNode; quiet?: boolean }) {
  return <p className={`box-line${quiet ? " quiet" : ""}`}>{children}</p>;
}

/** The newest few files in a folder. */
export function Thumbs({ assets, empty }: { assets: PublicAsset[]; empty: string }) {
  if (!assets.length) return <BoxLine quiet>{empty}</BoxLine>;
  return (
    <div className="thumbs">
      {assets.slice(0, 4).map((asset) =>
        asset.thumbnailKey ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={asset.id} src={fileUrl(asset.id, { thumb: true })} alt="" loading="lazy" />
        ) : (
          <div key={asset.id}><AssetIcon asset={asset} size={18} /></div>
        ),
      )}
    </div>
  );
}

/** A small version of the real grid. Open positions stay blank: nothing here is a placeholder image. */
export function MiniFeed({ slots }: { slots: FeedSlotView[] }) {
  const byPosition = new Map(slots.map((slot, index) => [slot.position ?? index, slot]));
  return (
    <div className="mini-feed" aria-hidden>
      {Array.from({ length: 9 }, (_, position) => {
        const slot = byPosition.get(position);
        const image = slot?.media.find((asset) => isImage(asset.mimeType)) ?? slot?.media.find((asset) => asset.thumbnailKey);
        if (!image) return <span key={position} />;
        // eslint-disable-next-line @next/next/no-img-element
        return <img key={position} src={fileUrl(image.id, image.thumbnailKey ? { thumb: true } : undefined)} alt="" loading="lazy" />;
      })}
    </div>
  );
}

export function Swatches({ colors }: { colors: string[] }) {
  return (
    <div className="swatches">
      {colors.slice(0, 6).map((color) => <span key={color} className="swatch" style={{ background: color }} title={color} />)}
    </div>
  );
}

/** Her profile as it looks on Instagram: header, bio and the newest posts, in a small phone frame. */
export function InstaProfile({ profile, slots }: { profile: ProfileView; slots: FeedSlotView[] }) {
  return (
    <div className="phone phone-mini" aria-label={`${profile.instagramHandle ?? profile.firstName} on Instagram`}>
      <ProfileHeader profile={profile} plannedCount={0} />
      <div className="ig-grid">
        {slots.slice(0, 9).map((slot) => {
          // The same picture the feed planner shows: an image, otherwise a video's cover frame.
          const image = slot.media.find((asset) => isImage(asset.mimeType)) ?? slot.media.find((asset) => asset.thumbnailKey);
          const src = image ? fileUrl(image.id, image.thumbnailKey ? { thumb: true } : undefined) : null;
          return (
            <div key={slot.id} className="tile">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {src && <img src={src} alt="" loading="lazy" />}
              <span className="tile-kind"><KindIcon kind={slot.kind} /></span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
