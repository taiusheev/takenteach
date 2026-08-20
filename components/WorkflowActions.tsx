"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Transition } from "@/lib/workflow";
import { Subject } from "@/lib/subjects";
import {
  CORRECTION_CATEGORIES,
  CorrectionTag,
  tagsForSubject,
} from "@/lib/correction-tags";

export default function WorkflowActions({
  materialId,
  subject,
  transitions,
  blockedReason,
}: {
  materialId: number;
  subject: Subject;
  transitions: Transition[];
  /**
   * Why submitting would be refused right now, if it would be.
   *
   * The page already knows: `nextStep` mirrors the review gate exactly, so
   * whenever it reports work outstanding, the transition route is going to
   * answer 422. Offering "Submit for review" as the most prominent button on
   * the screen in that state — which is what happened, in brand gradient, next
   * to the words "11 quality checks failing" — is a dead end dressed as the
   * primary action. The 422 handler below is good and stays; this is about not
   * inviting the click in the first place.
   */
  blockedReason?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [blockers, setBlockers] = useState<string[]>([]);
  const [modalFor, setModalFor] = useState<Transition | null>(null);

  async function submit(t: Transition, tags: string[], note: string) {
    setBusy(true);
    setError("");
    setBlockers([]);
    const res = await fetch(`/api/materials/${materialId}/transition`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: t.action, tags, reason: note }),
    });
    const data = (await res.json()) as GateResponse;
    setBusy(false);
    setModalFor(null);
    if (!res.ok) {
      setError(data.error ?? "Transition failed");
      setBlockers(gateBlockers(data));
      router.refresh();
      return;
    }
    router.refresh();
  }

  function run(t: Transition) {
    if (t.requiresReason) {
      setModalFor(t); // send-back / unpublish → capture correction tags
    } else {
      submit(t, [], "");
    }
  }

  if (transitions.length === 0 && !error) return null;

  /* Two weights, because the workflow only ever offers two kinds of move. No
     state hands you two forward actions — draft offers submit, in_review offers
     approve OR send-back, approved offers publish, published offers unpublish —
     so the forward one can always be THE primary action on the screen and the
     backward one is always the outlined danger.

     "Publish" used to be a raw `sky-700`, a blue belonging to no palette in
     the product, on the theory that publishing deserved its own colour. It does,
     and it already has one: published is the destination the whole product
     exists to reach, so it wears the product's own brand — the same rule the
     status chips run on (see .chip-published in globals.css). */
  const style = (action: string) =>
    action === "reject" || action === "unpublish" ? "btn-danger" : "btn-primary";

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {transitions.map((t) => {
          /* Only the forward move out of draft is gated this way. Send-back and
             unpublish are always allowed, and an approval is the reviewer's own
             judgement rather than something this page can pre-empt. */
          const blocked = t.action === "submit" && !!blockedReason;
          return (
            <button
              key={t.action}
              onClick={() => (blocked ? undefined : run(t))}
              disabled={busy || blocked}
              aria-disabled={blocked || undefined}
              title={blocked ? blockedReason : undefined}
              className={`btn ${blocked ? "btn-secondary" : style(t.action)} disabled:opacity-40`}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      {blockedReason && transitions.some((t) => t.action === "submit") && (
        <p className="max-w-xs text-right text-[11.5px] leading-snug text-fg3">
          {blockedReason} — review opens once that is cleared.
        </p>
      )}
      {error && (
        <div className="max-w-md rounded-lg border border-danger/40 bg-danger/10 p-3 text-right">
          <p className="text-xs font-semibold text-danger">{error}</p>
          {blockers.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1 text-[11px] text-danger/90">
              {blockers.map((b) => (
                <li key={b}>· {b}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {modalFor && (
        <CorrectionModal
          transition={modalFor}
          subject={subject}
          busy={busy}
          onCancel={() => setModalFor(null)}
          onSubmit={(tags, note) => submit(modalFor, tags, note)}
        />
      )}
    </div>
  );
}

/** What a blocked transition (422) sends back alongside the message. */
type GateResponse = {
  error?: string;
  needsQa?: boolean;
  checklist?: { items?: { label: string; passed: boolean; detail?: string }[] };
  qaBlock?: {
    citations?: { id: string; verdict: string }[];
    weakActivities?: string[];
    answerKeyIssues?: string[];
    grade?: string;
    summary?: string;
  };
};

/**
 * Turn a gate's structured payload into the concrete list of things to fix, so
 * the author sees *what* is blocking review, not just that something is.
 */
function gateBlockers(data: GateResponse): string[] {
  const out: string[] = [];
  for (const i of data.checklist?.items ?? []) {
    if (!i.passed) out.push(`${i.label}${i.detail ? ` — ${i.detail}` : ""}`);
  }
  for (const c of data.qaBlock?.citations ?? []) {
    out.push(`Citation ${c.id}: ${c.verdict}`);
  }
  for (const a of data.qaBlock?.weakActivities ?? []) {
    out.push(`Weak activity: ${a}`);
  }
  for (const k of data.qaBlock?.answerKeyIssues ?? []) {
    out.push(`Answer key: ${k}`);
  }
  if (data.qaBlock?.grade) out.push(`Content QA graded this ${data.qaBlock.grade}`);
  if (data.qaBlock?.summary) out.push(data.qaBlock.summary);
  if (data.needsQa) out.push("Run Content QA on this pack, then submit again.");
  return out;
}

function CorrectionModal({
  transition,
  subject,
  busy,
  onCancel,
  onSubmit,
}: {
  transition: Transition;
  subject: Subject;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (tags: string[], note: string) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const tags = useMemo(() => tagsForSubject(subject), [subject]);
  const byCategory = useMemo(() => {
    const m = new Map<string, CorrectionTag[]>();
    for (const cat of CORRECTION_CATEGORIES) m.set(cat, []);
    for (const t of tags) m.get(t.category)?.push(t);
    return m;
  }, [tags]);

  const canSubmit = selected.length > 0 || note.trim().length > 0;

  function toggle(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-inkline bg-inkmid p-6 shadow-2xl">
        <h2 className="font-display text-2xl text-fg1">{transition.label}</h2>
        <p className="mb-4 mt-1 text-xs text-fg3">
          Tag what needs fixing. These feed the Quality Insights log — recurring
          tags reveal what to fix in the builder or promote into an automated
          check.
        </p>

        <div className="flex flex-col gap-4">
          {CORRECTION_CATEGORIES.map((cat) => {
            const catTags = byCategory.get(cat) ?? [];
            if (catTags.length === 0) return null;
            return (
              <div key={cat}>
                <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-widest text-fg3">
                  {cat}
                </h3>
                <div className="flex flex-wrap gap-2">
                  {catTags.map((t) => {
                    const on = selected.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        title={t.description}
                        onClick={() => toggle(t.id)}
                        className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                          on
                            ? "border-danger/60 bg-danger/12 text-danger"
                            : "border-inkline text-fg2 hover:text-fg1"
                        }`}
                      >
                        {on ? "✓ " : ""}
                        {t.label}
                        {t.hasAutomatedCheck && (
                          <span title="Already caught by an automated check" className="ml-1 opacity-60">
                            ⚙
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <label className="mt-4 block">
          <span className="field-label">Note to the builder (optional)</span>
          <textarea
            className="field-textarea"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Specifics — which card, which page, what to change."
          />
        </label>

        <div className="mt-5 flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={busy}
            className="rounded-md border border-inkline px-4 py-2 text-sm font-bold text-fg2 hover:text-fg1 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onSubmit(selected, note)}
            disabled={busy || !canSubmit}
            className="rounded-md border border-danger/50 bg-danger/10 px-4 py-2 text-sm font-bold text-danger hover:bg-danger/12 disabled:opacity-40 transition-colors"
          >
            {busy ? "Sending…" : `${transition.label} with ${selected.length} tag${selected.length === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </div>
  );
}
