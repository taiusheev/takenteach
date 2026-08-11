"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Assign a draft to a Style Kit — everything inherits from it automatically. */
export default function StyleKitPicker({
  materialId,
  current,
  kits,
  disabled,
}: {
  materialId: number;
  current: number;
  kits: { id: number; name: string; isDefault: boolean }[];
  disabled: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function pick(styleKitId: number) {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/materials/${materialId}/style-kit`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ styleKitId }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Could not change kit");
      return;
    }
    router.refresh();
  }

  return (
    <label className="flex items-center gap-2 text-xs text-fg3">
      <span className="uppercase tracking-widest font-bold">Style Kit</span>
      <select
        value={current}
        disabled={disabled || busy}
        onChange={(e) => pick(Number(e.target.value))}
        aria-label="Style Kit"
        className="rounded-md border border-inkline bg-inkcard px-2 py-1.5 text-sm font-semibold text-fg1 outline-none focus:border-accent/60 disabled:opacity-60"
      >
        {kits.map((k) => (
          <option key={k.id} value={k.id}>
            {k.name}
            {k.isDefault ? " (default)" : ""}
          </option>
        ))}
      </select>
      {error && <span className="text-danger">{error}</span>}
    </label>
  );
}
