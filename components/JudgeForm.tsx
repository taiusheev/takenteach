"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { JudgeBallot } from "@/lib/judge-ballot-schema";
import { ScoreMap } from "@/lib/judging";

/**
 * The judge's ballot form. Designed to be completable in under two minutes:
 * criteria scored with steppers, winner as two big buttons, and only the
 * prompts the template actually defines. A running timer records how long it
 * took, which is the metric the module is judged on.
 */
export default function JudgeForm({
  roundId,
  label,
  proTeam,
  conTeam,
  resolution,
  ballot,
  role,
}: {
  roundId: number;
  label: string;
  proTeam: string;
  conTeam: string;
  resolution: string;
  ballot: JudgeBallot;
  role: string;
}) {
  const router = useRouter();
  // set on mount, not during render — reading the clock while rendering is impure
  const startedAt = useRef(0);
  const [elapsed, setElapsed] = useState(0);
  const [judgeName, setJudgeName] = useState("");
  const [winner, setWinner] = useState<"pro" | "con" | "">("");
  const [scores, setScores] = useState<ScoreMap>(() =>
    Object.fromEntries(
      ballot.criteria.map((c) => [c.name, { pro: 0, con: 0 }])
    )
  );
  const sp = ballot.speakerPoints;
  const mid = Math.round((sp.min + sp.max) / 2);
  const [speakerPoints, setSpeakerPoints] = useState({ pro: mid, con: mid });
  const [rfd, setRfd] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    startedAt.current = Date.now();
    const t = setInterval(
      () => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)),
      1000
    );
    return () => clearInterval(t);
  }, []);

  /** Seconds since the judge opened the form (0 before mount). */
  const secondsTaken = () =>
    startedAt.current ? Math.floor((Date.now() - startedAt.current) / 1000) : 0;

  function setScore(name: string, side: "pro" | "con", v: number, max: number) {
    setScores((s) => ({
      ...s,
      [name]: { ...s[name], [side]: Math.max(0, Math.min(max, v)) },
    }));
  }

  const rfdAnswered = Object.values(rfd).some((v) => v.trim().length > 0);
  const canSubmit = winner !== "" && rfdAnswered && !busy;

  async function submit() {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/rounds/${roundId}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        judgeName,
        winner,
        scores,
        speakerPoints,
        rfd,
        feedback,
        secondsTaken: secondsTaken(),
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Could not submit the ballot");
      return;
    }
    router.push(`/rounds/${roundId}`);
    router.refresh();
  }

  const mm = Math.floor(elapsed / 60);
  const ss = elapsed % 60;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-3xl text-fg1">Judging · {label}</h1>
          <p className="text-xs text-fg3">
            {proTeam} vs {conTeam} · judging as {role}
          </p>
        </div>
        <span
          className={`rounded-full border px-3 py-1 font-mono text-xs font-bold ${
            elapsed > 120
              ? "border-warn/40 text-warn"
              : "border-inkline text-fg3"
          }`}
          title="Target: under 2 minutes"
        >
          {mm}:{String(ss).padStart(2, "0")}
        </span>
      </div>

      {resolution && (
        <p className="mb-5 rounded-lg border border-inkline bg-inkcard px-4 py-2.5 text-xs text-fg2">
          “{resolution}”
        </p>
      )}

      {/* winner first — judges usually know before they score */}
      <section className="mb-5 rounded-xl border border-inkline bg-inkcard p-4">
        <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-fg3">
          Who won?
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {(["pro", "con"] as const).map((side) => {
            const on = winner === side;
            const name = side === "pro" ? proTeam : conTeam;
            return (
              <button
                key={side}
                onClick={() => setWinner(side)}
                className={`rounded-xl border-2 px-4 py-4 text-sm font-bold transition-colors ${
                  on
                    ? side === "pro"
                      ? "border-ok bg-ok/12 text-ok"
                      : "border-danger bg-danger/12 text-danger"
                    : "border-inkline text-fg2 hover:text-fg1"
                }`}
              >
                {on ? "✓ " : ""}
                {name}
                <span className="ml-1 text-[10px] uppercase opacity-70">
                  {side}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* criteria */}
      {ballot.criteria.length > 0 && (
        <section className="mb-5 rounded-xl border border-inkline bg-inkcard p-4">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-fg3">
            Criteria
          </h2>
          <div className="flex flex-col gap-3">
            {ballot.criteria.map((c) => (
              <div key={c.name}>
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <span className="text-sm font-bold text-fg1">{c.name}</span>
                  <span className="text-[10px] text-fg3">/{c.maxPoints}</span>
                </div>
                {c.description && (
                  <p className="mb-1.5 text-[11px] text-fg3">{c.description}</p>
                )}
                <div className="grid grid-cols-2 gap-2">
                  {(["pro", "con"] as const).map((side) => (
                    <label key={side} className="flex items-center gap-2">
                      <span className="w-10 shrink-0 text-[10px] font-bold uppercase text-fg3">
                        {side}
                      </span>
                      <input
                        type="number"
                        min={0}
                        max={c.maxPoints}
                        className="field-input !py-1.5"
                        value={scores[c.name]?.[side] ?? 0}
                        onChange={(e) =>
                          setScore(c.name, side, Number(e.target.value) || 0, c.maxPoints)
                        }
                      />
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* speaker points */}
      <section className="mb-5 rounded-xl border border-inkline bg-inkcard p-4">
        <h2 className="mb-1 text-xs font-bold uppercase tracking-widest text-fg3">
          Speaker points ({sp.min}–{sp.max})
        </h2>
        {sp.guidance && <p className="mb-2 text-[11px] text-fg3">{sp.guidance}</p>}
        <div className="grid grid-cols-2 gap-2">
          {(["pro", "con"] as const).map((side) => (
            <label key={side} className="flex items-center gap-2">
              <span className="w-10 shrink-0 text-[10px] font-bold uppercase text-fg3">
                {side}
              </span>
              <input
                type="number"
                min={sp.min}
                max={sp.max}
                className="field-input !py-1.5"
                value={speakerPoints[side]}
                onChange={(e) =>
                  setSpeakerPoints((p) => ({
                    ...p,
                    [side]: Math.max(sp.min, Math.min(sp.max, Number(e.target.value) || sp.min)),
                  }))
                }
              />
            </label>
          ))}
        </div>
      </section>

      {/* RFD — required */}
      <section className="mb-5 rounded-xl border border-inkline bg-inkcard p-4">
        <h2 className="mb-1 text-xs font-bold uppercase tracking-widest text-fg3">
          Reason for decision <span className="text-danger">*</span>
        </h2>
        <p className="mb-3 text-[11px] text-fg3">
          At least one answer is required — a ballot without an RFD is the thing
          this replaces.
        </p>
        <div className="flex flex-col gap-3">
          {ballot.rfdPrompts.map((p) => (
            <label key={p.label} className="block">
              <span className="field-label">{p.label}</span>
              {p.hint && <span className="mb-1 block text-[10px] italic text-fg3">{p.hint}</span>}
              <textarea
                className="field-textarea"
                value={rfd[p.label] ?? ""}
                onChange={(e) => setRfd((r) => ({ ...r, [p.label]: e.target.value }))}
              />
            </label>
          ))}
          {ballot.rfdPrompts.length === 0 && (
            <label className="block">
              <span className="field-label">Why did this side win?</span>
              <textarea
                className="field-textarea"
                value={rfd["Why did this side win?"] ?? ""}
                onChange={(e) =>
                  setRfd((r) => ({ ...r, "Why did this side win?": e.target.value }))
                }
              />
            </label>
          )}
        </div>
      </section>

      {/* debater feedback */}
      {ballot.feedbackPrompts.length > 0 && (
        <section className="mb-5 rounded-xl border border-inkline bg-inkcard p-4">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-fg3">
            Feedback for the debaters
          </h2>
          <div className="flex flex-col gap-3">
            {ballot.feedbackPrompts.map((p) => (
              <label key={p.label} className="block">
                <span className="field-label">{p.label}</span>
                {p.hint && <span className="mb-1 block text-[10px] italic text-fg3">{p.hint}</span>}
                <textarea
                  className="field-textarea"
                  value={feedback[p.label] ?? ""}
                  onChange={(e) =>
                    setFeedback((f) => ({ ...f, [p.label]: e.target.value }))
                  }
                />
              </label>
            ))}
          </div>
        </section>
      )}

      <label className="mb-5 block max-w-xs">
        <span className="field-label">Your name</span>
        <input
          className="field-input"
          value={judgeName}
          onChange={(e) => setJudgeName(e.target.value)}
          placeholder="Judge name"
        />
      </label>

      {error && <p className="mb-3 text-xs text-danger">{error}</p>}
      <div className="flex items-center gap-3">
        <button
          onClick={submit}
          disabled={!canSubmit}
          className="btn btn-primary disabled:cursor-not-allowed"
        >
          {busy ? "Submitting…" : "Submit ballot"}
        </button>
        {!canSubmit && !busy && (
          <span className="text-[11px] text-fg3">
            {winner === "" ? "Pick a winner" : "Write at least one reason for decision"}
          </span>
        )}
      </div>
    </div>
  );
}
