"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  FONT_OPTIONS,
  LOCK_GROUPS,
  LockGroup,
  StyleKitConfig,
} from "@/lib/style-kit";

/**
 * Founder-facing kit editor. Locking a group means an individual pack can no
 * longer override it — that's the mechanism that keeps a whole cohort's output
 * identical, so each lock says what it actually enforces.
 */
export default function StyleKitEditor({
  kitId,
  initialName,
  initialConfig,
  initialLocked,
  isDefault,
  usage,
  canEdit,
}: {
  kitId: number;
  initialName: string;
  initialConfig: StyleKitConfig;
  initialLocked: string[];
  isDefault: boolean;
  usage: number;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [cfg, setCfg] = useState<StyleKitConfig>(initialConfig);
  const [locked, setLocked] = useState<string[]>(initialLocked);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");
  const [logoErr, setLogoErr] = useState("");

  const ro = !canEdit;

  function set<K extends keyof StyleKitConfig>(k: K, v: StyleKitConfig[K]) {
    setCfg((c) => ({ ...c, [k]: v }));
  }
  function toggleLock(g: LockGroup) {
    setLocked((l) => (l.includes(g) ? l.filter((x) => x !== g) : [...l, g]));
  }

  async function save() {
    setState("saving");
    setError("");
    const res = await fetch(`/api/style-kits/${kitId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, config: cfg, lockedFields: locked }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setState("error");
      setError(data.error ?? "Save failed");
      return;
    }
    setState("saved");
    router.refresh();
  }

  async function makeDefault() {
    const res = await fetch(`/api/style-kits/${kitId}/default`, { method: "POST" });
    if (res.ok) router.refresh();
  }

  async function duplicate() {
    const res = await fetch("/api/style-kits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ duplicateOf: kitId }),
    });
    const data = await res.json();
    if (res.ok) router.push(`/style-kits/${data.id}`);
  }

  async function remove() {
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/style-kits/${kitId}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Delete failed");
      return;
    }
    router.push("/style-kits");
  }

  return (
    <div>
      <div className="mb-6 mt-3 flex flex-wrap items-center gap-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={ro}
          aria-label="Kit name"
          className="field-input !bg-transparent !border-transparent hover:!border-inkline focus:!border-accent/60 !text-2xl !font-bold flex-1 min-w-60 disabled:opacity-70"
        />
        {isDefault ? (
          <span className="rounded-full border border-ok/40 bg-ok/12 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-ok">
            Default kit
          </span>
        ) : (
          canEdit && (
            <button
              onClick={makeDefault}
              className="rounded-md border border-inkline px-3 py-1.5 text-xs font-bold text-fg2 hover:text-fg1 transition-colors"
            >
              Make default
            </button>
          )
        )}
      </div>

      <p className="mb-6 text-xs text-fg3">
        {usage} material{usage === 1 ? "" : "s"} built in this kit.
        {isDefault && " New packs start here."}
      </p>

      {error && (
        <div className="mb-4 rounded-lg border border-danger/40 bg-danger/10 p-3 text-xs text-danger">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-5">
        {/* ── Branding ── */}
        <Group id="branding" locked={locked} onToggle={toggleLock} canEdit={canEdit}>
          <Field label="Brand">
            <input className="field-input" value={cfg.brand} disabled={ro}
              onChange={(e) => set("brand", e.target.value)} />
          </Field>
          <Field label="Series label">
            <input className="field-input" value={cfg.seriesLabel} disabled={ro}
              onChange={(e) => set("seriesLabel", e.target.value)} />
          </Field>
          <Field label="Cover footer line">
            <input className="field-input" value={cfg.footerText} disabled={ro}
              onChange={(e) => set("footerText", e.target.value)} />
          </Field>
          {/* The logo prints in the frame at the top of every cover. Read as a
              data URL so it travels with the kit row — see logoDataUrl. */}
          <Field label="Academy logo">
            <div className="flex items-center gap-3">
              {cfg.logoDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={cfg.logoDataUrl}
                  alt="Academy logo"
                  className="h-14 w-14 rounded-lg border border-inkline bg-white object-contain p-1"
                />
              ) : (
                <div className="grid h-14 w-14 place-items-center rounded-lg border border-dashed border-inkline text-[10px] text-fg3">
                  none
                </div>
              )}
              <div className="flex flex-col gap-1">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  disabled={ro}
                  className="text-xs text-fg3 file:mr-2 file:rounded file:border-0 file:bg-inkmid file:px-2 file:py-1 file:text-xs file:font-bold file:text-fg1"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    // A cover logo prints at ~30mm; anything past a few hundred
                    // KB is a photo, and it would be carried in every backup.
                    if (file.size > 400_000) {
                      setLogoErr("That file is over 400KB — use a trimmed PNG or an SVG.");
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = () => {
                      setLogoErr("");
                      set("logoDataUrl", String(reader.result ?? ""));
                    };
                    reader.readAsDataURL(file);
                  }}
                />
                {cfg.logoDataUrl && !ro && (
                  <button
                    type="button"
                    className="self-start text-[11px] font-bold text-fg3 hover:text-fg1"
                    onClick={() => set("logoDataUrl", "")}
                  >
                    remove logo
                  </button>
                )}
                {logoErr && <span className="text-[11px] text-danger">{logoErr}</span>}
              </div>
            </div>
          </Field>
        </Group>

        {/* ── Palette ── */}
        <Group id="palette" locked={locked} onToggle={toggleLock} canEdit={canEdit}>
          <div className="grid gap-3 sm:grid-cols-3">
            {(Object.keys(cfg.palette) as (keyof StyleKitConfig["palette"])[]).map(
              (key) => (
                <label key={key} className="block">
                  <span className="field-label">{key}</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      className="field-input !h-9 !w-12 !p-1"
                      value={cfg.palette[key]}
                      disabled={ro}
                      onChange={(e) =>
                        set("palette", { ...cfg.palette, [key]: e.target.value })
                      }
                    />
                    <input
                      className="field-input !font-mono !text-xs"
                      value={cfg.palette[key]}
                      disabled={ro}
                      onChange={(e) =>
                        set("palette", { ...cfg.palette, [key]: e.target.value })
                      }
                    />
                  </div>
                </label>
              )
            )}
          </div>
        </Group>

        {/* ── Typography ── */}
        <Group id="fonts" locked={locked} onToggle={toggleLock} canEdit={canEdit}>
          <div className="grid gap-3 sm:grid-cols-2">
            {(["display", "body", "mono", "handwritten"] as const).map((slot) => (
              <Field key={slot} label={slot}>
                <select
                  className="field-input"
                  value={cfg.fonts[slot]}
                  disabled={ro}
                  onChange={(e) =>
                    set("fonts", { ...cfg.fonts, [slot]: e.target.value })
                  }
                >
                  {FONT_OPTIONS[slot].map((o) => (
                    <option key={o.label} value={o.label}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>
            ))}
          </div>
        </Group>

        {/* ── Structural rules ── */}
        <Group id="rules" locked={locked} onToggle={toggleLock} canEdit={canEdit}>
          <p className="mb-2 text-xs text-fg3">
            These drive the quality checklist — a pack can&apos;t be submitted
            for review until it meets them.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Paraphrase max words">
              <input type="number" className="field-input" value={cfg.rules.paraphraseMaxWords} disabled={ro}
                onChange={(e) => set("rules", { ...cfg.rules, paraphraseMaxWords: Math.max(10, Number(e.target.value) || 40) })} />
            </Field>
            <Field label="Word bank — minimum terms">
              <input type="number" className="field-input" value={cfg.rules.minVocabTerms} disabled={ro}
                onChange={(e) => set("rules", { ...cfg.rules, minVocabTerms: Math.max(0, Number(e.target.value) || 0) })} />
            </Field>
            <Field label="Minimum student activities">
              <input type="number" className="field-input" value={cfg.rules.minActivities} disabled={ro}
                onChange={(e) => set("rules", { ...cfg.rules, minActivities: Math.max(0, Number(e.target.value) || 0) })} />
            </Field>
            <Field label="Minimum success criteria">
              <input type="number" className="field-input" value={cfg.rules.minSuccessCriteria} disabled={ro}
                onChange={(e) => set("rules", { ...cfg.rules, minSuccessCriteria: Math.max(0, Number(e.target.value) || 0) })} />
            </Field>
            <Field label="Page size">
              <select className="field-input" value={cfg.rules.pageSize} disabled={ro}
                onChange={(e) => set("rules", { ...cfg.rules, pageSize: e.target.value as "letter" | "a4" })}>
                <option value="letter">Letter (8.5 × 11 in)</option>
                <option value="a4">A4 (210 × 297 mm)</option>
              </select>
            </Field>
          </div>
        </Group>
      </div>

      {canEdit && (
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <button
            onClick={save}
            disabled={state === "saving"}
            className="btn btn-primary disabled:opacity-40"
          >
            {state === "saving" ? "Saving…" : "Save kit"}
          </button>
          {state === "saved" && (
            <span className="text-xs font-bold uppercase tracking-widest text-ok">
              Saved
            </span>
          )}
          <div className="flex-1" />
          <button
            onClick={duplicate}
            className="rounded-md border border-inkline px-3 py-2 text-xs font-bold text-fg2 hover:text-fg1 transition-colors"
          >
            ⧉ Duplicate
          </button>
          {!isDefault && (
            <button
              onClick={remove}
              className="rounded-md border border-danger/40 px-3 py-2 text-xs font-bold text-danger/80 hover:bg-danger/10 hover:text-danger transition-colors"
            >
              🗑 Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Group({
  id,
  locked,
  onToggle,
  canEdit,
  children,
}: {
  id: LockGroup;
  locked: string[];
  onToggle: (g: LockGroup) => void;
  canEdit: boolean;
  children: React.ReactNode;
}) {
  const def = LOCK_GROUPS.find((g) => g.id === id)!;
  const isLocked = locked.includes(id);
  return (
    <section className="rounded-xl border border-inkline bg-inkcard p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl text-fg1">{def.label}</h2>
          <p className="text-xs text-fg3">{def.hint}</p>
        </div>
        <button
          onClick={() => onToggle(id)}
          disabled={!canEdit}
          className={`shrink-0 rounded-md border px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-50 ${
            isLocked
              ? "border-accent/50 bg-accent/10 text-accent"
              : "border-inkline text-fg3 hover:text-fg1"
          }`}
        >
          {isLocked ? "🔒 Locked" : "🔓 Unlocked"}
        </button>
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}
