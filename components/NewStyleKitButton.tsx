"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function NewStyleKitButton({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function create() {
    const name = window.prompt("Name the new Style Kit:", "Spring 2027 Cohort");
    if (!name?.trim()) return;
    setBusy(true);
    setError("");
    const res = await fetch("/api/style-kits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Could not create kit");
      return;
    }
    router.push(`/style-kits/${data.id}`);
  }

  if (disabled) {
    return (
      <span
        title="Only the founder manages Style Kits."
        className="cursor-not-allowed rounded-md bg-accent/40 px-4 py-2 text-sm font-bold text-ink/60"
      >
        + New Style Kit
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-danger">{error}</span>}
      <button
        onClick={create}
        disabled={busy}
        className="btn btn-primary disabled:opacity-40"
      >
        {busy ? "Creating…" : "+ New Style Kit"}
      </button>
    </div>
  );
}
