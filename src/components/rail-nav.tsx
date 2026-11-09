"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { SectionExample, type SectionId } from "@/components/section-examples";

export type RailItem = { id: SectionId; href: string; label: string; hint: string; count?: number; exact?: boolean };
export type RailGroup = { label?: string; items: RailItem[] };

/** The team sidebar. Each link says in a few words what is inside, and hovering shows an example. */
export function RailNav({ groups }: { groups: RailGroup[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState<{ item: RailItem; top: number } | null>(null);

  const show = (item: RailItem) => (event: React.MouseEvent<HTMLElement> | React.FocusEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setOpen({ item, top: Math.max(12, Math.min(rect.top - 8, window.innerHeight - 250)) });
  };

  return (
    <>
      {groups.map((group, index) => (
        <nav key={group.label ?? index} className="rail-group" aria-label={group.label ?? "Main"}>
          {group.label && <span className="rail-label">{group.label}</span>}
          {group.items.map((item) => {
            const current = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className="rail-link"
                aria-current={current ? "page" : undefined}
                onMouseEnter={show(item)}
                onMouseLeave={() => setOpen(null)}
                onFocus={show(item)}
                onBlur={() => setOpen(null)}
              >
                <span className="rail-text">
                  <span>{item.label}</span>
                  <small>{item.hint}</small>
                </span>
                {item.count ? <span className="nav-count">{item.count}</span> : null}
              </Link>
            );
          })}
        </nav>
      ))}
      {open && (
        <div className="rail-peek" style={{ top: open.top }} role="tooltip">
          <p className="rail-peek-title">{open.item.label}</p>
          <p className="rail-peek-hint">{open.item.hint}</p>
          <SectionExample id={open.item.id} />
        </div>
      )}
    </>
  );
}
