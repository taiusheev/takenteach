import Link from "next/link";
import { countSubmissions, listMaterials, listRounds, listStudents } from "@/lib/db";
import { requireActiveSession } from "@/lib/auth/dal";
import NewRoundForm from "@/components/NewRoundForm";

export const dynamic = "force-dynamic";

export default async function RoundsPage() {
  const { legacyRole: role, scope } = await requireActiveSession();
  const rounds = await Promise.all(
    (await listRounds(scope)).map(async (r) => ({
      ...r,
      submissions: await countSubmissions(scope, r.id),
    }))
  );
  // only ballots that have cleared review are safe to judge from
  const ballots = (await listMaterials(scope)).filter(
    (m) =>
      m.type === "judge-ballot" &&
      (m.status === "published" || m.status === "approved")
  );
  const canOpen = role === "founder" || role === "coach";

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-8">
        <h1 className="font-display text-4xl text-fg1">Rounds</h1>
        <p className="mt-1 text-sm text-fg2">
          Judging happens here. Open a round from a Judge Ballot template, then
          judges submit structured feedback — criteria scores, speaker points,
          and a written reason for decision.
        </p>
      </div>

      {canOpen && <NewRoundForm
          ballots={ballots.map((b) => ({ id: b.id, title: b.title }))}
          students={(await listStudents(scope)).map((s) => ({ id: s.id, name: s.name }))}
        />}

      {!canOpen && (
        <p className="mb-6 rounded-lg border border-inkline bg-inkcard px-4 py-2.5 text-xs text-fg2">
          You&apos;re acting as {role} — pick a round below to judge it.
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {rounds.map((r) => (
          <li key={r.id}>
            <Link
              href={`/rounds/${r.id}`}
              className="flex items-center gap-4 rounded-xl border border-inkline bg-inkcard px-5 py-4 hover:border-accent/40 transition-colors"
            >
              <div className="font-display flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand text-lg text-white">
                ⚖️
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold text-fg1">{r.label}</div>
                <div className="truncate text-xs text-fg3">
                  {r.pro_team || "Pro"} vs {r.con_team || "Con"}
                  {r.room ? ` · ${r.room}` : ""} · {r.held_on}
                </div>
              </div>
              <span
                className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-widest ${
                  r.submissions > 0
                    ? "border-ok/40 bg-ok/12 text-ok"
                    : "border-warn/40 bg-warn/12 text-warn"
                }`}
              >
                {r.submissions > 0
                  ? `${r.submissions} ballot${r.submissions === 1 ? "" : "s"}`
                  : "Awaiting ballots"}
              </span>
            </Link>
          </li>
        ))}
        {rounds.length === 0 && (
          <li className="rounded-xl border border-dashed border-inkline px-5 py-10 text-center text-sm text-fg3">
            No rounds yet.
            {canOpen
              ? " Open one above to start collecting judge feedback."
              : " A founder or coach opens rounds."}
          </li>
        )}
      </ul>
    </div>
  );
}
