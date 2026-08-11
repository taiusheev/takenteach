import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  applyTransition,
  getKitForMaterial,
  listSeriesSiblings,
  saveChecklistRun,
} from "@/lib/db";
import { runChecklistFor, earlierSiblingVocab } from "@/lib/checklist";
import { LessonPack, packContentHash } from "@/lib/lesson-pack-schema";
import { correctionLabel, isValidTag } from "@/lib/correction-tags";
import { findTransition } from "@/lib/workflow";
import { loadMaterial } from "@/lib/api/guards";
import { badRequest, forbidden, readBody, unprocessable } from "@/lib/api/request";

const bodySchema = z.object({
  action: z.string().trim().min(1, "say which transition to apply"),
  reason: z.string().trim().max(2000).default(""),
  // Unknown tags are dropped rather than rejected: the tag vocabulary changes as
  // correction patterns are added, and a stale browser tab sending a retired tag
  // should still be able to send a pack back.
  tags: z.array(z.string()).default([]),
});

export async function POST(
  req: NextRequest,
  ctx: RouteContext<"/api/materials/[id]/transition">
) {
  const found = await loadMaterial(ctx);
  if (!found.ok) return found.response;
  const { material, session } = found;
  const { scope, legacyRole: role } = session;
  const parsed = await readBody(req, bodySchema);
  if (!parsed.ok) return parsed.response;
  const { action, reason } = parsed.data;
  const cleanTags = parsed.data.tags.filter(isValidTag);

  const transition = findTransition(action, material.status, role);
  if (!transition) {
    return forbidden(
      `A ${role} can't "${action}" a pack that is ${material.status.replace("_", " ")}.`
    );
  }
  if (transition.requiresReason && cleanTags.length === 0 && !reason) {
    return badRequest(
      "This action needs at least one correction tag (or a note) — it feeds the quality-insights log."
    );
  }
  if (transition.requiresChecklist) {
    // Series integrity: give the checklist the vocabulary earlier lessons taught
    // so it can flag a pack that re-defines a sibling's word.
    const content = material.content as LessonPack;
    const siblingVocab = earlierSiblingVocab(
      { id: material.id, lessonCode: content.lessonCode },
      await listSeriesSiblings(scope, material.subject, content.series ?? "", material.id)
    );
    const result = runChecklistFor(
      material.type,
      material.content,
      material.subject,
      (await getKitForMaterial(scope, material.style_kit_id))?.config,
      { siblingVocab }
    );
    await saveChecklistRun(material.id, result.passed, result.items);
    if (!result.passed) {
      return unprocessable(
        "The evidence-integrity checklist must pass before review.",
        { checklist: result }
      );
    }

    // Content-QA gate (lesson packs): the deterministic checklist can't judge
    // whether a claim is real or an activity actually teaches — the QA pass can.
    // A pack can't go to review with a fabricated citation or a weak activity.
    if (material.type === "lesson-pack") {
      const raw = content.contentQaJson;
      let qa: {
        readyForReview?: boolean;
        citations?: { id: string; verdict: string }[];
        activities?: { index: number; title: string; verdict: string }[];
        answerKeyIssues?: string[];
        overallGrade?: string;
        summary?: string;
        contentHash?: string;
      } | null = null;
      if (raw) {
        try {
          qa = JSON.parse(raw);
        } catch {
          qa = null;
        }
      }
      if (!qa) {
        return unprocessable(
          "Run Content QA before review — every pack must be fact-checked and its activities approved first.",
          { needsQa: true }
        );
      }
      // Stale-QA guard: if the content changed since QA ran, the report no longer
      // applies — require a fresh run so a changed pack can't ride an old pass.
      if (qa.contentHash !== packContentHash(content)) {
        return unprocessable(
          "The pack changed since it was last QA'd — re-run Content QA so the review reflects the current content.",
          { needsQa: true }
        );
      }
      const badCites = (qa.citations ?? []).filter(
        (c) => c.verdict === "unsupported" || c.verdict === "suspect"
      );
      const weak = (qa.activities ?? []).filter((a) => a.verdict === "weak");
      // A wrong answer key is a teaching defect, not a nit: it is the line a
      // teacher reads aloud while grading. QA lists them; the gate used to let
      // them through, which is how a pack with a misattributed card in its key
      // reached review. A C/D grade blocks for the same reason.
      const keyIssues = qa.answerKeyIssues ?? [];
      const poorGrade = /^[CD]/i.test(qa.overallGrade ?? "");
      if (
        badCites.length > 0 ||
        weak.length > 0 ||
        keyIssues.length > 0 ||
        poorGrade ||
        qa.readyForReview === false
      ) {
        return unprocessable(
          "Content QA flagged issues that must be fixed before review — use “Fix one thing” to resolve them, then re-run QA.",
          {
            qaBlock: {
              citations: badCites,
              weakActivities: weak.map((a) => `p${a.index} ${a.title}`),
              answerKeyIssues: keyIssues,
              grade: poorGrade ? qa.overallGrade : undefined,
              summary: qa.summary ?? "",
            },
          }
        );
      }
    }
  }

  const detail = [cleanTags.map(correctionLabel).join(", "), reason]
    .filter(Boolean)
    .join(" — ");

  // status change + activity + (for a send-back) the correction land atomically
  await applyTransition(scope, {
    materialId: material.id,
    toStatus: transition.to,
    role,
    action: transition.action,
    detail,
    correction: transition.requiresReason
      ? {
          subject: material.subject,
          type: material.type,
          tags: cleanTags,
          note: reason,
        }
      : undefined,
  });
  return NextResponse.json({ ok: true, status: transition.to });
}
