"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RATINGS, SKILLS } from "@/lib/students";

/**
 * Logging what you just saw, in one tap.
 *
 * The whole progress feature lives or dies here: if recording an observation
 * costs a coach more than a few seconds, it never happens and every downstream
 * report is empty. So a rating IS the submit — pick a skill, tap a level, done.
 * The note and context are optional afterthoughts, not required fields.
 */
export default function ObservationLogger({ studentId }: { studentId: number }) {
  const router = useRouter();
  const [skill, setSkill] = useState<string>(SKILLS[0].id);
  const [note, setNote] = useState("");
  const [context, setContext] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [saved, setSaved] = useState("");
  const [err, setErr] = useState("");

  async function log(rating: number) {
    if (busy !== null) return;
    setBusy(rating);
    setErr("");
    setSaved("");
    try {
      const res = await fetch(`/api/students/${studentId}/observations`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ skill, rating, note, context }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not log");
      const label = SKILLS.find((s) => s.id === skill)?.label ?? skill;
      setSaved(`${label} logged as "${RATINGS.find((r) => r.value === rating)?.label}"`);
      setNote("");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not log");
    } finally {
      setBusy(null);
    }
  }

  const active = SKILLS.find((s) => s.id === skill);

  return (
    <section className="rounded-xl border border-inkline bg-inkcard p-4">
      <h2 className="text-xs font-bold uppercase tracking-widest text-fg3">
        Log what you just saw
      </h2>
      <p className="mb-3 mt-1 text-xs text-fg3">
        Pick a skill, tap a level. The note is optional — one tap is a complete
        observation.
      </p>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {SKILLS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSkill(s.id)}
            title={s.hint}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
              skill === s.id
                ? "border-accent/60 bg-accent/10 text-fg1"
                : "border-inkline text-fg2 hover:text-fg1"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {active && <p className="mb-2 text-[11px] text-fg3">{active.hint}</p>}

      <div className="mb-3 flex flex-wrap gap-2">
        {RATINGS.map((r) => (
          <button
            key={r.value}
            type="button"
            onClick={() => log(r.value)}
            disabled={busy !== null}
            className={`rounded-lg border px-3 py-2 text-xs font-bold transition-colors disabled:opacity-40 ${r.tone} hover:brightness-125`}
          >
            {busy === r.value ? "Saving…" : r.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional: what exactly did you see?"
          className="min-w-[14rem] flex-1 rounded-md border border-inkline bg-ink px-3 py-2 text-xs text-fg1 placeholder:text-fg3 focus:border-accent focus:outline-none"
        />
        <input
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder="Where? e.g. Round 3, L5 practice"
          className="min-w-[10rem] flex-1 rounded-md border border-inkline bg-ink px-3 py-2 text-xs text-fg1 placeholder:text-fg3 focus:border-accent focus:outline-none"
        />
      </div>

      {saved && <p className="mt-2 text-xs text-ok">{saved}</p>}
      {err && <p className="mt-2 text-xs text-danger">{err}</p>}
    </section>
  );
}
