"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { SUBJECTS, SUBJECT_DEFS } from "@/lib/subjects";
import { CONTENT_TYPES, CONTENT_TYPE_DEFS } from "@/lib/content-types";
import { STATUSES, STATUS_LABELS } from "@/lib/workflow";

/**
 * Search + filter bar. Debounced query and filter changes push to the URL, and
 * the server library page re-renders the results — so every search is a
 * shareable link.
 */
export default function LibraryControls({
  q,
  subject,
  status,
  type,
  sort,
  summary,
}: {
  q: string;
  subject: string;
  status: string;
  type: string;
  sort: string;
  summary: {
    total: number;
    bySubject: Record<string, number>;
    byStatus: Record<string, number>;
    byType: Record<string, number>;
    unbuilt?: number;
  };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState(q);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  function push(next: Record<string, string>) {
    const params = new URLSearchParams();
    const merged = { q: query, subject, status, type, sort, ...next };
    for (const [k, v] of Object.entries(merged)) {
      if (v && v !== "all" && !(k === "sort" && v === "auto")) params.set(k, v);
    }
    startTransition(() => router.replace(`/?${params.toString()}`));
  }

  // debounce the free-text query
  useEffect(() => {
    if (query === q) return;
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => push({ q: query }), 250);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return (
    <div className="mb-6 flex flex-col gap-3">
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg3">🔎</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search titles, skills, vocabulary, evidence, activities…"
          className="w-full rounded-lg border border-inkline bg-inkmid py-2.5 pl-10 pr-10 text-sm text-fg1 outline-none focus:border-accent/60 transition-colors"
          aria-label="Search materials"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-fg3 hover:text-fg1"
          >
            ✕
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        {/* subject chips */}
        <Chip active={subject === "all"} onClick={() => push({ subject: "all" })}>
          All tracks <Count n={summary.total} />
        </Chip>
        {SUBJECTS.map((s) => (
          <Chip key={s} active={subject === s} onClick={() => push({ subject: s })}>
            {SUBJECT_DEFS[s].emoji} {SUBJECT_DEFS[s].label} <Count n={summary.bySubject[s] ?? 0} />
          </Chip>
        ))}

        <span className="mx-1 h-4 w-px bg-inkline" />

        <select
          value={type}
          onChange={(e) => push({ type: e.target.value })}
          aria-label="Filter by content type"
          className="rounded-md border border-inkline bg-inkcard px-2 py-1.5 font-semibold text-fg1 outline-none focus:border-accent/60"
        >
          <option value="all">Any type</option>
          {CONTENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {CONTENT_TYPE_DEFS[t].emoji} {CONTENT_TYPE_DEFS[t].label} (
              {summary.byType[t] ?? 0})
            </option>
          ))}
        </select>

        <select
          value={status}
          onChange={(e) => push({ status: e.target.value })}
          aria-label="Filter by status"
          className="rounded-md border border-inkline bg-inkcard px-2 py-1.5 font-semibold text-fg1 outline-none focus:border-accent/60"
        >
          <option value="all">Any status</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]} ({summary.byStatus[s] ?? 0})
            </option>
          ))}
          {/* build state, not workflow state: abandoned shells clutter the list */}
          <option value="built">Built only</option>
          <option value="unbuilt">Empty shells ({summary.unbuilt ?? 0})</option>
        </select>

        <select
          value={sort}
          onChange={(e) => push({ sort: e.target.value })}
          aria-label="Sort order"
          className="rounded-md border border-inkline bg-inkcard px-2 py-1.5 font-semibold text-fg1 outline-none focus:border-accent/60"
        >
          <option value="auto">Sort: {q ? "relevance" : "recent"}</option>
          <option value="recent">Most recent</option>
          <option value="relevance">Relevance</option>
          <option value="title">Title A–Z</option>
        </select>

        {pending && <span className="text-fg3">…</span>}
      </div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-semibold transition-colors ${
        active
          ? "border-accent/60 bg-inkcard text-fg1"
          : "border-inkline bg-inkmid text-fg2 hover:text-fg1"
      }`}
    >
      {children}
    </button>
  );
}

function Count({ n }: { n: number }) {
  return <span className="text-fg3">{n}</span>;
}
