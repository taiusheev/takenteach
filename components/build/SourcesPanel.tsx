"use client";

import { useMemo } from "react";
import type { EvidenceCard, LessonPack } from "@/lib/lesson-pack-schema";
import { IconSearch } from "@/components/shell/icons";

/**
 * THE SOURCE LEDGER.
 *
 * ── THE PROBLEM THIS SOLVES ──────────────────────────────────────────────
 * Every evidence card is drafted by a model, and the build screen has always
 * said so: "AI-drafted citations must be verified against real sources before
 * this pack goes to review." Until now that sentence WAS the mechanism. There
 * was nowhere to record that anyone had checked a card, so the warning read the
 * same whether a citation had been confirmed line by line or never opened —
 * and a warning that never changes is a warning nobody reads.
 *
 * This makes the check a fact about each card. `verified` is set by a person
 * ticking a box, never by the generator: "this quotation exists in this
 * publication" is the one claim an AI cannot make about its own output.
 *
 * ── WHY "WHERE IT IS USED" IS ON EVERY ROW ───────────────────────────────
 * A card cited on three pages is worth ten minutes of checking. A card cited
 * nowhere is a card to delete, and the deck accumulates those — the generator
 * drafts a full deck and the activities only reach for some of it. Showing the
 * usage count turns the panel into a triage list rather than an inventory.
 *
 * ── WHAT IT DOES NOT CLAIM ───────────────────────────────────────────────
 * The brief asks for a "reliability indicator". There is no reliability data:
 * nothing scores publishers, and inventing a green tick for a domain the
 * product has never assessed would be worse than useless on educational
 * material — it would launder a model's guess into an authority rating. What
 * is shown instead is the one thing actually known: whether a HUMAN has
 * checked it. That is a weaker claim and a true one.
 */

/** Verdicts that mean a person must look before this pack goes anywhere. */
const DOUBTFUL = new Set(["suspect", "unsupported"]);

const VERDICT_LABEL: Record<string, string> = {
  verified: "Reviewer: looks real",
  plausible: "Reviewer: check the exact figure",
  suspect: "Reviewer: doubtful",
  unsupported: "Reviewer: cannot support this",
};

/* `plausible` is amber rather than red deliberately: it means "consistent
   with a real source, confirm the number", which is a job for the person
   reading this panel — not a fault. Red is reserved for the two verdicts that
   block review. */
const TONE: Record<string, string> = {
  verified: "border-ok/40 bg-ok/[0.07] text-ok",
  plausible: "border-warn/40 bg-warn/[0.07] text-warn",
  suspect: "border-danger/50 bg-danger/[0.08] text-danger",
  unsupported: "border-danger/50 bg-danger/[0.08] text-danger",
};

export default function SourcesPanel({
  pack,
  onChange,
}: {
  pack: LessonPack;
  onChange: (cards: EvidenceCard[]) => void;
}) {
  /* Which pages cite each card. The activities reference cards by id in their
     prompts and body text, so a case-insensitive id match over the activity's
     serialised content is both cheap and accurate enough to triage with. */
  const usage = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const card of pack.evidenceCards) {
      const id = card.id.trim().toUpperCase();
      if (!id) continue;
      const hits: string[] = [];
      for (const a of pack.activities ?? []) {
        const hay = JSON.stringify(a).toUpperCase();
        /* Word-boundary-ish: "CARD A" and "(A)" count, "ANALYSIS" does not. */
        if (
          new RegExp(`(CARD\\s*|\\(|\\[|\\b)${id}\\b`).test(hay) &&
          !hits.includes(a.title)
        ) {
          hits.push(a.title);
        }
      }
      map.set(id, hits);
    }
    return map;
  }, [pack.evidenceCards, pack.activities]);

  /* WHAT THE REVIEWER ALREADY SAID ABOUT EACH CARD.

     Content QA grades every citation `verified | plausible | suspect |
     unsupported` and writes a specific note saying what to check. That
     verdict was going into `contentQaJson` and reaching nobody: no gate read
     it, and this panel — the one screen where a person ticks a card as
     checked — did not show it. Signing off was therefore ceremonial: a coach
     faced six identical rows with no idea which one the reviewer had doubts
     about.

     Same shape as the QA-findings-into-actions fix: the system already knew,
     and the person deciding could not see it. */
  const qa = useMemo(() => {
    const map = new Map<string, { verdict: string; note: string }>();
    if (!pack.contentQaJson) return map;
    try {
      for (const c of JSON.parse(pack.contentQaJson)?.citations ?? []) {
        map.set(String(c.id).trim().toUpperCase(), { verdict: c.verdict, note: c.note });
      }
    } catch {
      /* An unreadable report costs the annotations and nothing else — the
         panel still works, it just cannot say what the reviewer thought. */
    }
    return map;
  }, [pack.contentQaJson]);

  const cards = pack.evidenceCards;
  const verified = cards.filter((c) => c.verified).length;
  const doubted = cards.filter(
    (c) => !c.verified && DOUBTFUL.has(qa.get(c.id.trim().toUpperCase())?.verdict ?? "")
  ).length;

  function update(i: number, patch: Partial<EvidenceCard>) {
    onChange(cards.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  }

  if (cards.length === 0) {
    return (
      <section className="card p-4">
        <h2 className="text-xs font-bold uppercase tracking-widest text-fg1">
          Sources
        </h2>
        <p className="mt-2 text-[12px] leading-relaxed text-fg3">
          No evidence cards yet. They arrive with the build, and each one needs
          checking against the real publication before review.
        </p>
      </section>
    );
  }

  return (
    <section className="card p-4">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h2 className="text-xs font-bold uppercase tracking-widest text-fg1">
          Sources
        </h2>
        <span
          className={`shrink-0 text-[11px] font-semibold tabular-nums ${
            verified === cards.length ? "text-ok" : "text-warn"
          }`}
        >
          {verified}/{cards.length} checked
        </span>
      </div>
      <p className="mb-3 text-[11.5px] leading-relaxed text-fg3">
        Every card is AI-drafted. Tick one only once you have opened the source
        and seen the quotation.
        {doubted > 0 && (
          <>
            {" "}
            <strong className="font-semibold text-danger">
              {doubted} {doubted === 1 ? "card is" : "cards are"} flagged below and
              cannot go to review unchecked.
            </strong>
          </>
        )}
      </p>

      <ul className="flex flex-col gap-2">
        {cards.map((c, i) => {
          const id = c.id.trim().toUpperCase();
          const used = usage.get(id) ?? [];
          const verdict = qa.get(id);
          return (
            <li
              key={i}
              className={`rounded-lg border p-2.5 ${
                c.verified
                  ? "border-ok/40 bg-ok/[0.06]"
                  : DOUBTFUL.has(qa.get(c.id.trim().toUpperCase())?.verdict ?? "")
                    ? "border-danger/50 bg-danger/[0.06]"
                    : "border-inkline bg-surface-alt/40"
              }`}
            >
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={!!c.verified}
                  onChange={(e) => update(i, { verified: e.target.checked })}
                  aria-label={`Mark card ${c.id || i + 1} verified`}
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[var(--ok)]"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-semibold text-fg1">
                    <span className="text-fg3">{c.id || "—"} ·</span>{" "}
                    {c.institution || "Unattributed"}
                  </p>
                  <p className="truncate text-[11.5px] text-fg3">
                    {[c.publication, c.year].filter(Boolean).join(" · ") ||
                      "No publication named"}
                  </p>

                  {/* The reviewer's own verdict on THIS card, at the moment of
                      signing it off. A note saying "the report is from 2018,
                      not 2020" is worth more here than anywhere else in the
                      product, and it was previously only inside a JSON blob. */}
                  {verdict && (
                    <div
                      className={`mt-1.5 rounded-md border px-2 py-1 text-[11px] leading-snug ${TONE[verdict.verdict] ?? "border-inkline text-fg3"}`}
                    >
                      <span className="font-bold uppercase tracking-wide">
                        {VERDICT_LABEL[verdict.verdict] ?? verdict.verdict}
                      </span>
                      {verdict.note && <span className="opacity-90"> — {verdict.note}</span>}
                    </div>
                  )}

                  {/* The URL is the thing a verifier actually needs, and it is
                      the field the generator most often cannot supply — so it
                      is editable here rather than buried in the card form. */}
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <input
                      value={c.url ?? ""}
                      onChange={(e) => update(i, { url: e.target.value })}
                      placeholder="Paste the source URL"
                      aria-label={`Source URL for card ${c.id || i + 1}`}
                      className="field-input !h-7 min-w-0 flex-1 !text-[11.5px]"
                    />
                    {c.url ? (
                      <a
                        href={c.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Open the source"
                        className="shrink-0 rounded-md border border-inkline p-1.5 text-fg3 transition-colors hover:text-fg1"
                      >
                        <IconSearch size={13} />
                        <span className="sr-only">Open source</span>
                      </a>
                    ) : null}
                  </div>

                  <p className="mt-1.5 text-[11px] text-fg3">
                    {used.length === 0 ? (
                      /* Not cited anywhere. The generator drafts a full deck
                         and the activities reach for only some of it, so this
                         is the row to delete rather than to check. */
                      <span className="text-warn">Not cited on any page</span>
                    ) : (
                      <>
                        Used on {used.length}{" "}
                        {used.length === 1 ? "page" : "pages"} —{" "}
                        <span className="text-fg2">{used.join(", ")}</span>
                      </>
                    )}
                  </p>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
