"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/shell/Toaster";
import { EMPTY_PROFILE, type StyleProfile } from "@/lib/style-profile";

/**
 * "MAKE IT SOUND LIKE ME."
 *
 * ── EVERY FIELD IS EDITABLE, AND THAT IS THE FEATURE ─────────────────────
 * What a model decided about someone's teaching, shown back to them as a
 * finished fact, is the kind of thing people resent — and if it is wrong they
 * have no way to tell, because the only symptom is lessons that feel slightly
 * off. So the extraction produces a draft, the draft is displayed in plain
 * English, and saving an edit costs nothing and calls no model. A teacher who
 * deletes everything and writes their own two sentences has used this
 * correctly.
 *
 * ── THE SAMPLES ARE NOT KEPT ─────────────────────────────────────────────
 * Only the profile is stored. The pasted material is somebody's own work,
 * often a whole term of it, and there is no feature here that needs it a
 * second time — re-reading means pasting again, which is a fair price for not
 * holding a copy of a teacher's back catalogue in a column nobody audits.
 */
export default function StyleProfilePanel({
  initial,
}: {
  initial: StyleProfile;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [profile, setProfile] = useState<StyleProfile>(initial);
  const [samples, setSamples] = useState("");
  const [busy, setBusy] = useState<"" | "read" | "save" | "clear">("");
  const [error, setError] = useState("");

  const has =
    profile.voice.trim() ||
    profile.instructionStyle.trim() ||
    profile.signatureMoves.length > 0 ||
    profile.vocabulary.length > 0;

  async function call(
    kind: "read" | "save" | "clear",
    init: RequestInit
  ): Promise<void> {
    setBusy(kind);
    setError("");
    try {
      const res = await fetch("/api/style-profile", init);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "That didn't work");
      setProfile(data.profile ?? EMPTY_PROFILE);
      if (kind === "read") setSamples("");
      toast(
        kind === "read"
          ? "Read. Check it below and change anything that isn't you."
          : kind === "save"
            ? "Saved."
            : "Forgotten.",
        "ok"
      );
      router.refresh();
    } catch (err) {
      const m = err instanceof Error ? err.message : "That didn't work";
      setError(m);
      toast(m, "error");
    } finally {
      setBusy("");
    }
  }

  const json = (body: unknown, method: string): RequestInit => ({
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const setList = (key: "signatureMoves" | "vocabulary" | "gaps", v: string) =>
    setProfile({
      ...profile,
      [key]: v
        .split("\n")
        .map((x) => x.trim())
        .filter(Boolean),
    });

  return (
    <section className="card mb-4 p-5">
      <h2 className="mb-1 text-xs font-bold uppercase tracking-widest text-fg1">
        Your teaching style
      </h2>
      <p className="mb-4 text-[12px] leading-relaxed text-fg3">
        Paste a lesson or two you wrote yourself. We read how you sound — your
        voice, your routines, your words for things — and write new lessons that
        way. It changes how they read, never how rigorous they are.
      </p>

      {!has && (
        <>
          <label className="block">
            <span className="field-label">
              Paste your own material — a handout, a plan, a worksheet
            </span>
            <textarea
              className="field-textarea !min-h-32"
              value={samples}
              onChange={(e) => setSamples(e.target.value)}
              maxLength={40000}
              placeholder={
                "Paste the text of one or two of your own lessons.\n\nA page or two reads much better than a paragraph — and separate lessons beat one long one, because the routines you repeat are the part worth finding."
              }
            />
          </label>
          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-3">
            <span className="text-[11px] text-fg3">
              {samples.trim().length.toLocaleString()} characters · the text is
              read once and not kept.
            </span>
            <button
              type="button"
              disabled={!!busy || samples.trim().length < 200}
              onClick={() =>
                void call("read", json({ samples, sampleCount: 1 }, "POST"))
              }
              className="btn btn-primary"
            >
              {busy === "read" ? "Reading…" : "Read my style"}
            </button>
          </div>
        </>
      )}

      {has && (
        <div className="flex flex-col gap-3.5">
          <p className="rounded-lg border border-inkline bg-surface-alt px-3 py-2 text-[11.5px] text-fg3">
            This is what we think you sound like. It was written by reading your
            material — <strong className="font-semibold text-fg2">change
            anything that isn&apos;t you</strong>, or write your own from
            scratch. Nothing here is fixed.
            {profile.updatedAt && ` Last read ${profile.updatedAt}.`}
          </p>

          <label className="block">
            <span className="field-label">Your voice</span>
            <textarea
              className="field-textarea !min-h-14"
              value={profile.voice}
              onChange={(e) => setProfile({ ...profile, voice: e.target.value })}
              maxLength={400}
            />
          </label>

          <label className="block">
            <span className="field-label">How you set a task</span>
            <textarea
              className="field-textarea !min-h-14"
              value={profile.instructionStyle}
              onChange={(e) =>
                setProfile({ ...profile, instructionStyle: e.target.value })
              }
              maxLength={400}
            />
          </label>

          <label className="block">
            <span className="field-label">
              Your routines — one per line
            </span>
            <textarea
              className="field-textarea !min-h-16"
              value={profile.signatureMoves.join("\n")}
              onChange={(e) => setList("signatureMoves", e.target.value)}
            />
            <span className="mt-1 block text-[11px] text-fg3">
              The things a student of yours would recognise week to week.
            </span>
          </label>

          <label className="block">
            <span className="field-label">Your words for things — one per line</span>
            <textarea
              className="field-textarea !min-h-16"
              value={profile.vocabulary.join("\n")}
              onChange={(e) => setList("vocabulary", e.target.value)}
            />
            <span className="mt-1 block text-[11px] text-fg3">
              Used instead of the standard term. If you say
              &ldquo;claim-warrant-impact&rdquo;, your lessons won&apos;t say
              PEEL.
            </span>
          </label>

          {/* Suggestions, kept visually apart from everything above, because
              everything above is a description of them and this is an opinion
              about them. It is never sent to the generator — see the note in
              lib/style-profile.ts. */}
          {profile.gaps.length > 0 && (
            <div className="rounded-lg border border-warn/40 bg-warn/8 px-3.5 py-3">
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-warn">
                Things your material never does
              </p>
              <ul className="flex flex-col gap-1 text-[12.5px] leading-snug text-fg2">
                {profile.gaps.map((g, i) => (
                  <li key={i} className="flex gap-1.5">
                    <span aria-hidden className="text-warn">
                      ·
                    </span>
                    {g}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-fg3">
                A suggestion, not a setting. Nothing acts on this — your built
                lessons already meet the house standard either way.
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={!!busy}
              onClick={() => void call("save", json({ profile }, "PATCH"))}
              className="btn btn-primary"
            >
              {busy === "save" ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              disabled={!!busy}
              onClick={() => {
                if (
                  window.confirm(
                    "Forget your style profile? New lessons go back to the house voice."
                  )
                ) {
                  void call("clear", { method: "DELETE" });
                }
              }}
              className="text-[12px] font-semibold text-fg3 transition-colors hover:text-danger"
            >
              {busy === "clear" ? "Forgetting…" : "Forget this"}
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-[12.5px] text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
