"use client";

import Link from "next/link";
import { useTransition } from "react";
import { markNotificationsRead } from "@/lib/actions/workspace";
import { timeAgo } from "@/lib/format";

type Row = { id: string; title: string; body: string; href: string; readAt: Date | null; createdAt: Date };

export function NotificationsView({ rows }: { rows: Row[] }) {
  const [, start] = useTransition();
  const unread = rows.filter((row) => !row.readAt);
  return (
    <div className="stack">
      {unread.length > 0 && (
        <div>
          <button className="btn btn-sm" onClick={() => start(() => markNotificationsRead(unread.map((row) => row.id)))}>
            Mark all as read
          </button>
        </div>
      )}
      {rows.length === 0 ? (
        <div className="empty">
          <p className="section-title">All quiet</p>
          <p className="small">We will let you know when something needs you.</p>
        </div>
      ) : (
        <div>
          {rows.map((row) => (
            <Link
              key={row.id}
              href={row.href}
              className="list-row"
              data-testid="notification"
              onClick={() => {
                if (!row.readAt) start(() => markNotificationsRead([row.id]));
              }}
            >
              <div className="grow">
                <p className={`list-title${row.readAt ? " muted" : ""}`}>
                  {!row.readAt && <span className="nav-count" style={{ marginLeft: 0, marginRight: 8, minWidth: 8, height: 8, padding: 0, display: "inline-block", verticalAlign: 2 }} />}
                  {row.title}
                </p>
                {row.body && <p className="muted small truncate">{row.body}</p>}
              </div>
              <span className="muted tiny nowrap">{timeAgo(row.createdAt)}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
