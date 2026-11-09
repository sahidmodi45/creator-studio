"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ASSET_CATEGORIES, ASSET_STATUS_LABEL, ASSET_STATUSES, CATEGORY_LABEL } from "@/lib/constants";

type Filters = { q?: string; category?: string; tag?: string; status?: string; uploader?: string; project?: string };

/** Filters live in the address bar, so a filtered view can be shared and the back button works. */
export function LibraryFiltersBar({
  filters,
  tags,
  uploaders = [],
  projects = [],
  simple = false,
  hideType = false,
}: {
  filters: Filters;
  tags: string[];
  uploaders?: { id: string; name: string }[];
  projects?: { id: string; title: string }[];
  simple?: boolean;
  hideType?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState(filters.q ?? "");

  const apply = (change: Partial<Filters>) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...filters, ...change })) if (value) next.set(key, value);
    router.replace(next.size ? `${pathname}?${next}` : pathname);
  };

  // Search as she types, without a request per keystroke.
  useEffect(() => {
    if (query === (filters.q ?? "")) return;
    const timer = setTimeout(() => apply({ q: query }), 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const active = Object.values(filters).some(Boolean);

  return (
    <div className="filters">
      <label className="field search">
        <span>Search</span>
        <span style={{ position: "relative", display: "block" }}>
          <Search size={15} style={{ position: "absolute", left: 11, top: 12, color: "var(--ink-3)" }} />
          <input type="search" value={query} placeholder="Titles, notes, tags, file names" style={{ paddingLeft: 32 }} onChange={(event) => setQuery(event.target.value)} />
        </span>
      </label>
      {!hideType && (
        <label className="field">
          <span>Type</span>
          <select value={filters.category ?? ""} onChange={(event) => apply({ category: event.target.value })}>
            <option value="">All</option>
            {ASSET_CATEGORIES.map((category) => <option key={category} value={category}>{CATEGORY_LABEL[category]}</option>)}
          </select>
        </label>
      )}
      {tags.length > 0 && (
        <label className="field">
          <span>Tag</span>
          <select value={filters.tag ?? ""} onChange={(event) => apply({ tag: event.target.value })}>
            <option value="">All</option>
            {tags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
          </select>
        </label>
      )}
      {!simple && (
        <>
          <label className="field">
            <span>Status</span>
            <select value={filters.status ?? ""} onChange={(event) => apply({ status: event.target.value })}>
              <option value="">All</option>
              {ASSET_STATUSES.map((status) => <option key={status} value={status}>{ASSET_STATUS_LABEL[status]}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Uploaded by</span>
            <select value={filters.uploader ?? ""} onChange={(event) => apply({ uploader: event.target.value })}>
              <option value="">Anyone</option>
              {uploaders.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Project</span>
            <select value={filters.project ?? ""} onChange={(event) => apply({ project: event.target.value })}>
              <option value="">Any</option>
              {projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}
            </select>
          </label>
        </>
      )}
      {active && (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => {
            setQuery("");
            router.replace(pathname);
          }}
        >
          Clear
        </button>
      )}
    </div>
  );
}
