"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Activity, LessonPack } from "@/lib/lesson-pack-schema";
import { debateFormat, type SpeechSlot } from "@/lib/debate-formats";

/**
 * Classroom Mode — the lesson as a class, not a document.
 *
 * Everything this needs already existed and was thrown away at teaching time:
 * each page carries its own `durationMin`, every prompt carries its expected
 * answer, and a pack that names a competitive format has that format's real
 * speech order and timings in the registry. The product still stopped at a PDF,
 * so the teacher printed A4 and ran the room from memory and a phone timer.
 *
 * One page per view, projected: big type, the essentials only. This is
 * deliberately NOT a replica of the print page — A4 is laid out for reading at
 * desk distance, a projector is read from the back row, so the same content is
 * re-cut for a screen (fewer words visible at once, no answer key unless the
 * teacher asks for it).
 *
 * Keyboard, because a teacher's hands are busy: ← → move, Space start/pause the
 * timer, R reset it, A reveal answers, F fullscreen.
 */
export default function ClassroomMode({
  pack,
  materialId,
}: {
  pack: LessonPack;
  materialId: number;
}) {
  // Slide 0 is the mission; slides 1..n are the pages, so the class starts on
  // what they're here to learn rather than mid-activity.
  const slides = pack.activities.length + 1;
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState(false);
  const activity = i === 0 ? null : pack.activities[i - 1];
  const format = debateFormat(pack.debateFormat);

  // ── timer ────────────────────────────────────────────────────────────────
  // Counting down by decrementing on an interval drifts — over a 15-minute
  // segment the clock on the wall and the clock on the wall behind you disagree,
  // which is exactly the thing a room notices. So the running clock is an END
  // TIMESTAMP and the display is derived from it; `left` is only what's painted.
  const planned = (activity?.durationMin ?? 0) * 60;
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [left, setLeft] = useState(0);
  const [speech, setSpeech] = useState<SpeechSlot | null>(null);
  const running = endsAt !== null;

  // Mirrored so start/pause can read the current remainder without the callback
  // changing identity every second (it's wired to a window keydown listener).
  const leftRef = useRef(0);
  useEffect(() => {
    leftRef.current = left;
  }, [left]);

  // Same reason: the key handler moves relative to the current slide, and
  // shouldn't be torn down and re-registered on every navigation.
  const iRef = useRef(0);
  useEffect(() => {
    iRef.current = i;
  }, [i]);

  useEffect(() => {
    if (endsAt === null) return;
    const id = setInterval(() => {
      const rem = Math.max(0, Math.round((endsAt - Date.now()) / 1000));
      setLeft(rem);
      if (rem === 0) setEndsAt(null); // out of time: stop, don't go negative
    }, 200);
    return () => clearInterval(id);
  }, [endsAt]);

  /**
   * Move to a slide. A new slide is a new segment, so the clock stops and
   * reloads with that page's own duration — the teacher never runs page 5 on
   * page 4's leftover time.
   */
  const go = useCallback(
    (n: number) => {
      const to = Math.max(0, Math.min(slides - 1, n));
      setI(to);
      setEndsAt(null);
      setSpeech(null);
      setLeft((pack.activities[to - 1]?.durationMin ?? 0) * 60);
    },
    [slides, pack.activities]
  );

  const toggleTimer = useCallback(() => {
    setEndsAt((prev) =>
      prev !== null
        ? null
        : leftRef.current > 0
          ? Date.now() + leftRef.current * 1000
          : null
    );
  }, []);

  const startSpeech = useCallback((s: SpeechSlot) => {
    setSpeech(s);
    setLeft(s.minutes * 60);
    setEndsAt(Date.now() + s.minutes * 60 * 1000);
  }, []);

  const resetTimer = useCallback(() => {
    setEndsAt(null);
    setLeft(speech ? speech.minutes * 60 : planned);
  }, [speech, planned]);

  // ── keyboard ─────────────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // never hijack typing in a field
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      switch (e.key) {
        case "ArrowRight":
        case "PageDown":
          go(iRef.current + 1);
          break;
        case "ArrowLeft":
        case "PageUp":
          go(iRef.current - 1);
          break;
        case " ":
          e.preventDefault();
          toggleTimer();
          break;
        case "r":
        case "R":
          resetTimer();
          break;
        case "a":
        case "A":
          setAnswers((a) => !a);
          break;
        case "f":
        case "F":
          if (document.fullscreenElement) document.exitFullscreen();
          else document.documentElement.requestFullscreen().catch(() => {});
          break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, resetTimer, toggleTimer]);

  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");
  const low = left <= 60 && left > 0;
  const done = left === 0 && (planned > 0 || !!speech);

  return (
    // Exactly one screen: the control bar and the nav footer stay put and the
    // slide scrolls between them, so the timer never scrolls out of the room's
    // view mid-activity.
    <div className="flex h-screen flex-col overflow-hidden bg-ink text-fg1">
      {/* ── control bar ── */}
      <header className="flex flex-wrap items-center gap-3 border-b border-inkline px-5 py-2.5">
        <span className="min-w-0 flex-1 truncate text-xs font-bold uppercase tracking-widest text-fg3">
          {pack.lessonCode} · {pack.skillFocus || pack.title}
        </span>

        <button
          type="button"
          onClick={() => setAnswers((a) => !a)}
          className={`rounded-md border px-3 py-1.5 text-xs font-bold transition-colors ${
            answers
              ? "border-warn/60 bg-warn/12 text-warn"
              : "border-inkline text-fg2 hover:text-fg1"
          }`}
        >
          {answers ? "Answers shown" : "Show answers"}
        </button>

        <div
          className={`flex items-center gap-2 rounded-md border px-3 py-1 ${
            done
              ? "border-danger/60 bg-danger/12"
              : low
                ? "border-warn/60 bg-warn/10"
                : "border-inkline"
          }`}
        >
          <span
            className={`font-mono text-2xl font-bold tabular-nums ${
              done ? "text-danger" : low ? "text-warn" : "text-fg1"
            }`}
          >
            {mm}:{ss}
          </span>
          <button
            type="button"
            onClick={() => toggleTimer()}
            className="rounded border border-inkline px-2 py-0.5 text-[11px] font-bold text-fg2 hover:text-fg1"
          >
            {running ? "Pause" : "Start"}
          </button>
          <button
            type="button"
            onClick={resetTimer}
            className="rounded border border-inkline px-2 py-0.5 text-[11px] font-bold text-fg2 hover:text-fg1"
          >
            Reset
          </button>
        </div>

        <Link
          href={`/materials/${materialId}`}
          className="rounded-md border border-inkline px-3 py-1.5 text-xs font-bold text-fg2 hover:text-fg1"
        >
          Exit
        </Link>
      </header>

      {/* ── the slide ── */}
      <main className="flex flex-1 justify-center overflow-y-auto px-8 py-10">
        <div className="w-full max-w-5xl">
          {i === 0 ? (
            <MissionSlide pack={pack} />
          ) : (
            <ActivitySlide
              activity={activity!}
              index={i}
              total={pack.activities.length}
              answers={answers}
              speeches={format && isSparring(activity!) ? format.speeches : null}
              formatLabel={format?.short ?? ""}
              activeSpeech={speech}
              onSpeech={startSpeech}
            />
          )}
        </div>
      </main>

      {/* ── progress + navigation ── */}
      <footer className="border-t border-inkline px-5 py-2.5">
        <div className="mb-2 flex h-1 gap-0.5">
          {Array.from({ length: slides }, (_, n) => (
            <button
              key={n}
              type="button"
              aria-label={`Go to slide ${n + 1}`}
              onClick={() => go(n)}
              className={`flex-1 rounded-full transition-colors ${
                n === i ? "bg-accent" : n < i ? "bg-fg3" : "bg-inkline"
              }`}
            />
          ))}
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => go(i - 1)}
            disabled={i === 0}
            className="rounded-md border border-inkline px-3 py-1.5 text-xs font-bold text-fg2 hover:text-fg1 disabled:opacity-30"
          >
            ← Back
          </button>
          <span className="text-xs text-fg3">
            {i === 0 ? "Mission" : `Page ${i} of ${pack.activities.length}`}
          </span>
          <div className="flex-1" />
          <span className="hidden text-[11px] text-fg3 sm:block">
            ← → move · Space timer · R reset · A answers · F fullscreen
          </span>
          <button
            type="button"
            onClick={() => go(i + 1)}
            disabled={i === slides - 1}
            className="btn btn-primary btn-sm"
          >
            Next →
          </button>
        </div>
      </footer>
    </div>
  );
}

/** Oral-practice pages are where a format's real speech clock matters. */
function isSparring(a: Activity): boolean {
  return a.kind === "sparring";
}

function MissionSlide({ pack }: { pack: LessonPack }) {
  return (
    <div>
      {/* A kicker, not a summary — the pack's `subtitle` is a full descriptive
          sentence and set in caps it filled three lines above the title. */}
      <p className="mb-2 truncate text-sm font-bold uppercase tracking-widest text-accent">
        {[pack.series, pack.skillFocus].filter(Boolean).join(" · ") || "Today"}
      </p>
      <h1 className="font-display mb-6 text-5xl leading-tight text-fg1">
        {pack.title}
      </h1>
      {pack.mission && (
        <p className="mb-8 text-2xl leading-relaxed text-fg2">{pack.mission}</p>
      )}
      {pack.resolution && (
        <p className="mb-8 border-l-4 border-accent pl-4 text-xl italic text-fg2">
          {pack.resolution}
        </p>
      )}
      {pack.successCriteria.length > 0 && (
        <>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-fg3">
            By the end you can
          </h2>
          <ul className="flex flex-col gap-3">
            {pack.successCriteria.map((c, n) => (
              <li key={n} className="flex gap-3 text-xl text-fg1">
                <span aria-hidden className="text-accent">
                  ✓
                </span>
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function ActivitySlide({
  activity: a,
  index,
  total,
  answers,
  speeches,
  formatLabel,
  activeSpeech,
  onSpeech,
}: {
  activity: Activity;
  index: number;
  total: number;
  answers: boolean;
  speeches: SpeechSlot[] | null;
  formatLabel: string;
  activeSpeech: SpeechSlot | null;
  onSpeech: (s: SpeechSlot) => void;
}) {
  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="rounded bg-inkmid px-2 py-0.5 text-[11px] font-bold uppercase tracking-widest text-fg3">
          {a.kind}
        </span>
        {a.badge && (
          <span className="text-[11px] font-bold uppercase tracking-widest text-accent">
            {a.badge}
          </span>
        )}
        <span className="text-[11px] text-fg3">
          {index} / {total} · {a.durationMin} min
        </span>
      </div>
      <h1 className="font-display mb-4 text-4xl leading-tight text-fg1">
        {a.title}
      </h1>

      {a.instructions && (
        <p className="mb-6 rounded-lg border-l-4 border-accent bg-inkcard px-4 py-3 text-xl leading-relaxed text-fg1">
          {a.instructions}
        </p>
      )}

      {/* The format's real speech clock, on the page that runs a round. This is
          the one thing no general lesson tool can print: PF's 4-3-4-3-3-3-2, not
          "sparring, 15 minutes". */}
      {speeches && speeches.length > 0 && (
        <div className="mb-6 rounded-lg border border-inkline bg-inkcard p-4">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-fg3">
            {formatLabel} running order — tap a speech to run its clock
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {speeches.map((s, n) => {
              const on = activeSpeech?.name === s.name && activeSpeech?.speaker === s.speaker;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => onSpeech(s)}
                  title={s.purpose}
                  className={`rounded-md border px-3 py-1.5 text-left text-xs font-bold transition-colors ${
                    on
                      ? "border-accent bg-accent/15 text-accent"
                      : "border-inkline text-fg2 hover:text-fg1"
                  }`}
                >
                  {s.name}
                  <span className="ml-1.5 font-normal text-fg3">{s.minutes}m</span>
                </button>
              );
            })}
          </div>
          {activeSpeech && (
            <p className="mt-2 text-sm text-fg2">
              <strong className="text-fg1">{activeSpeech.speaker}</strong> —{" "}
              {activeSpeech.purpose}
            </p>
          )}
        </div>
      )}

      {a.callouts.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-4">
          {a.callouts.map((c, n) => (
            <div
              key={n}
              className="min-w-36 flex-1 rounded-lg border border-inkline bg-inkcard p-4 text-center"
            >
              <div className="font-display text-5xl text-accent">{c.value}</div>
              <div className="mt-1 text-sm uppercase tracking-wider text-fg3">
                {c.label}
              </div>
            </div>
          ))}
        </div>
      )}

      {(a.scene.setup || a.scene.turns.length > 0 || a.scene.twist) && (
        <div className="mb-6">
          {a.scene.setup && (
            <p className="mb-3 text-lg italic text-fg3">{a.scene.setup}</p>
          )}
          <div className="flex flex-col gap-2">
            {a.scene.turns.map((t, n) => (
              <div key={n} className="flex gap-3">
                <span
                  className={`mt-1 h-8 w-8 shrink-0 rounded-full text-center text-sm font-bold leading-8 ${
                    t.side === "pro"
                      ? "bg-ok/12 text-ok"
                      : t.side === "con"
                        ? "bg-danger/12 text-danger"
                        : "bg-inkmid text-fg2"
                  }`}
                >
                  {(t.speaker || "?").charAt(0).toUpperCase()}
                </span>
                <div className="rounded-lg bg-inkcard px-4 py-2.5">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-fg3">
                    {t.speaker}
                  </div>
                  <div className="text-lg leading-relaxed text-fg1">{t.line}</div>
                </div>
              </div>
            ))}
          </div>
          {a.scene.twist && (
            <p className="mt-3 rounded-lg bg-warn/10 px-4 py-2.5 text-lg font-semibold text-warn">
              {a.scene.twist}
            </p>
          )}
        </div>
      )}

      {a.exampleLayers.length > 0 && (
        <div className="mb-6 flex flex-col gap-2">
          {a.exampleLayers.map((l, n) => (
            <div key={n} className="rounded-lg border border-inkline bg-inkcard p-3">
              <div className="text-[11px] font-bold uppercase tracking-widest text-accent">
                {l.label}
              </div>
              <div className="text-lg leading-relaxed text-fg1">{l.text}</div>
              {l.note && <div className="mt-1 text-sm text-fg3">{l.note}</div>}
            </div>
          ))}
        </div>
      )}

      {a.steps.length > 0 && (
        <ol className="mb-6 flex flex-col gap-2">
          {a.steps.map((s, n) => (
            <li key={n} className="flex items-start gap-3">
              <span className="mt-0.5 h-7 w-7 shrink-0 rounded-full bg-accent text-center text-sm font-bold leading-7 text-ink">
                {n + 1}
              </span>
              <span className="text-xl text-fg1">
                {s.text}
                {s.detail && (
                  <span className="ml-2 text-base text-fg3">{s.detail}</span>
                )}
              </span>
            </li>
          ))}
        </ol>
      )}

      {a.compare.rows.length > 0 && (
        <div className="mb-6 overflow-hidden rounded-lg border border-inkline">
          <div className="grid grid-cols-2 bg-inkmid text-sm font-bold uppercase tracking-wider">
            <div className="px-4 py-2 text-danger">{a.compare.leftLabel}</div>
            <div className="border-l border-inkline px-4 py-2 text-ok">
              {a.compare.rightLabel}
            </div>
          </div>
          {a.compare.rows.map((r, n) => (
            <div key={n} className="grid grid-cols-2 border-t border-inkline">
              <div className="px-4 py-2.5 text-lg text-fg2">{r.left}</div>
              <div className="border-l border-inkline px-4 py-2.5 text-lg text-fg1">
                {r.right}
              </div>
            </div>
          ))}
        </div>
      )}

      {a.frames.length > 0 && (
        <div className="mb-6 flex flex-col gap-2">
          {a.frames.map((f, n) => (
            <div key={n} className="rounded-lg border border-dashed border-inkline p-3">
              <span className="text-[11px] font-bold uppercase tracking-widest text-fg3">
                {f.label}
              </span>
              <div className="text-xl text-fg1">{f.starter}</div>
            </div>
          ))}
        </div>
      )}

      {a.sortItems.length > 0 && (
        <ul className="mb-6 flex flex-col gap-2">
          {a.sortItems.map((s, n) => (
            <li
              key={n}
              className="flex items-baseline gap-3 rounded-lg bg-inkcard px-4 py-2.5"
            >
              <span className="text-sm font-bold text-fg3">{n + 1}</span>
              <span className="flex-1 text-lg text-fg1">{s.statement}</span>
              {answers && (
                <span className="rounded bg-warn/12 px-2 py-0.5 text-sm font-bold text-warn">
                  {s.category}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {a.matchPairs.length > 0 && (
        <div className="mb-6 flex flex-col gap-2">
          {a.matchPairs.map((m, n) => (
            <div key={n} className="flex items-center gap-3 text-lg">
              <span className="flex-1 rounded-lg bg-inkcard px-4 py-2 text-fg1">
                {m.left}
              </span>
              <span aria-hidden className="text-fg3">
                →
              </span>
              <span className="flex-1 rounded-lg bg-inkcard px-4 py-2 text-fg2">
                {answers ? m.right : "?"}
              </span>
            </div>
          ))}
        </div>
      )}

      {a.prompts.length > 0 && (
        <ol className="mb-6 flex flex-col gap-3">
          {a.prompts.map((p, n) => (
            <li key={n} className="rounded-lg border border-inkline bg-inkcard p-4">
              <div className="flex gap-3">
                <span className="text-sm font-bold text-fg3">{n + 1}</span>
                <span className="flex-1 text-xl leading-relaxed text-fg1">
                  {p.label}
                </span>
              </div>
              {answers && p.expectedAnswer && (
                <p className="mt-2 rounded border-l-4 border-warn bg-warn/10 px-3 py-2 text-base text-warn">
                  {p.expectedAnswer}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}

      {a.keyIdea && (
        <p className="mb-6 rounded-lg bg-accent/15 px-5 py-4 text-2xl font-bold leading-relaxed text-accent">
          {a.keyIdea}
        </p>
      )}

      {a.standAndDeliver && (
        <p className="mb-6 rounded-lg border border-inkline px-5 py-4 text-xl text-fg1">
          <span className="mr-2 text-[11px] font-bold uppercase tracking-widest text-fg3">
            Stand &amp; deliver
          </span>
          {a.standAndDeliver}
        </p>
      )}
    </div>
  );
}
