# Ascent Lesson Maker — Senior Product Review

Reviewed against the vision: *"I need tomorrow's lesson" → "I'm ready to teach" in under 10 minutes.*

This review is grounded in measured behaviour from real builds (packs #22, #24, #25, #27), not
inspection alone. Where a claim has a number, the number came from an instrumented run.

---

## Verdict

The generation engine is genuinely strong — arguably the best part of any AI lesson tool I've
seen, because it enforces quality structurally rather than hoping the model behaves: 28 automated
gates, a content-QA pass that catches evidence misattribution, mandatory scope limits on every
source card, and a repair loop that fixes its own failures.

**The product around that engine does not yet deliver the vision.** Three structural problems:

1. **Time-to-ready is 25–40 minutes, not 10.** Not because generation is slow for what it does,
   but because the workflow is serial and the teacher waits through all of it.
2. **The wizard asks for 14 things the AI can infer from one sentence.**
3. **It produces a document, not a taught lesson.** No projector view, no timers, no live-round
   materials — so the teacher still assembles the actual class from the PDF.

The strategic opportunity nobody else can copy: this platform now holds **judged round data and
per-student observations**. Lesson generation informed by what a specific squad actually got wrong
last week is a moat. Nothing in the recommendations below matters more than closing that loop.

---

## Measured baseline

| Stage | Measured | Notes |
|---|---|---|
| Plan from one sentence | 6–11 s | Excellent |
| Full content build | 435–559 s | 7–9 min, streamed by stage |
| Design system | ~90 s | Serial, after content |
| Content QA | ~73 s | Serial, after design |
| QA → revise → re-QA loop | 20–65 s per fix, ×2–4 | #27 needed 7 revisions across 3 QA passes |
| **Realistic time to "ready to teach"** | **25–40 min** | vs. a 10-minute promise |

Other measurements that inform the critique:

- Pack #27 (elite): QA graded **B, not ready** on first pass — it had cited Card D for a claim the
  card contradicts, on the anchor worked example. Third pass reached A. **The engine is right to
  block, but the teacher paid ~6 minutes of waiting to find out.**
- The B/W contrast pass auto-corrected **34 elements** on #27 and **51** on #22. Every correction
  is a place the AI design system produced unreadable print.
- Wizard: **14 labelled fields, 28 pieces of state**.
- **Three** independent styling systems: Style Kits, lesson-design skins, per-pack AI `designCss`.
- **No version history table** — regenerate and revise mutate content in place.

---

## Structural weaknesses

### W1. The wait is serial when it could be parallel and progressive
Content → design → QA run one after another, and the teacher can't use anything until all three
finish. But a teacher reads a pack **in order** and teaches it in order. The cover, the hook and
the first two pages are useful long before page 14 exists.

### W2. The wizard front-loads decisions the AI should make
`planLesson()` already infers subject, skill focus, series, resolution, duration, grade band, rigor
and lesson format from a single sentence — and now the competitive format too. Yet the wizard still
presents lesson code, cover title, accent, emoji, motif, prior knowledge, misconceptions and
constraints. Every one is a decision point before the teacher has seen anything.

### W3. QA findings are prose, not actions
Content QA produces excellent, specific findings ("the p4 model answer cites Card D for shopping
trips; Card D is about disabled adults' car dependence"). The teacher must then **retype that** into
the revision box. The system already knows the page and the fix. This is the single cheapest
high-value fix in the product.

### W4. Two fix surfaces, three styling systems, one workflow that assumes an academy
- `RevisePanel` (pack-wide instruction) and `PagesPanel` (per page) overlap.
- Style Kits vs. skins vs. AI `designCss` — three ways to control appearance, none authoritative.
- Draft → Review → Approved → Published with a role switcher is correct for a multi-coach academy
  and pure friction for a teacher planning tomorrow alone.

### W5. The output is a worksheet pack, not a class
Durations exist per activity. Expected answers exist per prompt. Speech orders and timings now exist
per format. **None of it is used at teaching time.** The teacher prints A4 and runs the class from
memory and a phone timer.

### W6. Destructive AI edits with no undo
`fresh: true` regeneration and per-page rewrites overwrite content permanently. During testing I
watched a revision clobber the wrong page (fixed by matching on title) — the class of bug exists,
and there is no restore.

---

## Recommendations

Ordered by priority. Each follows the requested format.

---

### R1 — Teachable Draft (progressive build)

**Problem solved.** Time-to-ready is 25–40 minutes because nothing is usable until everything is
finished.

**User story.** *"It's 9pm. I need tomorrow's 90-minute novice class. I want something I could
teach from within two minutes, and let it keep improving while I make dinner."*

**How it works.** The build emits a **teachable core first** — cover, mission, success criteria,
hook, I-do, we-do, exit ticket, and the teacher guide — then backfills drills, evidence study,
sparring and transfer pages. A banner reads *"Teachable now · 7 of 14 pages · finishing in the
background."* Print is enabled the moment the core exists. Design and QA start **concurrently with**
the backfill rather than after it.

**AI logic.** Reorder the stage graph: outline → foundation → *core activities* → (emit) →
{remaining activities ∥ design system ∥ evidence deck}. QA runs when activities complete. The pack
is persisted per stage already, so this is a scheduling change, not new generation.

**Complexity.** Medium. **Priority.** Critical. **Impact.** Transformational — it is the difference
between meeting and missing the product's central promise.

---

### R2 — One-Click QA Fixes

**Problem solved.** QA finds precise defects; the teacher retypes them to get them fixed.

**User story.** *"QA says page 4 misuses Card D. I want to press Fix, not write an essay about it."*

**How it works.** Every QA finding — citation verdict, weak activity, answer-key issue — renders
with a **Fix this** button. Pressing it calls the existing revision endpoint with the finding text
as the instruction, scoped to the page the finding names. A **Fix all** button queues them. After
the queue drains, QA re-runs automatically and the grade updates.

**AI logic.** No new prompt. `reviseLessonPack()` already locates targets by exact page title and
applies surgical patches; QA findings already carry `index` and `title`.

**Complexity.** Easy — both halves exist and are verified. **Priority.** Critical.
**Impact.** High. On #27 this would have collapsed seven manual revisions into two clicks.

---

### R3 — Squad Loop: lessons that answer last week's rounds

**Problem solved.** Every AI lesson tool generates from a topic. None generates from *what this
specific squad got wrong*, because none has the data. This platform now does — judged ballots
write per-student observations automatically.

**User story.** *"Three of my eight kids scored 4/10 on refutation on Saturday. Build Tuesday's
lesson about that, and tell me who to pair with whom."*

**How it works.** The builder gains a **"Build from my squad"** entry. It reads the cohort's
observation log, names the weakest and most-slipped skills, and pre-fills the lesson idea:
*"Rebuttal — answering the strongest version. 4 of 8 students rated Emerging or below in the last
two rounds."* The generated pack cites the pattern in the teacher guide, and the pairing suggestion
puts a *Solid* student with a *Not yet* student on the guided-practice page.

**AI logic.** Deterministic selection (`skillStates` + `recommendations` already compute this), then
the existing generation path with `classroomEvidence` populated from real observations rather than
free text. The teaching-signal plumbing already exists — it is currently fed weakly.

**Complexity.** Medium. **Priority.** Critical. **Impact.** Transformational — this is the feature
competitors structurally cannot ship, because they have no round data.

---

### R4 — Classroom Mode

**Problem solved.** The product ends at the PDF. The teacher still runs the class from memory.

**User story.** *"Project the lesson, run the timings, reveal answers when I choose, and don't make
me hold a phone timer."*

**How it works.** A **Teach** button opens the pack full-screen, one activity per view, with: the
activity's own `durationMin` as a countdown; a class-visible timer; arrow-key navigation; an
**answers** toggle (already implemented in print); and — for sparring pages — the format's real
speech sequence from the debate-format registry, so the timer follows *Constructive 4:00 →
Crossfire 3:00 → Rebuttal 4:00* rather than one flat block.

**AI logic.** None. Every input already exists: durations, expected answers, speech orders, prompts.

**Complexity.** Medium. **Priority.** High. **Impact.** High — it converts a document into a taught
class and removes the last reason to open slides.

---

### R5 — One-Box Build

**Problem solved.** 14 fields before the teacher sees anything.

**User story.** *"I type one sentence. If the AI guessed wrong, I correct the guess — I don't fill
a form."*

**How it works.** The default screen is a single text box. On submit, the plan renders as a row of
**editable chips**: `Debate · 90 min · Grades 6–8 · Standard · Public Forum · Weighing`. Tapping a
chip changes it. Everything else — code, cover title, accent, emoji, motif — is generated and lives
behind "Advanced" for the rare teacher who cares. Prior knowledge and misconceptions are inferred
from the series' earlier lessons, which the system already digests.

**AI logic.** `planLesson()` already returns all of it. This is a UI deletion, not a new capability.

**Complexity.** Easy. **Priority.** High. **Impact.** High — largest reduction in clicks and
cognitive load available.

---

### R6 — Version History with one-click restore

**Problem solved.** AI edits are destructive and there is no undo.

**User story.** *"That regeneration made page 9 worse. Put it back."*

**How it works.** A snapshot row before every AI mutation (generate, revise, regenerate-section,
design). The material page shows a compact timeline — *"Regenerated page 9 · 14:22 · Coach"* — with
Preview and Restore. Diffs highlight what changed.

**AI logic.** None.

**Complexity.** Easy (one table, one JSON blob per mutation).
**Priority.** High. **Impact.** Medium — but it is the difference between a teacher trusting the AI
buttons and avoiding them.

---

### R7 — Round Kit (auto-generated live-round materials)

**Problem solved.** Running an actual round needs materials the pack doesn't produce: speech-order
cards, a timer sheet, flow paper, ballots. Teachers assemble these by hand, per format.

**User story.** *"We're running PF practice on Thursday. Give me everything the room needs."*

**How it works.** Any pack whose format is set produces a printable **Round Kit** appendix:
speech-order card with real timings and each speech's burden, a blank flow sheet with columns
matching that format's speeches, prep-time tracker, and the cohort's ballot. All of it is already
modelled in `lib/debate-formats.ts` (6 formats, 46 speech slots).

**AI logic.** None — pure rendering of reference data.

**Complexity.** Easy. **Priority.** High. **Impact.** High, and it is *unique*: no general-purpose
EdTech tool models speech order per format.

---

### R8 — Clash Map (the artefact debate teachers actually draw)

**Problem solved.** The one thing experienced debate coaches draw on a whiteboard — the map of how
arguments collide — is exactly what no tool generates.

**User story.** *"Show the class where this motion actually clashes, so they stop debating past
each other."*

**How it works.** A one-page visual per motion: Prop arguments left, Opp right, lines connecting
them at the point of clash, with the warrant under each line named. Printable and projectable.
Motions in the library already carry `proArguments`, `conArguments` and `keyClash`, so seeded
motions render one immediately; a generated pack derives it from its own evidence deck.

**AI logic.** Small structured call: given the arguments, return clash pairs and the contested
warrant. Deterministic layout.

**Complexity.** Medium. **Priority.** Medium. **Impact.** High — highly distinctive, and it teaches
the single hardest novice concept.

---

### R9 — Differentiation Lanes

**Problem solved.** Debate squads are radically mixed — a first-week novice and a national qualifier
sit in the same room. One pack currently targets one level.

**User story.** *"Same lesson, same motion, three levels of scaffolding, printed as one pack."*

**How it works.** On any production page, an optional **lane** switch prints three variants: frames
provided / frames removed / no scaffold plus a complication. The teacher prints the mix they need
(e.g. 4 × novice, 2 × varsity).

**AI logic.** Reuses the existing per-page regeneration with the rigor guidance swapped — the elite
and foundational rubrics already exist.

**Complexity.** Medium. **Priority.** Medium. **Impact.** High for mixed squads, which is most of
them.

---

### R10 — Teaching Profile (visible, steerable memory)

**Problem solved.** The system already learns — correction tags, exemplar selection, design memory,
recurring-correction guidance — but the teacher cannot see or steer any of it. Invisible memory is
indistinguishable from randomness.

**User story.** *"Show me what you've learned about how I teach, and let me correct it."*

**How it works.** A single page: *"You teach 90-minute classes · You cut scene pages 4 times · Your
students' weakest skill is weighing · You prefer Public Forum vocabulary."* Each line is toggleable
and feeds the generation hints.

**AI logic.** Aggregate existing corrections + observations + material metadata. No new model calls.

**Complexity.** Medium. **Priority.** Medium. **Impact.** Medium–High — it converts an invisible
feedback loop into a trust-building one.

---

### R11 — Solo Mode (make the workflow optional)

**Problem solved.** Draft → Review → Approved → Published, role switching, and a review queue are
correct for an academy and pure friction for one teacher at 9pm.

**How it works.** A workspace setting. **Solo:** drafts and published only; quality gates still run
but present as a checklist on the pack, not as a submission wall. **Academy:** today's behaviour.

**AI logic.** None.

**Complexity.** Easy. **Priority.** Medium. **Impact.** Medium — removes the biggest source of
"why won't it let me" friction for the single-teacher case.

---

### R12 — Design Presets, not from-scratch CSS

**Problem solved.** The AI authors a full stylesheet per pack (~20k tokens, ~90 s) and the results
still needed 34 and 51 automatic contrast repairs. That is an expensive way to be unreliable.

**How it works.** Ship 6–8 hand-built, print-verified house styles (Dossier, Broadsheet, Field
Manual, Exhibition, Lab Notebook, Playground). The AI **selects** one and varies palette, motif and
type within validated bounds instead of writing structure from zero. Full generative design remains
available as "Surprise me".

**AI logic.** Selection + constrained variation, not authorship.

**Complexity.** Medium. **Priority.** Medium. **Impact.** High for consistency and cost; removes the
main source of unreadable print.

---

### R13 — Tournament Back-Planner

**Problem solved.** Coaches plan backwards from a competition date, and no tool models that.

**User story.** *"State quals are 6 April. Build the seven weeks between now and then."*

**How it works.** Enter the date and the squad. The system emits a week-by-week unit — skills first,
motion-specific prep in the middle, full practice rounds and judge-adaptation last — with each week
as a real lesson in the existing unit builder. Weak skills from the observation log are scheduled
early, where there is still time to fix them.

**AI logic.** Deterministic scheduling skeleton + existing unit generation.

**Complexity.** Medium. **Priority.** Medium. **Impact.** High for competitive programmes.

---

## Remove or merge

| Thing | Verdict | Why |
|---|---|---|
| `RevisePanel` (pack-wide fix box) | **Merge** into PagesPanel + QA fix-its | Two overlapping surfaces for the same job; per-page is more accurate and QA fixes are more actionable |
| Style Kits × skins × `designCss` | **Merge** to one system (R12) | Three styling models, none authoritative; a teacher cannot predict what changes what |
| Wizard fields: lesson code, cover title, accent, emoji, motif | **Remove** from the default flow | All are AI-generated well; each is a decision before the teacher has seen anything |
| Activity `body` (legacy prose) | **Delete** | Already structurally suppressed; keeping it invites walls of text |
| "Quality Insights" analytics page | **Merge** into a single Coach dashboard | Currently thin and material-centric; far more valuable joined to student observations |
| The 6 empty stub packs | **Delete** | Now findable via the *Empty shells* filter |
| Static `design-mono-safe` checklist item | **Remove** | Superseded by the runtime contrast pass; the static version can't see `var()` colours |

---

## Redesigned core workflow

**Today:** wizard (14 fields) → plan → build 7–9 min → design 90 s → QA 73 s → read prose findings →
retype fixes → re-QA → submit → gates → print.

**Proposed:**

1. **One box.** "90-minute novice class tomorrow, they're weak on rebuttal."
   *(or* **Build from my squad** *— zero typing, reads the observation log)*
2. **Chips confirm the inferred plan.** Tap to change anything. One click to build.
3. **~90 s: Teachable Draft.** Cover, hook, I-do, we-do, exit ticket, teacher guide. Print enabled.
   Remaining pages, design and QA continue in the background.
4. **Findings arrive as buttons.** *Fix all* → surgical patches → automatic re-QA.
5. **Teach.** Classroom Mode with per-activity timers and format-accurate speech timings; Round Kit
   prints alongside.

Typing: one sentence. Clicks to a teachable lesson: **two**. Time to teachable: **~90 seconds**.

---

## Sequencing

**Now (unlocks the promise):** R2 one-click QA fixes → R5 one-box build → R1 teachable draft.
Together these take time-to-ready from ~30 minutes to a couple of minutes, and two of the three are
Easy.

**Next (makes it a teaching system):** R4 Classroom Mode, R7 Round Kit, R6 version history.

**Then (builds the moat):** R3 Squad Loop, R10 Teaching Profile, R13 Back-Planner.

**Ongoing:** R12 design presets, R9 lanes, R8 clash map, R11 solo mode.

The order matters: R3 is the most defensible feature in this document, but it is worth little if
the teacher abandons the build at minute twenty. Fix the promise first, then build the moat.
