"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { ForkMode } from "@/lib/remix";

/**
 * Fork a lesson: duplicate it outright, or remix — keep the proven skeleton
 * and swap the topic, then let Quick Build refill that shape.
 */
export default function ForkForm({
  sourceId,
  sourceTitle,
  subjectLabel,
  anchorLabel,
  anchorPlaceholder,
  sourcePack,
  inherits,
  hasStructure,
}: {
  sourceId: number;
  sourceTitle: string;
  subjectLabel: string;
  anchorLabel: string;
  anchorPlaceholder: string;
  sourcePack: {
    lessonCode: string;
    title: string;
    skillFocus: string;
    series: string;
    resolution: string;
    durationMin: number;
  };
  inherits: string[];
  hasStructure: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<ForkMode>(hasStructure ? "remix" : "duplicate");
  const [lessonCode, setLessonCode] = useState("");
  const [coverTitle, setCoverTitle] = useState("");
  const [skillFocus, setSkillFocus] = useState(sourcePack.skillFocus);
  const [series, setSeries] = useState(sourcePack.series);
  const [resolution, setResolution] = useState("");
  const [durationMin, setDurationMin] = useState(sourcePack.durationMin);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const isRemix = mode === "remix";

  async function submit() {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/materials/${sourceId}/fork`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode,
        lessonCode,
        coverTitle,
        skillFocus,
        series,
        resolution: isRemix ? resolution : sourcePack.resolution,
        durationMin,
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Fork failed");
      return;
    }
    // a remix starts empty by design — send it straight to Quick Build
    router.push(
      data.mode === "remix"
        ? `/materials/${data.id}/generate`
        : `/materials/${data.id}/edit`
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <Link href={`/materials/${sourceId}`} className="text-sm font-bold text-fg3 hover:text-fg1 transition-colors">
        ← Back
      </Link>
      <h1 className="mt-3 font-display text-4xl text-fg1">Remix / Fork</h1>
      <p className="mb-8 mt-1 text-sm text-fg2">
        Starting from <strong className="text-fg1">{sourceTitle}</strong> ·{" "}
        {subjectLabel}
      </p>

      {/* mode */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setMode("remix")}
          disabled={!hasStructure}
          className={`rounded-xl border p-4 text-left transition-colors disabled:opacity-40 ${
            isRemix ? "border-accent/70 bg-inkcard" : "border-inkline bg-inkmid hover:border-accent/30"
          }`}
        >
          <div className="text-sm font-bold text-fg1">🎛 Remix — swap the topic</div>
          <div className="mt-0.5 text-[11px] text-fg3">
            Keeps the structure and style that already work; clears the content
            and re-anchors to a new topic. Quick Build then refills that exact
            shape.
          </div>
        </button>
        <button
          type="button"
          onClick={() => setMode("duplicate")}
          className={`rounded-xl border p-4 text-left transition-colors ${
            !isRemix ? "border-accent/70 bg-inkcard" : "border-inkline bg-inkmid hover:border-accent/30"
          }`}
        >
          <div className="text-sm font-bold text-fg1">📄 Duplicate — exact copy</div>
          <div className="mt-0.5 text-[11px] text-fg3">
            Full copy as a new draft, content and all. For iterating without
            touching the original.
          </div>
        </button>
      </div>

      {isRemix && (
        <div className="mb-6 rounded-xl border border-inkline bg-inkcard p-4">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-fg3">
            Carried over from the source
          </h2>
          {hasStructure ? (
            <ul className="flex flex-col gap-1 text-xs text-fg2">
              {inherits.map((s, i) => (
                <li key={i}>✓ {s}</li>
              ))}
              <li>✓ Style kit, accent colour and cover emoji</li>
            </ul>
          ) : (
            <p className="text-xs text-fg3">
              This pack has no activities yet, so there&apos;s no structure to
              inherit — duplicate it instead.
            </p>
          )}
        </div>
      )}

      <div className="mb-3 grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="field-label">New lesson code</span>
          <input className="field-input" value={lessonCode} onChange={(e) => setLessonCode(e.target.value)} placeholder="L2" />
        </label>
        <label className="block sm:col-span-2">
          <span className="field-label">Skill focus</span>
          <input className="field-input" value={skillFocus} onChange={(e) => setSkillFocus(e.target.value)} />
        </label>
      </div>
      <div className="mb-3 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="field-label">Cover title</span>
          <input className="field-input" value={coverTitle} onChange={(e) => setCoverTitle(e.target.value)} placeholder={sourcePack.title} />
        </label>
        <label className="block">
          <span className="field-label">Series / cohort</span>
          <input className="field-input" value={series} onChange={(e) => setSeries(e.target.value)} />
        </label>
      </div>

      {isRemix ? (
        <label className="mb-3 block">
          <span className="field-label">New {anchorLabel} (required — this is the new topic)</span>
          <textarea className="field-textarea !min-h-16" value={resolution} onChange={(e) => setResolution(e.target.value)} placeholder={anchorPlaceholder} />
        </label>
      ) : (
        <div className="mb-3 rounded-lg border border-inkline bg-inkmid p-3">
          <span className="field-label">{anchorLabel} (kept from source)</span>
          <p className="text-xs text-fg2">{sourcePack.resolution || "—"}</p>
        </div>
      )}

      <label className="mb-6 block w-40">
        <span className="field-label">Duration (minutes)</span>
        <input type="number" className="field-input" value={durationMin} onChange={(e) => setDurationMin(Math.max(30, Number(e.target.value) || 120))} />
      </label>

      {error && <p className="mb-3 text-xs text-danger">{error}</p>}
      <button
        onClick={submit}
        disabled={busy || (isRemix && !resolution.trim())}
        className="btn btn-primary disabled:cursor-not-allowed"
      >
        {busy
          ? "Forking…"
          : isRemix
            ? "Create remix & start AI build →"
            : "Create duplicate →"}
      </button>
      {isRemix && !resolution.trim() && (
        <p className="mt-2 text-[11px] text-fg3">
          A remix needs its own {anchorLabel.toLowerCase()} — that&apos;s what
          makes it a new lesson rather than a copy.
        </p>
      )}
    </div>
  );
}
