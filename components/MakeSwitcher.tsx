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
    <div>
      <div className="mx-auto mt-8 flex max-w-sm rounded-xl border border-inkline bg-inkmid p-1 text-sm font-bold">
        <button
          onClick={() => setMode("lesson")}
          className={`flex-1 rounded-lg px-4 py-2 transition-colors ${
            mode === "lesson" ? "bg-accent text-ink" : "text-fg2 hover:text-fg1"
          }`}
        >
          📄 One lesson
        </button>
        <button
          onClick={() => setMode("unit")}
          className={`flex-1 rounded-lg px-4 py-2 transition-colors ${
            mode === "unit" ? "bg-accent text-ink" : "text-fg2 hover:text-fg1"
          }`}
        >
          📚 Full class
        </button>
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
