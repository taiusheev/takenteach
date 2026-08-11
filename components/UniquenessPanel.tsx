import { UniquenessReport } from "@/lib/uniqueness";

/**
 * Advisory overlap report against sibling lessons in the same series. Not a
 * blocker — spiralling a term on purpose is legitimate — but it surfaces the
 * silent failure of a series turning into ten copies of one lesson.
 */
export default function UniquenessPanel({
  report,
  series,
}: {
  report: UniquenessReport;
  series: string;
}) {
  if (report.siblingCount === 0) {
    return (
      <div className="rounded-xl border border-inkline bg-inkcard p-4">
        <h2 className="mb-1 text-xs font-bold uppercase tracking-widest text-fg3">
          Uniqueness
        </h2>
        <p className="text-xs text-fg3">
          First lesson in{" "}
          <span className="font-semibold text-fg2">{series || "this series"}</span>{" "}
          — nothing to compare against yet.
        </p>
      </div>
    );
  }

  const tone =
    report.verdict === "distinct"
      ? { border: "border-ok/40", text: "text-ok", label: "Distinct" }
      : report.verdict === "some-overlap"
        ? { border: "border-warn/40", text: "text-warn", label: "Some overlap" }
        : { border: "border-danger/40", text: "text-danger", label: "Heavy overlap" };

  const groups: { label: string; items: typeof report.duplicateTitles }[] = [
    { label: "Page titles reused", items: report.duplicateTitles },
    { label: "Vocabulary re-taught", items: report.duplicateVocab },
    { label: "Evidence sources reused", items: report.duplicateEvidence },
    { label: "Skill focus duplicated", items: report.duplicateSkillFocus },
  ].filter((g) => g.items.length > 0);

  return (
    <div className={`rounded-xl border ${tone.border} bg-inkcard p-4`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-xs font-bold uppercase tracking-widest text-fg3">
          Uniqueness vs {report.siblingCount} sibling
          {report.siblingCount === 1 ? "" : "s"}
        </h2>
        <span className={`text-xs font-bold ${tone.text}`}>
          {tone.label} · {Math.round(report.distinctScore * 100)}%
        </span>
      </div>

      {groups.length === 0 ? (
        <p className="text-xs text-fg2">
          Nothing shared with the other lessons in {series} — this pack teaches
          its own material.
        </p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {groups.map((g) => (
            <div key={g.label}>
              <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-fg3">
                {g.label}
              </div>
              <ul className="flex flex-col gap-1">
                {g.items.map((d) => (
                  <li key={d.value} className="text-xs text-fg2">
                    <span className="font-semibold text-fg1">{d.value}</span>{" "}
                    <span className="text-fg3">
                      — also in {d.sharedWith.join(", ")}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <p className="mt-1 text-[11px] text-fg3">
            Advisory only. Reusing a term on purpose (spiralling) is fine —
            reusing evidence and page titles usually isn&apos;t.
          </p>
        </div>
      )}
    </div>
  );
}
