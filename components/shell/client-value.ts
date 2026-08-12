"use client";

import { useSyncExternalStore } from "react";

/**
 * Reading things that only exist in a browser, without a state-setting effect.
 *
 * ── WHY NOT `useState` + `useEffect` ─────────────────────────────────────
 * The obvious shape — state initialised to a default, then an effect that reads
 * localStorage and calls `setState` — is now a lint error under React's current
 * rules ("calling setState synchronously within an effect can trigger cascading
 * renders"), and the rule is right: it renders once with the wrong value, then
 * again with the right one, and anything below re-renders twice on every mount.
 *
 * `useSyncExternalStore` is built for exactly this. It takes a SERVER snapshot
 * (used for SSR and the first client render, so the two agree and hydration is
 * clean) and a CLIENT snapshot read synchronously during render. One render,
 * no flash, no hydration warning.
 *
 * The subscribe half also gets something the effect version never had: a
 * `storage` listener, so changing the theme in one tab updates the others.
 */

/** Storage events do not fire in the tab that wrote them; this bridges that. */
const LOCAL_EVENT = "tt:storage";

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(LOCAL_EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(LOCAL_EVENT, cb);
  };
}

/** The current value of a localStorage key. `null` on the server. */
export function useStored(key: string): string | null {
  return useSyncExternalStore(
    subscribe,
    () => {
      try {
        return localStorage.getItem(key);
      } catch {
        return null; // storage disabled — behave as unset rather than crash
      }
    },
    () => null
  );
}

/** Write a key and tell this tab's subscribers. Pass null to remove. */
export function writeStored(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* A private window with storage blocked should not break the control that
       writes the preference; it just will not be remembered. */
  }
  window.dispatchEvent(new Event(LOCAL_EVENT));
}

/**
 * Is this an Apple keyboard? Decides whether shortcuts read ⌘ or Ctrl.
 *
 * Never changes after load, so `subscribe` is a no-op — the point of using the
 * hook is the server snapshot, which keeps the first paint identical on both
 * sides. Guessing wrong for one frame would show every shortcut hint changing
 * under the reader's eye.
 */
const noopSubscribe = () => () => {};

export function useIsMac(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent),
    () => false
  );
}
