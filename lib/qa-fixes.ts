import type { ContentQa } from "./ai";

/**
 * Turning QA findings into one-click repairs.
 *
 * Content QA already produces surgical, specific findings — "the page-4 model
 * answer cites Card D for shopping trips; Card D is about disabled adults' car
 * dependence". Until now the author had to read that and retype it into the
 * revision box. The system knows the page, the problem and the fix; the button
 * should just do it.
 *
 * This module is the mapping layer, deliberately kept pure so the rules are
 * inspectable and testable without running the model.
 */

export interface QaFix {
  /** stable identity for queue/progress tracking */
  key: string;
  kind: "activity" | "answer-key" | "citation";
  /** what the button sits next to, for the progress list */
  label: string;
  /** the instruction handed to the revision pass */
  instruction: string;
}

/**
 * A "plausible" citation is NOT auto-fixable and must never get a Fix button.
 * The verdict means "a human should check this against the real source" — the
 * model cannot browse, so asking it to "fix" a plausible citation invites it to
 * invent a replacement. That is the exact failure the evidence rules exist to
 * prevent.
 */
export function isAutoFixableCitation(verdict: string): boolean {
  return verdict === "suspect" || verdict === "unsupported";
}

/**
 * Every actionable finding in a report, in the order they should be applied:
 * activities first (they carry page-scoped instructions and are the most
 * surgical), then answer keys, then evidence cards.
 *
 * `topFixes` deliberately produces NO buttons: it is a summary of the findings
 * below, so offering it as well would apply the same change twice — and a
 * double-applied "rewrite this answer" is how a good page becomes a mangled one.
 */
/**
 * Whether a page's review entry describes work that actually needs doing.
 *
 * Measured against the three real reports in the library: the reviewer fills
 * `issue` and `fix` on EVERY page, including the strong ones — "Hook cleanly
 * models phantom clash…", "Fix: None needed; optionally add a callout tally".
 * So neither field is a defect signal; treating a filled `issue` as one turned
 * 7 real defects on pack #27 into 19 fix buttons, and would have spent an
 * automatic repair budget rewriting pages the reviewer had just praised.
 *
 * `verdict` is the signal. A page needs work when it is weak, when it doesn't
 * build the lesson's skill, or when it is merely adequate — and even then not
 * when the reviewer's own suggestion opens by saying it isn't needed.
 */
const DECLINED_FIX = /^\s*(none needed|none\b|no change|nothing|n\/a|optional)/i;

function activityNeedsWork(a: ContentQa["activities"][number]): boolean {
  if (a.verdict === "weak" || !a.teachesSkill) return true;
  if (a.verdict !== "adequate") return false;
  return !DECLINED_FIX.test(a.fix ?? "");
}

function activityFix(a: ContentQa["activities"][number]): QaFix {
  const problem = [
    a.issue,
    !a.teachesSkill ? "This page does not build the lesson's stated skill." : "",
  ]
    .filter(Boolean)
    .join(" ");
  return {
    key: `activity-${a.index}`,
    kind: "activity",
    label: `p${a.index} ${a.title}`,
    // scoped by exact title — the same stable key the revision pass locates by
    instruction: `On the page titled "${a.title}" (page ${a.index}) only: ${problem}${
      a.fix ? ` Make this change: ${a.fix}` : ""
    }`,
  };
}

export function qaFixes(report: ContentQa | null): QaFix[] {
  if (!report) return [];
  const fixes: QaFix[] = [];

  for (const a of report.activities) {
    if (!activityNeedsWork(a)) continue;
    // Nothing to instruct with — unless the page misses the lesson's skill,
    // which is itself the instruction and needs no supporting note.
    if (!a.issue && !a.fix && a.teachesSkill) continue;
    fixes.push(activityFix(a));
  }

  report.answerKeyIssues.forEach((issue, i) => {
    fixes.push({
      key: `answer-${i}`,
      kind: "answer-key",
      label: issue.length > 70 ? `${issue.slice(0, 70)}…` : issue,
      // these name their own page ("Page 9: …"), which the revision pass reads
      instruction: `Fix this answer key, changing nothing else: ${issue}`,
    });
  });

  for (const c of report.citations) {
    if (!isAutoFixableCitation(c.verdict)) continue;
    fixes.push({
      key: `citation-${c.id}`,
      kind: "citation",
      label: `Card ${c.id} · ${c.verdict}`,
      instruction: `Card ${c.id} was flagged as ${c.verdict} in review: ${c.note} Correct the card so it is accurate and its limit is honest, and fix any page that cites it beyond what it can now support. Do not invent a replacement source — if the claim cannot be sourced honestly, weaken the claim.`,
    });
  }

  return fixes;
}

/**
 * Suggestions on pages the reviewer judged STRONG — real improvements it
 * volunteered rather than defects it found ("optionally have students also
 * label WHY Con's line is phantom before rewriting").
 *
 * Kept separate from `qaFixes` and never auto-applied: a build that rewrites
 * pages its own reviewer called strong is gambling with the parts that already
 * work. Offered to the author as optional polish, which is what they are.
 */
export function qaOptionalFixes(report: ContentQa | null): QaFix[] {
  if (!report) return [];
  return report.activities
    .filter(
      (a) =>
        !activityNeedsWork(a) &&
        (a.fix ?? "").trim().length > 0 &&
        // "None needed." on its own is not a suggestion; "None needed;
        // optionally add a tally students fill in" is.
        !/^\s*(none needed|none|no change|nothing|n\/a)\.?\s*$/i.test(a.fix)
    )
    .map(activityFix);
}

/**
 * The same findings, arranged for the BUILD to repair on its own.
 *
 * Two differences from the button list. First, order by severity rather than by
 * surgical convenience: a misattributed source and a wrong answer key are
 * factual errors a teacher would hand to a class, while a thin page is a quality
 * complaint — correctness goes first so that if the cap bites, it bites on the
 * least damaging findings.
 *
 * Second, group them. A revision call returns each edited page as a full JSON
 * object, so one call can carry several fixes far more cheaply than one call per
 * fix — and on a first draft with twenty findings, one-at-a-time would add half
 * an hour to the build. Grouping is capped rather than unlimited because a
 * single instruction listing everything blows the revision token ceiling, which
 * is exactly how the "Empty revision response" bug happened.
 */
export function qaRepairPlan(
  report: ContentQa | null,
  { maxFixes = 12, perCall = 4 }: { maxFixes?: number; perCall?: number } = {}
): { batches: QaFix[][]; deferred: QaFix[] } {
  const severity: Record<QaFix["kind"], number> = {
    citation: 0,
    "answer-key": 1,
    activity: 2,
  };
  const ordered = qaFixes(report)
    .map((f, i) => ({ f, i }))
    .sort((a, b) => severity[a.f.kind] - severity[b.f.kind] || a.i - b.i)
    .map(({ f }) => f);

  const take = ordered.slice(0, maxFixes);
  const batches: QaFix[][] = [];
  for (let i = 0; i < take.length; i += perCall) {
    batches.push(take.slice(i, i + perCall));
  }
  return { batches, deferred: ordered.slice(maxFixes) };
}

/** One revision instruction carrying a whole batch of findings. */
export function repairInstruction(batch: QaFix[]): string {
  return `A senior reviewer read this finished pack and found the problems below. Fix EXACTLY these and change nothing else — every other page, card and field must come back byte-for-byte identical.

${batch.map((f, i) => `${i + 1}. ${f.instruction}`).join("\n\n")}`;
}

/** Findings that need a human, not a button — surfaced so they aren't ignored. */
export function qaVerifyOnly(report: ContentQa | null): string[] {
  if (!report) return [];
  return report.citations
    .filter((c) => c.verdict === "plausible")
    .map((c) => `Card ${c.id}: ${c.note}`);
}
