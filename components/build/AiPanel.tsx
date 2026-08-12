"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/shell/Toaster";
import { IconSpark } from "@/components/shell/icons";

/**
 * THE EDITOR'S AI ASSISTANT.
 *
 * ── EVERY BUTTON HERE POSTS TO A REAL ENDPOINT ───────────────────────────
 * `/api/materials/[id]/revise` already accepts one plain-English instruction
 * and applies a TARGETED change — it edits the units it can locate and leaves
 * the rest of the pack alone, which is the opposite of a regenerate. This panel
 * is a front end for that, not a new capability pretending to be one.
 *
 * The brief lists a longer menu — translate, fact-check, find sources, create
 * homework. Those are not here because they do not exist behind an endpoint
 * yet, and §17 is explicit: build the UI so it can be connected later rather
 * than creating fake functionality. A button that appears to summon an AI and
 * silently does nothing is worse than an absent feature, because it spends the
 * trust the working ones need.
 *
 * ── THE PRESETS ARE PROMPTS, NOT COMMANDS ────────────────────────────────
 * Each one fills the box rather than firing immediately. A revision costs money
 * and rewrites a teacher's pack, so the last step before that happens should be
 * a human reading the sentence they are about to send — and most of the value
 * is in editing the preset ("make the exit ticket easier" → "...easier, and
 * keep it to five minutes") rather than in the preset itself.
 *
 * ── IT IS ALWAYS UNDOABLE ────────────────────────────────────────────────
 * The route snapshots the pack before it writes, so every revision has a
 * version to fall back to. That is stated on the panel, because the reason
 * people do not use an AI edit button is the fear that it will quietly ruin
 * something they cannot get back.
 */

/** Straight from the brief's §6 examples, minus the ones with no endpoint. */
const PRESETS = [
  "Make the main activity easier for a weaker group.",
  "Add a 10-minute warm-up before the first activity.",
  "Rewrite the mission and success criteria for 12-year-olds.",
  "Check the timing plan adds up to the lesson length, and fix it if not.",
  "Add an extension task for students who finish early.",
];

interface ReviseResult {
  applied: boolean;
  summary: string;
  changed?: string[];
}

export default function AiPanel({ materialId }: { materialId: number }) {
  const router = useRouter();
  const { toast } = useToast();
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ReviseResult | null>(null);

  async function send() {
    const text = instruction.trim();
    if (!text || busy) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch(`/api/materials/${materialId}/revise`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: text }),
      });
      const data = (await res.json()) as ReviseResult & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Revision failed");

      setResult(data);
      if (data.applied) {
        toast(data.summary || "Revision applied.", "ok");
        setInstruction("");
        /* The pack is a server component's data, so the edit is on the server
           and not in this component's state. Refreshing re-renders the form
           around the new content instead of leaving the author looking at what
           they had before the change they just watched succeed. */
        router.refresh();
      } else {
        /* `applied: false` is a real answer, not a failure: the model could not
           locate what the instruction referred to and the route deliberately
           did NOT overwrite the pack. Saying so beats a generic error. */
        toast("Nothing changed — see the note in the panel.", "info");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Revision failed";
      setResult({ applied: false, summary: message });
      toast(message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card p-4">
      <h2 className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-fg1">
        <IconSpark size={14} className="text-brand2" />
        Ask for a change
      </h2>
      <p className="mb-3 text-[11.5px] leading-relaxed text-fg3">
        One plain-English change at a time. It edits only what it can find and
        leaves the rest alone — and the pack is snapshotted first, so anything
        here can be undone from Version history.
      </p>

      <textarea
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send();
        }}
        rows={3}
        disabled={busy}
        placeholder="e.g. make the exit ticket easier and keep it to five minutes"
        className="field-textarea w-full text-[13px]"
        aria-label="Describe the change you want"
      />

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-[10.5px] text-fg3">
          <kbd>⌘</kbd>
          <kbd>↵</kbd> to send
        </span>
        <button
          type="button"
          onClick={send}
          disabled={busy || !instruction.trim()}
          className="btn btn-primary btn-sm"
        >
          {busy ? "Revising…" : "Apply change"}
        </button>
      </div>

      {/* The presets FILL the box; they do not fire. See the note above. */}
      <div className="mt-3 border-t border-inkline pt-3">
        <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wider text-fg3">
          Common changes
        </p>
        <div className="flex flex-col gap-1">
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              disabled={busy}
              onClick={() => setInstruction(p)}
              className="rounded-md px-2 py-1.5 text-left text-[12px] leading-snug text-fg2 transition-colors hover:bg-surface-alt hover:text-fg1 disabled:opacity-40"
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {result && (
        <div
          className={`mt-3 rounded-lg border p-2.5 text-[12px] leading-relaxed ${
            result.applied
              ? "border-ok/40 bg-ok/10 text-ok"
              : "border-warn/40 bg-warn/10 text-warn"
          }`}
        >
          <p>{result.summary}</p>
          {result.changed && result.changed.length > 0 && (
            <p className="mt-1 text-fg2">
              Changed: {result.changed.join(", ")}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
