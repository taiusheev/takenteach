"use client";

import type { QaFix } from "@/lib/qa-fixes";

export type FixState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "applied"; summary: string }
  | { status: "nothing"; summary: string }
  | { status: "error"; summary: string };

/**
 * The button that turns one QA finding into one applied repair. Kept tiny and
 * stateless — the panel owns the queue, because "Fix all" must run the same code
 * path as a single click rather than a parallel one that races the same pack.
 */
export default function QaFixButton({
  fix,
  state,
  disabled,
  onFix,
}: {
  fix: QaFix;
  state: FixState;
  disabled: boolean;
  onFix: (fix: QaFix) => void;
}) {
  if (state.status === "applied") {
    return (
      <span
        title={state.summary}
        className="shrink-0 rounded border border-ok/40 bg-ok/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ok"
      >
        ✓ Fixed
      </span>
    );
  }
  if (state.status === "nothing") {
    return (
      <span
        title={state.summary}
        className="shrink-0 rounded border border-warn/40 bg-warn/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-warn"
      >
        No change
      </span>
    );
  }
  if (state.status === "error") {
    return (
      <button
        onClick={() => onFix(fix)}
        disabled={disabled}
        title={state.summary}
        className="shrink-0 rounded border border-danger/40 bg-danger/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-danger hover:bg-danger/12 disabled:opacity-40"
      >
        Retry
      </button>
    );
  }
  return (
    <button
      onClick={() => onFix(fix)}
      disabled={disabled || state.status === "running"}
      className="shrink-0 rounded border border-brand/50 bg-brand/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand transition-colors hover:bg-brand/12 disabled:opacity-40"
    >
      {state.status === "running" ? "Fixing…" : "Fix"}
    </button>
  );
}
