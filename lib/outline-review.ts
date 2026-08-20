import type { ActivityKind, OutlineEntry } from "./lesson-pack-schema";

/**
 * CURRICULUM CHECKS ON THE PLAN, BEFORE ANYTHING IS WRITTEN.
 *
 * ── WHY HERE AND NOT AFTER THE BUILD ─────────────────────────────────────
 * Everything in this file could be checked on the finished pack instead — and
 * some of it already is, by the evidence checklist. But a structural defect
 * found after the build costs 7–15 minutes and a dollar to fix, because fixing
 * it means writing pages again. Found here it costs one click, because nothing
 * has been written yet. A lesson with no independent practice is the same
 * mistake at both moments; only the price differs.
 *
 * ── EVERY CHECK IS DERIVED, NOT DECLARED ─────────────────────────────────
 * There is no score here and no invented metric. Each check reads the plan the
 * model just produced and answers a question a head of department would ask
 * looking over a colleague's shoulder: does it end with an assessment, is the
 * skill modelled before it is demanded, does the class ever work alone, do the
 * minutes add up, is anyone actually talking for forty of the sixty minutes.
 *
 * ── A PROBLEM WITHOUT A FIX IS A COMPLAINT ───────────────────────────────
 * So a check carries `fix` wherever a correct repair can be derived from the
 * plan itself: append the missing exit ticket, rescale the minutes, move the
 * modelled example ahead of the guided practice. Where a repair would be a
 * guess, the check says what is wrong and points at the row, and does not
 * pretend to know the answer.
 */

export type CheckLevel = "blocker" | "warn" | "info";

export interface OutlineCheck {
  id: string;
  level: CheckLevel;
  title: string;
  detail: string;
  /** Row this concerns, so the UI can scroll to it. */
  index?: number;
  /** A repair the plan itself justifies. Pure — returns a new plan. */
  fix?: { label: string; apply: (plan: OutlineEntry[]) => OutlineEntry[] };
}

/** Page kinds that are the teacher talking or the class watching. */
const TEACHER_LED: ActivityKind[] = ["topic-intel", "i-do", "vocabulary"];
/**
 * Page kinds where a student produces something unaided.
 *
 * `exit-ticket` is deliberately NOT here even though it is unaided work. If it
 * were, this check would only ever fire on a plan that also has no assessment —
 * which is already a blocker — and it would be silent on the flaw it exists to
 * catch: a lesson where the first time anyone works alone is the moment they
 * are being marked.
 */
const INDEPENDENT: ActivityKind[] = ["independent-build", "remix", "sparring"];
/** Page kinds that assess. */
const ASSESSING: ActivityKind[] = ["exit-ticket"];

const KIND_LABEL: Partial<Record<ActivityKind, string>> = {
  hook: "opening hook",
  review: "retrieval review",
  "topic-intel": "topic briefing",
  vocabulary: "vocabulary page",
  "i-do": "modelled example",
  "we-do": "guided practice",
  drill: "drill",
  "evidence-study": "evidence study",
  "scaffolded-build": "scaffolded build",
  "independent-build": "independent build",
  sparring: "oral sparring",
  bridge: "bridge page",
  remix: "transfer task",
  "exit-ticket": "exit ticket",
  /* "page" alone read as a missing label. In a list where every other row
     names a teaching move — opening hook, modelled example, guided practice —
     one row saying only "PAGE" looks like the product failed to classify it,
     when in fact `custom` is the model's deliberate choice for a beat that
     none of the fourteen kinds describes (a consolidation page, say). Naming
     it as a choice is both more accurate and less alarming to read. */
  custom: "custom page",
};

export function outlineChecks(
  plan: OutlineEntry[],
  targetMin: number
): OutlineCheck[] {
  const out: OutlineCheck[] = [];
  if (plan.length === 0) return out;

  const kinds = plan.map((p) => p.kind);
  const has = (k: ActivityKind) => kinds.includes(k);
  const total = plan.reduce((n, p) => n + (p.durationMin || 0), 0);

  // ── 1. Do the minutes add up? ──
  if (targetMin > 0 && total !== targetMin) {
    const off = total - targetMin;
    out.push({
      id: "timing",
      level: Math.abs(off) > targetMin * 0.15 ? "blocker" : "warn",
      title: `The pages add up to ${total} minutes, not ${targetMin}`,
      detail:
        off > 0
          ? `${off} minutes over. Something gets cut in the room, and it is usually the exit ticket — the one page that tells you whether the lesson worked.`
          : `${-off} minutes short. A class that finishes early is a class that ends on its worst behaviour.`,
      fix: {
        label: `Rescale to ${targetMin} min`,
        apply: (p) => balance(p, targetMin),
      },
    });
  }

  // ── 2. Does it end by finding out whether they learned it? ──
  if (!ASSESSING.some(has)) {
    out.push({
      id: "no-assessment",
      level: "blocker",
      title: "Nothing assesses what they learned",
      detail:
        "There is no exit ticket, so the lesson ends without evidence that the skill landed — and the next lesson starts on a guess.",
      fix: {
        label: "Add an exit ticket",
        apply: (p) =>
          balance(
            [
              ...p,
              {
                kind: "exit-ticket" as ActivityKind,
                title: "EXIT TICKET",
                badge: "",
                durationMin: Math.max(3, Math.round(targetMin * 0.08)),
                goal: "Students perform today's skill once, alone and under a clock, against the success criteria.",
              },
            ],
            targetMin
          ),
      },
    });
  }

  // ── 3. Is the skill shown before it is demanded? ──
  if (!has("i-do")) {
    out.push({
      id: "no-model",
      level: "warn",
      title: "The skill is never modelled",
      detail:
        "No page shows the teacher performing the move before students attempt it. Novices asked to produce a skill they have not seen tend to reproduce the mistake they arrived with.",
    });
  } else {
    const firstModel = kinds.indexOf("i-do");
    const firstGuided = kinds.indexOf("we-do");
    if (firstGuided !== -1 && firstGuided < firstModel) {
      out.push({
        id: "release-order",
        level: "warn",
        title: "Guided practice comes before the modelled example",
        detail:
          "Page " +
          (firstGuided + 1) +
          " asks the class to practise together before page " +
          (firstModel + 1) +
          " shows them how. Gradual release runs I do → we do → you do.",
        index: firstGuided,
        fix: {
          label: "Put the model first",
          apply: (p) => {
            const next = [...p];
            const [model] = next.splice(firstModel, 1);
            next.splice(firstGuided, 0, model);
            return next;
          },
        },
      });
    }
  }

  // ── 4. Does anyone ever work alone? ──
  if (!INDEPENDENT.some(has)) {
    out.push({
      id: "no-independent",
      level: "warn",
      title: "The first unaided attempt is the assessment",
      detail:
        "Every page before the exit ticket is scaffolded, guided or teacher-led — so the first time students work without support is the moment they are being marked. One unaided practice page first is what turns the exit ticket into a measurement rather than a surprise.",
      fix: {
        label: "Add an independent build",
        apply: (p) => {
          const at = lastIndexOfKind(p, "exit-ticket");
          const page: OutlineEntry = {
            kind: "independent-build",
            title: "ON YOUR OWN",
            badge: "",
            durationMin: Math.max(4, Math.round(targetMin * 0.1)),
            goal: "Students perform the skill once with no frames and no partner.",
          };
          const next = [...p];
          next.splice(at === -1 ? next.length : at, 0, page);
          return balance(next, targetMin);
        },
      },
    });
  }

  // ── 5. Who is doing the work? ──
  const teacherMin = plan
    .filter((p) => TEACHER_LED.includes(p.kind))
    .reduce((n, p) => n + (p.durationMin || 0), 0);
  if (total > 0 && teacherMin / total > 0.45) {
    out.push({
      id: "teacher-heavy",
      level: "warn",
      title: `${Math.round((teacherMin / total) * 100)}% of the lesson is teacher-led`,
      detail:
        "Briefings, vocabulary and modelling take up most of the clock. The skill is learned in the pages where students are the ones producing.",
    });
  }

  // ── 6. Pages too short to contain anything ──
  const tiny = plan
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => (p.durationMin || 0) > 0 && p.durationMin < 3);
  if (tiny.length > 0) {
    out.push({
      id: "tiny-pages",
      level: "info",
      title: `${tiny.length} page${tiny.length === 1 ? " is" : "s are"} under three minutes`,
      detail:
        "Handing out a sheet, reading it and settling takes about two. A page shorter than that is a page nobody gets to.",
      index: tiny[0].i,
    });
  }

  // ── 7. Pages with no stated purpose ──
  const aimless = plan
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => !p.goal.trim());
  if (aimless.length > 0) {
    out.push({
      id: "no-goal",
      level: "warn",
      title: `${aimless.length} page${aimless.length === 1 ? " has" : "s have"} no stated purpose`,
      detail:
        "The goal is what the build writes the page against. Without one, that page is generated from its title alone.",
      index: aimless[0].i,
    });
  }

  // ── 8. Two of the same thing in a row ──
  for (let i = 1; i < plan.length; i++) {
    if (plan[i].kind === plan[i - 1].kind && plan[i].kind !== "drill") {
      out.push({
        id: "repeated-kind",
        level: "info",
        title: `Two ${KIND_LABEL[plan[i].kind] ?? plan[i].kind} pages back to back`,
        detail: `Pages ${i} and ${i + 1} do the same kind of work. Sometimes right, often a plan that lost its shape in the middle.`,
        index: i,
      });
      break;
    }
  }

  // ── 9. Duplicate titles ──
  const seen = new Map<string, number>();
  for (let i = 0; i < plan.length; i++) {
    const key = plan[i].title.trim().toLowerCase();
    if (!key) continue;
    if (seen.has(key)) {
      out.push({
        id: "duplicate-title",
        level: "warn",
        title: "Two pages share a title",
        detail: `Pages ${seen.get(key)! + 1} and ${i + 1} are both "${plan[i].title}". The pack refuses duplicate titles at review, and an AI edit aimed at one would find the other.`,
        index: i,
      });
      break;
    }
    seen.set(key, i);
  }

  return out;
}

/** Proportionally rescale durations so they sum to `target`. */
export function balance(plan: OutlineEntry[], target: number): OutlineEntry[] {
  const cur = plan.reduce((n, e) => n + (e.durationMin || 0), 0);
  if (cur <= 0 || plan.length === 0 || target <= 0) return plan;
  const scaled = plan.map((e) =>
    Math.max(1, Math.round(((e.durationMin || 0) * target) / cur))
  );
  /* Hand the rounding remainder to the longest pages, a minute at a time, so
     the shape of the lesson survives the arithmetic. */
  let diff = target - scaled.reduce((a, b) => a + b, 0);
  const order = scaled.map((_, i) => i).sort((a, b) => scaled[b] - scaled[a]);
  let k = 0;
  let guard = 2000;
  while (diff !== 0 && guard-- > 0) {
    const i = order[k % order.length];
    if (diff > 0) {
      scaled[i] += 1;
      diff -= 1;
    } else if (scaled[i] > 1) {
      scaled[i] -= 1;
      diff += 1;
    }
    k += 1;
  }
  return plan.map((e, i) => ({ ...e, durationMin: scaled[i] }));
}

function lastIndexOfKind(plan: OutlineEntry[], kind: ActivityKind): number {
  for (let i = plan.length - 1; i >= 0; i--) if (plan[i].kind === kind) return i;
  return -1;
}

/**
 * The five phases a lesson moves through, for the arc bar.
 *
 * Grouped by what the ROOM is doing, not by page kind, because that is the
 * thing a teacher is judging when they look at a plan: how long am I talking,
 * how long are they working, and does it end with them on their own.
 */
export type ArcPhase = "open" | "teach" | "practise" | "apply" | "assess";

const PHASE_OF: Record<ActivityKind, ArcPhase> = {
  hook: "open",
  review: "open",
  "topic-intel": "teach",
  vocabulary: "teach",
  "i-do": "teach",
  "we-do": "practise",
  drill: "practise",
  "evidence-study": "practise",
  "scaffolded-build": "practise",
  bridge: "practise",
  "independent-build": "apply",
  sparring: "apply",
  remix: "apply",
  "exit-ticket": "assess",
  custom: "practise",
};

export const PHASE_LABEL: Record<ArcPhase, string> = {
  open: "Open",
  teach: "Teach",
  practise: "Practise",
  apply: "Apply",
  assess: "Assess",
};

export function phaseOf(kind: ActivityKind): ArcPhase {
  return PHASE_OF[kind] ?? "practise";
}

export function kindLabel(kind: ActivityKind): string {
  return KIND_LABEL[kind] ?? kind;
}
