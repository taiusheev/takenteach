# Ascent Academy Platform — Build Blueprint

**One platform. Three subject tracks. Built in phases, not all at once.**

---

## 0. Vision

A single internal site where any teacher can build high-quality lesson materials — for **Debate**, **Critical Thinking**, and **Academic Writing** — fast, in a consistent style, with quality that improves over time instead of degrading with scale. Replaces: founder hand-building packs, unreviewed AI drafts, and a weak feedback tool.

**Non-negotiables carried over from existing practice:**
- No fabricated citations, ever — every evidence/source claim is structurally forced, not free-typed
- Scope limits mandatory wherever evidence is used
- WCAG AA accessibility throughout
- Print-ready output
- Resolution/unit language stays consistent across every artifact in a unit

---

## 1. System modules (what the site is made of)

| Module | Purpose |
|---|---|
| **Materials Builder** | Structured authoring for every content type, across all 3 subject tracks |
| **Style Kits** | Reusable visual + structural identity, assignable per semester/cohort |
| **Memory & Quality Engine** | Approved-lesson corpus, AI drafting grounded in it, correction-pattern capture |
| **Review & Publish Workflow** | Draft → Review → Approved → Published, role-gated |
| **Feedback & Judging** | TA/judge structured feedback on lessons and rounds (replaces the current weak site) |
| **Training Hub** | Onboarding + calibration for new TAs/judges |
| **Semester Planner** | Calendar view of what's built/scheduled across cohorts, flags gaps/duplicates |
| **Analytics** | Approval times, correction patterns, quality trends, judge consistency |
| **Library & Search** | Full-text search across everything ever published, remix/fork from existing materials |

---

## 2. Content type catalog

Each type = a structured schema (fields, not a blank text box). Same engine, different shapes.

| Content type | Debate | Crit. Thinking | Writing |
|---|:---:|:---:|:---:|
| Full Lesson Pack | ✓ | ✓ | ✓ |
| Class Plan (lightweight) | ✓ | ✓ | ✓ |
| Reading Passage / Article (leveled variants) | | ✓ | ✓ |
| Worksheet / Drill Sheet | ✓ | ✓ | ✓ |
| Vocabulary Set | ✓ | ✓ | ✓ |
| Rubric / Assessment | ✓ | | ✓ |
| Evidence Brief / Case File | ✓ | | |
| Judge Ballot / Feedback Form | ✓ | | |
| Prompt + Model Response | | | ✓ |
| Argument Map / Fallacy Spotter | ✓ | ✓ | |
| Unit Overview (multi-lesson arc) | ✓ | ✓ | ✓ |

---

## 3. Style Kits

A saved bundle: palette, typography, cover template, tone-of-voice, resolution/unit language, structural rules (page minimums, word bank rules, citation format).

- Teacher selects a kit when starting a build — everything inherits automatically
- Founder can **lock** fields (unoverridable) vs. leave others flexible
- One kit per semester/cohort keeps every teacher's output visually and structurally identical

---

## 4. Memory & Quality Engine (how "gets better over time" actually works)

1. **Approved-lesson corpus** — every published lesson becomes a tagged reference example (subject, type, style, grade)
2. **Retrieval-grounded drafting** — new AI drafts pull the closest high-quality approved examples as grounding, not a blank prompt
3. **Correction capture** — every founder/coach edit or rejection is tagged with a reason (e.g. "missing scope limit," "off-resolution," "reading level too high")
4. **Pattern → automated check** — recurring correction tags get converted into checklist rules (like the evidence-integrity checklist), so known failure modes get caught automatically, not just noticed again by a human

---

## 5. Roles & permissions

| Role | Can build | Can review/approve | Can publish | Manages Style Kits |
|---|:---:|:---:|:---:|:---:|
| Founder | ✓ | ✓ | ✓ | ✓ |
| Coach | ✓ | ✓ (own track) | ✓ (own track) | — |
| Teacher | ✓ (Quick Build default) | — | Earns auto-publish after track record | — |
| TA / Judge | Feedback only | — | — | — |

---

## 6. Build modes

- **Quick Build** — pick type + subject + style kit + topic → AI drafts full first pass, grounded in the corpus → user refines structured fields
- **Full Build** — every field exposed from scratch (what the Lesson Builder prototype already demonstrates)
- **Snippet Library** — reusable blocks (warm-up, rubric band, word bank set) draggable into any material

---

## 7. Extras to fold in as they come up naturally

- Fact/citation guard — cross-check citations against a verified source library before publish
- Reading-level variants — auto-generate simplified/advanced versions of the same passage
- Multi-format export — one source → print PDF / Google Classroom doc / student vs. teacher edition
- Version history + inline comments (Google-Docs style)
- Remix/fork — start from an approved lesson, swap topic, keep structure + style

---

## 8. Build order — phase by phase

Each phase should be fully working and demoable before the next one starts. Don't parallelize early phases — the schema decisions in Phase 1 and 2 get inherited by everything after.

### **Phase 1 — Core Engine (Debate track only)**
*Goal: prove the builder + workflow + checklist pattern end to end.*
- Lesson Pack schema for Debate (already prototyped)
- Draft → Review → Approved → Published workflow, role-gated
- Evidence-integrity checklist (citation + scope limit + word bank rules)
- One default Style Kit
- Print preview
- **Exit criteria:** a coach can build a full Debate lesson pack, a founder can review and publish it, and it renders correctly in print preview.

### **Phase 2 — Style Kits + Multi-Type (still Debate only)**
*Goal: prove style consistency and content-type variety before multiplying subjects.*
- Style Kit system: create, lock fields, assign to cohort/semester
- Add 2–3 more Debate content types (Class Plan, Vocabulary Set, Judge Ballot)
- Library + search across everything built so far
- **Exit criteria:** two different coaches build materials in the same Style Kit and the output is visually/structurally identical; search finds any past material by keyword.

### **Phase 3 — Expand to Critical Thinking + Academic Writing**
*Goal: prove the schema generalizes across subjects.*
- Reading Passage / Article schema with leveled variants
- Rubric / Assessment schema
- Prompt + Model Response schema
- Subject-specific checklists (equivalent of evidence-integrity, but for reading level / rubric alignment / prompt clarity)
- **Exit criteria:** all three tracks have at least 3 working content types each, using shared Style Kits.

### **Phase 4 — AI Quick Build + Memory Engine**
*Goal: the "gets better over time" mechanic goes live.*
- Approved-lesson corpus with tagging
- Retrieval-grounded AI drafting (Quick Build mode)
- Correction-tag capture on every edit/rejection
- First pass at converting recurring correction tags into automated checklist rules
- **Exit criteria:** a Quick Build draft visibly improves in quality as more lessons get published and tagged — measurable via fewer correction tags per new draft over time.

### **Phase 5 — Feedback & Judging Module**
*Goal: replace the current weak feedback site.*
- Structured feedback forms tied to specific lessons/rounds
- Judge Ballot content type wired into the feedback loop
- Feedback data feeds quality signal back into the Memory Engine
- **Exit criteria:** a judge can submit structured feedback on a round in under 2 minutes, and founder can see aggregated patterns (e.g. most-flagged lesson).

### **Phase 6 — Training Hub**
- New TA/judge onboarding flow
- Calibration exercises using real (anonymized) past feedback data
- **Exit criteria:** a new TA can complete onboarding and a calibration exercise entirely in-platform.

### **Phase 7 — Semester Planner + Analytics**
- Calendar view across cohorts, gap/duplicate detection
- Analytics dashboard: approval time, correction-pattern trends, judge consistency
- **Exit criteria:** founder can answer "what's missing this semester" and "which lesson type gets corrected most" without leaving the dashboard.

### **Phase 8 — Polish extras**
- Fact/citation guard, reading-level auto-variants, multi-format export, version history + comments, remix/fork
- Pull items from this list based on what Phases 1–7 revealed as most painful in practice

---

## 9. Open decisions — RESOLVED 2026-07-18

- [x] Stack: **Next.js (App Router, TypeScript, Tailwind) + SQLite** (better-sqlite3). Real auth deferred — Phase 1 uses a role switcher (Founder/Coach/Teacher/TA) to prove role gating without accounts.
- [x] First-wave users: internal (user + founder) — role switcher is sufficient until real coaches join.
- [x] Phase 1 test case: user will provide the existing Lesson Builder prototype and a real UBI Debate lesson; the Lesson Pack schema stays in a single module so it can be validated/adjusted against that content when it arrives.
