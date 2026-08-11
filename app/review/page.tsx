import Link from "next/link";
import { getKitForMaterial, listMaterials } from "@/lib/db";
import { requireActiveSession } from "@/lib/auth/dal";
import { runChecklistFor } from "@/lib/checklist";
import { coherenceReport } from "@/lib/coherence";
import { commonFields, contentTypeDef, pageEstimate } from "@/lib/content-types";
import { LessonPack } from "@/lib/lesson-pack-schema";
import { SUBJECT_DEFS, Subject } from "@/lib/subjects";
import StatusChip from "@/components/StatusChip";

export const dynamic = "force-dynamic";

export default async function ReviewQueuePage() {
  const { legacyRole: role, scope } = await requireActiveSession();
  const queue = listMaterials(scope).filter(
    (m) => m.status === "in_review" || m.status === "approved"
  );
  const canAct = role === "founder" || role === "coach";

  // Per-pack quality signals so a reviewer can triage without opening each one.
  const rows = queue.map((m) => {
    const c = commonFields(m.content);
    const checklist = runChecklistFor(
      m.type,
      m.content,
      m.subject,
      getKitForMaterial(scope, m.style_kit_id)?.config
    );
    const failing = checklist.items.filter((i) => !i.passed).length;
    const coh =
      m.type === "lesson-pack" ? coherenceReport(m.content as LessonPack) : null;
    const unused = coh
      ? coh.unusedEvidence.length + coh.unusedVocab.length
      : 0;
    return { m, c, failing, unused, pages: pageEstimate(m.type, m.content) };
  });

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="font-display text-4xl text-fg1">Review Queue</h1>
      <p className="mt-1 mb-8 text-sm text-fg2">
        Packs waiting for approval or publication.{" "}
        {!canAct && (
          <span className="text-warn">
            You&apos;re acting as {role} — only founders and coaches can approve or
            publish.
          </span>
        )}
      </p>
      <ul className="flex flex-col gap-3">
        {rows.map(({ m, c, failing, unused, pages }) => (
          <li key={m.id}>
            <Link
              href={`/materials/${m.id}`}
              className="flex items-center gap-4 rounded-xl border border-inkline bg-inkcard px-5 py-4 hover:border-accent/40 transition-colors"
            >
              <div
                className="font-display mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-lg text-white"
                style={{ background: c.accentColor || "#0f766e" }}
              >
                {c.lessonCode || contentTypeDef(m.type).emoji}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-bold text-fg1">{m.title}</span>
                  <span className="shrink-0 rounded bg-inkmid px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-fg3">
                    {contentTypeDef(m.type).label}
                  </span>
                </div>
                <div className="truncate text-xs text-fg3">
                  {SUBJECT_DEFS[m.subject as Subject]?.emoji}{" "}
                  {SUBJECT_DEFS[m.subject as Subject]?.label ?? m.subject} ·{" "}
                  {c.skillFocus || "No skill focus"} · {pages} pages · by{" "}
                  {m.created_by_role} · {m.updated_at}
                </div>
                {/* triage signals */}
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {failing === 0 ? (
                    <Badge tone="green">✓ Checks pass</Badge>
                  ) : (
                    <Badge tone="red">
                      {failing} check{failing === 1 ? "" : "s"} failing
                    </Badge>
                  )}
                  {unused > 0 ? (
                    <Badge tone="amber">⚠ {unused} unused</Badge>
                  ) : (
                    m.type === "lesson-pack" && <Badge tone="green">✓ coherent</Badge>
                  )}
                </div>
              </div>
              <StatusChip status={m.status} />
            </Link>
          </li>
        ))}
        {rows.length === 0 && (
          <li className="rounded-xl border border-dashed border-inkline px-5 py-10 text-center text-sm text-fg3">
            The queue is clear.
          </li>
        )}
      </ul>
    </div>
  );
}

function Badge({
  tone,
  children,
}: {
  tone: "green" | "red" | "amber";
  children: React.ReactNode;
}) {
  const cls =
    tone === "green"
      ? "border-ok/40 bg-ok/10 text-ok"
      : tone === "red"
        ? "border-danger/40 bg-danger/10 text-danger"
        : "border-warn/40 bg-warn/10 text-warn";
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${cls}`}
    >
      {children}
    </span>
  );
}
