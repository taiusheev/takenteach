"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useToast } from "@/components/shell/Toaster";
import { ThemeToggle } from "@/components/shell/Theme";
import { GRADE_BANDS } from "@/lib/lesson-quality";
import { SUBJECT_DEFS, SUBJECTS, type Subject } from "@/lib/subjects";
import type { Preferences } from "@/lib/auth/preferences";

/**
 * Settings.
 *
 * ── EVERY CONTROL ON THIS PAGE CHANGES SOMETHING ─────────────────────────
 * The brief asks for five sections: Account, Teaching Preferences, AI
 * Preferences, Notifications, Appearance. Three are here.
 *
 * AI Preferences (creativity, source preferences, default structure) and
 * Notifications are not, and their absence is the point. Nothing reads them —
 * there is no notification system to switch off and no creativity parameter in
 * the generator to bind a slider to. A settings page whose switches do nothing
 * is worse than a shorter one: the first control someone flips and finds inert
 * teaches them that none of the others work either, and that suspicion is
 * expensive to undo.
 *
 * What is here is wired end to end. The teaching defaults below seed the create
 * screen the moment they are saved, which is checkable in about ten seconds and
 * is the difference between a preference and a decoration.
 */

const DURATIONS = [45, 60, 90, 120, 150, 180];

export default function SettingsForm({
  name: initialName,
  email,
  orgName,
  preferences: initialPrefs,
}: {
  name: string;
  email: string;
  orgName: string;
  preferences: Preferences;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = useState(initialName);
  const [prefs, setPrefs] = useState<Preferences>(initialPrefs);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  /* Dirty-tracking against the values the server sent, so Save is disabled
     until something actually differs. A button that is always live invites a
     pointless request and gives no signal about whether an edit registered. */
  const dirty =
    name.trim() !== initialName.trim() ||
    prefs.subject !== initialPrefs.subject ||
    prefs.gradeBand !== initialPrefs.gradeBand ||
    prefs.durationMin !== initialPrefs.durationMin ||
    prefs.defaultPriorKnowledge !== initialPrefs.defaultPriorKnowledge ||
    prefs.defaultMisconceptions !== initialPrefs.defaultMisconceptions ||
    prefs.defaultConstraints !== initialPrefs.defaultConstraints;

  async function save() {
    if (!dirty || saving) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, preferences: prefs }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't save your settings");
      toast("Settings saved.", "ok");
      /* The name is rendered by the server in the header and the dashboard
         greeting, so a refresh is what makes the change visible where it
         actually appears rather than only in this form. */
      router.refresh();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Couldn't save your settings";
      setError(message);
      toast(message, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-7">
        <h1 className="text-[24px] font-bold tracking-[-0.02em] text-fg1">
          Settings
        </h1>
        <p className="mt-1 text-[13.5px] text-fg2">
          Your account and the defaults every new lesson starts from.
        </p>
      </div>

      {/* ── Account ── */}
      <section className="card mb-4 p-5">
        <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-fg1">
          Account
        </h2>

        <label className="block">
          <span className="field-label">Your name</span>
          <input
            className="field-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            placeholder="Jane Okafor"
          />
        </label>
        <p className="mt-1.5 text-[11.5px] text-fg3">
          This is how you are greeted and how your name appears to colleagues in{" "}
          {orgName}.
        </p>

        <div className="mt-4 border-t border-inkline pt-4">
          <span className="field-label">Email</span>
          {/* Read-only on purpose — see the note in app/api/account/route.ts.
              Changing a login needs the new address verified before the old one
              stops working, which is its own flow; an editable box here would
              let a typo lock someone out of their own account. */}
          <p className="text-[14px] text-fg1">{email}</p>
          <p className="mt-1 text-[11.5px] text-fg3">
            Your email is your sign-in, so changing it needs verification — not
            available yet.{" "}
            <Link
              href="/account/password"
              className="font-semibold text-brand hover:underline"
            >
              Change your password
            </Link>
          </p>
        </div>
      </section>

      {/* ── Teaching defaults ── */}
      <section className="card mb-4 p-5">
        <h2 className="mb-1 text-xs font-bold uppercase tracking-widest text-fg1">
          Teaching defaults
        </h2>
        <p className="mb-4 text-[12px] text-fg3">
          Where a new lesson starts. You can change any of it per lesson — this
          just stops you re-picking the same three things every time.
        </p>

        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="field-label">Track</span>
            <select
              className="field-input"
              value={prefs.subject}
              onChange={(e) =>
                setPrefs({ ...prefs, subject: e.target.value as Subject })
              }
            >
              {SUBJECTS.map((s) => (
                <option key={s} value={s}>
                  {SUBJECT_DEFS[s]?.label ?? s}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="field-label">Reading level</span>
            <select
              className="field-input"
              value={prefs.gradeBand}
              onChange={(e) =>
                setPrefs({
                  ...prefs,
                  gradeBand: e.target.value as Preferences["gradeBand"],
                })
              }
            >
              {GRADE_BANDS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="field-label">Lesson length</span>
            <select
              className="field-input"
              value={prefs.durationMin}
              onChange={(e) =>
                setPrefs({ ...prefs, durationMin: Number(e.target.value) })
              }
            >
              {DURATIONS.map((d) => (
                <option key={d} value={d}>
                  {d} minutes
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {/* ── Your classes ──
          The memory a teacher was retyping into "Add teaching detail" on every
          single build. Saved here, it seeds those same fields on the create
          screen — still editable per lesson, never a silent override. */}
      <section className="card mb-4 p-5">
        <h2 className="mb-1 text-xs font-bold uppercase tracking-widest text-fg1">
          Your classes
        </h2>
        <p className="mb-4 text-[12px] text-fg3">
          What&apos;s generally true about the students you teach. Every new
          lesson starts from this, and you can still change it per lesson.
        </p>

        <div className="flex flex-col gap-3.5">
          <label className="block">
            <span className="field-label">What they already know</span>
            <textarea
              className="field-textarea !min-h-14"
              value={prefs.defaultPriorKnowledge}
              onChange={(e) =>
                setPrefs({ ...prefs, defaultPriorKnowledge: e.target.value })
              }
              maxLength={600}
              placeholder="e.g. Can build a basic PEEL argument. New to rebuttal."
            />
          </label>
          <label className="block">
            <span className="field-label">Mistakes and misconceptions they tend to make</span>
            <textarea
              className="field-textarea !min-h-14"
              value={prefs.defaultMisconceptions}
              onChange={(e) =>
                setPrefs({ ...prefs, defaultMisconceptions: e.target.value })
              }
              maxLength={600}
              placeholder="e.g. They just say 'I disagree' instead of attacking the reasoning."
            />
          </label>
          <label className="block">
            <span className="field-label">Your room, generally</span>
            <textarea
              className="field-textarea !min-h-14"
              value={prefs.defaultConstraints}
              onChange={(e) =>
                setPrefs({ ...prefs, defaultConstraints: e.target.value })
              }
              maxLength={600}
              placeholder="e.g. 24 students, no printer, one shared screen."
            />
          </label>
        </div>
      </section>

      {/* ── Appearance ── */}
      <section className="card mb-4 flex items-center justify-between gap-4 p-5">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-widest text-fg1">
            Appearance
          </h2>
          <p className="mt-1 text-[12px] text-fg3">
            Light, dark, or follow your system. Saved in this browser, applied
            straight away.
          </p>
        </div>
        {/* The same control as the header — one implementation, so the two can
            never disagree about which theme is on. It writes to localStorage
            rather than to the account, because a teacher's classroom projector
            and their laptop want different answers. */}
        <ThemeToggle />
      </section>

      {error && (
        <p className="mb-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-[13px] text-danger">
          {error}
        </p>
      )}

      <div className="flex items-center justify-end gap-3">
        {dirty && (
          <span className="text-[12px] text-fg3">Unsaved changes</span>
        )}
        <button
          type="button"
          onClick={save}
          disabled={!dirty || saving}
          className="btn btn-primary"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}
