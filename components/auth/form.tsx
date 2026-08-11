"use client";

import { useId, useState } from "react";

/**
 * The parts every auth form is made of, and the one hook that submits them.
 *
 * Six forms with six hand-rolled fetch/pending/error blocks is six chances to
 * forget the disabled state or swallow a field error — the same argument that
 * put the buttons in globals.css and the request parsing in lib/api/request.ts.
 */

/* ── Submission ──────────────────────────────────────────────────────────── */

export interface PostState {
  pending: boolean;
  /** The one-sentence failure, shown above the button. */
  error: string;
  /** Per-field messages, keyed exactly as the zod schema names them. */
  fields: Record<string, string>;
}

export function useAuthPost(url: string) {
  const [state, setState] = useState<PostState>({
    pending: false,
    error: "",
    fields: {},
  });

  async function post(
    body: unknown,
    onDone?: (data: Record<string, unknown>) => void
  ) {
    setState({ pending: true, error: "", fields: {} });
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      /* The offline / dropped-connection case, which school wifi produces
         regularly and which a bare `.json()` would turn into an unhandled
         rejection and a form that just sits there. */
      setState({
        pending: false,
        error: "Couldn't reach the server. Check your connection and try again.",
        fields: {},
      });
      return;
    }

    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;

    if (!res.ok) {
      setState({
        pending: false,
        error: (data.error as string) || "Something went wrong. Try again.",
        fields: (data.fields as Record<string, string>) ?? {},
      });
      return;
    }

    /* A HARD navigation, not router.push. The session cookie was set by the
       response we are holding, and every server component above this point —
       the header, the layout — was rendered for a signed-out visitor. A full
       load is the one way to guarantee the whole tree is rebuilt with the new
       identity. It happens once per sign-in; the cost is not worth the class of
       bug the alternative invites.

       `pending` is deliberately left true: the page is on its way, and a button
       that re-enables itself mid-navigation invites a second submit. */
    if (onDone) onDone(data);
    else window.location.assign(String(data.next ?? "/"));
  }

  return { ...state, post };
}

/* ── Fields ──────────────────────────────────────────────────────────────── */

export function Field({
  label,
  name,
  type = "text",
  value,
  onChange,
  error,
  hint,
  autoComplete,
  required = true,
  placeholder,
}: {
  label: string;
  name: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  hint?: string;
  autoComplete?: string;
  required?: boolean;
  placeholder?: string;
}) {
  const id = useId();
  const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-semibold text-fg1">
        {label}
        {!required && <span className="ml-1.5 font-normal text-fg3">Optional</span>}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        value={value}
        required={required}
        placeholder={placeholder}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`w-full rounded-lg border bg-surface px-3 py-2.5 text-sm text-fg1 outline-none transition-colors placeholder:text-fg3 ${
          error
            ? "border-danger focus:border-danger"
            : "border-inkline focus:border-brand"
        }`}
      />
      {error ? (
        <p id={`${id}-err`} className="mt-1.5 text-xs font-medium text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-fg3">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/**
 * A password field with a reveal toggle.
 *
 * The toggle is not a nicety: without it, a long generated password typed into
 * dots is unverifiable, and the standard response to that is to pick a shorter,
 * weaker one. `type` flips rather than the field being duplicated, so password
 * managers still see one input.
 */
export function PasswordField(props: {
  label: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  hint?: string;
  autoComplete?: string;
}) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <Field {...props} type={shown ? "text" : "password"} />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        /* Sits on the input's own row: the label is 13px plus 6px of margin
           above it, and the input is 42px tall. */
        className="absolute right-2 top-[26px] rounded-md px-2 py-1.5 text-[11px] font-semibold text-fg3 transition-colors hover:bg-surface-alt hover:text-fg1"
      >
        {shown ? "Hide" : "Show"}
      </button>
    </div>
  );
}

export function Select({
  label,
  name,
  value,
  onChange,
  options,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-semibold text-fg1">
        {label}
      </label>
      <select
        id={id}
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-inkline bg-surface px-3 py-2.5 text-sm text-fg1 outline-none transition-colors focus:border-brand"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * The form-level failure.
 *
 * `role="alert"` so it is announced when it appears — a sighted user sees the
 * red box, and without this a screen-reader user gets a button that stopped
 * spinning and no explanation.
 */
export function FormError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="rounded-lg border border-danger/40 bg-danger/12 px-3.5 py-2.5 text-[13px] font-medium text-danger"
    >
      {message}
    </div>
  );
}

export function Submit({
  children,
  pending,
  pendingLabel,
}: {
  children: React.ReactNode;
  pending: boolean;
  /** What the button says while it works — never just a spinner. */
  pendingLabel: string;
}) {
  return (
    <button type="submit" disabled={pending} className="btn btn-primary w-full">
      {pending && (
        <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden className="animate-spin">
          <circle
            cx="7.5"
            cy="7.5"
            r="6"
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.3"
            strokeWidth="2"
          />
          <path
            d="M13.5 7.5a6 6 0 0 0-6-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      )}
      {pending ? pendingLabel : children}
    </button>
  );
}
