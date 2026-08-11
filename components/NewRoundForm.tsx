"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function NewRoundForm({
  ballots,
  students = [],
}: {
  ballots: { id: number; title: string }[];
  /** roster, so a round can be linked to the debaters who actually spoke */
  students?: { id: number; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [ballotId, setBallotId] = useState<number>(ballots[0]?.id ?? 0);
  const [label, setLabel] = useState("");
  const [proTeam, setProTeam] = useState("");
  const [conTeam, setConTeam] = useState("");
  const [proStudentId, setProStudentId] = useState("");
  const [conStudentId, setConStudentId] = useState("");
  const [room, setRoom] = useState("");
  const [heldOn, setHeldOn] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (ballots.length === 0) {
    return (
      <div className="mb-6 rounded-xl border border-warn/40 bg-warn/10 p-4 text-xs text-warn">
        No approved Judge Ballot templates yet. Build one in the Library and get
        it through review — a round runs from a ballot template so every judge
        scores the same criteria.
      </div>
    );
  }

  async function create() {
    setBusy(true);
    setError("");
    const res = await fetch("/api/rounds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ballotId, label, proTeam, conTeam, room, heldOn,
        proStudentId, conStudentId,
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Could not open the round");
      return;
    }
    router.push(`/rounds/${data.id}`);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mb-6 btn btn-primary"
      >
        + Open a round
      </button>
    );
  }

  return (
    <div className="mb-6 rounded-xl border border-inkline bg-inkcard p-4">
      <h2 className="mb-3 font-display text-2xl text-fg1">Open a round</h2>
      <div className="flex flex-col gap-3">
        <label className="block">
          <span className="field-label">Ballot template</span>
          <select
            className="field-input"
            value={ballotId}
            onChange={(e) => setBallotId(Number(e.target.value))}
          >
            {ballots.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title}
              </option>
            ))}
          </select>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="field-label">Round label</span>
            <input className="field-input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="R3 · Room 4" />
          </label>
          <label className="block">
            <span className="field-label">Room (optional)</span>
            <input className="field-input" value={room} onChange={(e) => setRoom(e.target.value)} placeholder="Room 4" />
          </label>
          <label className="block">
            <span className="field-label">Pro team</span>
            <input className="field-input" value={proTeam} onChange={(e) => setProTeam(e.target.value)} placeholder="Team A" />
          </label>
          <label className="block">
            <span className="field-label">Con team</span>
            <input className="field-input" value={conTeam} onChange={(e) => setConTeam(e.target.value)} placeholder="Team B" />
          </label>
          <label>
            <span className="field-label">Pro debater (roster)</span>
            <select
              className="field-input"
              value={proStudentId}
              onChange={(e) => setProStudentId(e.target.value)}
            >
              <option value="">— not linked —</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="field-label">Con debater (roster)</span>
            <select
              className="field-input"
              value={conStudentId}
              onChange={(e) => setConStudentId(e.target.value)}
            >
              <option value="">— not linked —</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="field-label">Date</span>
            <input type="date" className="field-input" value={heldOn} onChange={(e) => setHeldOn(e.target.value)} />
          </label>
        </div>
        {error && <p className="text-xs text-danger">{error}</p>}
        <div className="flex items-center gap-3">
          <button
            onClick={create}
            disabled={busy || !label.trim()}
            className="btn btn-primary disabled:opacity-40"
          >
            {busy ? "Opening…" : "Open round"}
          </button>
          <button
            onClick={() => setOpen(false)}
            className="rounded-md border border-inkline px-3 py-2 text-xs font-bold text-fg2 hover:text-fg1 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
