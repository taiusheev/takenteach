"use client";

import {
  ACTIVITY_KINDS,
  Activity,
  Figure,
  Prompt,
  SIDES,
} from "@/lib/lesson-pack-schema";
import { IconGrip } from "@/components/shell/icons";
import AiActions from "./AiActions";
import { AddButton, Field, RemoveButton, MoveButtons } from "./fields";

/**
 * ONE PAGE OF THE LESSON, COLLAPSED UNTIL IT IS WANTED.
 *
 * ── THE MEASUREMENT THAT CAUSED THIS ─────────────────────────────────────
 * The editor rendered every field of every page at once. On a ten-page pack —
 * below average; a full build makes twelve to fourteen — that is a document
 * 14,964 pixels tall containing 251 form controls and 171 buttons, with no way
 * to reach page seven except to scroll past pages one to six. A teacher who
 * wants to fix the exit ticket has to travel the length of eleven screens to
 * find it, and the AI rewrite button for the page they want is somewhere in the
 * same stack.
 *
 * A lesson is a sequence of pages, so the editor is a list of pages. Collapsed,
 * each is one row that says what the page IS — its number, kind, title, length,
 * how many prompts it carries and whether anything is missing. Open, it is the
 * same complete field set as before: nothing was removed to make this fit, the
 * only change is that a page you are not editing is one line instead of forty.
 *
 * ── THE SUMMARY ROW IS A QUALITY SIGNAL, NOT A LABEL ─────────────────────
 * `pageIssues` runs the cheap, local half of what the checklist proves later:
 * an unkeyed prompt, an empty instruction line, a page with no work on it. The
 * point is that a weak page is visible while the list is still collapsed —
 * scanning ten rows for amber dots is how you find the thin page in a pack,
 * and it is not something you can do by scrolling through 15,000 pixels of
 * open textareas.
 */

/** Local, cheap checks — the ones that can be seen without the full checklist. */
export function pageIssues(a: Activity): string[] {
  const out: string[] = [];
  if (!a.title.trim()) out.push("No title");
  if (!a.instructions.trim()) out.push("No instructions for students");
  const unkeyed = a.prompts.filter((p) => !p.expectedAnswer.trim()).length;
  if (unkeyed > 0) {
    out.push(
      `${unkeyed} prompt${unkeyed === 1 ? "" : "s"} without an expected answer`
    );
  }
  if (a.durationMin <= 0) out.push("No duration");
  const hasWork =
    a.prompts.length > 0 ||
    a.sortItems.length > 0 ||
    a.matchPairs.length > 0 ||
    a.frames.length > 0 ||
    a.exampleLayers.length > 0 ||
    a.figures.length > 0 ||
    a.quiz.length > 0;
  if (!hasWork) out.push("Nothing for students to do");
  return out;
}

function updateAt<T>(arr: T[], i: number, patch: Partial<T>): T[] {
  return arr.map((item, j) => (j === i ? { ...item, ...patch } : item));
}
function removeAt<T>(arr: T[], i: number): T[] {
  return arr.filter((_, j) => j !== i);
}

export default function PageCard({
  activity: a,
  index,
  total,
  open,
  onToggle,
  onChange,
  onRemove,
  onDuplicate,
  onMove,
  onAi,
  aiBusy,
  rowProps,
  handleProps,
  practiceTopic = "",
}: {
  activity: Activity;
  index: number;
  total: number;
  open: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<Activity>) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onMove: (dir: -1 | 1) => void;
  onAi: (instruction: string, label: string) => void;
  aiBusy: boolean;
  rowProps: Record<string, unknown>;
  handleProps: Record<string, unknown>;
  /** The pack's practice topic, if it has one — see practiceTopic on the pack.
      Passed rather than the whole pack because this is the only field the page
      editor needs from it. */
  practiceTopic?: string;
}) {
  const issues = pageIssues(a);
  const set = (patch: Partial<Activity>) => onChange(patch);

  return (
    <div
      {...rowProps}
      id={`page-${index}`}
      className="card scroll-mt-[calc(var(--header-h)+4.5rem)] overflow-hidden transition-shadow data-[dragging=true]:opacity-45 data-[drop-target=true]:border-brand data-[drop-target=true]:shadow-[0_0_0_2px_var(--brand)]"
    >
      {/* ── the row ── */}
      <div
        className={`flex items-center gap-2.5 px-3 py-2.5 ${
          open ? "border-b border-inkline bg-surface-alt/50" : ""
        }`}
      >
        <span
          {...handleProps}
          title="Drag to reorder"
          aria-hidden
          className="cursor-grab rounded p-0.5 text-fg3 transition-colors hover:text-fg1 active:cursor-grabbing"
        >
          <IconGrip size={14} />
        </span>

        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={`page-body-${index}`}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md py-1 text-left"
        >
          <span className="w-5 shrink-0 text-right text-[12px] font-semibold tabular-nums text-fg3">
            {index + 1}
          </span>
          <span className="shrink-0 rounded bg-surface-alt px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-fg3">
            {a.kind}
          </span>
          <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-fg1">
            {a.title || <span className="text-fg3">Untitled page</span>}
          </span>
          {/* Amber dot = something on this page is incomplete. Findable while
              the whole pack is collapsed, which is the entire point. */}
          {issues.length > 0 && (
            <span
              title={issues.join(" · ")}
              className="shrink-0 rounded-full bg-warn/12 px-1.5 py-0.5 text-[10px] font-bold text-warn"
            >
              {issues.length}
            </span>
          )}
          <span className="hidden shrink-0 text-[11px] tabular-nums text-fg3 sm:inline">
            {a.prompts.length > 0 && `${a.prompts.length} prompt${a.prompts.length === 1 ? "" : "s"} · `}
            {a.durationMin}m
          </span>
        </button>

        <AiActions busy={aiBusy} onRun={onAi} allowRegenerate />
        <MoveButtons
          onUp={() => onMove(-1)}
          onDown={() => onMove(1)}
          upDisabled={index === 0}
          downDisabled={index === total - 1}
        />
        <button
          type="button"
          onClick={onDuplicate}
          title="Duplicate this page"
          aria-label="Duplicate this page"
          className="hidden h-8 w-8 shrink-0 place-items-center rounded-md border border-inkline text-fg3 transition-colors hover:text-fg1 sm:grid"
        >
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden>
            <rect x="4.5" y="4.5" width="8" height="8" rx="1.6" stroke="currentColor" strokeWidth="1.4" />
            <path d="M9.5 1.5H2.6A1.1 1.1 0 0 0 1.5 2.6v6.9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
        <RemoveButton onClick={onRemove} title="Delete this page" />
      </div>

      {/* ── the page itself ── */}
      {open && (
        <div id={`page-body-${index}`} className="flex flex-col gap-3.5 p-4">
          <div className="grid gap-3 sm:grid-cols-[10rem_1fr_6rem]">
            <Field label="Page kind">
              <select
                className="field-input"
                value={a.kind}
                onChange={(e) => set({ kind: e.target.value as Activity["kind"] })}
              >
                {ACTIVITY_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Page title (printed at the top)">
              <input
                className="field-input font-semibold"
                value={a.title}
                onChange={(e) => set({ title: e.target.value })}
                placeholder="THE ARENA"
              />
            </Field>
            <Field label="Minutes">
              <input
                type="number"
                className="field-input"
                value={a.durationMin}
                onChange={(e) =>
                  set({ durationMin: Math.max(0, Number(e.target.value) || 0) })
                }
              />
            </Field>
          </div>

          {/* Only offered once a practice topic exists — a topic switch on a
              pack with nothing to switch to is a dangling reference, which the
              `practice-topic-declared` gate would then have to catch. */}
          {practiceTopic.trim() && (
            <Field label="This page runs on">
              <select
                className="field-input"
                value={a.runsOn ?? "anchor"}
                onChange={(e) => set({ runsOn: e.target.value as "anchor" | "practice" })}
              >
                <option value="anchor">The real anchor</option>
                <option value="practice">The practice topic</option>
              </select>
            </Field>
          )}

          <Field label="Droppable when the room runs behind">
            <select
              className="field-input"
              value={a.optional ? "yes" : "no"}
              onChange={(e) => set({ optional: e.target.value === "yes" })}
            >
              <option value="no">Core — this page runs</option>
              <option value="yes">Optional — cut this first if time is short</option>
            </select>
          </Field>

          <Field label="Header badge">
            <input
              className="field-input"
              value={a.badge}
              onChange={(e) => set({ badge: e.target.value })}
              placeholder="BASELINE HOOK · 12 MIN"
            />
          </Field>

          <Field label="Instructions banner — what students read first">
            <textarea
              className="field-textarea !min-h-14"
              value={a.instructions}
              onChange={(e) => set({ instructions: e.target.value })}
            />
          </Field>

          {/* Sits directly under the instruction it accompanies, in the order
              both print: what to do, then why it is worth doing. */}
          <Field label="Why this page — the student's reason to care, 1–2 sentences">
            <textarea
              className="field-textarea !min-h-14"
              value={a.whyItMatters ?? ""}
              onChange={(e) => set({ whyItMatters: e.target.value })}
              placeholder="A judge trusts the debater who can say what the other side gets right."
            />
          </Field>

          <Field label="Body / explainer content">
            <textarea
              className="field-textarea !min-h-14"
              value={a.body}
              onChange={(e) => set({ body: e.target.value })}
            />
          </Field>

          <div>
            <span className="field-label">
              Student prompts + expected answers
            </span>
            <div className="flex flex-col gap-2">
              {a.prompts.map((p: Prompt, pi) => (
                <div
                  key={pi}
                  className="rounded-lg border border-inkline bg-surface-alt/40 p-2.5"
                >
                  <div className="mb-2 flex gap-2">
                    {/* Named per row: a placeholder vanishes once there is a
                        value, so without this a screen reader announces a
                        dozen identical "edit text" fields on one page. */}
                    <input
                      className="field-input"
                      aria-label={`Prompt ${pi + 1}`}
                      value={p.label}
                      onChange={(e) =>
                        set({ prompts: updateAt(a.prompts, pi, { label: e.target.value }) })
                      }
                      placeholder="Prompt students see"
                    />
                    <select
                      className="field-input !w-28"
                      value={p.side}
                      onChange={(e) =>
                        set({ prompts: updateAt(a.prompts, pi, { side: e.target.value as Prompt["side"] }) })
                      }
                      aria-label="Prompt side"
                    >
                      {SIDES.map((s) => (
                        <option key={s} value={s}>
                          {s.toUpperCase()}
                        </option>
                      ))}
                    </select>
                    <RemoveButton
                      onClick={() => set({ prompts: removeAt(a.prompts, pi) })}
                      title="Remove prompt"
                    />
                  </div>
                  {/* The two student-facing lines sit ABOVE the answer key in
                      the editor, in the order they print on the sheet — the
                      student reads Include, then Don't, then writes. Keeping
                      editor order and page order the same is what stops an
                      author writing a `guide` that is really a second copy of
                      the expected answer sitting two fields below it. */}
                  <div className="mb-1.5 flex gap-2">
                    <input
                      className="field-input"
                      aria-label={`Student guidance for prompt ${pi + 1}`}
                      value={p.guide ?? ""}
                      onChange={(e) =>
                        set({ prompts: updateAt(a.prompts, pi, { guide: e.target.value }) })
                      }
                      placeholder="Include — what to put in the box (student sees this)"
                    />
                    <input
                      className="field-input"
                      aria-label={`Trap for prompt ${pi + 1}`}
                      value={p.trap ?? ""}
                      onChange={(e) =>
                        set({ prompts: updateAt(a.prompts, pi, { trap: e.target.value }) })
                      }
                      placeholder="Don't — the wrong move made here (student sees this)"
                    />
                  </div>
                  <input
                    className={`field-input ${p.expectedAnswer.trim() ? "" : "!border-warn/60"}`}
                    aria-label={`Expected answer for prompt ${pi + 1}`}
                    value={p.expectedAnswer}
                    onChange={(e) =>
                      set({ prompts: updateAt(a.prompts, pi, { expectedAnswer: e.target.value }) })
                    }
                    placeholder="Expected answer — teacher only, hidden on the student copy"
                  />
                </div>
              ))}
              <AddButton
                label="+ Add prompt"
                onClick={() =>
                  set({
                    prompts: [
                      ...a.prompts,
                      { label: "", side: "neutral", expectedAnswer: "", guide: "", trap: "" },
                    ],
                  })
                }
              />
            </div>
          </div>

          {/* The exit ballot, shown only where it belongs. Putting it on every
              page would invite an author to fill it on a drill, and a ballot on
              a drill is a mark out of ten for practice. */}
          {a.kind === "exit-ticket" && (
            <div className="rounded-lg border border-inkline bg-surface-alt/40 p-2.5">
              <span className="field-label">
                Exit ballot — what a partner marks, then the repair
              </span>
              <div className="mt-2 flex flex-col gap-2">
                <Field label="Ballot rows — one per criterion the pack already taught (criterion | observable test, one per line)">
                  <textarea
                    className="field-textarea !min-h-16"
                    value={(a.exitBallot?.rows ?? [])
                      .map((r) => `${r.criterion} | ${r.test}`)
                      .join("\n")}
                    onChange={(e) =>
                      set({
                        exitBallot: {
                          ...(a.exitBallot ?? { scale: [], errors: [], repairs: [], product: "" }),
                          rows: e.target.value
                            .split("\n")
                            .map((l) => l.trim())
                            .filter(Boolean)
                            .map((l) => {
                              const [criterion, ...rest] = l.split("|");
                              return { criterion: criterion.trim(), test: rest.join("|").trim() };
                            }),
                        },
                      })
                    }
                    placeholder={"Clear side and claim | A stranger could repeat it after hearing it once."}
                  />
                </Field>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Field label="Named errors — the student marks one (one per line)">
                    <textarea
                      className="field-textarea !min-h-14"
                      value={(a.exitBallot?.errors ?? []).join("\n")}
                      onChange={(e) =>
                        set({
                          exitBallot: {
                            ...(a.exitBallot ?? { rows: [], scale: [], repairs: [], product: "" }),
                            errors: e.target.value.split("\n").map((l) => l.trim()).filter(Boolean),
                          },
                        })
                      }
                      placeholder={"My reason repeated my point\nI never named the source"}
                    />
                  </Field>
                  <Field label="Repair moves — between them these must answer every error">
                    <textarea
                      className="field-textarea !min-h-14"
                      value={(a.exitBallot?.repairs ?? []).join("\n")}
                      onChange={(e) =>
                        set({
                          exitBallot: {
                            ...(a.exitBallot ?? { rows: [], scale: [], errors: [], product: "" }),
                            repairs: e.target.value.split("\n").map((l) => l.trim()).filter(Boolean),
                          },
                        })
                      }
                      placeholder={"Add the missing why\nName the source out loud"}
                    />
                  </Field>
                </div>
                <Field label="What the student leaves with">
                  <input
                    className="field-input"
                    value={a.exitBallot?.product ?? ""}
                    onChange={(e) =>
                      set({
                        exitBallot: {
                          ...(a.exitBallot ?? { rows: [], scale: [], errors: [], repairs: [] }),
                          product: e.target.value,
                        },
                      })
                    }
                    placeholder="a rewritten sentence, not a score"
                  />
                </Field>
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Key idea box (optional)">
              <textarea
                className="field-textarea !min-h-12"
                value={a.keyIdea}
                onChange={(e) => set({ keyIdea: e.target.value })}
                placeholder="The one line students write down."
              />
            </Field>
            <Field label="Stand & deliver (optional)">
              <textarea
                className="field-textarea !min-h-12"
                value={a.standAndDeliver}
                onChange={(e) => set({ standAndDeliver: e.target.value })}
                placeholder="Closing oral micro-task."
              />
            </Field>
          </div>

          {/* The typed blocks. Open when they carry content, closed when they
              don't — a page with no sort drill should not show an empty one. */}
          <Block
            title="Worked example layers"
            count={a.exampleLayers.length}
            hint="for I Do / mentor text"
          >
            {a.exampleLayers.map((l, li) => (
              <div key={li} className="flex flex-wrap gap-2">
                <input className="field-input !w-36" value={l.label} placeholder="POINT"
                  onChange={(e) => set({ exampleLayers: updateAt(a.exampleLayers, li, { label: e.target.value }) })} />
                <textarea className="field-textarea !min-h-10 min-w-48 flex-1" value={l.text} placeholder="Model text for this layer"
                  onChange={(e) => set({ exampleLayers: updateAt(a.exampleLayers, li, { text: e.target.value }) })} />
                <input className="field-input !w-64" value={l.note} placeholder="Why this works"
                  onChange={(e) => set({ exampleLayers: updateAt(a.exampleLayers, li, { note: e.target.value }) })} />
                {/* The pass condition is student-facing and self-administered, so
                    it sits beside the teacher-facing note rather than inside it. */}
                <input className="field-input !w-64" value={l.passesWhen ?? ""} placeholder="Passes when — an observable test"
                  onChange={(e) => set({ exampleLayers: updateAt(a.exampleLayers, li, { passesWhen: e.target.value }) })} />
                <RemoveButton onClick={() => set({ exampleLayers: removeAt(a.exampleLayers, li) })} />
              </div>
            ))}
            <AddButton label="+ Add layer" onClick={() => set({ exampleLayers: [...a.exampleLayers, { label: "", text: "", note: "", passesWhen: "" }] })} />
          </Block>

          <Block
            title="Card jobs"
            count={a.cardJobs.length}
            hint="one job per card — card ID → job → what the student writes"
          >
            {a.cardJobs.map((j, ji) => (
              <div key={ji} className="flex flex-wrap gap-2">
                <input className="field-input !w-20" value={j.cardId} placeholder="A"
                  onChange={(e) => set({ cardJobs: updateAt(a.cardJobs, ji, { cardId: e.target.value }) })} />
                <input className="field-input !w-44" value={j.job} placeholder="THE LIMIT"
                  onChange={(e) => set({ cardJobs: updateAt(a.cardJobs, ji, { job: e.target.value }) })} />
                <textarea className="field-textarea !min-h-10 min-w-48 flex-1" value={j.instruction}
                  placeholder="What the student writes — one line, student-facing"
                  onChange={(e) => set({ cardJobs: updateAt(a.cardJobs, ji, { instruction: e.target.value }) })} />
                <RemoveButton onClick={() => set({ cardJobs: removeAt(a.cardJobs, ji) })} />
              </div>
            ))}
            <AddButton label="+ Add card job" onClick={() => set({ cardJobs: [...a.cardJobs, { cardId: "", job: "", instruction: "" }] })} />
          </Block>

          {/* FIGURES. The four shared fields sit together at the top of each
              row because they apply to every kind, and only the fields the
              chosen kind actually draws appear underneath — an author editing a
              process flow should not be looking at a box count. */}
          <Block
            title="Figures"
            count={a.figures.length}
            hint="a drawing that rounds must also state the exact number"
          >
            {a.figures.map((f, fi) => {
              const upd = (patch: Partial<Figure>) =>
                set({ figures: updateAt(a.figures, fi, patch) });
              return (
                <div key={fi} className="rounded-lg border border-inkline bg-surface-alt/40 p-2.5">
                  <div className="mb-2 flex flex-wrap gap-2">
                    <select
                      className="field-input !w-40"
                      value={f.kind}
                      onChange={(e) => upd({ kind: e.target.value as Figure["kind"] })}
                      aria-label={`Figure ${fi + 1} kind`}
                    >
                      <option value="unit-chart">Unit chart — N of M</option>
                      <option value="process-flow">Process flow — stages</option>
                      <option value="ratio">Ratio — X = N × Y</option>
                      <option value="balance">Balance — brings / costs</option>
                    </select>
                    <input className="field-input flex-1" value={f.title} placeholder="Figure heading"
                      onChange={(e) => upd({ title: e.target.value })} />
                    <RemoveButton onClick={() => set({ figures: removeAt(a.figures, fi) })} />
                  </div>

                  {f.kind === "unit-chart" && (
                    <div className="mb-2 flex flex-wrap gap-2">
                      <input type="number" className="field-input !w-24" value={f.filled} placeholder="filled"
                        onChange={(e) => upd({ filled: Math.max(0, Number(e.target.value) || 0) })} aria-label="Filled now" />
                      <input type="number" className="field-input !w-24" value={f.total} placeholder="of"
                        onChange={(e) => upd({ total: Math.max(1, Number(e.target.value) || 1) })} aria-label="Total" />
                      <input className="field-input !w-44" value={f.nowLabel} placeholder="label for this series"
                        onChange={(e) => upd({ nowLabel: e.target.value })} />
                      <input type="number" className="field-input !w-28" value={f.thenFilled ?? ""} placeholder="earlier"
                        onChange={(e) => upd({ thenFilled: e.target.value === "" ? undefined : Math.max(0, Number(e.target.value) || 0) })}
                        aria-label="Earlier series, optional" />
                      <input className="field-input !w-44" value={f.thenLabel} placeholder="label for the earlier one"
                        onChange={(e) => upd({ thenLabel: e.target.value })} />
                    </div>
                  )}

                  {f.kind === "process-flow" && (
                    <textarea className="field-textarea !min-h-14 mb-2" value={f.stages.join("\n")}
                      placeholder={"One stage per line\nPower generation\nTransmission lines"}
                      onChange={(e) => upd({ stages: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) })} />
                  )}

                  {f.kind === "ratio" && (
                    <div className="mb-2 flex flex-wrap gap-2">
                      <input className="field-input flex-1" value={f.ratioLeft} placeholder="about five ordinary centers"
                        onChange={(e) => upd({ ratioLeft: e.target.value })} />
                      <input type="number" className="field-input !w-20" value={f.ratioCount ?? ""} placeholder="how many"
                        onChange={(e) => upd({ ratioCount: e.target.value === "" ? undefined : Math.max(1, Number(e.target.value) || 1) })}
                        aria-label="How many of the left make one right" />
                      <input className="field-input flex-1" value={f.ratioRight} placeholder="one hyperscale center"
                        onChange={(e) => upd({ ratioRight: e.target.value })} />
                    </div>
                  )}

                  {f.kind === "balance" && (
                    <div className="mb-2 flex flex-col gap-2">
                      <input className="field-input" value={f.subject} placeholder="The thing being weighed"
                        onChange={(e) => upd({ subject: e.target.value })} />
                      <div className="grid gap-2 sm:grid-cols-2">
                        <textarea className="field-textarea !min-h-14" value={f.brings.map((b) => `${b.head} | ${b.detail}`).join("\n")}
                          placeholder={"What it brings — head | detail, one per line"}
                          onChange={(e) => upd({ brings: e.target.value.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => { const [head, ...r] = l.split("|"); return { head: head.trim(), detail: r.join("|").trim() }; }) })} />
                        <textarea className="field-textarea !min-h-14" value={f.costs.map((c) => `${c.head} | ${c.detail}`).join("\n")}
                          placeholder={"What it costs — head | detail, one per line"}
                          onChange={(e) => upd({ costs: e.target.value.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => { const [head, ...r] = l.split("|"); return { head: head.trim(), detail: r.join("|").trim() }; }) })} />
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <input className="field-input flex-1" value={f.caption} placeholder="Caption — the one line to take away"
                      onChange={(e) => upd({ caption: e.target.value })} />
                    <input
                      className={`field-input flex-1 ${
                        (f.kind === "unit-chart" || f.kind === "ratio") && !f.exact.trim() ? "!border-warn/60" : ""
                      }`}
                      value={f.exact}
                      placeholder="Exact — the unrounded truth"
                      onChange={(e) => upd({ exact: e.target.value })}
                    />
                    <input className={`field-input flex-1 ${f.source.trim() ? "" : "!border-warn/60"}`} value={f.source}
                      placeholder="Source" onChange={(e) => upd({ source: e.target.value })} />
                  </div>
                </div>
              );
            })}
            <AddButton
              label="+ Add figure"
              onClick={() =>
                set({
                  figures: [
                    ...a.figures,
                    {
                      kind: "unit-chart", title: "", caption: "", exact: "", source: "",
                      filled: 0, total: 100, nowLabel: "", thenLabel: "",
                      stages: [], ratioLeft: "", ratioRight: "",
                      subject: "", bringsLabel: "What it brings", costsLabel: "What it costs",
                      brings: [], costs: [],
                    },
                  ],
                })
              }
            />
          </Block>

          <Block title="Sort drill items" count={a.sortItems.length} hint="statement → category">
            {a.sortItems.map((s, si) => (
              <div key={si} className="flex flex-wrap gap-2">
                <textarea className="field-textarea !min-h-10 min-w-48 flex-1" value={s.statement} placeholder="Statement to sort"
                  onChange={(e) => set({ sortItems: updateAt(a.sortItems, si, { statement: e.target.value }) })} />
                <input className="field-input !w-40" value={s.category} placeholder="FACT / OPINION"
                  onChange={(e) => set({ sortItems: updateAt(a.sortItems, si, { category: e.target.value }) })} />
                <input className="field-input !w-64" value={s.explanation} placeholder="Why (teacher-facing)"
                  onChange={(e) => set({ sortItems: updateAt(a.sortItems, si, { explanation: e.target.value }) })} />
                <RemoveButton onClick={() => set({ sortItems: removeAt(a.sortItems, si) })} />
              </div>
            ))}
            <AddButton label="+ Add item" onClick={() => set({ sortItems: [...a.sortItems, { statement: "", category: "", explanation: "" }] })} />
          </Block>

          <Block title="Matching pairs" count={a.matchPairs.length}>
            {a.matchPairs.map((m, mi) => (
              <div key={mi} className="flex flex-wrap gap-2">
                <input className="field-input min-w-40 flex-1" value={m.left} placeholder="Left"
                  onChange={(e) => set({ matchPairs: updateAt(a.matchPairs, mi, { left: e.target.value }) })} />
                <input className="field-input min-w-40 flex-1" value={m.right} placeholder="Right"
                  onChange={(e) => set({ matchPairs: updateAt(a.matchPairs, mi, { right: e.target.value }) })} />
                <RemoveButton onClick={() => set({ matchPairs: removeAt(a.matchPairs, mi) })} />
              </div>
            ))}
            <AddButton label="+ Add pair" onClick={() => set({ matchPairs: [...a.matchPairs, { left: "", right: "" }] })} />
          </Block>

          <Block title="Scaffold frames" count={a.frames.length} hint="sentence starters">
            {a.frames.map((f, fi) => (
              <div key={fi} className="flex flex-wrap gap-2">
                <input className="field-input !w-36" value={f.label} placeholder="POINT"
                  onChange={(e) => set({ frames: updateAt(a.frames, fi, { label: e.target.value }) })} />
                <input className="field-input min-w-48 flex-1" value={f.starter} placeholder="My first reason is ____ because ____."
                  onChange={(e) => set({ frames: updateAt(a.frames, fi, { starter: e.target.value }) })} />
                <RemoveButton onClick={() => set({ frames: removeAt(a.frames, fi) })} />
              </div>
            ))}
            <AddButton label="+ Add frame" onClick={() => set({ frames: [...a.frames, { label: "", starter: "" }] })} />
          </Block>

          {issues.length > 0 && (
            <p className="rounded-lg border border-warn/40 bg-warn/8 px-3 py-2 text-[11.5px] leading-relaxed text-warn">
              {issues.join(" · ")}. Fix it here, or press AI → Improve.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Block({
  title,
  count,
  hint,
  children,
}: {
  title: string;
  count: number;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <details
      className="rounded-lg border border-inkline px-3 py-2"
      open={count > 0}
    >
      <summary className="cursor-pointer text-[12px] font-semibold text-fg2">
        {title}{" "}
        <span className="font-normal text-fg3">
          ({count}){hint ? ` — ${hint}` : ""}
        </span>
      </summary>
      <div className="mt-2.5 flex flex-col gap-2">{children}</div>
    </details>
  );
}
