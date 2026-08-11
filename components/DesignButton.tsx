"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * "Give this pack its own look."
 *
 * The design system is authored by one AI call and applied to every page, and
 * it is the single biggest visible difference between a pack that looks
 * generated and one that looks published. Until now the only way to trigger it
 * was a button inside the print preview's toolbar — a place you reach *after*
 * you have decided the pack is finished, and which nothing points at.
 *
 * That discoverability gap has a documented cost: packs sat with one designed
 * page among templated ones, which is exactly the "different design on
 * different pages" defect. Putting the action on the material page, next to the
 * build it belongs to, is how it stops being a secret.
 */
export default function DesignButton({
  materialId,
  hasDesign,
  note,
}: {
  materialId: number;
  hasDesign: boolean;
  note: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function run() {
    if (busy) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(`/api/materials/${materialId}/design`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Design generation failed");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Design generation failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={run}
          disabled={busy}
          className="rounded-md border border-inkline px-3 py-1.5 text-xs font-bold text-fg1 hover:border-accent/40 disabled:opacity-50"
        >
          {busy
            ? "Designing… (about 90 seconds)"
            : hasDesign
              ? "Redesign this pack"
              : "Design this pack"}
        </button>
        <span className="text-xs text-fg3">
          {hasDesign
            ? note || "This pack has its own design system."
            : "One AI call authors a palette, type and treatment for every page at once — so the whole pack is one publication."}
        </span>
      </div>
      {err && <p className="mt-2 text-xs text-danger">{err}</p>}
    </div>
  );
}
