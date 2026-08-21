/**
 * Overnight builds: several packs, one queue, half price.
 *
 * This is the driver that sits on top of `lib/batch-queue.ts`. It turns the
 * coalescer on, runs the packs CONCURRENTLY through the ordinary generator, and
 * turns it off again. Nothing about the generation changes — same stages, same
 * prompts, same gates — the calls simply get parked and submitted in rounds.
 *
 * Concurrency is the whole point. Each pack blocks at the same stage boundaries,
 * so running five at once means each round's batch carries five requests
 * instead of one, and five lessons finish in about the wall-clock of one. A
 * sequential loop would still get the 50% discount but none of the throughput,
 * which for a week of lessons is most of the value.
 *
 * WHY THIS IS NOT AN HTTP REQUEST. A batch can take up to 24 hours, so nothing
 * here can live inside a route handler — `maxDuration` on the build route is an
 * hour and a serverless request would be long dead. The caller starts this and
 * returns immediately; progress is written to the materials themselves, exactly
 * as the live build does, so the library is the status board.
 */

import {
  getBestExemplar,
  getKitForMaterial,
  getMaterial,
  listAllObservations,
  listAllSubmissions,
  listCorrections,
  listMaterials,
  listOwnRecentLessonPacks,
  listRounds,
  listTaught,
  listSeriesSiblings,
  listStudents,
  logActivity,
  snapshotMaterial,
  updateMaterialContent,
  type MaterialRow,
  type Scope,
} from "./db";
import { describeAiError, generateLessonPack } from "./ai";
import { avoidDigest, priorDesigns } from "./design-memory";
import { unitDesign } from "./unit-identity";
import { recurringCorrectionGuidance, recentActivityGuidance } from "./analytics";
import { teachingFeedbackForPrompt } from "./weekly-digest";
import { computeTeachingSignal, signalForPrompt } from "./teaching-signal";
import { squadSignal, squadSignalForPrompt } from "./squad-signal";
import { type LessonPack } from "./lesson-pack-schema";
import { BatchCoalescer, setActiveCoalescer, type BatchEvent } from "./batch-queue";
import type { InheritedOutline } from "./remix";

/**
 * Everything a build needs about one pack, gathered from the DB.
 *
 * Called by BOTH the live build route and the overnight runner, so the two
 * paths cannot drift: an overnight build that grounded itself on a different
 * exemplar, or missed the squad signal, would produce quietly different lessons
 * for the same request. (This function claimed to be shared long before it was —
 * the route kept its own copy of these forty lines until they were deleted.)
 */
export async function buildInputs(scope: Scope, material: MaterialRow) {
  const content = material.content as LessonPack;
  const kit = await getKitForMaterial(scope, material.style_kit_id);
  const siblings = await listSeriesSiblings(
    scope,
    material.subject,
    content.series ?? "",
    material.id
  );
  const look = unitDesign(
    siblings.map((s) => {
      const c = s.content as LessonPack;
      return {
        id: s.id,
        lessonCode: c.lessonCode ?? "",
        title: s.title,
        designCss: c.designCss ?? "",
        designNote: c.designNote ?? "",
      };
    })
  );
  const skillFocus = content.skillFocus ?? "";
  const evidence = [
    squadSignalForPrompt(
      squadSignal(
        content.series || "No cohort",
        await listStudents(scope),
        await listAllObservations(scope)
      ),
      skillFocus
    ),
    signalForPrompt(
      computeTeachingSignal(
        await listRounds(scope),
        await listAllSubmissions(scope),
        await listMaterials(scope)
      ),
      skillFocus
    ),
  ]
    .filter(Boolean)
    .join("\n\n");

  let inherited: InheritedOutline | null = null;
  if (material.inherited_outline) {
    try {
      inherited = JSON.parse(material.inherited_outline) as InheritedOutline;
    } catch {
      inherited = null;
    }
  }

  return {
    kit,
    siblings,
    inherited,
    evidence,
    exemplar:
      (
        await getBestExemplar(
          scope,
          material.subject,
          {
            skillFocus: content.skillFocus,
            format: content.format,
            gradeBand: content.gradeBand,
            rigorLevel: content.rigorLevel,
          },
          material.id
        )
      )?.content ?? null,
    corrections: recurringCorrectionGuidance(
      await listCorrections(scope),
      material.subject
    ),
    recentActivity: recentActivityGuidance(
      await listOwnRecentLessonPacks(scope, material.id)
    ),
    /* Closes the loop the teaching log opened: what actually happened when
       this teacher last stood in front of a class, fed back into planning the
       next one. See teachingFeedbackForPrompt. */
    teachingFeedback: teachingFeedbackForPrompt(
      await listTaught(scope, { limit: 40 }),
      new Date().toISOString().slice(0, 10)
    ),
    design: {
      avoid: avoidDigest(await priorDesigns(scope, material.id)),
      inherit: look ? { css: look.designCss, note: look.designNote } : null,
    },
  };
}

export interface OvernightResult {
  materialId: number;
  ok: boolean;
  pages?: number;
  error?: string;
}

export interface OvernightRun {
  startedAt: string;
  finishedAt?: string;
  materialIds: number[];
  results: OvernightResult[];
  events: BatchEvent[];
  running: boolean;
}

/** The one run at a time this single-process deployment supports. */
let current: OvernightRun | null = null;

export function overnightStatus(): OvernightRun | null {
  return current;
}

/**
 * Build every pack in `materialIds` through the Batches API.
 *
 * Resolves when all of them have finished. Callers that must return immediately
 * (an HTTP route) should NOT await this — start it and poll `overnightStatus()`.
 */
export async function runOvernight(
  scope: Scope,
  materialIds: number[],
  opts: {
    fresh?: boolean;
    autoQa?: boolean;
    autoDesign?: boolean;
    role?: string;
    makeCoalescer: () => BatchCoalescer;
  }
): Promise<OvernightRun> {
  if (current?.running) {
    throw new Error(
      "An overnight run is already in progress. Wait for it to finish before starting another."
    );
  }
  const run: OvernightRun = {
    startedAt: new Date().toISOString(),
    materialIds,
    results: [],
    events: [],
    running: true,
  };
  current = run;

  const coalescer = opts.makeCoalescer();
  setActiveCoalescer(coalescer);
  const role = opts.role ?? "founder";

  try {
    await Promise.all(
      materialIds.map(async (id) => {
        const material = await getMaterial(scope, id);
        if (!material || material.type !== "lesson-pack") {
          run.results.push({
            materialId: id,
            ok: false,
            error: "Not a lesson pack.",
          });
          return;
        }
        try {
          await snapshotMaterial(material.id, "overnight build", role);
          await logActivity(material.id, role, "overnight-build-start");
          const inputs = await buildInputs(scope, material);
          let pages = 0;
          const gen = generateLessonPack(
            material.subject,
            material.content as LessonPack,
            inputs.inherited,
            inputs.siblings,
            inputs.evidence,
            inputs.kit?.config,
            inputs.exemplar,
            opts.fresh ?? false,
            inputs.corrections,
            opts.autoQa !== false,
            {
              // Opt-IN, exactly as the live build treats it. This used to
              // default ON here, so the same pack came back art-directed or
              // printing the house stylesheet depending only on which path
              // built it — and the overnight path is the one nobody watches.
              // The house design is the design on both. See the note on
              // `autoDesign` in app/api/materials/[id]/generate/route.ts.
              enabled: opts.autoDesign === true,
              avoid: inputs.design.avoid,
              inherit: inputs.design.inherit,
            },
            inputs.recentActivity,
            inputs.teachingFeedback
          );
          for await (const event of gen) {
            // Persist per stage, exactly like the live build: an overnight run
            // that dies at 3am must leave everything it finished on disk.
            if ((event.type === "stage-done" || event.type === "done") && event.pack) {
              pages = event.pack.activities.length;
              await updateMaterialContent(material.id, material.title, event.pack);
            }
          }
          await logActivity(material.id, role, "overnight-build-done");
          run.results.push({ materialId: id, ok: true, pages });
        } catch (err) {
          // The founder reads this hours later, from the status endpoint, with
          // no console and no stack. The two failures a 3am run actually hits —
          // out of credit, rate limited — are exactly the ones describeAiError
          // turns into a sentence with a next action attached.
          run.results.push({
            materialId: id,
            ok: false,
            error: describeAiError(err, "Overnight build failed."),
          });
          await logActivity(
            material.id,
            role,
            "overnight-build-error",
            describeAiError(err)
          );
        }
      })
    );
  } finally {
    // Always let any last round settle and detach, or the next live build would
    // silently park its requests in a coalescer nobody is draining.
    try {
      await coalescer.drain();
    } catch {
      /* drain errors already surfaced per request */
    }
    setActiveCoalescer(null);
    run.running = false;
    run.finishedAt = new Date().toISOString();
  }
  return run;
}
