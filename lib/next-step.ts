import type { ChecklistResult } from "./checklist";
import type { ContentQa } from "./ai";
import type { Readiness } from "./readiness";
import { qaFixes } from "./qa-fixes";

/**
 * The one thing to do next.
 *
 * The material page shows everything a pack knows about itself — readiness,
 * 28 deterministic checks, a content-QA report, uniqueness, coherence, build
 * preflight, version history. All of it is true and almost none of it answers
 * the question a teacher actually arrives with: *is this finished, and if not,
 * what do I press?*
 *
 * This resolves all of those signals into a single ranked answer, in the order
 * the work actually has to happen: build it → make it teachable → pass the
 * deterministic gates → pass review QA → submit.
 *
 * It deliberately mirrors the review gate in
 * `app/api/materials/[id]/transition/route.ts`. Those rules were only reachable
 * by pressing Submit and reading a 422 — so the teacher discovered the blocker
 * after deciding they were done. Stating the same conditions up front is the
 * whole point; if that route's rules change, change these with them.
 */

export interface NextStep {
  /** go = nothing blocking; work = something to do; wait = not the user's move */
  tone: "go" | "work" | "wait";
  headline: string;
  detail: string;
  /** the tab holding the work, so the caller can deep-link to it */
  tab?: "edit" | "quality" | "build";
  cta?: { label: string; href: string };
}

export interface NextStepInput {
  materialId: number;
  isPack: boolean;
  status: string;
  canEdit: boolean;
  canSubmit: boolean;
  readiness: Readiness | null;
  checklist: ChecklistResult;
  qa: ContentQa | null;
  /** true when the stored report was written against different content */
  qaStale: boolean;
}

export function nextStep(input: NextStepInput): NextStep {
  const {
    materialId,
    isPack,
    status,
    canEdit,
    canSubmit,
    readiness,
    checklist,
    qa,
    qaStale,
  } = input;

  if (!canEdit) {
    return {
      tone: "wait",
      headline:
        status === "published"
          ? "Published — this is the live version"
          : `Locked while ${status.replace("_", " ")}`,
      detail:
        status === "in_review"
          ? "A coach or founder reviews it next. Send it back to draft to keep editing."
          : "Only drafts are editable. Send it back to draft to change anything.",
    };
  }

  // 1. Does it exist, and could you stand in front of a class with it?
  if (isPack && readiness) {
    if (readiness.level === "empty" || readiness.level === "planned") {
      return {
        tone: "work",
        headline:
          readiness.level === "empty"
            ? "Nothing generated yet"
            : `Planned — ${readiness.pages === 0 ? "no pages written yet" : ""}`,
        detail:
          "Run the build and the pack writes itself, teachable core first. The Build tab shows what it will cost before you start.",
        tab: "build",
        cta: { label: "Build it with AI", href: `/materials/${materialId}/generate` },
      };
    }
    if (!readiness.canTeach) {
      return {
        tone: "work",
        headline: `Not teachable yet — ${readiness.pages} page${readiness.pages === 1 ? "" : "s"} written`,
        detail: `Still needs ${listOf(readiness.missing)}. It prints today, but you'd be missing a beat mid-class.`,
        tab: "build",
        cta: { label: "Continue the build", href: `/materials/${materialId}/generate` },
      };
    }
  }

  // 2. The deterministic gates — free, so they come before anything paid.
  const failing = checklist.items.filter((i) => !i.passed);
  if (failing.length > 0) {
    return {
      tone: "work",
      headline: `${failing.length} quality check${failing.length === 1 ? "" : "s"} failing`,
      detail: `${failing[0].label} — ${failing[0].detail}${
        failing.length > 1 ? ` (and ${failing.length - 1} more)` : ""
      }`,
      tab: "quality",
    };
  }

  if (!isPack) {
    return submitStep(canSubmit);
  }

  // 3. Content QA — the review gate refuses without a current, clean report.
  if (!qa) {
    return {
      tone: "work",
      headline: "Content QA hasn't run",
      detail:
        "Every pack is fact-checked and its activities approved before review. This reads the citations and answer keys and takes about a minute.",
      tab: "quality",
    };
  }
  if (qaStale) {
    return {
      tone: "work",
      headline: "Content QA is out of date",
      detail:
        "The pack changed since it was last reviewed, so the report no longer describes this content. Re-run it before submitting.",
      tab: "quality",
    };
  }

  const fixes = qaFixes(qa);
  if (fixes.length > 0) {
    return {
      tone: "work",
      headline: `${fixes.length} QA fix${fixes.length === 1 ? "" : "es"} ready to apply`,
      detail: `Each one is a button — ${fixes[0].label}${
        fixes.length > 1 ? `, and ${fixes.length - 1} more` : ""
      }. Fix all applies them in order and re-runs QA.`,
      tab: "quality",
    };
  }

  // Blocks that carry no fix button: a bad grade, a reviewer veto, or a
  // citation only a human can settle.
  const poorGrade = /^[CD]/i.test(qa.overallGrade ?? "");
  if (poorGrade || qa.readyForReview === false) {
    return {
      tone: "work",
      headline: poorGrade
        ? `Content QA graded this ${qa.overallGrade}`
        : "Content QA says it isn't ready",
      detail:
        qa.summary ||
        "The reviewer withheld approval. Read the report, fix what it names, then re-run it.",
      tab: "quality",
    };
  }
  const verify = qa.citations.filter((c) => c.verdict === "plausible");
  if (verify.length > 0) {
    return {
      tone: "go",
      headline: `Ready — after you check ${verify.length} citation${verify.length === 1 ? "" : "s"}`,
      detail:
        "The reviewer can't browse, so it flags sources a careful editor should confirm against the real thing. Nothing else is blocking.",
      tab: "quality",
    };
  }

  return submitStep(canSubmit);
}

function submitStep(canSubmit: boolean): NextStep {
  return canSubmit
    ? {
        tone: "go",
        headline: "Ready to submit for review",
        detail: "Every check passes and the content review is clean.",
      }
    : {
        tone: "go",
        headline: "Nothing is blocking this pack",
        detail: "Every check passes. Your role can't submit it — a coach or founder can.",
      };
}

/** "an exit ticket and the timing plan" */
function listOf(items: string[]): string {
  if (items.length === 0) return "nothing";
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
