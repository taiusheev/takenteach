"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { IconClose } from "./icons";

/**
 * Toasts — the product's one way of saying "that worked".
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────
 * Today a save either changes something visible or says nothing at all, and
 * "nothing at all" is indistinguishable from a request that failed. That is the
 * gap this closes: an action that succeeds without changing the screen needs to
 * say so, and an action that fails needs to say so where the person is looking.
 *
 * ── IT IS ANNOUNCED, NOT JUST DRAWN ──────────────────────────────────────
 * The viewport is a live region. A sighted user sees the card appear; without
 * `aria-live` a screen-reader user gets silence, which means the confirmation
 * exists only for people who did not need it most. `polite` rather than
 * `assertive` so it waits for a gap instead of interrupting mid-sentence —
 * except for errors, which interrupt on purpose.
 *
 * ── NO TIMER ON ERRORS ───────────────────────────────────────────────────
 * Successes dismiss themselves; failures stay until dismissed. An error message
 * that disappears after four seconds is one the reader has to catch, and if
 * they miss it the only evidence that something went wrong is gone.
 */

export type ToastKind = "ok" | "error" | "info";

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  /** Show a toast. Returns its id so a caller can dismiss it early. */
  toast: (message: string, kind?: ToastKind) => number;
  dismiss: (id: number) => void;
}

const Ctx = createContext<ToastApi | null>(null);

/**
 * `useToast()` is safe to call from anywhere, including outside the provider —
 * it degrades to a no-op rather than throwing. A missing provider should not be
 * able to crash a page over a confirmation message.
 */
export function useToast(): ToastApi {
  const ctx = useContext(Ctx);
  return (
    ctx ?? {
      toast: () => -1,
      dismiss: () => {},
    }
  );
}

const AUTO_DISMISS_MS = 4200;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, kind: ToastKind = "ok") => {
      const id = nextId.current++;
      /* Capped at three. A stack that grows without limit covers the thing the
         person is trying to look at, and the oldest is always the least
         relevant — so it is the one that goes. */
      setToasts((t) => [...t.slice(-2), { id, kind, message }]);
      if (kind !== "error") {
        setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
      }
      return id;
    },
    [dismiss]
  );

  const api = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <Ctx.Provider value={api}>
      {children}
      <div
        className="toast-viewport no-print"
        role="status"
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            <p className="min-w-0 flex-1 text-[13px] leading-snug text-fg1">
              {t.message}
            </p>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
              className="-mr-1 -mt-0.5 shrink-0 rounded p-1 text-fg3 transition-colors hover:bg-surface-alt hover:text-fg1"
            >
              <IconClose size={14} />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
