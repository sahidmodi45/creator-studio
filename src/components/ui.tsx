"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/** A nav link that marks itself current. `exact` is for section home pages. */
export function NavLink({
  href,
  exact = false,
  className,
  children,
}: {
  href: string;
  exact?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const current = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  const ref = useRef<HTMLAnchorElement>(null);
  // On a phone the nav scrolls sideways, so bring the current page into view.
  useEffect(() => {
    if (current) ref.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [current]);
  return (
    <Link ref={ref} href={href} className={className} aria-current={current ? "page" : undefined}>
      {children}
    </Link>
  );
}

/** Bell with a live count. Polls gently so new alerts show without a reload. */
export function NotificationBell({ href, initial, workspaceId }: { href: string; initial: number; workspaceId?: string }) {
  const [count, setCount] = useState(initial);
  const router = useRouter();

  useEffect(() => setCount(initial), [initial]);

  useEffect(() => {
    const check = async () => {
      if (document.hidden) return;
      const query = workspaceId ? `?workspaceId=${workspaceId}` : "";
      const response = await fetch(`/api/notifications/count${query}`).catch(() => null);
      if (!response?.ok) return;
      const { count: latest } = await response.json();
      setCount((previous) => {
        if (latest > previous) router.refresh();
        return latest;
      });
    };
    const timer = setInterval(check, 30_000);
    return () => clearInterval(timer);
  }, [router, workspaceId]);

  return (
    <Link href={href} className="icon-btn" aria-label={count ? `${count} unread notifications` : "Notifications"}>
      <Bell size={18} />
      {count > 0 && (
        <span className="nav-count" style={{ position: "absolute", top: -2, right: -4, marginLeft: 0 }}>
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}

export function Toast({ message, tone = "info", onDone }: { message: string; tone?: "info" | "error"; onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, tone === "error" ? 6000 : 3000);
    return () => clearTimeout(timer);
  }, [onDone, tone]);
  return (
    <div className={`toast${tone === "error" ? " error" : ""}`} role="status">
      {message}
    </div>
  );
}

export function CopyLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="stack-sm">
      <input value={link} readOnly onFocus={(event) => event.target.select()} data-testid="invite-link" />
      <div>
        <button
          type="button"
          className="btn btn-sm"
          onClick={async () => {
            await navigator.clipboard.writeText(link);
            setCopied(true);
          }}
        >
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
    </div>
  );
}
