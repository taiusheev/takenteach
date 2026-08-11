"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

/**
 * Filter bar for the Motion Library. Mirrors LibraryControls exactly — same
 * debounce, same URL-as-state so a filtered view is a shareable link, same chip
 * and select vocabulary — because a coach should not have to learn two search
 * bars in one product.
 */
export default function MotionFilters({
  q,
  topic,
  level,
  format,
  topics,
  levels,
  formats,
  total,
}: {
  q: string;
  topic: string;
  level: string;
  format: string;
  topics: string[];
  levels: string[];
  formats: { id: string; label: string }[];
  total: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState(q);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  function push(next: Record<string, string>) {
    const params = new URLSearchParams();
    const merged = { q: query, topic, level, format, ...next };
    for (const [k, v] of Object.entries(merged)) {
      if (v && v !== "all") params.set(k, v);
    }
    startTransition(() => router.replace(`/motions?${params.toString()}`));
  }

  useEffect(() => {
    if (query === q) return;
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => push({ q: query }), 250);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const select =
    "rounded-md border border-inkline bg-inkcard px-2 py-1.5 text-xs font-semibold text-fg1 outline-none focus:border-accent/60";

  return (
    <div className="mb-6 flex flex-col gap-3">
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg3">
          🔎
        </span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${total} motions — topic, argument, clash…`}
          aria-label="Search motions"
          className="w-full rounded-lg border border-inkline bg-inkmid py-2.5 pl-10 pr-3 text-sm text-fg1 outline-none transition-colors focus:border-accent/60"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={level}
          onChange={(e) => push({ level: e.target.value })}
          aria-label="Filter by level"
          className={select}
        >
          <option value="all">Any level</option>
          {levels.map((l) => (
            <option key={l} value={l}>
              {l[0].toUpperCase() + l.slice(1)}
            </option>
          ))}
        </select>

        <select
          value={topic}
          onChange={(e) => push({ topic: e.target.value })}
          aria-label="Filter by topic"
          className={select}
        >
          <option value="all">Any topic</option>
          {topics.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <select
          value={format}
          onChange={(e) => push({ format: e.target.value })}
          aria-label="Filter by debate format"
          className={select}
        >
          <option value="all">Any format</option>
          {formats.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>

        {(query || topic !== "all" || level !== "all" || format !== "all") && (
          <button
            onClick={() => {
              setQuery("");
              startTransition(() => router.replace("/motions"));
            }}
            className="rounded-full border border-inkline px-3 py-1.5 text-xs font-semibold text-fg2 transition-colors hover:text-fg1"
          >
            Clear
          </button>
        )}
        {pending && <span className="text-xs text-fg3">…</span>}
      </div>
    </div>
  );
}
