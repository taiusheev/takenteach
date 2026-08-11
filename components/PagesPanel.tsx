"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface PageRow {
  index: number;
  kind: string;
  title: string;
  durationMin: number;
}

type Mode = "fix" | "regenerate";
/** A page index, or the pack as a whole. */
type Target = number | "pack";

/**
 * The single place a finished pack gets edited.
 *
 * There used to be two surfaces for one job: a pack-wide "Fix one thing" box and
 * this per-page list. A teacher had to guess which one their change belonged to,
 * and the pack-wide box was the worse of the two for anything page-shaped —
 * the model had to locate the target from prose. Now the scope is a row you
 * pick: the whole pack, or one named page.
 *
 * Two actions per page, both keeping the pack's own look (the design system is
 * one shared stylesheet, so a rewritten page re-renders in the same style):
 *  - Fix: a surgical edit, targeted at this page by its exact title.
 *  - Regenerate: a full rewrite of this page only — same kind, slot, duration
 *    and title, rebuilt against the pack's criteria, vocabulary and cards.
 *
 * The pack row offers Fix only: "regenerate everything" is the build, not an
 * edit, and it lives on the build screen where the cost is shown first.
 */
export default function PagesPanel({
  materialId,
  pages,
}: {
  materialId: number;
  pages: PageRow[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState<Target | null>(null);
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{
    target: Target;
    ok: boolean;
    text: string;
    changed?: string[];
  } | null>(null);

  async function run(target: Target, mode: Mode) {
    if (busy) return;
    const text = instruction.trim();
    if (mode === "fix" && !text) return;
    const page = target === "pack" ? null : pages.find((p) => p.index === target);
    if (target !== "pack" && !page) return;
    setBusy(`${target}-${mode}`);
    setMsg(null);
    try {
      const res =
        mode === "fix"
          ? await fetch(`/api/materials/${materialId}/revise`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              // Page edits are located by exact title — the same stable key the
              // revise pass uses. A pack-wide edit passes the note through as-is.
              body: JSON.stringify({
                instruction: page
                  ? `On the page titled "${page.title}" (page ${page.index + 1}) only: ${text}`
                  : text,
              }),
            })
          : await fetch(`/api/materials/${materialId}/generate-section`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                section: "activity",
                activityIndex: page!.index,
                instruction: text,
              }),
            });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed");
      const applied = mode === "regenerate" || data.applied !== false;
      setMsg({
        target,
        ok: applied,
        changed: applied ? data.changed : undefined,
        text: applied
          ? mode === "regenerate"
            ? `Page ${page!.index + 1} rebuilt in the pack's style.`
            : (data.summary ?? "Applied.")
          : `Nothing changed — ${data.summary ?? "the AI could not locate that."}`,
      });
      if (applied) {
        setInstruction("");
        setOpen(null);
        router.refresh();
      }
    } catch (e) {
      setMsg({
        target,
        ok: false,
        text: e instanceof Error ? e.message : "Failed",
      });
    } finally {
      setBusy(null);
    }
  }

  /**
   * The instruction box + actions, shared by the pack row and every page row.
   *
   * A plain render function, deliberately not a component: declaring a component
   * inside the render body gives it a new identity every render, so React
   * unmounts and remounts the subtree — and the textarea loses focus on every
   * keystroke.
   */
  function editor(target: Target) {
    const page = target === "pack" ? null : pages.find((p) => p.index === target)!;
    return (
      <div className="mt-2 pl-9">
        <textarea
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") run(target, "fix");
          }}
          rows={2}
          disabled={!!busy}
          autoFocus
          placeholder={
            page
              ? `What should change on "${page.title}"? e.g. "the answer key overstates Card B" · "add a worked example before the prompts"`
              : `What should change across the pack? e.g. "swap Card F for a US source" · "use 'warrant' consistently instead of 'reason'"`
          }
          className="w-full resize-y rounded-md border border-inkline bg-ink px-3 py-2 text-xs text-fg1 placeholder:text-fg3 focus:border-accent focus:outline-none disabled:opacity-50"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => run(target, "fix")}
            disabled={!!busy || !instruction.trim()}
            className="rounded-md bg-brand px-3 py-1.5 text-xs font-bold text-white hover:bg-brand disabled:opacity-50"
          >
            {busy === `${target}-fix`
              ? "Fixing…"
              : page
                ? "Fix this page"
                : "Apply across the pack"}
          </button>
          {page && (
            <button
              type="button"
              onClick={() => run(target, "regenerate")}
              disabled={!!busy}
              className="rounded-md border border-inkline px-3 py-1.5 text-xs font-bold text-fg2 hover:text-fg1 disabled:opacity-50"
            >
              {busy === `${target}-regenerate`
                ? "Rebuilding…"
                : "Regenerate page"}
            </button>
          )}
          <span className="text-[10px] text-fg3">
            {page
              ? `Fix = surgical edit · Regenerate = full rewrite of this page${instruction.trim() ? ", steered by your note" : ""}`
              : "Only what you name is touched — the rest of the pack is left alone. ⌘/Ctrl + Enter"}
          </span>
        </div>
        {busy?.startsWith(`${target}-`) && (
          <p className="mt-2 text-[11px] text-fg3">
            Working — this takes about a minute.
          </p>
        )}
      </div>
    );
  }

  function result(target: Target) {
    if (msg?.target !== target) return null;
    return (
      <div className="mt-2 pl-9 text-xs">
        <p className={msg.ok ? "text-ok" : "text-warn"}>{msg.text}</p>
        {msg.ok && msg.changed && msg.changed.length > 0 && (
          <p className="mt-1 text-fg3">Changed: {msg.changed.join(" · ")}</p>
        )}
      </div>
    );
  }

  if (pages.length === 0) return null;

  return (
    <div className="rounded-xl border border-inkline bg-inkcard p-4">
      <h2 className="text-xs font-bold uppercase tracking-widest text-fg3">
        Fix a page — or the whole pack
      </h2>
      <p className="mb-3 mt-1 text-xs text-fg3">
        Every edit re-renders in this pack&apos;s own design system, so a rewritten
        page still matches the rest. Re-run Content QA afterwards — an edited pack
        needs a fresh pass before review.
      </p>

      <div className="border-b border-inkline/60 pb-2">
        <div className="flex items-center gap-3">
          <span aria-hidden className="w-6 shrink-0 text-right text-xs text-fg3">
            ◆
          </span>
          <span className="rounded bg-inkmid px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-fg3">
            whole pack
          </span>
          <span className="min-w-0 flex-1 truncate text-sm text-fg1">
            Something that runs across every page
          </span>
          <button
            type="button"
            onClick={() => {
              setOpen(open === "pack" ? null : "pack");
              setInstruction("");
              setMsg(null);
            }}
            disabled={!!busy}
            className="shrink-0 rounded-md border border-inkline px-2 py-1 text-[11px] font-bold text-fg2 hover:text-fg1 disabled:opacity-40"
          >
            {open === "pack" ? "Close" : "Fix one thing"}
          </button>
        </div>
        {open === "pack" && editor("pack")}
        {result("pack")}
      </div>

      <ol className="flex flex-col divide-y divide-inkline/60">
        {pages.map((p) => {
          const isOpen = open === p.index;
          return (
            <li key={p.index} className="py-2">
              <div className="flex items-center gap-3">
                <span className="w-6 shrink-0 text-right text-xs font-bold text-fg3">
                  {p.index + 1}
                </span>
                <span className="rounded bg-inkmid px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-fg3">
                  {p.kind}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-fg1">
                  {p.title}
                </span>
                <span className="shrink-0 text-[11px] text-fg3">{p.durationMin}m</span>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(isOpen ? null : p.index);
                    setInstruction("");
                    setMsg(null);
                  }}
                  disabled={!!busy}
                  className="shrink-0 rounded-md border border-inkline px-2 py-1 text-[11px] font-bold text-fg2 hover:text-fg1 disabled:opacity-40"
                >
                  {isOpen ? "Close" : "Edit page"}
                </button>
              </div>

              {isOpen && editor(p.index)}
              {result(p.index)}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
