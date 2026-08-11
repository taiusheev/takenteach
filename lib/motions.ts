import { DEBATE_FORMAT_IDS } from "./debate-formats";

/**
 * The Motion Library.
 *
 * Until now a resolution was a free-text field retyped into every pack, so the
 * same motion existed in six slightly different wordings and nothing was reusable.
 * A motion is its own object: the wording, plus the briefing a coach would
 * otherwise write by hand — background, the definitional fight, the arguments
 * each side will run, and where the round actually clashes.
 *
 * The seed set below is curated by hand rather than generated: motion wordings
 * are conventions, and a hallucinated "standard motion" is worse than none. Every
 * entry is either a real circuit motion or a standard classroom formulation.
 */

export const MOTION_TOPICS = [
  "Education",
  "Technology",
  "Environment",
  "Economics",
  "Politics & Governance",
  "Ethics & Philosophy",
  "Health",
  "Media & Culture",
  "International Relations",
  "Sport",
] as const;
export type MotionTopic = (typeof MOTION_TOPICS)[number];

export const MOTION_LEVELS = ["beginner", "intermediate", "advanced", "tournament"] as const;
export type MotionLevel = (typeof MOTION_LEVELS)[number];

export interface Motion {
  id: string;
  /** the motion exactly as it would be announced */
  text: string;
  topic: MotionTopic;
  level: MotionLevel;
  /** format ids this wording suits; empty = works in any format */
  formats: string[];
  /** the age band this is genuinely debatable for */
  ageBand: string;
  /** what a coach needs to know before running it */
  background: string;
  /** the definitional ground — where teams will fight over meaning */
  definitions: string;
  /** what Proposition/Affirmative will run */
  proArguments: string[];
  /** what Opposition/Negative will run */
  conArguments: string[];
  /** the clash the round actually turns on */
  keyClash: string;
  /** the debating skill this motion is good for teaching */
  skillFocus: string;
}

/**
 * Seed library. Small and real beats large and invented — this is the set a
 * coach can walk into a classroom with today, and it covers every level, every
 * topic family, and the formats the platform models.
 */
export const SEED_MOTIONS: Motion[] = [
  {
    id: "phones-schools",
    text: "This house would ban smartphones in schools",
    topic: "Education",
    level: "beginner",
    formats: [],
    ageBand: "Grades 6–8",
    background:
      "Several countries (France, parts of Australia, the Netherlands) have introduced school phone bans since 2018. Studies on outcomes are mixed and often small.",
    definitions:
      "Ban usually means during class and break, not confiscation at the gate. Opposition often narrows it to lesson time only — settle scope early or the round is two ships passing.",
    proArguments: [
      "Attention: phones fragment focus, and the distraction reaches students who aren't even using one",
      "Bullying moves online during the school day and follows students home",
      "Equality: visible phone brands become a status marker",
    ],
    conArguments: [
      "Safety and contact with parents, especially on long commutes",
      "Phones are a learning tool — research, translation, accessibility",
      "Bans teach avoidance, not self-regulation, which students need after school",
    ],
    keyClash:
      "Does removing the device build attention, or just postpone the moment students have to manage it themselves?",
    skillFocus: "Comparing everyday costs and benefits — a first weighing motion",
  },
  {
    id: "homework-abolish",
    text: "This house would abolish homework for primary school students",
    topic: "Education",
    level: "beginner",
    formats: [],
    ageBand: "Grades 4–5",
    background:
      "Finland's low-homework model is often cited; research suggests homework has little measurable benefit before roughly age 11 and more thereafter.",
    definitions:
      "Primary = up to about age 11. Reading for pleasure is usually excluded — say so, or the debate collapses into 'you'd ban reading'.",
    proArguments: [
      "Little measurable learning gain at this age",
      "Family time and play matter developmentally",
      "Homework advantages children with quiet homes and available parents",
    ],
    conArguments: [
      "Builds habits and independence early",
      "Lets parents see what their child is learning",
      "Practice consolidates reading and number fluency",
    ],
    keyClash: "Is early homework building habits, or widening the gap between home environments?",
    skillFocus: "Making a claim with a reason — first PEEL practice",
  },
  {
    id: "ai-artists",
    text: "This house believes that AI-generated art is a threat to human creativity",
    topic: "Technology",
    level: "intermediate",
    formats: [],
    ageBand: "Grades 9–10",
    background:
      "Generative image tools became mainstream from 2022. Disputes centre on training data, displacement of commercial illustrators, and what authorship means.",
    definitions:
      "'Threat to creativity' is the contested term: threat to working artists' livelihoods, or to creativity as a human capacity? Opposition should force the distinction.",
    proArguments: [
      "Displaces the commercial work that funds artists while they develop",
      "Training on artists' work without consent or payment",
      "Homogenises style toward whatever the model was trained on",
    ],
    conArguments: [
      "Every tool from photography to sampling drew the same objection",
      "Lowers the barrier for people without training or money",
      "Creativity is in the intent and the editing, not the brushstroke",
    ],
    keyClash:
      "Is the harm to the profession of art the same as harm to creativity itself?",
    skillFocus: "Separating a definition fight from a substantive clash",
  },
  {
    id: "social-media-16",
    text: "This house would prohibit social media accounts for under-16s",
    topic: "Technology",
    level: "intermediate",
    formats: ["public-forum", "wsdc", "asian-parliamentary"],
    ageBand: "Grades 9–10",
    background:
      "Australia legislated an under-16 ban in 2024; several EU states have debated similar measures. Enforcement and age verification are the practical sticking points.",
    definitions:
      "Does 'social media' include messaging apps, gaming platforms, YouTube? The mechanism (who verifies age, what penalty) belongs to Proposition.",
    proArguments: [
      "Adolescent mental-health correlations with heavy use",
      "Algorithmic feeds are designed for compulsion, not consent",
      "Removes the collective-action trap where no individual teen can opt out",
    ],
    conArguments: [
      "Age verification requires identifying every user, including adults",
      "Isolates marginalised teens who find community online",
      "Drives use underground where there is no moderation at all",
    ],
    keyClash: "Can a ban be enforced without building surveillance infrastructure for everyone?",
    skillFocus: "Mechanism and practical burdens — proving a policy can actually work",
  },
  {
    id: "carbon-tax",
    text: "This house would impose a carbon tax rather than subsidise green technology",
    topic: "Environment",
    level: "advanced",
    formats: ["policy", "british-parliamentary", "lincoln-douglas"],
    ageBand: "Grades 11–12",
    background:
      "Sweden and British Columbia run long-standing carbon taxes; the US Inflation Reduction Act took the subsidy route. The comparison is a genuine live policy dispute.",
    definitions:
      "This is a comparative motion — Opposition does not defend inaction, it defends subsidy. Anyone arguing 'climate change is real' has missed the clash.",
    proArguments: [
      "Prices the externality directly and lets the market find the cheapest abatement",
      "Raises revenue rather than spending it, which can be rebated to poorer households",
      "Technology-neutral — no government picking winners",
    ],
    conArguments: [
      "Regressive without a rebate scheme that is politically fragile",
      "Subsidies build domestic industry and jobs, creating a constituency that defends the policy",
      "Price signals are slow where alternatives don't exist yet",
    ],
    keyClash:
      "Which instrument survives contact with politics — the efficient one, or the one that builds its own support?",
    skillFocus: "Comparative policy weighing between two positive options",
  },
  {
    id: "nuclear-power",
    text: "This house believes that nuclear power is essential to decarbonisation",
    topic: "Environment",
    level: "intermediate",
    formats: [],
    ageBand: "Grades 9–10",
    background:
      "Germany closed its reactors while France retained them; both claim climate leadership. Cost overruns and build times are the strongest practical objections.",
    definitions: "'Essential' is a high bar — Opposition should hold Proposition to necessity, not merely usefulness.",
    proArguments: [
      "The only proven dispatchable low-carbon baseload at scale",
      "Land and materials footprint per unit of energy is small",
      "Grid stability when wind and solar are intermittent",
    ],
    conArguments: [
      "Build times of a decade-plus miss the decarbonisation window",
      "Cost per MWh has risen while renewables have collapsed in price",
      "Waste and decommissioning liabilities outlast the political systems that approved them",
    ],
    keyClash: "Is the binding constraint on decarbonisation technology, or time and money?",
    skillFocus: "Holding an opponent to the strength of their own wording",
  },
  {
    id: "ubi",
    text: "This house would replace means-tested welfare with a universal basic income",
    topic: "Economics",
    level: "advanced",
    formats: ["british-parliamentary", "policy", "wsdc"],
    ageBand: "Grades 11–12",
    background:
      "Pilots in Finland, Kenya (GiveDirectly) and Stockton, California produced modest employment effects and clear wellbeing gains — but none tested a full national replacement.",
    definitions:
      "'Replace' is the crux: a UBI on top of welfare is a different motion. Proposition must own what gets abolished.",
    proArguments: [
      "Removes the poverty trap created by benefit withdrawal rates",
      "Administrative simplicity and near-total take-up",
      "No stigma, no caseworker discretion, no wrongful sanctions",
    ],
    conArguments: [
      "A flat payment underserves people with disabilities and high needs",
      "Cost forces either a low payment or very high taxation",
      "Untargeted spending is regressive relative to targeted spending per pound",
    ],
    keyClash:
      "Does universality buy enough in take-up and dignity to justify what targeting could have bought instead?",
    skillFocus: "Multi-card synthesis — pilot evidence rarely transfers to national scale",
  },
  {
    id: "billionaires",
    text: "This house believes that the existence of billionaires is a policy failure",
    topic: "Economics",
    level: "advanced",
    formats: ["british-parliamentary", "lincoln-douglas"],
    ageBand: "Grades 11–12",
    background:
      "A values-and-mechanism hybrid: wealth taxes in Norway and Spain, and the US debate over unrealised gains, give it concrete grounding.",
    definitions:
      "'Policy failure' — failure against what goal? Proposition should set the standard early rather than let Opposition define it as 'any inequality'.",
    proArguments: [
      "Extreme wealth converts into political power and captures the rules",
      "Accumulation at that scale implies undertaxed rents, not just productivity",
      "The same resources have far higher marginal utility elsewhere",
    ],
    conArguments: [
      "Wealth is mostly illiquid equity in productive companies, not hoarded cash",
      "Punishes the positive-sum creation of valuable firms",
      "Capital flight makes the policy self-defeating",
    ],
    keyClash: "Is billionaire wealth a symptom of value created, or of rules captured?",
    skillFocus: "Framework debating — setting the standard the round is judged against",
  },
  {
    id: "compulsory-voting",
    text: "This house would make voting compulsory",
    topic: "Politics & Governance",
    level: "intermediate",
    formats: [],
    ageBand: "Grades 9–10",
    background:
      "Australia and Belgium enforce compulsory voting with turnout above 90%. Penalties are small fines, and 'attendance' rather than a valid vote is what is compelled.",
    definitions:
      "Compulsory attendance at the ballot, not compulsory choice — spoiled ballots remain legal. Proposition should clarify this before Opposition frames it as forced speech.",
    proArguments: [
      "Turnout stops being a strategic variable parties can suppress",
      "Full participation makes the mandate genuinely representative",
      "Shifts campaigns from mobilising the base to persuading the middle",
    ],
    conArguments: [
      "Compels the uninformed to vote, adding noise",
      "Abstention is itself political expression",
      "Fines fall hardest on the people least able to reach a polling station",
    ],
    keyClash: "Does a compelled vote produce a more legitimate government, or a less meaningful one?",
    skillFocus: "Principle versus practical consequence",
  },
  {
    id: "lower-voting-age",
    text: "This house would lower the voting age to 16",
    topic: "Politics & Governance",
    level: "beginner",
    formats: [],
    ageBand: "Grades 6–8",
    background:
      "Austria, Brazil, Scotland and Wales allow voting at 16 in at least some elections; turnout among first-time 16-year-old voters is often higher than among 18-year-olds.",
    definitions: "All elections, or local only? Proposition should pick and defend the scope.",
    proArguments: [
      "16-year-olds work, pay tax, and live with the consequences longest",
      "Voting while still in school builds a lifelong habit",
      "Policy currently skews toward older voters who reliably turn out",
    ],
    conArguments: [
      "Other adult responsibilities are withheld until 18 for the same maturity reasons",
      "Higher susceptibility to parental and peer influence",
      "Little evidence that turnout gains persist",
    ],
    keyClash: "Is the vote a reward for maturity, or a tool for representing an affected interest?",
    skillFocus: "Building a case with three distinct reasons",
  },
  {
    id: "animal-testing",
    text: "This house would ban animal testing for medical research",
    topic: "Ethics & Philosophy",
    level: "intermediate",
    formats: ["lincoln-douglas", "wsdc"],
    ageBand: "Grades 9–10",
    background:
      "The EU bans cosmetic animal testing; medical testing remains legal nearly everywhere under 3Rs rules. Organoids and computational models are advancing but not yet substitutes for whole-system effects.",
    definitions: "Medical research only — conceding cosmetics narrows the round to the hard case.",
    proArguments: [
      "Suffering inflicted on beings who cannot consent and gain nothing",
      "Cross-species results transfer poorly, so much of the harm buys little",
      "A ban would force investment into alternatives that already partly work",
    ],
    conArguments: [
      "No current substitute models whole-organism toxicity",
      "Delayed treatments have a real human body count",
      "Regulated use with the 3Rs already minimises suffering",
    ],
    keyClash: "Does the moral weight of animal suffering survive comparison with delayed human treatment?",
    skillFocus: "Weighing incommensurable impacts",
  },
  {
    id: "free-speech-platforms",
    text: "This house believes that social media platforms should not remove legal speech",
    topic: "Media & Culture",
    level: "advanced",
    formats: ["lincoln-douglas", "british-parliamentary"],
    ageBand: "Grades 11–12",
    background:
      "Section 230 in the US, the EU Digital Services Act, and platform policy shifts after 2022 give this concrete legal grounding.",
    definitions:
      "'Legal speech' excludes incitement and defamation — the motion is about lawful but harmful content, which is where the real fight is.",
    proArguments: [
      "Private control of the public square without due process",
      "Enforcement is inconsistent and tracks political pressure",
      "Removal drives belief underground and confirms persecution narratives",
    ],
    conArguments: [
      "Platforms amplify by algorithm — that is a publishing choice, not neutrality",
      "Harassment silences more speech than moderation does",
      "Advertisers and users have their own freedom of association",
    ],
    keyClash: "Is a platform a conduit or a publisher — and does amplification make it responsible?",
    skillFocus: "Principled framework plus practical enforcement burden",
  },
  {
    id: "sports-transgender",
    text: "This house would organise competitive sport by biological category rather than gender identity",
    topic: "Sport",
    level: "tournament",
    formats: ["british-parliamentary", "wsdc"],
    ageBand: "Mixed / adult learners",
    background:
      "Policies vary by federation — World Athletics, FINA and the IOC have taken different positions since 2021. Handle with care and set discussion norms before running it in class.",
    definitions:
      "Elite competition or all levels? The motion is far more defensible for the former; Opposition should press the scope immediately.",
    proArguments: [
      "Fair competition depends on categories that track performance-relevant physiology",
      "Categories exist to protect a class of competitor, as weight classes do",
      "Clear rules reduce case-by-case intrusive scrutiny of individual athletes",
    ],
    conArguments: [
      "Excludes people from public life on a contested and shifting scientific basis",
      "Enforcement requires invasive testing that has historically targeted women",
      "Inclusion at sub-elite levels has far higher welfare stakes than fairness costs",
    ],
    keyClash: "Whose exclusion is the sporting category system designed to prevent?",
    skillFocus: "Debating a sensitive motion with precision and charity",
  },
  {
    id: "developing-nations-aid",
    text: "This house believes that development aid does more harm than good",
    topic: "International Relations",
    level: "advanced",
    formats: ["british-parliamentary", "wsdc", "asian-parliamentary"],
    ageBand: "Grades 11–12",
    background:
      "The Moyo/Sachs dispute is the canonical framing; the evidence base differs sharply between humanitarian, health (PEPFAR, vaccination) and budget-support aid.",
    definitions:
      "Splitting aid into humanitarian, health and governance support is the strongest Opposition move — the motion is far weaker against vaccination programmes than against budget support.",
    proArguments: [
      "Props up unaccountable governments that need not tax their citizens",
      "Distorts local markets and displaces domestic producers",
      "Sets donor priorities above recipient ones",
    ],
    conArguments: [
      "Health aid has a measurable, enormous mortality benefit",
      "Humanitarian aid is a floor under catastrophe, not a development strategy",
      "'Aid' failures are usually failures of a specific modality, not the category",
    ],
    keyClash: "Is the harm intrinsic to aid, or specific to one kind of aid badly delivered?",
    skillFocus: "Refusing a false aggregate — splitting the opponent's category",
  },
  {
    id: "vaccine-mandates",
    text: "This house would mandate vaccination for school attendance",
    topic: "Health",
    level: "intermediate",
    formats: ["public-forum", "lincoln-douglas"],
    ageBand: "Grades 9–10",
    background:
      "Most US states mandate childhood vaccination for school entry with medical exemptions; uptake and measles incidence track exemption rules closely.",
    definitions:
      "Routine childhood schedule, with medical exemptions — Proposition should say so before Opposition argues against forced injection of anyone.",
    proArguments: [
      "Herd immunity protects those who cannot be vaccinated",
      "School is a state-provided collective space with reciprocal obligations",
      "Mandates measurably raise uptake where persuasion has plateaued",
    ],
    conArguments: [
      "Bodily autonomy and parental authority over medical decisions",
      "Excluding unvaccinated children punishes the child for a parent's choice",
      "Coercion hardens vaccine scepticism and reduces trust",
    ],
    keyClash: "Does the collective benefit of herd immunity justify conditioning education on a medical act?",
    skillFocus: "Rights versus consequences, with real numbers on both sides",
  },
];

/** Filters the library UI exposes. */
export interface MotionQuery {
  q?: string;
  topic?: string;
  level?: string;
  format?: string;
  ageBand?: string;
}

export function searchMotions(all: Motion[], query: MotionQuery): Motion[] {
  const terms = (query.q ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  return all.filter((m) => {
    if (query.topic && query.topic !== "all" && m.topic !== query.topic) return false;
    if (query.level && query.level !== "all" && m.level !== query.level) return false;
    if (query.ageBand && query.ageBand !== "all" && m.ageBand !== query.ageBand) return false;
    // an empty formats list means the wording works anywhere
    if (
      query.format &&
      query.format !== "all" &&
      m.formats.length > 0 &&
      !m.formats.includes(query.format)
    ) {
      return false;
    }
    if (terms.length === 0) return true;
    const hay = [
      m.text,
      m.topic,
      m.skillFocus,
      m.background,
      m.keyClash,
      ...m.proArguments,
      ...m.conArguments,
    ]
      .join(" ")
      .toLowerCase();
    return terms.every((t) => hay.includes(t));
  });
}

/** Sanity guard: seed data referencing a format that doesn't exist is a typo. */
export function invalidSeedFormats(): string[] {
  return [
    ...new Set(
      SEED_MOTIONS.flatMap((m) => m.formats).filter(
        (f) => !DEBATE_FORMAT_IDS.includes(f)
      )
    ),
  ];
}
