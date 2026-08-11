"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

/** Mirrors the server's allow-list — see /api/style-kits/[id]/logo. */
const ALLOWED = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_BYTES = 400_000;

/**
 * The academy's mark, in the frame at the top of a cover — and the place you
 * put it there.
 *
 * The upload lived only in the Style Kit editor, which meant setting a logo
 * required leaving the thing you were looking at, finding the kit, and coming
 * back to see whether it landed well. His own novice packs put the control on
 * the cover itself — the placeholder IS the file picker — and that is the right
 * instinct: a logo is judged in place, at the size it prints, against the
 * artwork around it.
 *
 * The logo is kit-level, so dropping one here sets it for every cover in the
 * cohort at once. That is the intent, and the caption says so.
 *
 * Roles: only the founder can set it (the API enforces this independently —
 * `canEdit` governs the affordance, not the permission). Everyone else, and
 * every printed sheet, sees only the mark itself or the design's own fallback.
 */
export default function CoverLogo({
  kitId,
  brand,
  logoDataUrl,
  canEdit,
  fallback,
  className = "",
  style,
}: {
  kitId: number;
  brand: string;
  logoDataUrl: string;
  canEdit: boolean;
  /** what the cover draws when there is no logo (e.g. the lesson code) */
  fallback?: React.ReactNode;
  /** each cover frames its mark differently — a disc, a square, a glow. The
      frame belongs to the design, so it is passed in rather than assumed. */
  className?: string;
  style?: React.CSSProperties;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [over, setOver] = useState(false);

  async function save(dataUrl: string) {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(`/api/style-kits/${kitId}/logo`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ logoDataUrl: dataUrl }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      // The kit is read server-side by the print page, so the new mark only
      // appears after the server component re-runs.
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  function accept(file: File | undefined) {
    if (!file) return;
    if (!ALLOWED.includes(file.type)) {
      setErr("PNG, JPEG, WebP or GIF only.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setErr(`That's ${Math.round(file.size / 1024)}KB — keep it under 400KB.`);
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => setErr("Could not read that file.");
    reader.onload = () => save(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  }

  // Nothing to show and no right to add one: the cover keeps its own frame and
  // fallback exactly as the design drew it, with no editing chrome in the tree.
  if (!logoDataUrl && !canEdit) {
    if (fallback === undefined) return null;
    return (
      <div className={`pk-cover-glyph ${className}`} style={style}>
        {fallback}
      </div>
    );
  }

  return (
    <div className={`pk-cover-glyph relative ${className}`} style={style}>
      {logoDataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoDataUrl}
          alt={brand}
          className="pk-cover-logo h-full w-full object-contain"
        />
      ) : (
        fallback ?? null
      )}

      {canEdit && (
        <>
          <input
            ref={fileRef}
            type="file"
            accept={ALLOWED.join(",")}
            className="hidden"
            onChange={(e) => {
              accept(e.target.files?.[0]);
              // so picking the same file twice still fires onChange
              e.target.value = "";
            }}
          />
          {/* no-print throughout: the placeholder and the controls are editing
              chrome, and a printed pack must show the mark or nothing at all. */}
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              accept(e.dataTransfer.files?.[0]);
            }}
            title={
              logoDataUrl
                ? "Replace the academy logo (prints on every cover in this kit)"
                : "Add the academy logo — prints on every cover in this kit"
            }
            className={`no-print absolute inset-0 grid place-items-center rounded-[inherit] text-[9px] font-black uppercase tracking-widest transition-colors ${
              logoDataUrl
                ? "opacity-0 hover:opacity-100 bg-black/60 text-white"
                : over
                  ? "border-2 border-dashed border-brand bg-brand/12 text-brand"
                  : "border-2 border-dashed border-current/40 text-current opacity-70 hover:opacity-100"
            }`}
          >
            {busy ? "…" : logoDataUrl ? "Replace" : over ? "Drop it" : "+ Logo"}
          </button>
          {logoDataUrl && (
            <button
              type="button"
              disabled={busy}
              onClick={() => save("")}
              title="Remove the academy logo"
              className="no-print absolute -right-2 -top-2 grid h-5 w-5 place-items-center rounded-full bg-danger text-[11px] font-black text-white opacity-0 shadow hover:opacity-100"
            >
              ×
            </button>
          )}
          {err && (
            <span className="no-print absolute left-1/2 top-full mt-1 w-44 -translate-x-1/2 rounded bg-danger px-2 py-1 text-center text-[10px] font-bold text-white">
              {err}
            </span>
          )}
        </>
      )}
    </div>
  );
}
