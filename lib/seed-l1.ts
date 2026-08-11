import { type LessonPack, lessonPackSchema } from "./lesson-pack-schema";

/**
 * Seed material: Lesson 1 of the real UBI Novice series ("The Argument
 * Sandwich"), transcribed from ascent_UBI_hub_6.html. Content is verbatim from
 * the approved pack — evidence cards, vocabulary, and timing plan included —
 * so the Phase 1 schema is validated against real material, not placeholders.
 * (Evidence card E and the launch-script bodies were not transcribed; the
 * cards below are A–D.)
 */
export function seedLessonL1(): LessonPack {
  return lessonPackSchema.parse({
    lessonCode: "L1",
    title: "THE ARGUMENT SANDWICH",
    subtitle: "Topic Intro & The PEEL Argument",
    skillFocus: "PEEL Structure",
    series: "UBI Novice",
    resolution:
      "Resolved: Asia-Pacific governments should adopt universal basic income.",
    durationMin: 120,
    accentColor: "#0369a1",
    emoji: "🌏",
    mission:
      "An argument without all four layers is like a sandwich with no filling. Today you will learn to build Point → Evidence → Explain → Link — the engine behind every winning speech.",
    successCriteria: [
      "Label all four PEEL layers in an argument",
      "Tell a fact from an opinion in debate",
      "Write a complete PEEL with a real source",
      "Deliver my PEEL aloud and confirm 4 layers",
    ],
    vocabulary: [
      {
        term: "Resolution",
        definition:
          'The statement both teams debate. Always starts with "Resolved." The whole match is about proving whether the resolution is TRUE (Pro) or FALSE (Con).',
        analogy:
          'A resolution is the "question" on a quiz. Both teams are graded on how well they answer it.',
      },
      {
        term: "Basic Income",
        definition:
          "A regular cash payment a government gives to people with few or no conditions. In this topic, PRO defends broad, unconditional cash support for Asia-Pacific governments.",
        analogy:
          "A government allowance — like your parents giving you $20 every week, no chores required.",
      },
      {
        term: "PEEL",
        definition:
          "Point → Evidence → Explain → Link. The four-layer structure of a complete debate argument. You need ALL four layers every time.",
        analogy:
          "A sandwich. Top bread (Point) + Filling 1 (Evidence) + Filling 2 (Explain, your analysis) + Bottom bread (Link). Miss a layer = it falls apart.",
      },
      {
        term: "Impact",
        definition:
          'Why your argument matters to real people. IMPACT always lives in your Link layer. It answers the judge\'s most important question: "So what? Why should I care?"',
        analogy: "The punchline of a joke. Without it, nothing lands.",
      },
    ],
    evidenceCards: [
      {
        id: "A",
        side: "pro",
        institution: "World Bank Group",
        author: "",
        year: "2025",
        publication:
          "Future Jobs: Robots, AI, and Digital Platforms in East Asia and Pacific",
        paraphrase:
          "Robots in five ASEAN countries (2018–2022) created about 2 million skilled jobs — but also wiped out about 1.4 million low-skill jobs. The people who lost out most are those without technical skills.",
        translation:
          "Robots are creating good jobs for people with skills, but wiping out jobs for people without skills. That gap leaves real families without income.",
        tacticalNote:
          'Pro uses this to prove automation creates a losers group that needs government support. Connect to basic income as the "income floor" during transition.',
        limit:
          'This covers 5 ASEAN countries, 2018–2022 only. It does NOT prove UBI is the only policy solution, that every Asia-Pacific worker is equally affected, or that automation displacement is happening at the same rate in all countries. Do not say "this proves automation is destroying jobs everywhere."',
      },
      {
        id: "B",
        side: "pro",
        institution: "Gyeonggi Research Institute",
        author: "Young Seong Yoo",
        year: "2021",
        publication:
          "Gyeonggi Youth Basic Income Survey Report (pilot began 2019)",
        paraphrase:
          "South Korea's Gyeonggi Province paid eligible 24-year-old residents 250,000 won quarterly in local currency. GRI surveys reported positive effects on life satisfaction, happiness, welfare awareness, and labor motivation among recipients.",
        translation:
          "In South Korea, young people who received the cash payment became happier and were more motivated to find work — not less motivated, which is what critics fear.",
        tacticalNote:
          'Pro uses this as real-world proof from Asia that basic income improves wellbeing and labor motivation. This directly defeats the "people will stop working" Con argument.',
        limit:
          'This was one province, restricted to 24-year-olds, and paid in regional-currency vouchers, not cash. It does NOT prove a permanent, national UBI works for all ages or all of Asia-Pacific. Do not say "South Korea proved basic income works." Say: "A Gyeonggi Province survey found positive wellbeing effects among 24-year-old recipients."',
      },
      {
        id: "C",
        side: "con",
        institution: "International Monetary Fund",
        author: "",
        year: "2017",
        publication: "Fiscal Monitor: Tackling Inequality",
        paraphrase:
          "The IMF found that a basic income set at 25% of median wages would cost about 6.5% of GDP in wealthier countries. That's a massive chunk of a government's budget.",
        translation:
          "This is a huge bill. Paying 6.5% of the entire economy on one program would force governments to cut schools, roads, or hospitals.",
        tacticalNote:
          "Con shows the fiscal tradeoff is enormous. Even a modest payment creates budget pressure that forces cuts elsewhere.",
        limit:
          "This models advanced economies only. It proves high fiscal cost — NOT that governments cannot raise taxes to pay for it, or that no country could afford it. Do not apply 6.5% to developing Asia-Pacific countries without adjustment.",
      },
      {
        id: "D",
        side: "con",
        institution: "World Bank Group",
        author: "",
        year: "2020",
        publication:
          "Exploring Universal Basic Income: A Guide to Navigating Concepts, Evidence, and Practices",
        paraphrase:
          "World Bank UBI simulations warn that budget-neutral universal transfers can leave the poor worse off. In India, Brazil, and Indonesia, roughly half of the poorest households can lose compared to existing targeted programs.",
        translation:
          "If a government replaces existing help-the-poor programs with universal cash at the same budget, many of the very poorest families end up with LESS money than before.",
        tacticalNote:
          'Con proves "universal" does not mean "better for everyone." Replacing targeted programs with UBI can actively harm the poorest households.',
        limit:
          'This applies to budget-neutral replacement models only — UBI replacing existing targeted programs with no new funding. It does NOT prove that a fully funded, additive basic income would harm the poor. Do not say "basic income always hurts the poor."',
      },
    ],
    activities: [
      {
        kind: "hook",
        title: "THE ARENA",
        badge: "BASELINE HOOK · 12 MIN",
        durationMin: 12,
        instructions:
          "🃏 You received a BLUE (PRO) or RED (CON) card at the door. Find someone with the opposite card. You have 60 seconds to convince them. Use ANY reason you have. Ready? Go!",
        body: "A debate ARGUMENT = Claim + Reason + Evidence. An OPINION = just a feeling with no proof.",
        prompts: [
          {
            label:
              "PRO — Why SHOULD Asia-Pacific governments give people regular cash?",
            side: "pro",
            expectedAnswer:
              "Answers vary. Strong answers give a specific reason with 'because' — e.g. 'Because robots are taking factory jobs and workers need a safety net.' Weak answers: 'Because it's good.'",
          },
          {
            label:
              "CON — Why SHOULDN'T Asia-Pacific governments give people regular cash?",
            side: "con",
            expectedAnswer:
              "Answers vary. Strong answers give a specific reason — e.g. 'Because it costs too much money and could bankrupt the government.' Weak answers: 'Because it's a bad idea.'",
          },
          {
            label: "Debrief — What did your opponent say? Write their best reason:",
            side: "neutral",
            expectedAnswer: "Answers vary. Students note the opponent's key claim.",
          },
        ],
        standAndDeliver:
          'Find a NEW partner with the SAME card color. Together, write ONE sentence using the word "because" that gives a real reason for your side. Then read it aloud to the class. 30 seconds. GO!',
      },
      {
        kind: "topic-intel",
        title: "TOPIC INTEL",
        badge: "WHAT IS BASIC INCOME?",
        durationMin: 10,
        instructions:
          "Listen first — no writing yet. Follow along as your teacher walks through what basic income is and why Asia-Pacific is debating it right now.",
        body:
          "Basic income = a regular cash payment a government gives directly to people. No job requirement. No test. Just money. Some countries call it UBI (Universal Basic Income). The resolution says \"basic income,\" not \"UBI\" — UBI is one type of basic income that goes to everyone, no conditions. In this debate, PRO defends broad, unconditional cash support. Why now? Robots and AI are replacing low-skill jobs across the region, and countries like South Korea and Japan are asking what they owe workers left behind by technology.",
        prompts: [],
        standAndDeliver: "",
      },
      {
        kind: "vocabulary",
        title: "VOCABULARY DRILL",
        badge: "4 CORE TERMS + MATCHING",
        durationMin: 7,
        instructions:
          "Your teacher explains the 4 core terms with analogies. Then complete the matching activity in pairs, followed by quick-fire cold-call.",
        body: "",
        prompts: [
          {
            label: 'Quick-fire: "PEEL stands for ___, Evidence, ___, Link."',
            side: "neutral",
            expectedAnswer: "Point, Explain",
          },
          {
            label:
              'Quick-fire: "The ___ layer is where your Impact lives — it brings everything home."',
            side: "neutral",
            expectedAnswer: "Link",
          },
        ],
        standAndDeliver: "",
      },
      {
        kind: "exit-ticket",
        title: "EXIT TICKET",
        badge: "COLLECTED AT DOOR",
        durationMin: 8,
        instructions:
          "Complete the exit ticket solo. Your PEELs are collected — they are the raw material for Lesson 2 Contentions.",
        body: "",
        prompts: [
          {
            label: "Write one complete PEEL for your assigned side, citing a card.",
            side: "neutral",
            expectedAnswer:
              "A complete PEEL: Point (1 sentence claim), Evidence (card cited with source + year), Explain (own words, not copied), Link (uses resolution words).",
          },
        ],
        standAndDeliver: "",
      },
    ],
    teacherGuide: {
      cohort: "Novice · Zero Prior Exp.",
      assessment: "PEEL + Exit Ticket",
      nextLesson: "L2: Full Contention",
      materialsChecklist:
        "Student packets (printed or device) · PEEL sandwich whiteboard visual · Blue + Red cards (pre-assigned at door) · 5 evidence cards per student (or 1 deck shared at table) · Timer visible to class · Fact vs. Opinion sort strips (optional physical cut-outs) · PEEL checklist strip (1 per student) · Exit Ticket collected at end",
      timingPlan: [
        { startMin: 0, endMin: 5, phase: "Entry & Hook Setup", who: "T", what: "Pre-assign Blue/Red cards at door. No explanation. Say script #1. Students find an opposite-card partner. Page 2 is open." },
        { startMin: 5, endMin: 17, phase: "Hook Spar + Debrief", who: "Ss", what: '60-sec spar. Debrief: "Who gave a reason? Who just felt strongly?" Write ARGUMENT = CLAIM + REASON + EVIDENCE on board. Students complete Page 2 key concept boxes.' },
        { startMin: 17, endMin: 27, phase: "Topic Intro: What is Basic Income?", who: "T", what: "Script #2. Direct instruction: definition, who's experimenting (Korea, Japan), core tension (dignity floor vs. work disincentive vs. fiscal cost). Students follow on Page 3. No writing yet — listen only." },
        { startMin: 27, endMin: 30, phase: "What Pro Must Prove", who: "T", what: "Clarify Pro's burden: broad, unconditional cash support — not every AP country doing the same thing tomorrow. Students fill Page 3 comprehension blanks." },
        { startMin: 30, endMin: 37, phase: "Vocabulary Drill", who: "T+Ss", what: "Page 4. Teacher explains 4 core terms with analogies. Matching activity in pairs. Quick-fire cold-call. Introduce Warrant + Contention briefly (no testing)." },
        { startMin: 37, endMin: 47, phase: "I Do: PEEL Sandwich Model", who: "T", what: 'Script #3. Draw sandwich on board. Deliver full model argument live. Students label layers on Page 5. Ask: "Which layers were bread? Which were filling?"' },
        { startMin: 47, endMin: 60, phase: "We Do: Label & Fix", who: "T+Ss", what: "Pages 6–7. Pairs: label Argument A, fix missing layer in B. Cold-call random pairs — NOT volunteers. Correct live on board." },
        { startMin: 60, endMin: 68, phase: "Fact vs. Opinion Drill", who: "T+Ss", what: 'Script #4. Page 7 eight-statement sort. Debrief cold-call: "Why is \'most experts say\' unsupported?" Write Evidence Rule on board.' },
        { startMin: 68, endMin: 75, phase: "Evidence Deck Study", who: "Ss", what: "Students read Cards A–E silently (Pages 8–9). Highlight: source, year, TRANSLATION, HOW TO USE, LIMIT. Teacher circulates — check students are reading LIMIT notes." },
        { startMin: 75, endMin: 88, phase: "Scaffolded Build", who: "Ss", what: "Pages 10–11. PRO side does Page 10, CON does Page 11 simultaneously. Teacher circulates: (1) evidence sourced? (2) Explain NOT copied? (3) Link has resolution words?" },
        { startMin: 88, endMin: 103, phase: "Independent Build", who: "Ss", what: "Script #5. Pages 12–13 — students write free-form PEELs solo. No talking. Circulate with checklist: Point = 1 sentence? Evidence = source + year? Explain = own words? Link = resolution words?" },
        { startMin: 103, endMin: 112, phase: "Oral Sparring", who: "Ss", what: 'Script #6. Page 14. Crossfire rounds 1–3. Circulate — listen for vague feedback ("it was good") and model specific feedback live.' },
        { startMin: 112, endMin: 120, phase: "Exit Ticket + L2 Bridge", who: "T", what: "Script #7. Students complete Page 15 Exit Ticket. Collect all PEELs — raw material for L2 Contentions. Briefly preview L2." },
      ],
      launchScripts: [],
      pitfalls:
        "Circulation checks during builds: (1) evidence sourced? (2) Explain NOT copied from the card? (3) Link contains resolution words? Listen for vague oral feedback ('it was good') and model specific feedback live.",
      rubric: [],
    },
  });
}
