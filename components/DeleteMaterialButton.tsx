"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Delete a draft — guarded by a typed confirmation, since it's irreversible. */
export default function DeleteMaterialButton({
  materialId,
  title,
}: {
  materialId: number;
  title: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    if (
      !window.confirm(
        `Delete "${title}" permanently?\n\nThis cannot be undone. Only drafts can be deleted.`
      )
    ) {
      return;
    }
    setBusy(true);
    setError("");
    const res = await fetch(`/api/materials/${materialId}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Delete failed");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-danger">{error}</span>}
      <button
        onClick={remove}
        disabled={busy}
        className="rounded-md border border-danger/40 px-3 py-2 text-sm font-bold text-danger/80 hover:bg-danger/10 hover:text-danger disabled:opacity-40 transition-colors"
      >
        {busy ? "Deleting…" : "Delete draft"}
      </button>
    </div>
  );
}
