"use client";

import { useState } from "react";

/**
 * Sign out.
 *
 * A button posting to the API, not a link — a GET logout can be fired by any
 * `<img>` tag on any site, which is a small but free cross-site nuisance. See
 * the note in app/api/auth/logout/route.ts.
 *
 * The navigation afterwards is a hard one for the same reason sign-in uses one:
 * every server component above this was rendered for a signed-IN user, and a
 * client-side transition would leave their name in the header.
 */
export default function LogoutButton({
  children = "Sign out",
  className = "",
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await fetch("/api/auth/logout", { method: "POST" });
        } finally {
          /* Even if the request failed, go to the login page. The session may
             or may not be gone server-side, but leaving someone stuck on a page
             they just asked to leave is the worse outcome — and the next
             request will find out either way.

             A FULL DOCUMENT NAVIGATION, deliberately, which is why the lint rule
             is disabled rather than obeyed. `router.push()` is a client-side
             transition: it keeps Next's router cache, and that cache holds the
             rendered RSC payloads of the pages this person was just signed in
             to. Signing out and then navigating Back would re-display them from
             memory — the data is gone from the server's point of view and still
             on the screen. Discarding the whole document is the only way to be
             sure nothing authenticated survives the logout. */
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          window.location.assign("/login");
        }
      }}
      className={className}
    >
      {busy ? "Signing out…" : children}
    </button>
  );
}
