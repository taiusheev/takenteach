import Link from "next/link";
import { requireActiveSession } from "@/lib/auth/dal";
import { notFound } from "next/navigation";
import { getMaterial, getRound, listSubmissions } from "@/lib/db";
import { JudgeBallot } from "@/lib/judge-ballot-schema";
import { submissionQuality, summariseRound } from "@/lib/judging";

export const dynamic = "force-dynamic";

export default async function RoundPage(ctx: {
  params: Promise<{ id: string }>;
}) {
  const { scope } = await requireActiveSession();
  const { id } = await ctx.params;
  const round = await getRound(scope, Number(id));
  if (!round) notFound();

  const ballotMaterial = await getMaterial(scope, round.ballot_id);
  const ballot = (ballotMaterial?.content as JudgeBallot) ?? null;
  const submissions = await listSubmissions(scope, round.id);
  const result = summariseRound(submissions, ballot);

  const pro = round.pro_team || "Pro";
  const con = round.con_team || "Con";

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/rounds" className="text-sm font-bold text-fg3 hover:text-fg1 transition-colors">
        ← Rounds
      </Link>

      <div className="mb-6 mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-4xl text-fg1">{round.label}</h1>
          <p className="mt-1 text-sm text-fg2">
            {pro} <span className="text-fg3">vs</span> {con}
            {round.room ? ` · ${round.room}` : ""} · {round.held_on}
          </p>
          {round.resolution && (
            <p className="mt-1 text-xs text-fg3">“{round.resolution}”</p>
          )}
        </div>
        <Link
          href={`/rounds/${round.id}/judge`}
          className="btn btn-primary"
        >
          ⚖️ Judge this round
        </Link>
      </div>

      {/* decision */}
      <div className="mb-6 rounded-xl border border-inkline bg-inkcard p-4">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-fg3">
          Decision
        </h2>
        {result.submissionCount === 0 ? (
          <p className="text-xs text-fg3">
            No ballots yet. The decision appears once judges submit.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-6">
            <div>
              <div className="font-display text-3xl text-fg1">
                {result.decision === "pro"
                  ? pro
                  : result.decision === "con"
                    ? con
                    : "Tied"}
              </div>
              <div className="text-[11px] font-bold uppercase tracking-widest text-fg3">
                {result.decision ? "wins" : "no majority"}
                {result.unanimous && result.decision ? " · unanimous" : ""}
              </div>
            </div>
            <div className="text-xs text-fg2">
              <div>
                Ballots: <strong className="text-fg1">{result.proBallots}</strong> {pro} ·{" "}
                <strong className="text-fg1">{result.conBallots}</strong> {con}
              </div>
              <div className="mt-0.5 text-fg3">
                Avg total {result.avgTotals.pro.toFixed(1)} vs{" "}
                {result.avgTotals.con.toFixed(1)} · speaks{" "}
                {result.avgSpeakerPoints.pro.toFixed(1)} /{" "}
                {result.avgSpeakerPoints.con.toFixed(1)}
              </div>
              {result.spread > 0 && (
                <div className="mt-0.5 text-fg3">
                  Judge spread on totals: {result.spread.toFixed(1)}
                  {result.spread >= 5 && (
                    <span className="ml-1 text-warn">
                      — judges disagreed sharply
                    </span>
                  )}
                </div>
              )}
              {result.medianSeconds > 0 && (
                <div className="mt-0.5 text-fg3">
                  Median time to judge: {Math.round(result.medianSeconds / 60)}m{" "}
                  {result.medianSeconds % 60}s
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* per-criterion */}
      {result.perCriterion.length > 0 && result.submissionCount > 0 && (
        <div className="mb-6 rounded-xl border border-inkline bg-inkcard p-4">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-fg3">
            Where the round was won
          </h2>
          <div className="flex flex-col gap-2">
            {result.perCriterion.map((c) => {
              const max = Math.max(c.pro, c.con, 1);
              return (
                <div key={c.name} className="text-xs">
                  <div className="mb-1 flex justify-between text-fg2">
                    <span>{c.name}</span>
                    <span className="text-fg3">
                      {c.pro.toFixed(1)} / {c.con.toFixed(1)}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    <div className="h-2 flex-1 overflow-hidden rounded bg-inkmid">
                      <div className="h-full bg-ok/12" style={{ width: `${(c.pro / max) * 100}%` }} />
                    </div>
                    <div className="h-2 flex-1 overflow-hidden rounded bg-inkmid">
                      <div className="h-full bg-danger/12" style={{ width: `${(c.con / max) * 100}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
            <p className="mt-1 text-[10px] text-fg3">
              Left bar = {pro}, right bar = {con}.
            </p>
          </div>
        </div>
      )}

      {/* ballots */}
      <div className="rounded-xl border border-inkline bg-inkcard p-4">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-fg3">
          Ballots ({submissions.length})
        </h2>
        {submissions.length === 0 ? (
          <p className="text-xs text-fg3">Nothing submitted yet.</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {submissions.map((s) => {
              const q = submissionQuality(s);
              return (
                <li key={s.id} className="border-b border-inkline pb-3 last:border-b-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-bold text-fg1">
                      {s.judge_name || "Unnamed judge"}
                    </span>
                    <span className="text-fg3">({s.role})</span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                        s.winner === "pro"
                          ? "bg-ok/12 text-ok"
                          : "bg-danger/12 text-danger"
                      }`}
                    >
                      {s.winner === "pro" ? pro : con}
                    </span>
                    {!q.ok && (
                      <span
                        title={q.issues.join(" · ")}
                        className="rounded bg-warn/12 px-1.5 py-0.5 text-[10px] font-bold uppercase text-warn"
                      >
                        thin ballot
                      </span>
                    )}
                    <span className="text-fg3">· {s.created_at}</span>
                  </div>
                  {Object.entries(s.rfd)
                    .filter(([, v]) => v.trim())
                    .map(([k, v]) => (
                      <div key={k} className="mt-1.5 text-xs">
                        <div className="font-semibold text-fg2">{k}</div>
                        <p className="text-fg3">{v}</p>
                      </div>
                    ))}
                  {Object.entries(s.feedback)
                    .filter(([, v]) => v.trim())
                    .map(([k, v]) => (
                      <div key={k} className="mt-1.5 text-xs">
                        <div className="font-semibold text-fg2">{k}</div>
                        <p className="text-fg3">{v}</p>
                      </div>
                    ))}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
