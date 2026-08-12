"use client";

import { useSyncExternalStore } from "react";

/**
 * "Good morning, Timur."
 *
 * ── WHY THIS IS A CLIENT COMPONENT FOR ONE WORD ──────────────────────────
 * The greeting depends on the reader's clock, and the server does not have it.
 * Rendering it on the server means using the SERVER's timezone — which on
 * Vercel is UTC — so a teacher in Vladivostok opening this after dinner is told
 * "Good morning". Wrong in a way that is small, constant, and reads as the
 * product not knowing who it is talking to.
 *
 * So the server renders a time-neutral "Welcome back" and the client swaps in
 * the real greeting on first paint. `useSyncExternalStore` rather than an
 * effect: the server snapshot and the first client render agree, so this
 * hydrates without a mismatch and without a visible flip.
 */
const noopSubscribe = () => () => {};

function greetingFor(hour: number): string {
  if (hour < 5) return "Working late";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default function Greeting({ name }: { name: string }) {
  const greeting = useSyncExternalStore(
    noopSubscribe,
    () => greetingFor(new Date().getHours()),
    () => "Welcome back"
  );

  /* First name only. "Good morning, Ascent Academy Founder" is what a database
     row says, not what a person is called. */
  const first = name.trim().split(/\s+/)[0] || "";

  return (
    <h1 className="text-[26px] font-bold leading-tight tracking-[-0.02em] text-fg1 sm:text-[30px]">
      {greeting}
      {first ? `, ${first}` : ""}.
    </h1>
  );
}
