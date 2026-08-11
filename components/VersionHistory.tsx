"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface VersionSummary {
  id: number;
  label: string;
  role: string;
  createdAt: string;
  pages: number;
  cards: number;
  terms: number;
  designed: boolean;
  qa: boolean;
  title: string;
}

/**
 * The undo the AI buttons never had.
 *
 * Regeneration, revision and design all overwrite the pack in place, so a
 * teacher who pressed one and disliked the result had no way back — which in
 * practice means they stop pressing them. Each snapshot is labelled with the
 * action that was about to happen, and restoring is itself snapshotted, so
 * there is no move here that can lose work.
 */
export default function VersionHistory({
  materialId,
  canRestore,
}: {
  materialId: number;
  canRestore: boolean;
}) {
  const router = useRouter();
  const [versions, setVersions] = useState<VersionSummary[] | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open || versions) return;
    fetch(`/api/materials/${materialId}/versions`)
      .then((r) => r.json())
      .then((d) => setVersions(d.versions ?? []))
      .catch(() => setErr("Could not load history"));
  }, [open, versions, materialId]);

  async function restore(v: VersionSummary) {
    if (busy !== null) return;
    setBusy(v.id);
    setErr("");
    try {
      const res = await fetch(`/api/materials/${materialId}/versions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ versionId: v.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Restore failed");
      setVersions(null); // the restore added a snapshot of its own
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Restore failed");
    } finally {
      setBusy(null);
    }
  }

  const when = (iso: string) => {
    // stored as UTC "YYYY-MM-DD HH:MM:SS"
    const d = new Date(iso.replace(" ", "T") + "Z");
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
  };

  return (
    <div className="mb-6 rounded-xl border border-inkline bg-inkcard p-4">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="text-xs font-bold uppercase tracking-widest text-fg3">
          Version history
          {versions && versions.length > 0 ? ` (${versions.length})` : ""}
        </span>
        <span className="text-[11px] font-bold text-accent">
          {open ? "Hide" : "Show"}
        </span>
      </button>

      {open && (
        <div className="mt-3">
          <p className="mb-2 text-[11px] text-fg3">
            A snapshot is taken before every AI edit. Restoring is snapshotted
            too, so nothing here can lose work.
          </p>
          {err && <p className="mb-2 text-xs text-danger">{err}</p>}
          {versions === null && <p className="text-xs text-fg3">Loading…</p>}
          {versions?.length === 0 && (
            <p className="text-xs text-fg3">
              No history yet — snapshots start with the first AI edit.
            </p>
          )}
          {versions && versions.length > 0 && (
            <ul className="flex flex-col divide-y divide-inkline/60">
              {versions.map((v) => (
                <li key={v.id} className="flex flex-wrap items-center gap-3 py-2">
                  <span className="w-36 shrink-0 text-[11px] text-fg3">
                    {when(v.createdAt)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="text-xs font-semibold text-fg1">
                      before {v.label || "an edit"}
                    </span>
                    <span className="ml-2 text-[11px] text-fg3">
                      {v.pages} pages · {v.cards} cards · {v.terms} terms
                      {v.designed ? " · designed" : ""}
                      {v.qa ? " · QA'd" : ""}
                    </span>
                  </span>
                  {canRestore && (
                    <button
                      onClick={() => restore(v)}
                      disabled={busy !== null}
                      className="shrink-0 rounded border border-inkline px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-fg2 hover:text-fg1 disabled:opacity-40"
                    >
                      {busy === v.id ? "Restoring…" : "Restore"}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
