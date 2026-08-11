"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

export interface UnitLessonRow {
  id: number;
  code: string;
  title: string;
  skillFocus: string;
  status: string;
  /** already has generated content */
  built: boolean;
}

type RunState = "idle" | "running" | "done" | "error" | "stopped";
const STAGE_COUNT = 8; // lesson-pack generation stages

/**
 * Drives building a whole unit: generates each not-yet-built draft in turn,
 * reusing the per-lesson streaming endpoint, with live per-lesson progress. One
 * lesson at a time keeps the model focused and the arc coherent (each lesson
 * sees the ones already built).
 */
export default function UnitBuildRunner({
  accent,
  lessons: initial,
}: {
  accent: string;
  lessons: UnitLessonRow[];
}) {
  const router = useRouter();
  const [lessons, setLessons] = useState(initial);
  const [progress, setProgress] = useState<Record<number, number>>({});
  const [states, setStates] = useState<Record<number, RunState>>({});
  const [runningAll, setRunningAll] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const stopAllRef = useRef(false);

  async function buildOne(id: number): Promise<boolean> {
    setStates((s) => ({ ...s, [id]: "running" }));
    setProgress((p) => ({ ...p, [id]: 0 }));
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let done = 0;
    try {
      const res = await fetch(`/api/materials/${id}/generate`, {
        method: "POST",
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Generation failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          let event;
          try {
            event = JSON.parse(line);
          } catch {
            continue; // skip a malformed/partial line rather than killing the runner
          }
          if (event.type === "stage-done") {
            done += 1;
            setProgress((p) => ({ ...p, [id]: Math.min(done, STAGE_COUNT) }));
          } else if (event.type === "error") {
            throw new Error(event.error);
          }
        }
      }
      setStates((s) => ({ ...s, [id]: "done" }));
      setProgress((p) => ({ ...p, [id]: STAGE_COUNT }));
      setLessons((ls) => ls.map((l) => (l.id === id ? { ...l, built: true } : l)));
      return true;
    } catch (err) {
      if (ctrl.signal.aborted) {
        setStates((s) => ({ ...s, [id]: "stopped" }));
      } else {
        setStates((s) => ({ ...s, [id]: "error" }));
        setError(err instanceof Error ? err.message : "Generation failed");
      }
      return false;
    }
  }

  async function buildAll() {
    setError("");
    setRunningAll(true);
    stopAllRef.current = false;
    const queue = lessons.filter((l) => !l.built);
    for (const l of queue) {
      if (stopAllRef.current) break;
      const ok = await buildOne(l.id);
      if (!ok && !stopAllRef.current) {
        // an error stops the run so the author can look; a manual stop is quiet
        break;
      }
    }
    setRunningAll(false);
    router.refresh();
  }

  function stop() {
    stopAllRef.current = true;
    abortRef.current?.abort();
    setRunningAll(false);
  }

  const builtCount = lessons.filter((l) => l.built).length;
  const anyRunning = Object.values(states).includes("running");

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        {runningAll || anyRunning ? (
          <button
            onClick={stop}
            className="rounded-md border border-danger/50 px-4 py-2 text-sm font-bold text-danger hover:bg-danger/10 transition-colors"
          >
            ⏹ Stop (keeps what&apos;s built)
          </button>
        ) : (
          <button
            onClick={buildAll}
            disabled={builtCount === lessons.length}
            className="btn btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: builtCount === lessons.length ? undefined : accent, color: "#fff" }}
          >
            {builtCount === 0
              ? `⚡ Build all ${lessons.length} lessons`
              : builtCount === lessons.length
                ? "✓ All lessons built"
                : `⚡ Build the remaining ${lessons.length - builtCount}`}
          </button>
        )}
        <span className="text-xs text-fg3">
          {builtCount}/{lessons.length} built · builds one at a time (~1–2 min each)
        </span>
      </div>

      {error && (
        <p className="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-4 py-2 text-xs text-danger">
          {error}
        </p>
      )}

      <ol className="flex flex-col gap-2">
        {lessons.map((l) => {
          const st = states[l.id] ?? (l.built ? "done" : "idle");
          const pct = ((progress[l.id] ?? (l.built ? STAGE_COUNT : 0)) / STAGE_COUNT) * 100;
          return (
            <li
              key={l.id}
              className="rounded-xl border border-inkline bg-inkcard p-3"
            >
              <div className="flex items-center gap-3">
                <div
                  className="flex h-9 w-11 shrink-0 items-center justify-center rounded-md text-xs font-black text-white"
                  style={{ background: accent }}
                >
                  {l.code || "—"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/materials/${l.id}`}
                      className="truncate text-sm font-bold text-fg1 hover:text-accent"
                    >
                      {l.title}
                    </Link>
                    <StateTag state={st} built={l.built} />
                  </div>
                  <p className="truncate text-xs text-fg3">{l.skillFocus || "—"}</p>
                  {st === "running" && (
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-inkmid">
                      <div
                        className="h-full transition-all duration-500"
                        style={{ width: `${pct}%`, background: accent }}
                      />
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {st !== "running" && (
                    <button
                      onClick={() => buildOne(l.id).then(() => router.refresh())}
                      disabled={runningAll || anyRunning}
                      className="rounded-md border border-inkline px-3 py-1.5 text-xs font-bold text-fg2 hover:text-fg1 disabled:opacity-40 transition-colors"
                    >
                      {l.built ? "↻ Rebuild" : "Build"}
                    </button>
                  )}
                  <Link
                    href={l.built ? `/materials/${l.id}/print` : `/materials/${l.id}/generate`}
                    className="rounded-md border border-inkline px-3 py-1.5 text-xs font-bold text-fg2 hover:text-fg1 transition-colors"
                  >
                    {l.built ? "🖨 Print" : "Open"}
                  </Link>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function StateTag({ state, built }: { state: RunState; built: boolean }) {
  if (state === "running")
    return (
      <span className="inline-flex items-center gap-1 rounded bg-inkmid px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-fg2">
        <span className="inline-block h-2.5 w-2.5 animate-spin rounded-full border-2 border-inkline border-t-accent" />
        Building
      </span>
    );
  if (state === "error")
    return <span className="rounded bg-danger/12 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-danger">Error</span>;
  if (state === "stopped")
    return <span className="rounded bg-inkmid px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-fg3">Stopped</span>;
  if (built || state === "done")
    return <span className="rounded bg-ok/12 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ok">Built</span>;
  return <span className="rounded bg-inkmid px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-fg3">Draft</span>;
}
