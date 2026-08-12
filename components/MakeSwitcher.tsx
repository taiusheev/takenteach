"use client";

import { useState } from "react";
import QuickBuildWizard from "@/components/QuickBuildWizard";
import UnitBuilder from "@/components/UnitBuilder";
import { Subject } from "@/lib/subjects";

/**
 * The two ways to start building: one lesson, or a whole class (unit). A single
 * lesson is the fast path; a unit plans a coherent multi-lesson arc with its own
 * design. Both land the author in the same generation pipeline.
 */
export default function MakeSwitcher({
  prefillSkillFocus = "",
  prefillSubject,
  prefillResolution = "",
  prefillGradeBand = "",
  initialMode = "lesson",
}: {
  prefillSkillFocus?: string;
  prefillSubject?: Subject;
  /** motion wording handed over from the Motion Library */
  prefillResolution?: string;
  prefillGradeBand?: string;
  initialMode?: "lesson" | "unit";
}) {
  const [mode, setMode] = useState<"lesson" | "unit">(initialMode);

  return (
    <div className="mx-auto max-w-3xl">
      {/* ── THE PAGE HEAD ──
          One row: what you are doing, and the two things it could be. The
          switch used to be a centred pill floating above a 5xl display
          heading, which is a landing-page arrangement — it announced the
          page to someone deciding whether to use the product, on a screen
          only reached by someone already doing so.

          The selected half is a plain white panel rather than a filled brand
          blue. A two-option toggle is not the most important thing on this
          screen; the brief box below it is, and that is what should be
          carrying the accent when it is focused. */}
      <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-bold tracking-[-0.02em] text-fg1">
            {mode === "lesson" ? "New lesson" : "New class"}
          </h1>
          <p className="mt-1 text-[13.5px] text-fg2">
            {mode === "lesson"
              ? "Describe it in a sentence — the AI plans the setup and builds from your brief."
              : "Plan a series of lessons that share one arc, one look and one vocabulary."}
          </p>
        </div>
        <div
          role="tablist"
          aria-label="What to build"
          className="flex shrink-0 rounded-lg border border-inkline bg-surface-alt p-0.5 text-[13px] font-semibold"
        >
          <button
            role="tab"
            aria-selected={mode === "lesson"}
            onClick={() => setMode("lesson")}
            className={`rounded-md px-3.5 py-1.5 transition-colors ${
              mode === "lesson"
                ? "bg-surface text-fg1 shadow-[var(--elev)]"
                : "text-fg3 hover:text-fg1"
            }`}
          >
            One lesson
          </button>
          <button
            role="tab"
            aria-selected={mode === "unit"}
            onClick={() => setMode("unit")}
            className={`rounded-md px-3.5 py-1.5 transition-colors ${
              mode === "unit"
                ? "bg-surface text-fg1 shadow-[var(--elev)]"
                : "text-fg3 hover:text-fg1"
            }`}
          >
            Full class
          </button>
        </div>
      </div>

      {mode === "lesson" ? (
        <QuickBuildWizard
          prefillSkillFocus={prefillSkillFocus}
          prefillSubject={prefillSubject}
          prefillResolution={prefillResolution}
          prefillGradeBand={prefillGradeBand}
        />
      ) : (
        <UnitBuilder />
      )}
    </div>
  );
}
