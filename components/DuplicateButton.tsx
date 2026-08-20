"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/shell/Toaster";

/**
 * Duplicate a lesson in one click.
 *
 * Copying last term's lesson and changing the motion is the commonest thing a
 * teacher does with a library, and it already worked — behind a page. Reaching
 * it meant opening the material, finding "Remix / Fork", landing on a form
 * whose default is *remix* (which needs a new anchor and rewrites the content),
 * and knowing to switch the mode to duplicate. Four screens and a decision
 * between two words for the same-looking thing.
 *
 * The fork endpoint has always accepted `mode: "duplicate"`. This just asks it
 * from where the lesson is, and opens the copy in the editor — because the only
 * reason to duplicate something is to change it.
 */
export default function DuplicateButton({
  materialId,
  title,
  className = "",
  children,
}: {
  materialId: number;
  title: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function duplicate() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/materials/${materialId}/fork`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "duplicate",
          title: `${title} (copy)`.slice(0, 300),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not duplicate");
      toast("Copy created — opening it now.", "ok");
      router.push(`/materials/${data.id}/edit`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not duplicate", "error");
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void duplicate()}
      disabled={busy}
      title={`Duplicate "${title}"`}
      className={className}
    >
      {busy ? "Copying…" : (children ?? "Duplicate")}
    </button>
  );
}
