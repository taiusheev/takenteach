"use client";

import { usePathname } from "next/navigation";

/**
 * Hides the app's own navigation on routes that own the whole screen.
 *
 * Two kinds of route qualify, for two different reasons.
 *
 * CLASSROOM MODE is projected to a room. "Library · Motions · Review Queue ·
 * Style Kits · Acting as: Teacher" belongs to the person planning the lesson,
 * not on the wall in front of thirty students — and the nav bar also ate the
 * height the teach view needs to keep its controls on screen.
 *
 * THE AUTH SCREENS have no navigation to offer: every destination behind the
 * header requires the account the visitor is in the middle of creating. A
 * header full of links that all bounce to /login is worse than no header, and
 * these pages carry their own logo and their own way back.
 */
const FULL_SCREEN = [
  /\/teach\/?$/,
  /^\/login\/?$/,
  /^\/signup(\/|$)/,
  /^\/forgot-password\/?$/,
  /^\/reset-password\/?$/,
  /^\/account\/password\/?$/,
  /^\/no-access\/?$/,
];

export default function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  if (FULL_SCREEN.some((re) => re.test(pathname))) return null;
  return <>{children}</>;
}
