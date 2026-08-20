"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * When a page throws.
 *
 * There was no error boundary anywhere in the app, so any failure — a dropped
 * database connection, a malformed pack, a bug — produced Next's own crash
 * screen in development and a blank page in production. A teacher's honest
 * reading of a blank page is "my lesson is gone".
 *
 * So this says the two things that are actually true and useful: the work is
 * still there, and here is the button that tries again. `retry()` re-runs the
 * failed segment on the server rather than reloading the tab, which is the
 * cheapest possible recovery from a transient fault and usually works.
 *
 * NOTE: the recovery prop is `retry` in this version of Next, not the `reset`
 * older code and older documentation use.
 */
export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    /* No error service is wired up yet, so the console is the log. The digest
       is what matches this screen to the server-side stack — in production the
       message is deliberately withheld, and the digest is all there is. */
    console.error("Page error:", error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-lg flex-col items-start py-16">
      <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-fg1">
        That didn&apos;t load.
      </h1>
      <p className="mt-2 text-[14px] leading-relaxed text-fg2">
        Something failed while building this page. Nothing has been lost — your
        lessons are saved on the server, not in this tab.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        <button type="button" onClick={retry} className="btn btn-primary">
          Try again
        </button>
        <Link href="/" className="btn btn-secondary">
          Back to the library
        </Link>
      </div>

      {error.digest && (
        <p className="mt-6 text-[11.5px] text-fg3">
          Reference{" "}
          <code className="rounded bg-surface-alt px-1.5 py-0.5 font-mono">
            {error.digest}
          </code>{" "}
          — quote this if you report it.
        </p>
      )}
    </div>
  );
}
