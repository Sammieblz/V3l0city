"use client";

import { useEffect, useRef, useState } from "react";

import {
  MARKETING_THEME_STORAGE_KEY,
  normalizeMarketingThemePreference,
  resolveMarketingTheme,
  type MarketingThemePreference,
} from "@/lib/marketing-theme";

const choices: Array<{ value: MarketingThemePreference; label: string; description: string }> = [
  { value: "system", label: "System", description: "Follow this device" },
  { value: "light", label: "Light", description: "Use the light palette" },
  { value: "dark", label: "Dark", description: "Use the dark palette" },
];

function initialPreference(): MarketingThemePreference {
  if (typeof document === "undefined") return "system";
  return normalizeMarketingThemePreference(document.documentElement.dataset.marketingThemePreference);
}

function applyPreference(preference: MarketingThemePreference, prefersDark: boolean) {
  const documentElement = document.documentElement;
  documentElement.dataset.marketingThemePreference = preference;
  documentElement.dataset.marketingTheme = resolveMarketingTheme(preference, prefersDark);
}

export function MarketingThemeToggle() {
  const [open, setOpen] = useState(false);
  const [preference, setPreference] = useState<MarketingThemePreference>(initialPreference);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => applyPreference(preference, media.matches);
    update();
    if (preference !== "system") return undefined;
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [preference]);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const choose = (nextPreference: MarketingThemePreference) => {
    setPreference(nextPreference);
    try {
      window.localStorage.setItem(MARKETING_THEME_STORAGE_KEY, nextPreference);
    } catch {
      // Private browsing or a restrictive browser policy can deny local storage.
      // The preference still applies for the current page.
    }
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <div className="marketing-theme-control" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="theme-trigger"
        aria-label="Choose color theme"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="marketing-theme-menu"
        onClick={() => setOpen((isOpen) => !isOpen)}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.64 5.64l1.56 1.56M16.8 16.8l1.56 1.56M18.36 5.64 16.8 7.2M7.2 16.8l-1.56 1.56" strokeLinecap="round" />
          <circle cx="12" cy="12" r="4.25" />
        </svg>
        <span>Theme</span>
      </button>
      {open ? (
        <div id="marketing-theme-menu" className="theme-menu" role="menu" aria-label="Color theme">
          {choices.map((choice) => (
            <button
              key={choice.value}
              type="button"
              role="menuitemradio"
              aria-checked={preference === choice.value}
              className={preference === choice.value ? "is-selected" : undefined}
              onClick={() => choose(choice.value)}
            >
              <span>{choice.label}</span>
              <small>{choice.description}</small>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
