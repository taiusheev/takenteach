"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/shell/Toaster";
import { IconStack } from "@/components/shell/icons";

/**
 * "Use template" — a remix of an existing pack.
 *
 * ── THE TEMPLATE IS A REAL LESSON, NOT A STORED BLANK ────────────────────
 * There is no templates table, and adding one would mean a second library to
 * curate, keep current and keep in step with the house style. The product
 * already has the mechanism: `POST /api/materials/[id]/fork` with
 * `mode: "remix"` keeps a pack's SKELETON — its arc, its page kinds, its
 * pacing — and clears the topic-specific content so the build refills it.
 *
 * That is what a template is for. It is also better than a stored one, because
 * these templates improve as the library does: remixing the best pack a
 * department has written is a stronger starting point than a blank somebody
 * wrote once and never revisited.
 *
 * `duplicate` is deliberately not offered here. It copies the content whole,
 * which on a "browse templates" screen is how a library fills with near
 * identical lessons — the same reason the route itself defaults to remix.
 */
export default function UseTemplateButton({
  materialId,
  title,
}: {
  materialId: number;
  title: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function use() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/materials/${materialId}/fork`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "remix" }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Couldn't start from this template");
      }
      toast(`Started from “${title}”.`, "ok");
      /* Straight into the new draft's setup, not back to the library. The
         click meant "I want to build this one", and landing anywhere else
         makes the teacher navigate to the thing they just asked for. */
      router.push(`/materials/${data.id}/fork`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Couldn't start from this template";
      toast(message, "error");
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={use}
      disabled={busy}
      className="btn btn-primary btn-sm w-full"
    >
      <IconStack size={14} />
      {busy ? "Starting…" : "Use template"}
    </button>
  );
}
