import Link from "next/link";
import { SkillSignal } from "@/lib/teaching-signal";

/**
 * What judged rounds say about the skill THIS lesson teaches. This is the
 * closing half of the loop: a lesson isn't just reviewed by a founder, it's
 * measured by whether students can actually do the thing afterwards.
 */
export default function RoundEvidencePanel({
  signal,
  quotes,
  skillFocus,
}: {
  signal: SkillSignal | null;
  quotes: { text: string; round: string }[];
  skillFocus: string;
}) {
  if (!signal) {
    return (
      <div className="rounded-xl border border-inkline bg-inkcard p-4">
        <h2 className="mb-1 text-xs font-bold uppercase tracking-widest text-fg3">
          Round evidence
        </h2>
        <p className="text-xs text-fg3">
          No judged rounds yet score a criterion matching{" "}
          <span className="font-semibold text-fg2">
            {skillFocus || "this lesson's skill"}
          </span>
          . Once judges score rounds on it, this shows whether the lesson is
          actually working.
        </p>
      </div>
    );
  }

  const pct = Math.round(signal.pct * 100);
  const weak = signal.pct < 0.7;
  const tone = weak
    ? { border: "border-warn/40", bar: "bg-warn", text: "text-warn" }
    : { border: "border-ok/40", bar: "bg-ok", text: "text-ok" };

  return (
    <div className={`rounded-xl border ${tone.border} bg-inkcard p-4`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-xs font-bold uppercase tracking-widest text-fg3">
          Round evidence · {signal.criterion}
        </h2>
        <span className={`text-sm font-bold ${tone.text}`}>{pct}%</span>
      </div>

      <div className="mb-2 h-2 overflow-hidden rounded bg-inkmid">
        <div className={`h-full ${tone.bar}`} style={{ width: `${pct}%` }} />
      </div>

      <p className="text-xs text-fg2">
        Students score <strong className="text-fg1">{pct}%</strong> on{" "}
        <strong className="text-fg1">{signal.criterion}</strong> across{" "}
        {signal.rounds} judged round{signal.rounds === 1 ? "" : "s"} — the skill
        this lesson teaches.{" "}
        {weak ? (
          <span className="text-warn">
            That&apos;s below the 70% bar, so this lesson likely needs
            strengthening.
          </span>
        ) : (
          <span className="text-ok">This lesson appears to be working.</span>
        )}
      </p>

      {signal.lessons.length > 1 && (
        <p className="mt-2 text-[11px] text-fg3">
          Also taught by:{" "}
          {signal.lessons.map((l, i) => (
            <span key={l.id}>
              {i > 0 && ", "}
              <Link href={`/materials/${l.id}`} className="text-accent hover:underline">
                {l.code || l.title}
              </Link>
            </span>
          ))}
        </p>
      )}

      {weak && quotes.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-fg3">
            What judges wrote
          </div>
          <ul className="flex flex-col gap-1.5">
            {quotes.slice(0, 3).map((q, i) => (
              <li key={i} className="text-[11px] italic text-fg2">
                “{q.text}”{" "}
                <span className="not-italic text-fg3">— {q.round}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-fg3">
            Use ✨ AI rewrite in the Builder — generation now reads this evidence
            and targets these weaknesses.
          </p>
        </div>
      )}
    </div>
  );
}
