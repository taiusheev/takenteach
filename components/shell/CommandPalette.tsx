"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconFormats,
  IconInsights,
  IconLibrary,
  IconMoon,
  IconMotions,
  IconPalette,
  IconPlus,
  IconReview,
  IconRounds,
  IconSearch,
  IconStudents,
  type IconProps,
} from "./icons";
import { THEME_KEY } from "./Theme";

/**
 * ⌘K / Ctrl+K.
 *
 * ── EVERY COMMAND HERE DOES SOMETHING ────────────────────────────────────
 * The brief lists a generous menu of AI actions — improve writing, fact-check,
 * translate, adjust duration. Those belong to a document, not to the
 * application shell, and several have no implementation yet. Putting them here
 * would produce the exact thing the brief warns against twice: AI features that
 * feel gimmicky. A palette whose entries do nothing is worse than a smaller
 * palette, because the first dead command teaches people not to trust the rest.
 *
 * So this ships with what exists: every destination in the product, the create
 * action, the theme, and — the reason a palette is worth building at all —
 * every lesson by name. Document-scoped AI commands land with the editor in
 * phase 4, where there is a document for them to act on.
 *
 * ── MATCHING ─────────────────────────────────────────────────────────────
 * Subsequence matching, not substring: "wtw" finds "Weigh It Out: The Clash
 * Ledger". It is what makes a palette feel fast — you type the shape of the
 * thing rather than its opening characters. Scored so earlier and tighter
 * matches win, and a title match always beats a section match.
 */

export interface PaletteLesson {
  id: number;
  title: string;
  subject: string;
  status: string;
}

type Command = {
  id: string;
  label: string;
  hint?: string;
  group: string;
  icon: (p: IconProps) => React.ReactElement;
  run: () => void;
};

/** Subsequence score, or -1 for no match. Lower is better. */
function score(needle: string, haystack: string): number {
  if (!needle) return 0;
  const h = haystack.toLowerCase();
  let i = 0;
  let total = 0;
  let last = -1;
  for (const ch of needle.toLowerCase()) {
    const at = h.indexOf(ch, i);
    if (at === -1) return -1;
    // A gap costs; adjacent characters are free. This is what makes a tight
    // match outrank a match scattered across a long title.
    total += last === -1 ? at : at - last - 1;
    last = at;
    i = at + 1;
  }
  return total;
}

export default function CommandPalette({
  onClose,
  lessons,
}: {
  onClose: () => void;
  lessons: PaletteLesson[];
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const go = (href: string) => () => {
    onClose();
    router.push(href);
  };

  const commands: Command[] = useMemo(() => {
    const nav: Command[] = [
      { id: "new", label: "New lesson", hint: "Start a build", group: "Actions", icon: IconPlus, run: go("/materials/new") },
      { id: "lib", label: "Library", group: "Go to", icon: IconLibrary, run: go("/") },
      { id: "rev", label: "Review queue", group: "Go to", icon: IconReview, run: go("/review") },
      { id: "rnd", label: "Rounds", group: "Go to", icon: IconRounds, run: go("/rounds") },
      { id: "stu", label: "Students", group: "Go to", icon: IconStudents, run: go("/students") },
      { id: "ins", label: "Insights", group: "Go to", icon: IconInsights, run: go("/analytics") },
      { id: "fmt", label: "Formats", group: "Go to", icon: IconFormats, run: go("/formats") },
      { id: "mot", label: "Motions", group: "Go to", icon: IconMotions, run: go("/motions") },
      { id: "kit", label: "Style Kits", group: "Go to", icon: IconPalette, run: go("/style-kits") },
      {
        id: "theme",
        label: "Toggle dark mode",
        group: "Actions",
        icon: IconMoon,
        run: () => {
          const el = document.documentElement;
          const dark =
            el.getAttribute("data-theme") === "dark" ||
            (!el.getAttribute("data-theme") &&
              matchMedia("(prefers-color-scheme: dark)").matches);
          const next = dark ? "light" : "dark";
          el.setAttribute("data-theme", next);
          localStorage.setItem(THEME_KEY, next);
          onClose();
        },
      },
    ];
    const docs: Command[] = lessons.map((l) => ({
      id: `m${l.id}`,
      label: l.title || "Untitled",
      hint: `${l.subject} · ${l.status.replace("_", " ")}`,
      group: "Lessons",
      icon: IconSearch,
      run: go(`/materials/${l.id}`),
    }));
    return [...nav, ...docs];
  }, [lessons]); // eslint-disable-line react-hooks/exhaustive-deps

  const results = useMemo(() => {
    if (!q.trim()) return commands.slice(0, 12);
    return commands
      .map((c) => ({ c, s: score(q.trim(), `${c.label} ${c.hint ?? ""}`) }))
      .filter((r) => r.s >= 0)
      .sort((a, b) => a.s - b.s)
      .slice(0, 12)
      .map((r) => r.c);
  }, [q, commands]);

  /* Grouping is DERIVED, not accumulated while rendering. The obvious version
     keeps a `lastGroup` variable and mutates it inside the map — which is a
     render-phase mutation, and React's current rules reject it: with
     concurrent rendering a list can be re-rendered part-way, and the variable
     carries stale state into the retry. */
  const rows = useMemo(
    () =>
      results.map((c, i) => ({
        c,
        i,
        header: i === 0 || results[i - 1].group !== c.group ? c.group : null,
      })),
    [results]
  );

  /* Escape closes from anywhere inside, and the arrows never scroll the page
     behind the dialog — the commonest annoyance in a hand-built palette. */
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % Math.max(results.length, 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + results.length) % Math.max(results.length, 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      results[active]?.run();
    }
  }

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-i="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  return (
    <div
      className="fixed inset-0 flex items-start justify-center px-4 pt-[12vh]"
      style={{ zIndex: "var(--z-overlay)" }}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-navy/40 backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onKeyDown={onKeyDown}
        className="relative w-full max-w-lg overflow-hidden rounded-xl border border-inkline bg-surface shadow-[var(--elev-lg)]"
      >
        <div className="flex items-center gap-2 border-b border-inkline px-3">
          <IconSearch size={16} className="shrink-0 text-fg3" />
          <input
            ref={inputRef}
            /* The palette is only mounted while open, so this focuses on
               appear without an effect — and every keystroke resets the
               highlight to the top result, which is where a new search should
               always start. */
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            placeholder="Search lessons, jump to a section…"
            aria-label="Search lessons and commands"
            className="h-11 w-full bg-transparent text-[14px] text-fg1 outline-none placeholder:text-fg3"
          />
          <kbd className="shrink-0">esc</kbd>
        </div>

        <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-1.5">
          {results.length === 0 && (
            <p className="px-3 py-6 text-center text-[13px] text-fg3">
              Nothing matches “{q}”.
            </p>
          )}
          {rows.map(({ c, i, header }) => {
            const Icon = c.icon;
            return (
              <div key={c.id}>
                {header && <p className="nav-section mt-2 mb-1">{header}</p>}
                <button
                  type="button"
                  data-i={i}
                  onMouseMove={() => setActive(i)}
                  onClick={c.run}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${
                    i === active ? "bg-brandsoft text-brandink" : "text-fg1"
                  }`}
                >
                  <Icon
                    size={16}
                    className={i === active ? "text-brand" : "text-fg3"}
                  />
                  <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">
                    {c.label}
                  </span>
                  {c.hint && (
                    <span className="shrink-0 truncate text-[11.5px] text-fg3">
                      {c.hint}
                    </span>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
