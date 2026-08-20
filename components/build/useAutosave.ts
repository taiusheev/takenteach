"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * AUTOSAVE THAT CANNOT LOSE THE LAST EDIT.
 *
 * ── THE BUG THIS EXISTS TO KILL ──────────────────────────────────────────
 * The editors used to debounce a save by 700ms inside an effect whose cleanup
 * cleared the timer. Read that again: the cleanup ran on unmount, so typing a
 * word and immediately clicking "← Back" cleared the pending save and the edit
 * was gone. Nothing said so — the header still read "Saved", because it was
 * describing the save BEFORE the one that got dropped. Silent data loss in a
 * product whose whole promise is that the teacher's work is safe.
 *
 * So the debounce here is a delay before saving, never a licence to skip one.
 * There are four escape hatches out of the debounce window and all four flush:
 *
 *   unmount            in-app navigation away from the editor
 *   pagehide           closing the tab / a hard reload (keepalive request)
 *   visibilitychange   switching tabs or locking the laptop
 *   ⌘/Ctrl + S         the reflex every person who has ever used a document app
 *
 * ── AND IT REFUSES TO CLAIM SUCCESS IT DOESN'T HAVE ──────────────────────
 * `saved` is set only after the server answers, and only if the value has not
 * changed since the request went out — otherwise the state stays `dirty` and
 * another save is scheduled. A "Saved" that means "we sent something a while
 * ago" is the same lie in slower motion.
 *
 * ── CALLER CONTRACT ──────────────────────────────────────────────────────
 * `value` must be referentially stable while the document is unchanged —
 * `useMemo(() => ({ title, pack }), [title, pack])`. The hook uses identity as
 * the dirty signal, so an object rebuilt on every render would mark the
 * document dirty every time any unrelated state (a panel opening) changes.
 */

export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

export interface SaveOptions {
  /** True when the page is going away: the request must outlive the document. */
  keepalive: boolean;
}

export interface Autosave {
  state: SaveState;
  /** Message from the last failed save, for the status pill. */
  error: string;
  /** When the last successful save landed, for "Saved · 2 min ago". */
  savedAt: number | null;
  /** Save now, skipping the debounce. Safe to call when nothing is dirty. */
  saveNow: () => void;
  /**
   * "The next value that arrives is already on the server."
   *
   * Call this in the same handler as the setState that applies an AI rewrite:
   * those routes persist the pack themselves, so writing it straight back would
   * be a second request that can only agree with the first.
   */
  markSaved: () => void;
}

export function useAutosave<T>({
  value,
  save,
  delay = 800,
}: {
  value: T;
  /** Throw (or reject) to report failure; the message reaches the status pill. */
  save: (value: T, opts: SaveOptions) => Promise<void>;
  delay?: number;
}): Autosave {
  const [state, setState] = useState<SaveState>("idle");
  const [error, setError] = useState("");
  const [savedAt, setSavedAt] = useState<number | null>(null);

  /* Everything the flush needs, in refs, because it is called from event
     handlers and cleanups that closed over an older render. */
  const latest = useRef(value);
  const lastSaved = useRef(value);
  const saving = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNext = useRef(false);
  const saveFn = useRef(save);
  /* `flush` needs to be able to schedule ANOTHER flush (the author kept typing
     while the request was open). Going through a ref rather than referring to
     itself keeps the callback out of its own dependency list — the alternative
     is a new identity every render, which re-arms the debounce every render and
     can postpone the save indefinitely while someone types. */
  const flushRef = useRef<(opts?: SaveOptions) => void>(() => {});

  const flush = useCallback(async (opts: SaveOptions = { keepalive: false }) => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (latest.current === lastSaved.current) return; // nothing to write
    if (saving.current) return; // the in-flight save's tail re-checks and requeues
    const attempt = latest.current;
    saving.current = true;
    setState("saving");
    try {
      await saveFn.current(attempt, opts);
      lastSaved.current = attempt;
      setError("");
      setSavedAt(Date.now());
      /* If the author kept typing while the request was open, the document is
         still dirty — say so, and schedule the follow-up. */
      if (latest.current !== attempt) {
        setState("dirty");
        timer.current = setTimeout(() => flushRef.current(), delay);
      } else {
        setState("saved");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setState("error");
    } finally {
      saving.current = false;
    }
  }, [delay]);

  /* The two mutable handles, refreshed after every render. Assigning them here
     rather than in the render body is what keeps this hook pure: a ref written
     during render is read by nothing and can be lost to a discarded render. */
  useEffect(() => {
    saveFn.current = save;
    flushRef.current = (opts) => void flush(opts);
  });

  /* The document changed. Debounce, so a burst of keystrokes is one request. */
  useEffect(() => {
    latest.current = value;
    if (value === lastSaved.current) return;
    /* An AI rewrite the server already persisted. Adopt it as the saved
       baseline rather than writing it straight back. */
    if (skipNext.current) {
      skipNext.current = false;
      lastSaved.current = value;
      return;
    }
    setState("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), delay);
    // No cleanup clearing the timer: that cleanup WAS the data-loss bug. The
    // timer is cleared by the next scheduling or by flush itself.
  }, [value, delay, flush]);

  /* Leaving the editor. This runs on in-app navigation, where a normal request
     completes perfectly well because the tab is not going anywhere. */
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
      if (latest.current !== lastSaved.current) void flush();
    };
  }, [flush]);

  /* Closing the tab. `pagehide` fires where `beforeunload` is unreliable (bfcache,
     mobile Safari), and `keepalive` is what lets the request outlive the page. */
  useEffect(() => {
    const onHide = () => {
      if (latest.current !== lastSaved.current) void flush({ keepalive: true });
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") onHide();
    };
    /* The confirm dialog is the last line, for the case the keepalive request
       fails: a teacher who says "leave" has been told, which is the whole
       difference between losing work and choosing to. */
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (latest.current !== lastSaved.current || saving.current) {
        e.preventDefault();
      }
    };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [flush]);

  /* ⌘S. Bound on the window so it works with the caret anywhere in the form,
     and it always preventDefault()s — offering the browser's "save page as"
     dialog inside a document editor is never the right answer. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void flush();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flush]);

  const markSaved = useCallback(() => {
    skipNext.current = true;
    if (timer.current) clearTimeout(timer.current);
    setSavedAt(Date.now());
    setState("saved");
    setError("");
  }, []);

  return {
    state,
    error,
    savedAt,
    saveNow: useCallback(() => void flush(), [flush]),
    markSaved,
  };
}
