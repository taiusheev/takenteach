import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getBestExemplar,
  getKitForMaterial,
  getMaterial,
  listActivity,
  listAllSubmissions,
  listCorrectionsFor,
  listMaterials,
  listRounds,
  listSeriesSiblings,
  listStyleKits,
} from "@/lib/db";
import { checkUniqueness } from "@/lib/uniqueness";
import { preflight } from "@/lib/preflight";
import { BUDGET_MODES, budgetMode } from "@/lib/model-policy";
import { unitDesign, unitDesignLabel } from "@/lib/unit-identity";
import { contentOnly } from "@/lib/exemplar";
import { coherenceReport } from "@/lib/coherence";
import { computeTeachingSignal, signalForLesson } from "@/lib/teaching-signal";
import { LessonPack, packContentHash } from "@/lib/lesson-pack-schema";
import { packReadiness } from "@/lib/readiness";
import { nextStep } from "@/lib/next-step";
import { describeCoverage, qaCoverage, type QaScope } from "@/lib/qa-scope";
import UniquenessPanel from "@/components/UniquenessPanel";
import RoundEvidencePanel from "@/components/RoundEvidencePanel";
import { runChecklistFor, earlierSiblingVocab } from "@/lib/checklist";
import { correctionLabel } from "@/lib/correction-tags";
import { commonFields, contentTypeDef } from "@/lib/content-types";
import { requireActiveSession } from "@/lib/auth/dal";
import {
  availableTransitions,
  canCreate,
  canEdit,
  STATUS_LABELS,
  type Status,
} from "@/lib/workflow";
import StatusChip from "@/components/StatusChip";
import ChecklistPanel from "@/components/ChecklistPanel";
import ContentQaPanel from "@/components/ContentQaPanel";
import PagesPanel from "@/components/PagesPanel";
import PackSummary from "@/components/PackSummary";
import MaterialTabs, { type MaterialTab } from "@/components/MaterialTabs";
import VersionHistory from "@/components/VersionHistory";
import type { ContentQa } from "@/lib/ai";
import WorkflowActions from "@/components/WorkflowActions";
import DeleteMaterialButton from "@/components/DeleteMaterialButton";
import DuplicateButton from "@/components/DuplicateButton";
import StyleKitPicker from "@/components/StyleKitPicker";
import DesignButton from "@/components/DesignButton";
import { IconPencil, IconPlay, IconPrinter } from "@/components/shell/icons";

export const dynamic = "force-dynamic";

export default async function MaterialPage(ctx: {
  params: Promise<{ id: string }>;
}) {
  const { legacyRole: role, scope } = await requireActiveSession();
  const { id } = await ctx.params;
  const material = await getMaterial(scope, Number(id));
  if (!material) notFound();

  const editable = canEdit(material.status, role);
  const isPack = material.type === "lesson-pack";
  const source = material.forked_from ? await getMaterial(scope, material.forked_from) : null;
  const kit = await getKitForMaterial(scope, material.style_kit_id);
  const allKits = await listStyleKits(scope);
  const seriesSiblings = await listSeriesSiblings(scope, 
    material.subject,
    commonFields(material.content).series,
    material.id
  );
  const checklist = runChecklistFor(
    material.type,
    material.content,
    material.subject,
    kit?.config,
    {
      siblingVocab: earlierSiblingVocab(
        { id: material.id, lessonCode: commonFields(material.content).lessonCode },
        seriesSiblings
      ),
    }
  );
  // Last stored content-QA report, if any (parsed defensively). The stored copy
  // carries a `contentHash` the QA route stamps on at save time; it isn't part
  // of the model's own output shape, which is why it's widened here.
  let qaReport:
    | (ContentQa & { contentHash?: string; scope?: QaScope })
    | null = null;
  if (isPack) {
    const raw = (material.content as LessonPack).contentQaJson;
    if (raw) {
      try {
        qaReport = JSON.parse(raw) as ContentQa & {
          contentHash?: string;
          scope?: QaScope;
        };
      } catch {
        qaReport = null;
      }
    }
  }

  const transitions = availableTransitions(material.status, role);
  const activity = await listActivity(scope, material.id);
  const corrections = await listCorrectionsFor(scope, material.id);
  // what judged rounds say about the skill this lesson teaches
  const teachingSignal = computeTeachingSignal(
    await listRounds(scope),
    await listAllSubmissions(scope),
    await listMaterials(scope)
  );
  const lessonSignal = isPack
    ? signalForLesson(teachingSignal, material.content as LessonPack)
    : null;
  // Lesson-pack-only, like the two reports above it. Unguarded, this crashed the
  // whole page for every other type — a class plan has no `activities` to map —
  // so opening any class plan, vocabulary set or ballot returned a 500.
  const uniqueness = isPack
    ? checkUniqueness(material.content as LessonPack, seriesSiblings)
    : null;
  const coherence = isPack
    ? coherenceReport(material.content as LessonPack)
    : null;
  // the exemplar the next build would be measured against (same call the
  // generate route makes, so what's shown here is what will actually be used)
  const packContent = material.content as LessonPack;
  const readiness = isPack ? packReadiness(packContent) : null;
  const exemplar = isPack
    ? await getBestExemplar(scope, 
        material.subject,
        {
          skillFocus: packContent.skillFocus,
          format: packContent.format,
          gradeBand: packContent.gradeBand,
          rigorLevel: packContent.rigorLevel,
        },
        material.id
      )
    : null;
  // What the build would cost and what it's missing — computed from the same
  // slimmed exemplar the build actually sends, so the prefix figure is real.
  // A pack whose series already has a look inherits it and makes no design
  // call, so the quoted price has to drop accordingly.
  const seriesLook = isPack
    ? unitDesign(
        seriesSiblings.map((s) => {
          const c = s.content as LessonPack;
          return {
            id: s.id,
            lessonCode: c.lessonCode ?? "",
            title: s.title,
            designCss: c.designCss ?? "",
            designNote: c.designNote ?? "",
          };
        })
      )
    : null;
  const check = isPack
    ? preflight(packContent, {
        exemplarJson: exemplar ? JSON.stringify(contentOnly(exemplar.content)) : "",
        hasExemplar: !!exemplar,
        autoQa: true,
        // Deliberately omitted, which means off: a build does not art-direct.
        // This used to pass `!seriesLook`, quoting a design call the build was
        // never going to make whenever the series had no established look.
      })
    : null;

  // The single ranked answer to "what do I do now?", mirroring the review gate
  // so a blocker is visible before Submit returns a 422 rather than after.
  const step = nextStep({
    materialId: material.id,
    isPack,
    status: material.status,
    canEdit: editable,
    canSubmit: transitions.some((t) => t.action === "submit"),
    readiness,
    checklist,
    qa: qaReport,
    qaStale: !!qaReport && qaReport.contentHash !== packContentHash(packContent),
    /* Names the pages the stored verdict no longer covers, so a teacher can
       finish editing and pay for one review instead of one per session. */
    qaScopeNote: qaReport
      ? describeCoverage(
          qaCoverage(packContent, qaReport.scope ?? null),
          packContent.activities.length
        )
      : undefined,
  });

  const activeBudget = budgetMode();
  const failingChecks = checklist.items.filter((i) => !i.passed).length;

  const tabs: MaterialTab[] = [];

  tabs.push({
    id: "overview",
    label: "Overview",
    content: (
      <div className="flex flex-col gap-4">
        {isPack ? (
          <PackSummary pack={packContent} />
        ) : (
          <div className="rounded-xl border border-inkline bg-inkcard p-4 text-sm text-fg2">
            {contentTypeDef(material.type).label} · {material.subject}
            {commonFields(material.content).skillFocus
              ? ` · ${commonFields(material.content).skillFocus}`
              : ""}
          </div>
        )}
        {isPack && uniqueness && (
          <div className="grid gap-4 md:grid-cols-2">
            <UniquenessPanel
              report={uniqueness}
              series={commonFields(material.content).series}
            />
            <RoundEvidencePanel
              signal={lessonSignal}
              quotes={teachingSignal.judgeQuotes}
              skillFocus={commonFields(material.content).skillFocus}
            />
          </div>
        )}
      </div>
    ),
  });

  // Only once there are pages to edit — PagesPanel renders nothing for an empty
  // shell, and an empty tab is a dead end.
  if (isPack && editable && packContent.activities.length > 0) {
    tabs.push({
      id: "edit",
      label: "Edit",
      badge: `${packContent.activities.length}`,
      content: (
        <PagesPanel
          materialId={material.id}
          pages={packContent.activities.map((a, i) => ({
            index: i,
            kind: a.kind,
            title: a.title,
            durationMin: a.durationMin,
          }))}
        />
      ),
    });
  }

  tabs.push({
    id: "quality",
    label: "Quality",
    badge: failingChecks > 0 ? `${failingChecks} failing` : "pass",
    tone: failingChecks > 0 ? "bad" : "neutral",
    content: (
      <div className="flex flex-col gap-4">
        {isPack && (
          <ContentQaPanel
            materialId={material.id}
            initial={qaReport}
            ranAt={packContent.contentQaAt}
            canRun={editable}
          />
        )}
        <ChecklistPanel result={checklist} />
        {coherence &&
          packContent.activities.length > 0 &&
          (coherence.unusedEvidence.length > 0 ||
            coherence.unusedVocab.length > 0) && (
            <div className="rounded-xl border border-warn/40 bg-warn/5 p-4">
              <h2 className="mb-1 text-xs font-bold uppercase tracking-widest text-warn">
                Coherence — used, not just present
              </h2>
              <p className="mb-2 text-[11px] leading-relaxed text-fg3">
                Advisory (won&apos;t block review): defined but never deployed in
                an activity. A strong pack puts every card and term back to work.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {coherence.unusedEvidence.length > 0 && (
                  <span className="rounded-full border border-warn/40 bg-inkcard px-2 py-0.5 text-[11px] font-semibold text-fg1">
                    {coherence.unusedEvidence.length}/{coherence.evidenceCount}{" "}
                    evidence card
                    {coherence.unusedEvidence.length === 1 ? "" : "s"} unused
                  </span>
                )}
                {coherence.unusedVocab.length > 0 && (
                  <span className="rounded-full border border-warn/40 bg-inkcard px-2 py-0.5 text-[11px] font-semibold text-fg1">
                    {coherence.unusedVocab.length}/{coherence.vocabCount} vocab
                    term{coherence.unusedVocab.length === 1 ? "" : "s"} unused
                  </span>
                )}
              </div>
            </div>
          )}
      </div>
    ),
  });

  if (isPack && editable && check) {
    tabs.push({
      id: "build",
      label: "Build",
      badge: check.blockers.length > 0 ? `${check.blockers.length} blocking` : undefined,
      tone: "warn",
      content: (
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-inkline bg-inkcard p-4 text-xs">
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <Link
                href={`/materials/${material.id}/generate`}
                className="btn btn-primary"
              >
                {packContent.activities.length > 0
                  ? "Rebuild with AI"
                  : "Build it with AI"}
              </Link>
              <span className="text-fg3">
                Estimated{" "}
                <strong className="text-fg2">
                  {check.estimate.callsLow}–{check.estimate.callsHigh} model calls
                </strong>{" "}
                ·{" "}
                <strong className="text-fg2">
                  ${check.estimate.usdLow.toFixed(2)}–$
                  {check.estimate.usdHigh.toFixed(2)}
                </strong>{" "}
                · {(check.estimate.prefixTokens / 1000).toFixed(1)}k-token shared
                prompt prefix, cached across every call.
              </span>
            </div>

            {/* What each budget mode would cost for THIS pack, priced off the
                same table the build routes by — so the comparison is real
                rather than a rule of thumb. */}
            <div className="mb-3 rounded border border-inkline/70 p-2">
              <h3 className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-fg3">
                Cost mode
              </h3>
              <ul className="flex flex-col gap-1.5">
                {BUDGET_MODES.map((m) => {
                  const est = preflight(packContent, {
                    exemplarJson: exemplar
                      ? JSON.stringify(contentOnly(exemplar.content))
                      : "",
                    hasExemplar: !!exemplar,
                    autoQa: true,
                    mode: m.id,
                  }).estimate;
                  const on = m.id === activeBudget;
                  return (
                    <li key={m.id} className="flex flex-wrap items-baseline gap-2">
                      <span
                        className={`w-32 shrink-0 font-bold ${on ? "text-accent" : "text-fg2"}`}
                      >
                        {m.label}
                        {on && " ·"}
                        {on && (
                          <span className="font-normal text-fg3"> in use</span>
                        )}
                      </span>
                      <span className="shrink-0 font-mono text-fg1">
                        ${est.usdLow.toFixed(2)}–${est.usdHigh.toFixed(2)}
                      </span>
                      <span className="min-w-0 flex-1 text-[11px] text-fg3">
                        {m.blurb}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>

            {check.blockers.length > 0 && (
              <div className="mb-2 rounded border border-danger/40 bg-danger/10 p-2">
                <p className="mb-1 font-bold text-danger">
                  This build would produce a pack that can&apos;t pass review —
                  fix these first and save the spend:
                </p>
                <ul className="list-inside list-disc space-y-0.5 text-danger">
                  {check.blockers.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </div>
            )}
            {check.warnings.length > 0 && (
              <ul className="mb-2 list-inside list-disc space-y-0.5 text-warn">
                {check.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}

            {exemplar ? (
              <p className="text-fg2">
                Grounded on{" "}
                <Link
                  href={`/materials/${exemplar.id}`}
                  className="font-bold text-accent hover:underline"
                >
                  {exemplar.title}
                </Link>{" "}
                <span className="text-fg3">
                  ({STATUS_LABELS[exemplar.status as Status] ?? exemplar.status},{" "}
                  {(exemplar.content as LessonPack).activities.length} pages) —
                  held up as the standard to beat, never a template to copy.
                </span>
              </p>
            ) : (
              <p className="text-fg3">
                No exemplar yet — nothing in the library has been submitted for
                review, so this build sets its own bar. Get one pack through
                review and every later build is measured against it.
              </p>
            )}
            <p className="mt-1 text-[10px] text-fg3">
              Cost is an estimate from page count and the measured prefix size,
              not a quote.
            </p>
          </div>

          <div className="rounded-xl border border-inkline bg-inkcard p-4">
            <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-fg3">
              Appearance
            </h2>
            <div className="flex flex-col gap-3">
              {seriesLook && !packContent.designCss && (
                <p className="text-xs text-ok">
                  This build inherits the look already set by{" "}
                  <strong>{unitDesignLabel(seriesLook)}</strong> — one call
                  saved, and the series stays one publication. Design it
                  separately only if you want this lesson to stand apart.
                </p>
              )}
              <DesignButton
                materialId={material.id}
                hasDesign={!!packContent.designCss}
                note={packContent.designNote}
              />
              <StyleKitPicker
                materialId={material.id}
                current={kit?.id ?? 0}
                kits={allKits.map((k) => ({
                  id: k.id,
                  name: k.name,
                  isDefault: k.is_default === 1,
                }))}
                disabled={!editable}
              />
            </div>
          </div>
        </div>
      ),
    });
  }

  tabs.push({
    id: "history",
    label: "History",
    content: (
      <div className="flex flex-col gap-4">
        <VersionHistory materialId={material.id} canRestore={editable} />

        {corrections.length > 0 && (
          <div className="rounded-xl border border-danger/30 bg-danger/5 p-4">
            <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-danger/80">
              Correction history ({corrections.length})
            </h2>
            <ul className="flex flex-col gap-2.5">
              {corrections.map((c) => (
                <li key={c.id} className="text-xs">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-bold text-fg1">{c.role}</span>
                    <span className="text-fg3">{c.action.replace("_", " ")}</span>
                    <span className="text-fg3">· {c.created_at}</span>
                  </div>
                  {c.tags.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {c.tags.map((t) => (
                        <span
                          key={t}
                          className="rounded-full border border-danger/40 bg-danger/10 px-2 py-0.5 text-[10px] font-semibold text-danger"
                        >
                          {correctionLabel(t)}
                        </span>
                      ))}
                    </div>
                  )}
                  {c.note && <p className="mt-1 text-fg2">“{c.note}”</p>}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="rounded-xl border border-inkline bg-inkcard p-4">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-fg3">
            Activity
          </h2>
          <ul className="flex flex-col gap-2">
            {activity.map((a) => (
              <li key={a.id} className="text-xs">
                <span className="font-bold text-fg1">{a.role}</span>{" "}
                <span className="text-fg2">{a.action}</span>
                {a.detail && <span className="text-fg3"> — “{a.detail}”</span>}
                <span className="text-fg3"> · {a.created_at}</span>
              </li>
            ))}
            {activity.length === 0 && (
              <li className="text-xs text-fg3">No activity yet.</li>
            )}
          </ul>
        </div>
      </div>
    ),
  });

  const stepTone =
    step.tone === "go"
      ? "border-ok/40 bg-ok/5"
      : step.tone === "work"
        ? "border-warn/40 bg-warn/5"
        : "border-inkline bg-inkcard";

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5 flex flex-wrap items-center gap-4">
        <div
          className="font-display flex h-12 w-12 items-center justify-center rounded-lg text-xl text-white"
          style={{
            background: commonFields(material.content).accentColor || "#0f766e",
          }}
        >
          {commonFields(material.content).lessonCode ||
            contentTypeDef(material.type).emoji}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="font-display text-3xl text-fg1">{material.title}</h1>
            <span className="rounded bg-inkmid px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-fg3">
              {contentTypeDef(material.type).label}
            </span>
          </div>
          <p className="text-xs text-fg3">
            {material.subject} ·{" "}
            {commonFields(material.content).series || "No series"} · created by{" "}
            {material.created_by_role} · updated {material.updated_at}
            {source && (
              <>
                {" · "}
                {material.inherited_outline ? "Remixed" : "Duplicated"} from{" "}
                <Link
                  href={`/materials/${source.id}`}
                  className="font-bold text-accent hover:underline"
                >
                  {source.title}
                </Link>
              </>
            )}
          </p>
        </div>
        <StatusChip status={material.status} />
      </div>

      {/* What to do now, and the ways out of this page. Everything else is a
          diagnostic and lives behind a tab. */}
      <div className={`mb-6 rounded-xl border p-4 ${stepTone}`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-fg1">{step.headline}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-fg2">{step.detail}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {step.cta && (
              <Link
                href={step.cta.href}
                className="btn btn-primary"
              >
                {step.cta.label}
              </Link>
            )}
            <WorkflowActions
              materialId={material.id}
              subject={material.subject}
              transitions={transitions}
              /* `nextStep` mirrors the review gate, so "there is work to do"
                 and "submitting would 422" are the same condition. */
              blockedReason={step.tone === "work" ? step.headline : undefined}
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-inkline/60 pt-3">
          {/* One row of exits, all at the same weight — the ranked action is
              the CTA above, and a second bold button here would compete with
              it. The play glyph was a typed "▶", which sits on the baseline
              and renders as a different character on every platform. */}
          {isPack && readiness?.canTeach && (
            <Link
              href={`/materials/${material.id}/teach`}
              className="btn btn-secondary"
            >
              <IconPlay size={13} />
              Teach it
            </Link>
          )}
          {editable && (
            <Link
              href={`/materials/${material.id}/edit`}
              className="btn btn-secondary"
            >
              <IconPencil size={13} />
              Edit the lesson
            </Link>
          )}
          <Link
            href={`/materials/${material.id}/print`}
            className="btn btn-secondary"
          >
            <IconPrinter size={13} />
            Print &amp; download
          </Link>
          {canCreate(role) && (
            <>
              <DuplicateButton
                materialId={material.id}
                title={material.title}
                className="btn btn-secondary"
              />
              <Link
                href={`/materials/${material.id}/fork`}
                className="btn btn-secondary"
              >
                Remix
              </Link>
            </>
          )}
          <div className="flex-1" />
          {material.status === "draft" &&
            (role === "founder" || role === "coach") && (
              <DeleteMaterialButton
                materialId={material.id}
                title={material.title}
              />
            )}
        </div>
      </div>

      <MaterialTabs tabs={tabs} initial={step.tab} />
    </div>
  );
}
