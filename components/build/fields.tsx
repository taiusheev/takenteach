"use client";

/**
 * The editor's form primitives, in one file.
 *
 * They were previously declared three times — once at the bottom of Builder.tsx,
 * once at the bottom of SimpleBuilder.tsx, and partly again inside PagesPanel —
 * and had already drifted: two different remove buttons, two different section
 * headings, one set with a hint line and one without. Small components copied
 * per file is how an interface stops looking designed and starts looking
 * assembled, and it is invisible in review because each copy reads fine alone.
 */

export function Section({
  id,
  title,
  hint,
  action,
  children,
}: {
  id?: string;
  title: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="card scroll-mt-[calc(var(--header-h)+4.5rem)] p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          {/* A section heading, not a poster. This was `font-display text-2xl`,
              which put a 24px bold title on a form group and made every group
              look like the start of a new document. */}
          <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-fg1">
            {title}
          </h2>
          {hint && (
            <p className="mt-1 max-w-prose text-[12px] leading-relaxed text-fg3">
              {hint}
            </p>
          )}
        </div>
        {action}
      </div>
      <div className="flex flex-col gap-3.5">{children}</div>
    </section>
  );
}

export function Field({
  id,
  label,
  hint,
  children,
}: {
  id?: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label id={id} className="block scroll-mt-[calc(var(--header-h)+4.5rem)]">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-fg3">{hint}</span>}
    </label>
  );
}

export function AddButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="self-start rounded-md border border-dashed border-line-strong px-3 py-1.5 text-[12px] font-semibold text-fg2 transition-colors hover:border-brand/50 hover:text-fg1"
    >
      {label}
    </button>
  );
}

export function RemoveButton({
  onClick,
  title = "Remove",
}: {
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={title}
      title={title}
      className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-inkline text-fg3 transition-colors hover:border-danger/40 hover:bg-danger/8 hover:text-danger"
    >
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
        <path
          d="M2.5 2.5l7 7m0-7l-7 7"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}

export function MoveButtons({
  onUp,
  onDown,
  upDisabled,
  downDisabled,
}: {
  onUp: () => void;
  onDown: () => void;
  upDisabled?: boolean;
  downDisabled?: boolean;
}) {
  /* Kept alongside drag-and-drop, not replaced by it: native dragging is
     unusable from a keyboard, so these ARE the accessible reorder control. */
  return (
    <div className="flex shrink-0">
      <button
        type="button"
        onClick={onUp}
        disabled={upDisabled}
        aria-label="Move up"
        title="Move up"
        className="grid h-8 w-7 place-items-center rounded-l-md border border-inkline text-fg3 transition-colors hover:text-fg1 disabled:opacity-30"
      >
        <Chevron up />
      </button>
      <button
        type="button"
        onClick={onDown}
        disabled={downDisabled}
        aria-label="Move down"
        title="Move down"
        className="-ml-px grid h-8 w-7 place-items-center rounded-r-md border border-inkline text-fg3 transition-colors hover:text-fg1 disabled:opacity-30"
      >
        <Chevron />
      </button>
    </div>
  );
}

function Chevron({ up }: { up?: boolean }) {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 12 12"
      aria-hidden
      className={up ? "rotate-180" : ""}
    >
      <path
        d="M3 4.5L6 8l3-3.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
