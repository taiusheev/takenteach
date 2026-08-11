import Link from "next/link";
import { countMaterialsUsingKit, listStyleKits } from "@/lib/db";
import { requireActiveSession } from "@/lib/auth/dal";
import { LOCK_GROUPS } from "@/lib/style-kit";
import NewStyleKitButton from "@/components/NewStyleKitButton";

export const dynamic = "force-dynamic";

export default async function StyleKitsPage() {
  const { legacyRole: role, scope } = await requireActiveSession();
  const kits = listStyleKits(scope).map((k) => ({
    ...k,
    usage: countMaterialsUsingKit(scope, k.id),
  }));
  const isFounder = role === "founder";

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl text-fg1">Style Kits</h1>
          <p className="mt-1 text-sm text-fg2">
            One kit per semester or cohort keeps every teacher&apos;s output
            visually and structurally identical. Locked groups can&apos;t be
            overridden by an individual pack.
          </p>
        </div>
        <NewStyleKitButton disabled={!isFounder} />
      </div>

      {!isFounder && (
        <p className="mb-6 rounded-lg border border-warn/40 bg-warn/10 px-4 py-2.5 text-xs text-warn">
          You&apos;re acting as {role} — kits are read-only. Only the founder
          manages Style Kits.
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {kits.map((k) => (
          <li key={k.id}>
            <Link
              href={`/style-kits/${k.id}`}
              className="flex items-start gap-4 rounded-xl border border-inkline bg-inkcard px-5 py-4 hover:border-accent/40 transition-colors"
            >
              {/* palette swatch */}
              <div className="mt-0.5 flex shrink-0 overflow-hidden rounded-md border border-inkline">
                {[
                  k.config.palette.accent,
                  k.config.palette.gold,
                  k.config.palette.brickRed,
                  k.config.palette.grassGreen,
                ].map((c) => (
                  <span key={c} className="h-9 w-4" style={{ background: c }} />
                ))}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-bold text-fg1">
                    {k.name}
                  </span>
                  {k.is_default === 1 && (
                    <span className="rounded-full border border-ok/40 bg-ok/12 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-ok">
                      Default
                    </span>
                  )}
                </div>
                <div className="truncate text-xs text-fg3">
                  {k.config.brand} · {k.config.seriesLabel} ·{" "}
                  {k.config.fonts.display}/{k.config.fonts.body} ·{" "}
                  {k.usage} material{k.usage === 1 ? "" : "s"}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {LOCK_GROUPS.map((g) => {
                    const locked = k.locked_fields.includes(g.id);
                    return (
                      <span
                        key={g.id}
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                          locked
                            ? "bg-inkmid text-fg1"
                            : "text-fg3 opacity-60"
                        }`}
                      >
                        {locked ? "🔒" : "🔓"} {g.label}
                      </span>
                    );
                  })}
                </div>
              </div>
              <div className="shrink-0 text-xs text-fg3">
                {k.config.rules.paraphraseMaxWords}w · {k.config.rules.minVocabTerms} terms
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
