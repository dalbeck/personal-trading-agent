"use client";

import { useSyncExternalStore } from "react";
import { MoonIcon, SunIcon } from "@/components/icons";

type Theme = "light" | "dark";

// Subscribe to <html> class changes so the toggle's icon always reflects the
// resolved theme — including the value applied pre-paint by the inline script
// in the root layout.
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}

function getSnapshot(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

// Must match the server-rendered HTML during hydration; the real value is read
// from the DOM immediately after commit (useSyncExternalStore handles this).
function getServerSnapshot(): Theme {
  return "light";
}

/**
 * Light/dark toggle. Persists the user's explicit choice to localStorage
 * (theme only — never sensitive data, per AGENTS.md). The actual class swap
 * happens on <html>; the MutationObserver above keeps this button in sync.
 */
export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* private mode / storage disabled — ignore */
    }
  }

  const nextLabel = theme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${nextLabel} mode`}
      title={`Switch to ${nextLabel} mode`}
      className="grid size-9 place-items-center rounded-pill border border-line text-fg-muted transition-colors duration-150 ease-out hover:bg-surface-overlay hover:text-fg"
    >
      {theme === "dark" ? (
        <SunIcon className="size-5" />
      ) : (
        <MoonIcon className="size-5" />
      )}
    </button>
  );
}
