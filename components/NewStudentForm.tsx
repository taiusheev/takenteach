"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GRADE_BANDS } from "@/lib/lesson-quality";

/**
 * Adding a student is one line, not a form. Cohort and band are optional —
 * a coach mid-term should be able to type a name, hit enter, and move on.
 */
export default function NewStudentForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [cohort, setCohort] = useState("");
  const [gradeBand, setGradeBand] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function add() {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/students", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: trimmed, cohort, gradeBand }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not add");
      setName(""); // keep cohort and band — the next student is usually in the same class
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not add");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-6 rounded-xl border border-inkline bg-inkcard p-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[12rem] flex-1">
          <span className="field-label">Student name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="e.g. Amina R."
            className="w-full rounded-md border border-inkline bg-ink px-3 py-2 text-sm text-fg1 placeholder:text-fg3 focus:border-accent focus:outline-none"
          />
        </label>
        <label className="min-w-[10rem] flex-1">
          <span className="field-label">Cohort</span>
          <input
            value={cohort}
            onChange={(e) => setCohort(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="e.g. Novice Debate · Spring"
            className="w-full rounded-md border border-inkline bg-ink px-3 py-2 text-sm text-fg1 placeholder:text-fg3 focus:border-accent focus:outline-none"
          />
        </label>
        <label>
          <span className="field-label">Band</span>
          <select
            value={gradeBand}
            onChange={(e) => setGradeBand(e.target.value)}
            className="rounded-md border border-inkline bg-ink px-2 py-2 text-sm font-semibold text-fg1 focus:border-accent focus:outline-none"
          >
            <option value="">—</option>
            {GRADE_BANDS.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={add}
          disabled={busy || !name.trim()}
          className="btn btn-primary disabled:opacity-40"
        >
          {busy ? "Adding…" : "Add student"}
        </button>
      </div>
      {err && <p className="mt-2 text-xs text-danger">{err}</p>}
    </div>
  );
}
