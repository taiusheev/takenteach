"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/shell/Toaster";

/**
 * "I taught this."
 *
 * ── THE SKIPPED PAGES ARE DERIVED, NOT ASKED FOR ─────────────────────────
 * The one thing that makes this worth more than a checkbox: Classroom Mode
 * already knows which pages went up on the screen. So `unvisited` arrives
 * pre-selected, and a coach closing a lesson at 3:40pm confirms rather than
 * recalls. Asking someone to remember which of fourteen pages they cut, after
 * teaching, is how a form gets abandoned — and an abandoned form produces the
 * silence that looks exactly like "nothing was skipped".
 *
 * It stays EDITABLE because visited is not the same as taught: a page opened
 * for ten seconds and moved past was skipped in every sense that matters, and
 * only the person in the room knows that.
 *
 * ── WHY PACING IS THREE BUTTONS AND NOT A DURATION FIELD ─────────────────
 * A minute count would be more precise and would not get filled in. The
 * generator does not need the number — it needs to know which way to move,
 * and that is one tap. See `teachingFeedbackForPrompt` in lib/weekly-digest.ts
 * for what is done with it.
 *
 * Nothing here is required. A coach who taps only "ran out of time" and closes
 * it has given the single most useful fact there is, and the digest counts it.
 */

const PACING = [
  { id: "behind", label: "Ran out of time", hint: "Didn't finish the pack" },
  { id: "on", label: "About right", hint: "Landed the exit ticket on time" },
  { id: "ahead", label: "Finished early", hint: "Had time spare" },
] as const;

const RATINGS = [
  { value: 2, label: "Rough" },
  { value: 3, label: "OK" },
  { value: 4, label: "Good" },
  { value: 5, label: "Great" },
] as const;

export default function TeachingLog({
  materialId,
  defaultCohort,
  pageTitles,
  unvisited = [],
  className = "btn btn-secondary",
  label = "Log this lesson",
  onDone,
}: {
  materialId: number;
  /** the pack's series, as the starting cohort — a coach rarely retypes it */
  defaultCohort: string;
  pageTitles: string[];
  /** pages Classroom Mode never displayed; pre-selected as skipped */
  unvisited?: string[];
  className?: string;
  label?: string;
  onDone?: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {label}
      </button>
      {open && (
        <Dialog
          materialId={materialId}
          defaultCohort={defaultCohort}
          pageTitles={pageTitles}
          unvisited={unvisited}
          onClose={() => setOpen(false)}
          onDone={onDone}
        />
      )}
    </>
  );
}

function Dialog({
  materialId,
  defaultCohort,
  pageTitles,
  unvisited,
  onClose,
  onDone,
}: {
  materialId: number;
  defaultCohort: string;
  pageTitles: string[];
  unvisited: string[];
  onClose: () => void;
  onDone?: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [cohort, setCohort] = useState(defaultCohort);
  const [pacing, setPacing] = useState<string>("");
  const [rating, setRating] = useState(0);
  const [note, setNote] = useState("");
  const [skipped, setSkipped] = useState<string[]>(unvisited);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function toggleSkipped(title: string) {
    setSkipped((s) =>
      s.includes(title) ? s.filter((x) => x !== title) : [...s, title]
    );
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/materials/${materialId}/taught`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cohort, pacing, rating, note, skipped }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't log this lesson");
      toast("Logged. It's in this week's summary.", "ok");
      onClose();
      onDone?.();
      router.refresh();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Couldn't log this lesson";
      setError(message);
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-inkline bg-inkmid p-6 shadow-2xl">
        <h2 className="text-lg font-bold text-fg1">How did it go?</h2>
        <p className="mb-5 mt-1 text-xs leading-relaxed text-fg3">
          Two taps is plenty. What you say about time is the only real evidence
          we have that these packs fit a real room — it changes how the next one
          is built.
        </p>

        {/* Pacing first, and largest: it is the field that does the work. */}
        <div className="mb-4">
          <span className="field-label">Did it fit the time?</span>
          <div className="mt-1.5 grid gap-2 sm:grid-cols-3">
            {PACING.map((p) => {
              const on = pacing === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPacing(on ? "" : p.id)}
                  className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                    on
                      ? "border-brand bg-brandsoft/60 text-fg1"
                      : "border-inkline text-fg2 hover:text-fg1"
                  }`}
                >
                  <span className="block text-[12.5px] font-semibold">{p.label}</span>
                  <span className="block text-[11px] text-fg3">{p.hint}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mb-4">
          <span className="field-label">How did the lesson land?</span>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {RATINGS.map((r) => {
              const on = rating === r.value;
              return (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setRating(on ? 0 : r.value)}
                  className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                    on
                      ? "border-brand bg-brandsoft/60 text-fg1"
                      : "border-inkline text-fg2 hover:text-fg1"
                  }`}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
        </div>

        {pageTitles.length > 0 && (
          <details className="mb-4" open={unvisited.length > 0}>
            <summary className="cursor-pointer list-none text-[12.5px] font-semibold text-fg2 hover:text-fg1">
              Pages you skipped
              {skipped.length > 0 && (
                <span className="ml-1.5 font-normal text-fg3">
                  — {skipped.length} selected
                </span>
              )}
            </summary>
            {unvisited.length > 0 && (
              <p className="mt-1.5 text-[11px] text-fg3">
                Pre-ticked from the pages that never came up on screen. Untick
                anything you actually covered.
              </p>
            )}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {pageTitles.map((t) => {
                const on = skipped.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleSkipped(t)}
                    className={`rounded-md border px-2.5 py-1 text-[11.5px] transition-colors ${
                      on
                        ? "border-warn/60 bg-warn/10 text-warn"
                        : "border-inkline text-fg3 hover:text-fg2"
                    }`}
                  >
                    {on ? "✓ " : ""}
                    {t}
                  </button>
                );
              })}
            </div>
          </details>
        )}

        <label className="mb-3 block">
          <span className="field-label">Which class? (optional)</span>
          <input
            className="field-input"
            value={cohort}
            onChange={(e) => setCohort(e.target.value)}
            maxLength={120}
            placeholder="Novice · Tuesday"
          />
        </label>

        <label className="block">
          <span className="field-label">Anything worth remembering? (optional)</span>
          <textarea
            className="field-textarea !min-h-16"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={2000}
            placeholder="The hook landed. Nobody could do the weighing page without help."
          />
        </label>

        {error && (
          <p className="mt-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-[12.5px] text-danger">
            {error}
          </p>
        )}

        <div className="mt-5 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-md border border-inkline px-4 py-2 text-sm font-bold text-fg2 transition-colors hover:text-fg1"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="btn btn-primary"
          >
            {busy ? "Saving…" : "Log it"}
          </button>
        </div>
      </div>
    </div>
  );
}
