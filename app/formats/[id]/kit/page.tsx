import Link from "next/link";
import { notFound } from "next/navigation";
import { DEBATE_FORMATS, debateFormat, roundMinutes } from "@/lib/debate-formats";
import PrintButton from "@/components/PrintButton";

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return DEBATE_FORMATS.map((f) => ({ id: f.id }));
}

/**
 * The Round Kit — the paper a practice round actually needs.
 *
 * Every coach reproduces this by hand for every format: who speaks, for how
 * long, in what order, what each speech has to do, and blank paper laid out to
 * flow it. All of that is already modelled, so it is pure rendering — no model
 * call, nothing to verify, and it prints identically every time.
 *
 * Two A4 sheets: a running-order card for the room, and a flow sheet whose
 * columns are this format's actual speeches. The flow sheet is rotated to
 * landscape inside a portrait sheet, because a flow needs width and mixing page
 * orientations in one print job is how printers produce surprises.
 */
export default async function RoundKitPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const f = debateFormat(id);
  if (!f) notFound();

  // running clock, so the card doubles as a timing sheet — each speech starts
  // where the preceding ones have left off
  const timed = f.speeches.map((s, i) => {
    const start = f.speeches
      .slice(0, i)
      .reduce((total, prev) => total + prev.minutes, 0);
    return { ...s, start, end: start + s.minutes };
  });
  const mmss = (m: number) => `${String(Math.floor(m)).padStart(2, "0")}:00`;

  return (
    <div>
      <div className="no-print sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-inkline bg-inkmid px-5 py-3">
        <Link href="/formats" className="text-sm font-bold text-fg3 hover:text-fg1">
          ← Formats
        </Link>
        <div className="min-w-0 flex-1">
          <span className="text-sm font-bold text-fg1">{f.label} · Round Kit</span>
          <span className="ml-2 text-xs text-fg3">
            2 sheets · running order + flow paper
          </span>
        </div>
        <PrintButton />
      </div>

      <div className="print-stack flex flex-col items-center gap-10 bg-[#1e293b] py-10 print:bg-white print:gap-0 print:py-0">
        {/* ── Sheet 1: running order ── */}
        <div className="print-page bg-white text-[#0f172a]">
          <div className="flex h-full flex-col">
            <header className="mb-4 border-b-[3px] border-black pb-2">
              <div className="flex items-baseline justify-between">
                <h1 className="text-4xl font-black uppercase tracking-tight">
                  {f.label}
                </h1>
                <span className="text-lg font-black">{f.short}</span>
              </div>
              <p className="mt-1 text-xs font-bold uppercase tracking-[2px] text-gray-600">
                {f.teams} · {f.prepTimeMin} min prep · ~{roundMinutes(f)} min total
              </p>
            </header>

            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b-2 border-black text-left uppercase tracking-wider">
                  <th className="w-16 py-1">Clock</th>
                  <th className="w-12 py-1">Min</th>
                  <th className="w-44 py-1">Speech</th>
                  <th className="py-1">What this speech must do</th>
                  <th className="w-10 py-1">✓</th>
                </tr>
              </thead>
              <tbody>
                {timed.map((s, i) => (
                  <tr key={i} className="border-b border-gray-300 align-top">
                    <td className="py-1.5 font-bold tabular-nums">{mmss(s.start)}</td>
                    <td className="py-1.5 font-bold tabular-nums">{s.minutes}</td>
                    <td className="py-1.5">
                      <span className="font-bold">{s.name}</span>
                      <br />
                      <span className="text-[10px] uppercase tracking-wide text-gray-600">
                        {s.speaker}
                      </span>
                    </td>
                    <td className="py-1.5 leading-snug">{s.purpose}</td>
                    <td className="py-1.5">
                      <span className="inline-block h-3.5 w-3.5 border-2 border-black" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <section className="border-2 border-black p-2.5">
                <h2 className="mb-1 text-[11px] font-black uppercase tracking-widest">
                  {f.questioning.label}
                </h2>
                <p className="text-[11px] leading-snug">{f.questioning.rules}</p>
              </section>
              <section className="border-2 border-black p-2.5">
                <h2 className="mb-1 text-[11px] font-black uppercase tracking-widest">
                  What judges reward
                </h2>
                <ul className="text-[11px] leading-snug">
                  {f.judging.criteria.map((c) => (
                    <li key={c}>· {c}</li>
                  ))}
                </ul>
                <p className="mt-1 text-[10px] text-gray-600">
                  {f.judging.speakerPoints}. {f.judging.decision}
                </p>
              </section>
            </div>

            <section className="mt-3 border-l-4 border-black bg-gray-100 p-2.5">
              <h2 className="text-[11px] font-black uppercase tracking-widest">
                The mistake to watch for in {f.short}
              </h2>
              <p className="text-[11px] leading-snug">{f.commonNoviceError}</p>
            </section>

            <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-wider">
              {f.vocabulary.map((v) => (
                <span key={v} className="border border-black px-1.5 py-0.5">
                  {v}
                </span>
              ))}
            </div>

            <footer className="mt-auto border-t-2 border-black pt-1 text-[9px] font-bold uppercase tracking-[2px] text-gray-600">
              TakenTeach · {f.label} running order · prep {f.prepTimeMin} min
            </footer>
          </div>
        </div>

        {/* ── Sheet 2: flow paper, rotated to landscape ── */}
        <div className="print-page bg-white text-[#0f172a]">
          <div className="pk-landscape">
            <header className="mb-2 flex items-baseline justify-between border-b-2 border-black pb-1">
              <h2 className="text-xl font-black uppercase tracking-tight">
                {f.short} Flow Sheet
              </h2>
              <div className="flex gap-6 text-[10px] font-bold uppercase tracking-wider">
                <span>Name ______________________</span>
                <span>Side ____________</span>
                <span>Motion ______________________________</span>
              </div>
            </header>

            <div
              className="grid gap-0 border-2 border-black"
              style={{
                gridTemplateColumns: `repeat(${f.speeches.length}, minmax(0, 1fr))`,
                height: "calc(100% - 42px)",
              }}
            >
              {f.speeches.map((s, i) => (
                <div
                  key={i}
                  className={`flex flex-col ${i < f.speeches.length - 1 ? "border-r-2 border-black" : ""}`}
                >
                  <div className="border-b-2 border-black bg-gray-200 px-1 py-1 text-center">
                    <div className="text-[9px] font-black uppercase leading-tight">
                      {s.name}
                    </div>
                    <div className="text-[8px] uppercase text-gray-700">
                      {s.minutes}m
                    </div>
                  </div>
                  {/* ruled writing area — lines rather than an empty box, because
                      novices flow in prose unless the paper tells them not to */}
                  <div
                    className="flex-1"
                    style={{
                      backgroundImage:
                        "repeating-linear-gradient(to bottom, transparent 0, transparent 17px, #cbd5e1 17px, #cbd5e1 18px)",
                    }}
                  />
                </div>
              ))}
            </div>

            <p className="mt-1 text-[9px] font-bold uppercase tracking-[2px] text-gray-600">
              One column per speech · track each argument across the page — if a line
              stops, someone dropped it
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
