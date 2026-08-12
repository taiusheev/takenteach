"use client";

import { useStored, writeStored } from "./client-value";
import { IconMoon, IconSun } from "./icons";

/**
 * Light / dark / system.
 *
 * ── WHY A BLOCKING SCRIPT ────────────────────────────────────────────────
 * `ThemeScript` renders a synchronous `<script>` in the document head. That is
 * normally the wrong thing to do and is exactly right here: the alternative is
 * reading localStorage in an effect, which runs AFTER first paint, so a user
 * who chose dark gets a full-brightness white flash on every navigation. On a
 * dark theme that flash is not a blemish, it is the reason people give up and
 * switch back.
 *
 * It is a few hundred bytes, has no dependencies, and cannot fail the render —
 * the try/catch means a browser with storage disabled falls through to the
 * `prefers-color-scheme` default rather than blanking the page.
 */
export const THEME_KEY = "tt.theme";

export function ThemeScript() {
  const js = `try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});if(t==="dark"||t==="light"){document.documentElement.setAttribute("data-theme",t)}}catch(e){}`;
  return <script dangerouslySetInnerHTML={{ __html: js }} />;
}

type Mode = "light" | "dark" | "system";

export function ThemeToggle() {
  /* Read through useSyncExternalStore — see ./client-value.ts for why this is
     not useState + useEffect. */
  const stored = useStored(THEME_KEY);
  const mode: Mode = stored === "dark" || stored === "light" ? stored : "system";

  function apply(next: Mode) {
    writeStored(THEME_KEY, next === "system" ? null : next);
    if (next === "system") {
      document.documentElement.removeAttribute("data-theme");
    } else {
      document.documentElement.setAttribute("data-theme", next);
    }
  }

  /* Cycles rather than opening a menu. Three states is few enough that a cycle
     is faster than a dropdown, and the tooltip names the NEXT state so it is
     never a guess what the click will do. */
  const next: Mode =
    mode === "system" ? "light" : mode === "light" ? "dark" : "system";
  const label =
    next === "system"
      ? "Match system theme"
      : next === "light"
        ? "Switch to light"
        : "Switch to dark";

  return (
    <button
      type="button"
      onClick={() => apply(next)}
      title={label}
      aria-label={label}
      className="grid h-8 w-8 place-items-center rounded-lg text-fg3 transition-colors hover:bg-surface-alt hover:text-fg1"
    >
      {/* Both icons render; CSS picks. Swapping them in JS would need the
          resolved theme, which on `system` means a media-query listener for a
          purely decorative difference. */}
      <IconSun size={16} className="dark-hide" />
      <IconMoon size={16} className="dark-show" />
      <span className="sr-only">{label}</span>
    </button>
  );
}
