import { type LessonPack } from "./lesson-pack-schema";
import { type AnyContent, contentTypeDef } from "./content-types";

/**
 * Text exports of a finished pack.
 *
 * The print view is the deliverable, but a lesson also has to leave the app as
 * something a coach can paste into an email, drop in a shared drive, or edit in
 * Word — so the pack serialises to Markdown (and plain text) with everything a
 * teacher needs: the cover, the criteria, the word bank, the full source deck
 * WITH its limits, every page's components, the teacher guide, and the key.
 *
 * `withAnswers` exists because the same document is handed to students; the
 * student copy must not carry the answer key.
 */

export interface ExportOptions {
  /** include expected answers, the teacher guide, and the answer key */
  withAnswers?: boolean;
}

const rule = (s: string) => `\n\n---\n\n## ${s}\n`;

function activityToMarkdown(
  a: LessonPack["activities"][number],
  index: number,
  opts: ExportOptions
): string {
  const out: string[] = [];
  const badge = [a.badge, a.durationMin ? `${a.durationMin} min` : ""]
    .filter(Boolean)
    .join(" · ");
  out.push(`### ${index + 1}. ${a.title || a.kind.toUpperCase()}`);
  if (badge) out.push(`*${badge}*`);
  if (a.instructions) out.push(`> ${a.instructions}`);

  if (a.scene?.setup || a.scene?.turns.length || a.scene?.twist) {
    if (a.scene.setup) out.push(`**Scene:** ${a.scene.setup}`);
    for (const t of a.scene.turns) {
      out.push(`- **${t.speaker || t.side}:** “${t.line}”`);
    }
    if (a.scene.twist) out.push(`**The point:** ${a.scene.twist}`);
  }

  if (a.exampleLayers.length) {
    out.push("**Worked example**\n");
    for (const l of a.exampleLayers) {
      out.push(`- **${l.label}:** ${l.text}${l.note ? ` *(${l.note})*` : ""}`);
    }
  }

  if (a.steps.length) {
    out.push("**Steps**\n");
    a.steps.forEach((s, i) =>
      out.push(`${i + 1}. ${s.text}${s.detail ? ` — ${s.detail}` : ""}`)
    );
  }

  if (a.compare.rows.length) {
    const l = a.compare.leftLabel || "THIS";
    const r = a.compare.rightLabel || "THAT";
    out.push(`| ${l} | ${r} |`, `| --- | --- |`);
    for (const row of a.compare.rows) out.push(`| ${row.left} | ${row.right} |`);
  }

  if (a.callouts.length) {
    out.push(a.callouts.map((c) => `**${c.value}** ${c.label}`).join(" · "));
  }

  if (a.sortItems.length) {
    out.push("**Sort it**\n");
    a.sortItems.forEach((s, i) =>
      out.push(
        `${i + 1}. ${s.statement}${opts.withAnswers ? `  → **${s.category}**${s.explanation ? ` (${s.explanation})` : ""}` : "  → ______"}`
      )
    );
  }

  if (a.matchPairs.length) {
    out.push("**Match**\n");
    for (const m of a.matchPairs) {
      out.push(`- ${m.left} → ${opts.withAnswers ? m.right : "______"}`);
    }
  }

  if (a.frames.length) {
    out.push("**Sentence frames**\n");
    for (const f of a.frames) out.push(`- **${f.label}:** ${f.starter}`);
  }

  for (const p of a.prompts) {
    const side = p.side !== "neutral" ? `[${p.side.toUpperCase()}] ` : "";
    out.push(`**${side}${p.label}**`);
    out.push(
      opts.withAnswers && p.expectedAnswer
        ? `> *Expected:* ${p.expectedAnswer}`
        : "> ______________________________________________"
    );
  }

  if (a.keyIdea) out.push(`**Remember this:** ${a.keyIdea}`);
  if (a.standAndDeliver) out.push(`**Say it out loud:** ${a.standAndDeliver}`);
  return out.join("\n\n");
}

export function packToMarkdown(pack: LessonPack, opts: ExportOptions = {}): string {
  const out: string[] = [];
  const heading = [pack.lessonCode, pack.title].filter(Boolean).join(" · ");
  out.push(`# ${heading || "Untitled lesson"}`);
  if (pack.subtitle) out.push(`*${pack.subtitle}*`);

  const meta = [
    pack.series && `**Series:** ${pack.series}`,
    pack.skillFocus && `**Skill:** ${pack.skillFocus}`,
    pack.gradeBand && `**Level:** ${pack.gradeBand}`,
    pack.rigorLevel && `**Rigor:** ${pack.rigorLevel}`,
    pack.durationMin && `**Duration:** ${pack.durationMin} min`,
  ].filter(Boolean);
  if (meta.length) out.push(meta.join("  \n"));
  if (pack.resolution) out.push(`> **Big question:** ${pack.resolution}`);
  if (pack.mission) out.push(`**Today's mission.** ${pack.mission}`);

  if (pack.successCriteria.length) {
    out.push(rule("By the end of today I can…").trim());
    out.push(pack.successCriteria.map((c) => `- [ ] ${c}`).join("\n"));
  }

  if (pack.vocabulary.length) {
    out.push(rule("Word bank").trim());
    for (const v of pack.vocabulary) {
      out.push(
        `**${v.term}** — ${v.definition}${v.analogy ? `  \n*Like:* ${v.analogy}` : ""}`
      );
    }
  }

  if (pack.evidenceCards.length) {
    out.push(rule("Source deck").trim());
    for (const c of pack.evidenceCards) {
      out.push(
        [
          `### Card ${c.id} — ${c.side.toUpperCase()}`,
          `*${[c.author, c.institution, c.year, c.publication].filter(Boolean).join(", ")}*`,
          `**Says:** ${c.paraphrase}`,
          c.translation && `**In plain English:** ${c.translation}`,
          c.tacticalNote && `**How to use it:** ${c.tacticalNote}`,
          // never drop the limit: it is the pack's integrity guarantee
          `**LIMIT — what this card cannot prove:** ${c.limit}`,
        ]
          .filter(Boolean)
          .join("\n\n")
      );
    }
  }

  if (pack.activities.length) {
    out.push(rule("Lesson pages").trim());
    pack.activities.forEach((a, i) => out.push(activityToMarkdown(a, i, opts)));
  }

  if (opts.withAnswers) {
    const g = pack.teacherGuide;
    out.push(rule("Teacher guide").trim());
    const info = [
      g.cohort && `**Cohort:** ${g.cohort}`,
      g.assessment && `**Assessment:** ${g.assessment}`,
      g.materialsChecklist && `**Materials:** ${g.materialsChecklist}`,
      g.nextLesson && `**Next lesson:** ${g.nextLesson}`,
    ].filter(Boolean);
    if (info.length) out.push(info.join("  \n"));
    if (g.timingPlan.length) {
      out.push(`| Time | Phase | Who | What happens |`, `| --- | --- | --- | --- |`);
      for (const r of g.timingPlan) {
        out.push(`| ${r.startMin}–${r.endMin} | ${r.phase} | ${r.who} | ${r.what} |`);
      }
    }
    for (const s of g.launchScripts) out.push(`**${s.title}**\n\n${s.script}`);
    if (g.pitfalls) out.push(`**Prep & pitfalls.** ${g.pitfalls}`);
    if (g.rubric.length) {
      out.push(`| Score | Descriptor |`, `| --- | --- |`);
      for (const b of g.rubric) out.push(`| ${b.score} | ${b.descriptor} |`);
    }

    const keyed = pack.activities.flatMap((a, i) =>
      a.prompts
        .filter((p) => p.expectedAnswer)
        .map((p) => `**p${i + 1} · ${a.title}** — ${p.label}\n\n> ${p.expectedAnswer}`)
    );
    if (keyed.length) {
      out.push(rule("Answer key — teacher only").trim());
      out.push(keyed.join("\n\n"));
    }
  }

  return out.join("\n\n") + "\n";
}

/** Markdown stripped of its syntax — for a plain-text drop into an email. */
export function markdownToPlainText(md: string): string {
  return md
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/^>\s?/gm, "")
    .replace(/^- \[ \]\s+/gm, "[ ] ")
    .replace(/\|/g, "  ")
    .replace(/\n{3,}/g, "\n\n");
}

/**
 * Other content types don't have a bespoke serialiser yet; a readable dump of
 * their fields beats refusing the download.
 */
export function contentToMarkdown(
  type: string,
  content: AnyContent,
  opts: ExportOptions = {}
): string {
  if (type === "lesson-pack") return packToMarkdown(content as LessonPack, opts);
  const def = contentTypeDef(type);
  const lines: string[] = [`# ${def.label}`];
  for (const [k, v] of Object.entries(content as Record<string, unknown>)) {
    if (!v || (Array.isArray(v) && v.length === 0)) continue;
    if (k.startsWith("design") || k === "contentQaJson") continue;
    const label = k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
    lines.push(
      typeof v === "string" || typeof v === "number"
        ? `**${label}:** ${v}`
        : `**${label}**\n\n\`\`\`json\n${JSON.stringify(v, null, 2)}\n\`\`\``
    );
  }
  return lines.join("\n\n") + "\n";
}
