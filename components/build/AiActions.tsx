"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IconRefresh, IconSpark } from "@/components/shell/icons";

/**
 * THE AI, WHERE THE WORK IS.
 *
 * ── WHY PRESET ACTIONS AND NOT JUST A TEXT BOX ───────────────────────────
 * The editor used to offer one control per section: "✨ AI rewrite", opening an
 * empty box captioned "steer the rewrite (optional)". Every teacher therefore
 * had to invent the instruction, and the four they invent are always the same
 * four — make it better, make it easier, give me more, make it shorter. Asking
 * someone to compose a prompt for a job the product already knows the shape of
 * is friction wearing a feature's clothes.
 *
 * So the four are written down, phrased the way this product's rubric actually
 * defines them. That matters more than the convenience: "simplify" naively means
 * "make it shallower", and a lesson that gets shallower every time a teacher
 * presses Simplify is a product that degrades its own output. Here it means
 * plainer language and MORE scaffolding, with the task itself untouched — which
 * is what a teacher means when their class is struggling.
 *
 * ── THEY FIRE IMMEDIATELY; CUSTOM DOES NOT ───────────────────────────────
 * A preset is a known, bounded, undoable change, and every one of these is
 * snapshotted server-side before it writes — so making the teacher confirm a
 * sentence they did not write is a click that buys nothing. A custom
 * instruction is different: it is theirs, it is unbounded, and the last thing
 * before spending a model call on it should be reading it back.
 */

export interface AiAction {
  id: string;
  label: string;
  blurb: string;
  instruction: string;
}

/** The presets. Empty instruction = "rebuild this, meeting the standard". */
export const AI_ACTIONS: AiAction[] = [
  {
    id: "improve",
    label: "Improve",
    blurb: "Sharper wording, more specific answers",
    instruction:
      "Raise the quality without changing what this teaches, how long it takes, or its place in the lesson. Sharpen the wording, make every expected answer specific enough to mark against, and make sure the work actually practises this lesson's skill focus rather than talking about it.",
  },
  {
    id: "simplify",
    label: "Simplify",
    blurb: "Plainer language, more scaffolding",
    instruction:
      "Make this easier to access WITHOUT lowering the standard. Plainer words, shorter sentences, one instruction at a time, and more support — sentence frames, a worked step, a word bank. The task itself, its rigor and its expected answers stay exactly as demanding: this is a reading-level and scaffolding change, not a shallower lesson.",
  },
  {
    id: "expand",
    label: "Expand",
    blurb: "More practice and more support",
    instruction:
      "Go deeper. Add more practice items, a worked example or an extra scaffold, and make the expected answers fuller. Keep the same page kind, the same slot in the sequence and the same duration — this is more substance in the time available, not a longer lesson.",
  },
  {
    id: "shorten",
    label: "Shorten",
    blurb: "Cut what doesn't earn its space",
    instruction:
      "Tighten this. Cut repetition, filler and anything that does not earn its space on a printed page. Keep every teaching move, every scaffold and every expected answer — it should be quicker to READ, not thinner to teach.",
  },
];

export default function AiActions({
  busy,
  onRun,
  label = "AI",
  /** Adds "Regenerate" — a full rewrite from scratch, for a whole page. */
  allowRegenerate = false,
  align = "right",
}: {
  busy: boolean;
  onRun: (instruction: string, actionLabel: string) => void;
  label?: string;
  allowRegenerate?: boolean;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(false);
  const [instruction, setInstruction] = useState("");
  const wrap = useRef<HTMLDivElement | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setCustom(false);
    setInstruction("");
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  function run(text: string, actionLabel: string) {
    close();
    onRun(text, actionLabel);
  }

  return (
    <div ref={wrap} className="relative shrink-0">
      <button
        type="button"
        onClick={() => (busy ? undefined : setOpen((o) => !o))}
        disabled={busy}
        aria-expanded={open}
        aria-haspopup="menu"
        className="inline-flex items-center gap-1.5 rounded-md border border-brand2/40 bg-brand2/8 px-2.5 py-1 text-[11.5px] font-semibold text-brand2ink transition-colors hover:bg-brand2/12 disabled:opacity-45"
      >
        <IconSpark size={12} className={busy ? "build-pulse" : ""} />
        {busy ? "Rewriting…" : label}
      </button>

      {open && !busy && (
        <div
          role="menu"
          className={`absolute top-full z-30 mt-1.5 w-64 overflow-hidden rounded-xl border border-line-strong bg-surface shadow-[var(--elev-lg)] ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {custom ? (
            <div className="p-2.5">
              <label className="field-label" htmlFor="ai-custom">
                Describe the change
              </label>
              <textarea
                id="ai-custom"
                autoFocus
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    if (instruction.trim()) run(instruction.trim(), "Your change");
                  }
                }}
                rows={3}
                placeholder="e.g. make the analogies sports-themed · add a pro-side card on cost"
                className="field-textarea !min-h-16 text-[13px]"
              />
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-[10px] text-fg3">
                  <kbd>⌘</kbd>
                  <kbd>↵</kbd>
                </span>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={close}
                    className="btn btn-ghost btn-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={!instruction.trim()}
                    onClick={() => run(instruction.trim(), "Your change")}
                    className="btn btn-primary btn-sm"
                  >
                    Rewrite
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-col p-1">
                {AI_ACTIONS.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    role="menuitem"
                    onClick={() => run(a.instruction, a.label)}
                    className="rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-surface-alt"
                  >
                    <span className="block text-[13px] font-semibold text-fg1">
                      {a.label}
                    </span>
                    <span className="block text-[11px] leading-snug text-fg3">
                      {a.blurb}
                    </span>
                  </button>
                ))}
              </div>
              <div className="flex flex-col border-t border-inkline p-1">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => setCustom(true)}
                  className="rounded-lg px-2.5 py-2 text-left text-[13px] font-semibold text-fg1 transition-colors hover:bg-surface-alt"
                >
                  Something else…
                </button>
                {allowRegenerate && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => run("", "Regenerate")}
                    className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] font-semibold text-fg2 transition-colors hover:bg-surface-alt"
                  >
                    <IconRefresh size={13} className="shrink-0 text-fg3" />
                    Rebuild this page from scratch
                  </button>
                )}
              </div>
              <p className="border-t border-inkline bg-surface-alt px-2.5 py-1.5 text-[10.5px] leading-snug text-fg3">
                Every rewrite is snapshotted first — you can undo it.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
